import { Readable } from 'stream';
import { google, drive_v3 } from 'googleapis';
import type { Member, MoMScope } from '@/types';

const DOMAINS_FOLDER_ID = process.env.DRIVE_DOMAINS_FOLDER_ID;

export function getDriveClient(): drive_v3.Drive | null {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key) return null;
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// Per-process cache so repeated folder lookups in the same invocation don't
// make redundant API calls (each serverless invocation starts fresh anyway).
const folderCache = new Map<string, string>();

async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const key = `${parentId}:${name}`;
  if (folderCache.has(key)) return folderCache.get(key)!;
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const id = res.data.files?.[0]?.id ?? null;
  if (id) folderCache.set(key, id);
  return id;
}

// Like findChildFolder but creates the folder if it doesn't exist yet.
// Used for intermediate parent folders (e.g. "Presidium/" under Domains/).
async function findOrCreateChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  const id = created.data.id!;
  folderCache.set(`${parentId}:${name}`, id);
  return id;
}

// Folder path by role:
//   Director           → Domains/{Domain}/{clubId}/
//   Manager/Associate/Builder → Domains/{Domain}/{Subdomain}/{clubId}/
// Presidium members do not get personal Drive folders.
export async function createMemberDriveFolder(
  member: Member,
): Promise<{ folderId: string; permissionId?: string } | null> {
  if (member.role === 'SBG_LEADER' || member.role === 'SECRETARY') return null;
  if (!member.clubId || !member.domain) return null;
  if (!DOMAINS_FOLDER_ID) return null;
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    let parentId: string;

    if (member.role === 'DIRECTOR') {
      parentId = await findOrCreateChildFolder(drive, DOMAINS_FOLDER_ID!, member.domain);
    } else {
      // MANAGER / ASSOCIATE / BUILDER
      if (!member.subdomain) return null;
      const domainId = await findOrCreateChildFolder(drive, DOMAINS_FOLDER_ID!, member.domain);
      parentId = await findOrCreateChildFolder(drive, domainId, member.subdomain);
    }

    const created = await drive.files.create({
      requestBody: {
        name: member.clubId,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    const folderId = created.data.id!;

    let permissionId: string | undefined;
    const shareEmail = member.officialEmail;
    if (shareEmail) {
      const location = member.role === 'DIRECTOR' ? member.domain : member.subdomain!;
      const perm = await drive.permissions.create({
        fileId: folderId,
        requestBody: { type: 'user', role: 'writer', emailAddress: shareEmail },
        fields: 'id',
        sendNotificationEmail: true,
        emailMessage:
          `Hi ${member.name}, your personal AWS SBG work folder has been created in the club Drive. ` +
          `Use it to store your deliverables, project files, and work for ${location}. ` +
          `Your Club ID: ${member.clubId}`,
      });
      permissionId = perm.data.id ?? undefined;
    }

    return { folderId, permissionId };
  } catch (err) {
    console.error('Drive: createMemberDriveFolder failed', err);
    return null;
  }
}

// Moves the folder to trash (recoverable from Drive trash for 30 days).
// Best-effort — never throws.
export async function trashMemberDriveFolder(folderId: string): Promise<void> {
  const drive = getDriveClient();
  if (!drive) return;
  try {
    await drive.files.update({ fileId: folderId, requestBody: { trashed: true } });
  } catch (err) {
    console.error('Drive: trashMemberDriveFolder failed', err);
  }
}

// Revokes a specific sharing permission. Called on member deletion to remove
// the member's write access before trashing the folder.
// Best-effort — never throws.
export async function revokeDriveFolderPermission(
  folderId: string,
  permissionId: string,
): Promise<void> {
  const drive = getDriveClient();
  if (!drive) return;
  try {
    await drive.permissions.delete({ fileId: folderId, permissionId });
  } catch (err) {
    console.error('Drive: revokeDriveFolderPermission failed', err);
  }
}

export function driveConfigured(): boolean {
  return !!(
    process.env.DRIVE_DOMAINS_FOLDER_ID &&
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
    process.env.GOOGLE_SHEETS_PRIVATE_KEY
  );
}

// Uploads a MoM PDF to the centralized Minutes Of Meetings folder tree.
// Folder structure under DRIVE_MOM_FOLDER_ID:
//   CORE_TEAM            → Core Team/
//   DOMAIN + domain      → {domain}/
//   SUBDOMAIN + sub      → {domain}/{subdomain}/
// Returns { fileId, viewUrl } on success, null if not configured or on error.
export async function uploadMoMToDrive(
  pdfBuffer: Buffer,
  filename: string,
  scope: MoMScope,
  domain?: string | null,
  subdomain?: string | null,
): Promise<{ fileId: string; viewUrl: string } | null> {
  const momFolderId = process.env.DRIVE_MOM_FOLDER_ID;
  if (!momFolderId) return null;
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    let parentId: string;

    if (scope === 'CORE_TEAM') {
      parentId = await findOrCreateChildFolder(drive, momFolderId, 'Core Team');
    } else if (scope === 'DOMAIN' && domain) {
      parentId = await findOrCreateChildFolder(drive, momFolderId, domain);
    } else if (scope === 'SUBDOMAIN' && domain && subdomain) {
      const domainFolder = await findOrCreateChildFolder(drive, momFolderId, domain);
      parentId = await findOrCreateChildFolder(drive, domainFolder, subdomain);
    } else {
      return null;
    }

    const res = await drive.files.create({
      requestBody: { name: filename, mimeType: 'application/pdf', parents: [parentId] },
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      fields: 'id,webViewLink',
    });

    return { fileId: res.data.id!, viewUrl: res.data.webViewLink! };
  } catch (err) {
    console.error('Drive: uploadMoMToDrive failed', err);
    return null;
  }
}

// Moves any Drive file to trash.
export async function trashDriveFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  if (!drive) return;
  try {
    await drive.files.update({ fileId, requestBody: { trashed: true } });
  } catch (err) {
    console.error('Drive: trashDriveFile failed', err);
  }
}

