import { db, TABLE, GetCommand, UpdateCommand, ScanCommand, QueryCommand } from './dynamodb';
import { shareFile, unshareFile } from './drive';
import { computeFormViewers } from './permissions';
import type { DrivePermissionGrant, FormDef, FormResponseRecord, Member } from '@/types';

// Server-only (imports Drive + DynamoDB) — computeFormViewers itself is
// pure and lives in permissions.ts so client components can use it (and
// canViewFormResponses) without pulling googleapis/aws-sdk into the browser
// bundle. This module builds the actual Drive permission grant/revoke on
// top of that pure rule.

export async function loadActiveMembers(): Promise<Member[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
  return (result.Items || []) as Member[];
}

type Viewer = ReturnType<typeof computeFormViewers>[number];

// Diffs `viewers` against `existing` grants on one Drive file, revoking
// anyone no longer entitled and granting anyone newly entitled. Best-effort
// throughout — a failed grant/revoke is logged, never thrown, since Drive
// sync must never be able to break the app's own primary DynamoDB path.
async function diffAndSync(
  fileId: string | null | undefined,
  viewers: Viewer[],
  existing: DrivePermissionGrant[],
): Promise<DrivePermissionGrant[]> {
  if (!fileId) return existing;

  const wantIds = new Set(viewers.map(v => v.memberId));
  const haveIds = new Set(existing.map(e => e.memberId));

  const toRevoke = existing.filter(e => !wantIds.has(e.memberId));
  const toGrant = viewers.filter(v => !haveIds.has(v.memberId));

  await Promise.all(toRevoke.map(e => unshareFile(fileId, e.permissionId)));
  const granted = await Promise.all(
    toGrant.map(async v => {
      const permissionId = await shareFile(fileId, v.email, 'reader');
      return permissionId ? ({ memberId: v.memberId, email: v.email, permissionId } as DrivePermissionGrant) : null;
    }),
  );

  const kept = existing.filter(e => wantIds.has(e.memberId));
  return [...kept, ...granted.filter((g): g is DrivePermissionGrant => g !== null)];
}

// Syncs the form's response Sheet's viewer permissions to match
// computeFormViewers() right now, and persists the updated grant-tracking
// list back onto the form record. No-ops silently if the form has no
// driveSheetId yet (Drive not configured, or the async sheet-creation
// fire-and-forget hasn't landed).
export async function syncSheetPermissions(form: FormDef): Promise<void> {
  if (!form.driveSheetId) return;
  const allMembers = await loadActiveMembers();
  const viewers = computeFormViewers(form, allMembers);
  const updated = await diffAndSync(form.driveSheetId, viewers, form.sheetViewerPermissions || []);

  await db.send(new UpdateCommand({
    TableName: TABLE.FORMS,
    Key: { formId: form.formId },
    UpdateExpression: 'SET sheetViewerPermissions = :p',
    ExpressionAttributeValues: { ':p': updated },
  }));
}

// Same sync, but per uploaded file inside one response's answers — each
// file sits in its respondent's own personal Drive folder, so the form's
// viewers need an explicit per-file grant, not just Sheet access.
export async function syncResponseFilePermissions(formId: string, responseId: string): Promise<void> {
  const [formResult, responseResult, allMembers] = await Promise.all([
    db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } })),
    db.send(new GetCommand({ TableName: TABLE.FORM_RESPONSES, Key: { formId, responseId } })),
    loadActiveMembers(),
  ]);
  const form = formResult.Item as FormDef | undefined;
  const response = responseResult.Item as FormResponseRecord | undefined;
  if (!form || !response) return;

  const viewers = computeFormViewers(form, allMembers);
  let changed = false;
  const nextAnswers = await Promise.all(
    response.answers.map(async a => {
      if (!a.fileId) return a;
      const updated = await diffAndSync(a.fileId, viewers, a.filePermissions || []);
      changed = true;
      return { ...a, filePermissions: updated };
    }),
  );
  if (!changed) return;

  await db.send(new UpdateCommand({
    TableName: TABLE.FORM_RESPONSES,
    Key: { formId, responseId },
    UpdateExpression: 'SET answers = :a',
    ExpressionAttributeValues: { ':a': nextAnswers },
  }));
}

// Used by the sync-permissions cron: every response for a form that has at
// least one uploaded file, so re-syncs can catch member removals/role
// changes that happened well after the original submission.
export async function loadResponsesWithFiles(formId: string): Promise<FormResponseRecord[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.FORM_RESPONSES,
    KeyConditionExpression: 'formId = :f',
    ExpressionAttributeValues: { ':f': formId },
  }));
  const responses = (result.Items || []) as FormResponseRecord[];
  return responses.filter(r => r.answers.some(a => a.fileId));
}
