import { google, drive_v3 } from 'googleapis';
import type { Member } from '@/types';

// One-time setup required before Drive folder features work:
// 1. Enable "Google Drive API" in the same GCP project as the Sheets API.
// 2. Share the SBG Drive's top-level "Domains" folder with the service account
//    email (GOOGLE_SHEETS_CLIENT_EMAIL) as Editor.
// 3. Copy that folder's ID from its Drive URL and set DRIVE_DOMAINS_FOLDER_ID
//    in .env.local and in Vercel's environment variables.

const DOMAINS_FOLDER_ID = process.env.DRIVE_DOMAINS_FOLDER_ID;

function getDriveClient(): drive_v3.Drive | null {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key || !DOMAINS_FOLDER_ID) return null;
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
// Returns { folderId, permissionId } on success, null if Drive is not
// configured, role is Presidium, or required fields are missing.
// Best-effort — never throws.
export async function createMemberDriveFolder(
  member: Member,
): Promise<{ folderId: string; permissionId?: string } | null> {
  if (member.role === 'SBG_LEADER' || member.role === 'SECRETARY') return null;
  if (!member.clubId || !member.domain) return null;
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
