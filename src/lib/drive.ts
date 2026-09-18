import { Readable } from 'stream';
import { google, drive_v3 } from 'googleapis';
import type { Member, MoMScope } from '@/types';

const DOMAINS_FOLDER_ID = process.env.DRIVE_DOMAINS_FOLDER_ID;

function getDriveClient(): drive_v3.Drive | null {
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
