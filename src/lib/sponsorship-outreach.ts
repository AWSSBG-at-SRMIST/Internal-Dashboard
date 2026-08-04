import { randomUUID } from 'crypto';
import { db, TABLE, GetCommand, PutCommand, ScanCommand } from '@/lib/dynamodb';
import { decryptVaultValue } from '@/lib/vault-crypto';
import { canViewSponsorshipLogEntry } from '@/lib/permissions';
import { ImapFlow } from 'imapflow';
// nodemailer ships its own MIME builder that composes a raw RFC822 message
// without actually sending anything — exactly what we need to hand to IMAP's
// APPEND command. No new mail-building dependency required.
import MailComposer from 'nodemailer/lib/mail-composer';
import type { SessionUser, Role } from '@/types';

const MAX_COMPANIES_PER_BATCH = 5;

export interface SponsorshipDraftInput {
  companyName: string;
  companyEmail: string;
}

export interface SponsorshipDraftResult {
  companyName: string;
  companyEmail: string;
  success: boolean;
  attachmentIncluded?: boolean;
  error?: string;
}

// A team-visible record of outreach ("who mailed which company, when") —
// visibility is hierarchical (see canViewSponsorshipLogEntry): a Builder
// sees only their own entries, an Associate sees their own + Builders',
// a Manager sees their own + Associates' + Builders', and Presidium /
// the Corporate Director see everyone's. Sending access itself (who can
// create drafts at all) is unchanged — this only scopes the log view.
// Distinct from the app-wide Audit Logs (Presidium-only) — this is closer
// to a shared team log than a security audit trail.
export interface SponsorshipOutreachLogEntry {
  logId: string;
  companyName: string;
  companyEmail: string;
  createdBy: string;
  createdByName: string;
  createdByRole: Role | null;
  createdAt: string;
}

async function recordOutreachLog(user: SessionUser, companyName: string, companyEmail: string): Promise<void> {
  await db.send(new PutCommand({
    TableName: TABLE.SPONSORSHIP_LOG,
    Item: {
      logId: randomUUID(),
      companyName,
      companyEmail,
      createdBy: user.memberId,
      createdByName: user.name,
      createdByRole: user.role,
      createdAt: new Date().toISOString(),
    },
  }));
}

// Mirrors GET /api/sponsorship-outreach/log — used by the page's Server
// Component for the initial render. Filtered per-viewer per the hierarchy
// documented on SponsorshipOutreachLogEntry above.
export async function getSponsorshipOutreachLog(viewer: SessionUser): Promise<SponsorshipOutreachLogEntry[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.SPONSORSHIP_LOG }));
  const entries = (result.Items || []) as SponsorshipOutreachLogEntry[];
  const visible = entries.filter(e => canViewSponsorshipLogEntry(viewer, e));
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return visible;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The pitch text and the sponsorship-brochure Drive link live only inside
// this Vault entry (encrypted at rest, never in source control) — this
// function is the one deliberate exception to the vault "reveal" flow: it's
// a server-internal fetch on behalf of the system, not a human clicking
// Reveal, so it bypasses canViewVaultEntry/rate-limit/audit-log (none of
// which apply — no human ever sees the decrypted text, it goes straight
// into an outgoing email draft).
async function getSponsorshipTemplate(): Promise<string> {
  const entryId = process.env.SPONSORSHIP_TEMPLATE_VAULT_ID;
  if (!entryId) throw new Error('SPONSORSHIP_TEMPLATE_VAULT_ID is not configured');

  const result = await db.send(new GetCommand({ TableName: TABLE.VAULT, Key: { entryId } }));
  if (!result.Item) throw new Error('Sponsorship template Vault entry not found');

  return decryptVaultValue(result.Item.encryptedValue, result.Item.iv, result.Item.authTag);
}

// The template (stored in Vault) contains the literal marker `{{COMPANY}}`
// whereever the company name should appear, already wrapped in whatever
// bold/formatting tags whoever wrote it chose — this function never touches
// formatting, only substitutes the one variable, HTML-escaping the
// user-supplied company name first since it's about to go into an HTML
// email sent to a real external recipient.
function fillTemplate(template: string, companyName: string): string {
  return template.split('{{COMPANY}}').join(escapeHtml(companyName));
}

