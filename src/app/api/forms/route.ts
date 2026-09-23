import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db, TABLE, PutCommand, ScanCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb';
import { getCurrentUser } from '@/lib/auth';
import { canCreateForm, canViewFormResponses } from '@/lib/permissions';
import { slugify } from '@/lib/utils';
import { createResponseSheet } from '@/lib/sheets';
import { loadActiveMembers, syncSheetPermissions } from '@/lib/permission-sync';
import type { FormDef, FormField } from '@/types';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [result, allMembers] = await Promise.all([
    db.send(new ScanCommand({ TableName: TABLE.FORMS })),
    loadActiveMembers(),
  ]);
  const all = (result.Items || []) as FormDef[];
  // Same "who can view" rule as the responses page — creator, editors, the
  // hierarchy above the creator, Presidium — so a form shows up in the
  // list for everyone who can actually open its responses.
  const visible = all.filter(f => canViewFormResponses(user, f, allMembers));
  visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ success: true, data: visible });
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = await db.send(new QueryCommand({
    TableName: TABLE.FORMS,
    IndexName: 'SlugIndex',
    KeyConditionExpression: 'slug = :s',
    ExpressionAttributeValues: { ':s': base },
  }));
  if (!existing.Items || existing.Items.length === 0) return base;
  return `${base}-${nanoid(6).toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canCreateForm(user)) {
    return NextResponse.json({ error: 'Only core team members can create forms' }, { status: 403 });
  }

  const body = await req.json();
  const title = (body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const fields: FormField[] = Array.isArray(body.fields) ? body.fields : [];
  const formId = nanoid();
  const slug = await uniqueSlug(slugify(title));
  const now = new Date().toISOString();

  const form: FormDef = {
    formId,
    slug,
    title,
    description: (body.description || '').trim(),
    fields,
    accessMode: body.accessMode === 'MEMBERS_ONLY' ? 'MEMBERS_ONLY' : 'PUBLIC',
    acceptingResponses: body.acceptingResponses !== false,
    closesAt: body.closesAt || null,
    createdBy: user.memberId,
    createdByName: user.name,
    createdAt: now,
    responseCount: 0,
    driveFolderId: null,
    driveSheetId: null,
    editors: [],
    sheetViewerPermissions: [],
  };

  await db.send(new PutCommand({ TableName: TABLE.FORMS, Item: form }));

  // Fire-and-forget — Drive/Sheets sync never blocks form creation, and
  // silently no-ops if DRIVE_FORMS_FOLDER_ID isn't configured yet.
  createResponseSheet(form).then(async result => {
    if (!result) return;
    await db.send(new UpdateCommand({
      TableName: TABLE.FORMS,
      Key: { formId },
      UpdateExpression: 'SET driveFolderId = :f, driveSheetId = :s',
      ExpressionAttributeValues: { ':f': result.folderId, ':s': result.sheetId },
    }));
    // Grant the creator (and hierarchy/Presidium) real Drive view access on
    // the Sheet the moment it exists, not just an app-level permission.
    await syncSheetPermissions({ ...form, driveFolderId: result.folderId, driveSheetId: result.sheetId });
  }).catch(err => console.error('Drive sync on form create failed', err));

  return NextResponse.json({ success: true, data: form });
}
