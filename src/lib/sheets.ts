import { google, sheets_v4 } from 'googleapis';
import { toProfileLink } from '@/lib/utils';
import { getDriveClient, getOrCreateFormFolder } from './drive';
import type { Member, Role, FormDef, FormResponseAnswer } from '@/types';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// Copy-paste artifact seen in some Sub-Domain cells (zero-width/word-joiner
// characters) — must be stripped before writing or matching against our
// Subdomain enum.
const INVISIBLE_CHARS_RE = new RegExp('[\\u200B-\\u200D\\uFEFF\\u2060]', 'g');

function cleanCell(value: unknown): string {
  return String(value ?? '').replace(INVISIBLE_CHARS_RE, '').trim();
}

function getClient(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key || !SPREADSHEET_ID) return null;
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const ROLE_TO_POSITION: Record<Role, string> = {
  SBG_LEADER: 'SBG Leader',
  SECRETARY: 'Secretary',
  DIRECTOR: 'Director',
  MANAGER: 'Manager',
  ASSOCIATE: 'Associate',
  BUILDER: 'Builder',
};

function isPresidiumRole(role: Role): boolean {
  return role === 'SBG_LEADER' || role === 'SECRETARY';
}

// Each column header maps to the same Member field across every tab that
// contains it — a tab is just some subset of these columns.
function headerToValue(member: Member, header: string): string {
  switch (header) {
    case 'Club ID': return member.clubId || '';
    case 'Name': return member.name || '';
    case 'Domain': return isPresidiumRole(member.role) ? 'Presidium' : (member.domain || '');
    case 'Position': return ROLE_TO_POSITION[member.role] || '';
    case 'Reg No.': return member.regNo || '';
    case 'Department': return member.department || '';
    case 'Sub-Domain': return member.subdomain || '';
    case 'E-Mail (Off)': return member.officialEmail || '';
    case 'E-Mail (Per)': return member.personalEmail || '';
    case 'Phone No.': return member.phone || '';
    case 'FA Name': return member.faName || '';
    case 'FA Ph No': return member.faPhone || '';
    case 'FA E-Mail': return member.faEmail || '';
    case 'Section': return member.section || '';
    // Members can store either a bare handle or a full URL for these — the
    // sheet always gets the full URL so it keeps rendering as a clickable
    // link there regardless of which form was entered on the dashboard.
    // Meetup is always a full URL already (no handle-based construction).
    case 'GitHub': return toProfileLink('github', member.github) || '';
    case 'LinkedIn': return toProfileLink('linkedin', member.linkedin) || '';
    case 'Meetup Profile': return member.meetup || '';
    case 'Builder ID': case 'AWS Builder ID': return toProfileLink('builderId', member.builderId) || '';
    default: return '';
  }
}

interface TabInfo {
  title: string;
  sheetId: number;
  headers: string[];
  role: 'official' | 'links' | 'merged' | 'other' | 'unknown';
}

// Confirmed live against the actual spreadsheet: tabs are "Official Data",
// "Socials", "Certifications", and "Internship Data". Every tab keyed by
// Club ID gets a row created/removed on add/delete (structural row
// lifecycle) — "Certifications" only has Club ID/Name/Domain/Position
// mapped (headerToValue has no case for its "Certifications" column), so
// that column is left blank for manual upkeep, but the row itself still
// gets created and removed like every other tab.
function classifyTab(headers: string[]): TabInfo['role'] {
  if (!headers.includes('Club ID')) return 'unknown';
  const hasRegNo = headers.includes('Reg No.');
  const hasGithub = headers.includes('GitHub');
  if (hasRegNo && hasGithub) return 'merged';
  if (hasRegNo) return 'official';
  if (hasGithub) return 'links';
  return 'other';
}

let cachedTabs: TabInfo[] | null = null;

async function resolveTabs(sheets: sheets_v4.Sheets): Promise<TabInfo[]> {
  if (cachedTabs) return cachedTabs;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID! });
  const sheetMetas = meta.data.sheets || [];

  const tabs: TabInfo[] = [];
  for (const sheetMeta of sheetMetas) {
    const title = sheetMeta.properties?.title;
    const sheetId = sheetMeta.properties?.sheetId;
    if (!title || sheetId === undefined || sheetId === null) continue;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: `'${title}'!1:1`,
    });
    const headers = (res.data.values?.[0] || []).map(cleanCell);
    tabs.push({ title, sheetId, headers, role: classifyTab(headers) });
  }
  cachedTabs = tabs;
  return tabs;
}

function columnLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function findRowIndex(sheets: sheets_v4.Sheets, tabTitle: string, clubId: string): Promise<number | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID!,
    range: `'${tabTitle}'!A:A`,
  });
  const col = res.data.values || [];
  for (let i = 1; i < col.length; i++) { // skip header row
    if (cleanCell(col[i]?.[0]) === clubId) return i;
  }
  return null;
}