// The brochure's Drive link lives inside the template's own HTML (in the
// "Download" button href) — extracted here rather than stored as a second
// Vault field, so there's still only one place the link needs to be updated.
function extractDriveFileId(html: string): string | null {
  const match = html.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Fetches the brochure PDF's raw bytes from Drive's direct-download URL —
// works as long as the file is shared as "Anyone with the link can view"
// (already a requirement for the button link itself to work for recipients).
// Returns null (rather than throwing) on any failure, since a draft without
// the attachment — but with the working Download button — is still useful;
// the caller surfaces this via `attachmentIncluded` instead of failing outright.
async function fetchDriveAttachment(html: string): Promise<Buffer | null> {
  const fileId = extractDriveFileId(html);
  if (!fileId) return null;

  try {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    // Drive serves an HTML "can't scan this file for viruses" interstitial
    // instead of the file itself for some larger files — that's not a valid
    // attachment, so treat it the same as a failed fetch.
    if (contentType.includes('text/html')) return null;

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function buildRawMessage(to: string, subject: string, html: string, attachment: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    new MailComposer({
      from: `"AWS Student Builder Group" <${process.env.SPONSORSHIP_GMAIL_USER}>`,
      to,
      subject,
      html,
      ...(attachment ? { attachments: [{ filename: 'Sponsorship Brochure - AWS SBG at SRMIST.pdf', content: attachment, contentType: 'application/pdf' }] } : {}),
    }).compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

async function appendDraft(client: ImapFlow, draftsPath: string, raw: Buffer): Promise<void> {
  const result = await client.append(draftsPath, raw, ['\\Draft']);
  if (!result) throw new Error('IMAP server rejected the draft');
}

// Creates up to MAX_COMPANIES_PER_BATCH drafts in the sponsorship Gmail
// account's Drafts folder — one IMAP connection reused across the whole
// batch. Returns a per-company result so the caller can show exactly which
// ones landed and which didn't, rather than an all-or-nothing outcome.
export async function createSponsorshipDrafts(user: SessionUser, inputs: SponsorshipDraftInput[]): Promise<SponsorshipDraftResult[]> {
  if (inputs.length === 0) throw new Error('At least one company is required');
  if (inputs.length > MAX_COMPANIES_PER_BATCH) throw new Error(`No more than ${MAX_COMPANIES_PER_BATCH} companies per batch`);

  const gmailUser = process.env.SPONSORSHIP_GMAIL_USER;
  const pass = process.env.SPONSORSHIP_GMAIL_APP_PASSWORD;
  if (!gmailUser || !pass) throw new Error('Sponsorship Gmail credentials are not configured');

  const template = await getSponsorshipTemplate();
  // Fetched once and reused for every draft in the batch — it's the same
  // file regardless of which company each draft is going to.
  const attachment = await fetchDriveAttachment(template);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: gmailUser, pass },
    logger: false,
  });

  const results: SponsorshipDraftResult[] = [];

  await client.connect();
  try {
    const mailboxes = await client.list();
    const draftsBox = mailboxes.find(m => m.specialUse === '\\Drafts');
    if (!draftsBox) throw new Error('Could not find a Drafts folder on the sponsorship Gmail account');

    for (const { companyName, companyEmail } of inputs) {
      try {
        const html = fillTemplate(template, companyName);
        const subject = 'Invitation For Collaboration With AWS SBG at SRMIST';
        const raw = await buildRawMessage(companyEmail, subject, html, attachment);
        await appendDraft(client, draftsBox.path, raw);
        await recordOutreachLog(user, companyName, companyEmail);
        results.push({ companyName, companyEmail, success: true, attachmentIncluded: attachment !== null });
      } catch (err) {
        results.push({ companyName, companyEmail, success: false, error: err instanceof Error ? err.message : 'Failed to create draft' });
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return results;
}

export { MAX_COMPANIES_PER_BATCH };