// ─── Forms ──────────────────────────────────────────────────────────────────

const FORMS_FOLDER_ID = process.env.DRIVE_FORMS_FOLDER_ID;

// Root "Forms/{title} ({shortId})" folder for a given form, used both for
// the linked response Sheet and for anonymous-respondent file uploads.
// Returns null if Drive isn't configured — callers must treat that as a
// silent no-op, never a failure (DynamoDB is always the source of truth).
export async function getOrCreateFormFolder(title: string, formId: string): Promise<string | null> {
  if (!FORMS_FOLDER_ID) return null;
  const drive = getDriveClient();
  if (!drive) return null;
  try {
    const folderName = `${title} (${formId.slice(0, 8)})`;
    return await findOrCreateChildFolder(drive, FORMS_FOLDER_ID, folderName);
  } catch (err) {
    console.error('Drive: getOrCreateFormFolder failed', err);
    return null;
  }
}

// Uploads a file directly into a member's own personal Drive folder —
// reusing the folder this app already created for them when they joined —
// never creates a new personal folder or subfolder here, only reads
// member.driveFolderId. Deliberately not nested per-form: a member's own
// folder should stay one place, not fragmented by which form the file came
// from.
export async function uploadToMemberFolder(
  memberDriveFolderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ fileId: string; viewUrl: string } | null> {
  const drive = getDriveClient();
  if (!drive) return null;
  try {
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [memberDriveFolderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id,webViewLink',
    });
    return { fileId: res.data.id!, viewUrl: res.data.webViewLink! };
  } catch (err) {
    console.error('Drive: uploadToMemberFolder failed', err);
    return null;
  }
}

// Grants a real Drive "reader" (or "writer") permission on a file/sheet to
// one person's SRM email — this is what actually lets a form's creator (and
// the hierarchy above them) see attachments that otherwise sit inside a
// respondent's own personal folder they have no access to. Silent
// notification-free by design since this can fire many times as responses
// come in, not a one-off onboarding share.
export async function shareFile(fileId: string, email: string, role: 'reader' | 'writer' = 'reader'): Promise<string | null> {
  const drive = getDriveClient();
  if (!drive) return null;
  try {
    const perm = await drive.permissions.create({
      fileId,
      requestBody: { type: 'user', role, emailAddress: email },
      fields: 'id',
      sendNotificationEmail: false,
    });
    return perm.data.id ?? null;
  } catch (err) {
    console.error('Drive: shareFile failed', err);
    return null;
  }
}

// Revokes a previously-granted permission — called when someone no longer
// qualifies as a viewer (left the club, moved out of the hierarchy, lost
// editor access). Best-effort, never throws.
export async function unshareFile(fileId: string, permissionId: string): Promise<void> {
  const drive = getDriveClient();
  if (!drive) return;
  try {
    await drive.permissions.delete({ fileId, permissionId });
  } catch (err) {
    console.error('Drive: unshareFile failed', err);
  }
}

// Uploads a file into Forms/{title}/Attachments/ — the fallback for
// anonymous/public respondents who have no personal Drive folder of their own.
export async function uploadToFormAttachments(
  formTitle: string,
  formId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ fileId: string; viewUrl: string } | null> {
  if (!FORMS_FOLDER_ID) return null;
  const drive = getDriveClient();
  if (!drive) return null;
  try {
    const formFolderId = await getOrCreateFormFolder(formTitle, formId);
    if (!formFolderId) return null;
    const attachmentsId = await findOrCreateChildFolder(drive, formFolderId, 'Attachments');
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [attachmentsId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id,webViewLink',
    });
    return { fileId: res.data.id!, viewUrl: res.data.webViewLink! };
  } catch (err) {
    console.error('Drive: uploadToFormAttachments failed', err);
    return null;
  }
}