async function upsertRowInTab(sheets: sheets_v4.Sheets, tab: TabInfo, member: Member, oldClubId?: string | null) {
  const rowValues = tab.headers.map(h => headerToValue(member, h));

  let rowIndex = await findRowIndex(sheets, tab.title, member.clubId);
  if (rowIndex === null && oldClubId && oldClubId !== member.clubId) {
    rowIndex = await findRowIndex(sheets, tab.title, oldClubId);
  }

  if (rowIndex !== null) {
    const rowNumber = rowIndex + 1; // A1 notation is 1-indexed
    const endCol = columnLetter(tab.headers.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID!,
      range: `'${tab.title}'!A${rowNumber}:${endCol}${rowNumber}`,
      // RAW, not USER_ENTERED — member-supplied fields (personalEmail, name,
      // department, etc.) must never be evaluated as live formulas by Sheets.
      // USER_ENTERED would let a value like "=HYPERLINK(...)" execute as a
      // formula for whoever opens the sheet; RAW stores everything literally.
      valueInputOption: 'RAW',
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID!,
      range: `'${tab.title}'!A1`,
      // RAW, not USER_ENTERED — member-supplied fields (personalEmail, name,
      // department, etc.) must never be evaluated as live formulas by Sheets.
      // USER_ENTERED would let a value like "=HYPERLINK(...)" execute as a
      // formula for whoever opens the sheet; RAW stores everything literally.
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  }
}

// Best-effort push: writes/creates the member's row in every in-scope tab.
// Never throws — a Sheets hiccup shouldn't block a dashboard action, since
// DynamoDB (not the sheet) is this app's source of truth. Callers may still
// wrap calls in .catch(console.error) as defense-in-depth.
export async function upsertMemberRow(member: Member, oldClubId?: string | null): Promise<void> {
  const sheets = getClient();
  if (!sheets || !member.clubId) return;
  try {
    const tabs = await resolveTabs(sheets);
    for (const tab of tabs) {
      if (tab.role === 'unknown') continue;
      try {
        await upsertRowInTab(sheets, tab, member, oldClubId);
      } catch (err) {
        console.error(`Sheets upsert failed for tab "${tab.title}"`, err);
      }
    }
  } catch (err) {
    console.error('Sheets upsert failed', err);
  }
}

// Best-effort push: removes the member's row (a real row delete, not just a
// clear, so row numbers stay meaningful) from every in-scope tab.
export async function deleteMemberRow(clubId: string): Promise<void> {
  const sheets = getClient();
  if (!sheets || !clubId) return;
  try {
    const tabs = await resolveTabs(sheets);
    const requests: sheets_v4.Schema$Request[] = [];
    for (const tab of tabs) {
      if (tab.role === 'unknown') continue;
      try {
        const rowIndex = await findRowIndex(sheets, tab.title, clubId);
        if (rowIndex === null) continue;
        requests.push({
          deleteDimension: {
            range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        });
      } catch (err) {
        console.error(`Sheets row lookup failed for tab "${tab.title}"`, err);
      }
    }
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID!, requestBody: { requests } });
    }
  } catch (err) {
    console.error('Sheets delete failed', err);
  }
}

// ─── Forms ──────────────────────────────────────────────────────────────────
// Distinct from getClient() above, which gates on GOOGLE_SHEETS_SPREADSHEET_ID
// (the fixed "Builders' Information" sheet) — forms create their own new
// spreadsheets on the fly, one per form, so that env var is irrelevant here.

function getSheetsClient(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key) return null;
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Creates a new Google Sheet for this form (header row = field labels +
// "Submitted At" + "Respondent"), moves it into the form's Drive folder.
// Best-effort — returns null (never throws) if Drive/Sheets isn't configured
// or the call fails; DynamoDB is always the primary record either way.
export async function createResponseSheet(form: Pick<FormDef, 'formId' | 'title' | 'fields'>): Promise<{ sheetId: string; folderId: string } | null> {
  const sheets = getSheetsClient();
  const drive = getDriveClient();
  if (!sheets || !drive) return null;

  try {
    const folderId = await getOrCreateFormFolder(form.title, form.formId);
    if (!folderId) return null;

    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `${form.title} — Responses` },
        sheets: [{ properties: { title: 'Responses' } }],
      },
      fields: 'spreadsheetId',
    });
    const sheetId = created.data.spreadsheetId!;

    // Move it from the service account's own Drive root into the shared folder.
    const file = await drive.files.get({ fileId: sheetId, fields: 'parents' });
    const prevParents = (file.data.parents || []).join(',');
    await drive.files.update({
      fileId: sheetId,
      addParents: folderId,
      removeParents: prevParents,
      fields: 'id, parents',
    });

    const headers = [
      'Submitted At', 'Club ID', 'Name', 'Position', 'Domain', 'Subdomain', 'Official Email',
      ...form.fields.map(f => f.label),
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Responses!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    return { sheetId, folderId };
  } catch (err) {
    console.error('Sheets: createResponseSheet failed', err);
    return null;
  }
}

export interface RespondentIdentity {
  clubId: string;
  name: string;
  position: string;
  domain: string;
  subdomain: string;
  officialEmail: string;
}

// Appends one response row. valueInputOption is deliberately RAW, never
// USER_ENTERED — member-supplied text must never be evaluated as a formula.
// `identity` is auto-filled from the logged-in respondent's member record
// (never asked as a form question) — null for anonymous/public submissions.
export async function appendResponseRow(
  sheetId: string,
  form: Pick<FormDef, 'fields'>,
  answers: FormResponseAnswer[],
  submittedAt: string,
  identity: RespondentIdentity | null,
): Promise<void> {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    const byField = new Map(answers.map(a => [a.fieldId, a]));
    const row = [
      submittedAt,
      identity?.clubId || '',
      identity?.name || 'Anonymous',
      identity?.position || '',
      identity?.domain || '',
      identity?.subdomain || '',
      identity?.officialEmail || '',
      ...form.fields.map(f => {
        const a = byField.get(f.fieldId);
        if (!a) return '';
        if (a.fileUrl) return a.fileUrl;
        return Array.isArray(a.value) ? a.value.join(', ') : a.value;
      }),
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Responses!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('Sheets: appendResponseRow failed', err);
  }
}
