import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@/lib/dynamodb';
import { getCurrentUser } from '@/lib/auth';
import { canManageForm, isPresidium } from '@/lib/permissions';
import { loadActiveMembers, syncSheetPermissions } from '@/lib/permission-sync';
import type { FormDef, FormEditor } from '@/types';

async function loadForm(formId: string): Promise<FormDef | null> {
  const result = await db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } }));
  return (result.Item as FormDef) || null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { formId } = await params;
  const form = await loadForm(formId);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (!canManageForm(user, form)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ success: true, data: form });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { formId } = await params;
  const form = await loadForm(formId);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (!canManageForm(user, form)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  const setField = (key: string, value: unknown) => {
    const n = `#${key}`;
    const v = `:${key}`;
    names[n] = key;
    values[v] = value;
    updates[key] = value;
  };

  if (typeof body.title === 'string' && body.title.trim()) setField('title', body.title.trim());
  if (typeof body.description === 'string') setField('description', body.description.trim());
  if (Array.isArray(body.fields)) setField('fields', body.fields);
  if (body.accessMode === 'PUBLIC' || body.accessMode === 'MEMBERS_ONLY') setField('accessMode', body.accessMode);
  if (typeof body.acceptingResponses === 'boolean') setField('acceptingResponses', body.acceptingResponses);
  if ('closesAt' in body) setField('closesAt', body.closesAt || null);

  // Only the creator or Presidium may change who else has access — an
  // editor can use the access they've been given, not grant it onward.
  let editorsChanged = false;
  if (Array.isArray(body.editors)) {
    if (!isPresidium(user) && form.createdBy !== user.memberId) {
      return NextResponse.json({ error: 'Only the creator or Presidium can manage editors' }, { status: 403 });
    }
    const allMembers = await loadActiveMembers();
    const validIds = new Set(allMembers.map(m => m.memberId));
    const editors: FormEditor[] = (body.editors as Array<{ memberId: string }>)
      .filter(e => validIds.has(e.memberId))
      .map(e => {
        const m = allMembers.find(mm => mm.memberId === e.memberId)!;
        return { memberId: m.memberId, name: m.name, email: m.officialEmail };
      });
    setField('editors', editors);
    editorsChanged = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, data: form });
  }

  const updateExpr = 'SET ' + Object.keys(names).map(n => `${n} = ${n.replace('#', ':')}`).join(', ');
  await db.send(new UpdateCommand({
    TableName: TABLE.FORMS,
    Key: { formId },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  const updatedForm = { ...form, ...updates } as FormDef;

  // Editor list changed → the set of people who should hold real Drive
  // view access changed too, so re-sync immediately rather than waiting
  // for the next cron pass.
  if (editorsChanged) {
    syncSheetPermissions(updatedForm).catch(err => console.error('Editor permission sync failed', err));
  }

  return NextResponse.json({ success: true, data: updatedForm });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { formId } = await params;
  const form = await loadForm(formId);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (!canManageForm(user, form)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const responses = await db.send(new QueryCommand({
    TableName: TABLE.FORM_RESPONSES,
    KeyConditionExpression: 'formId = :f',
    ExpressionAttributeValues: { ':f': formId },
    ProjectionExpression: 'formId, responseId',
  }));

  const items = responses.Items || [];
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.FORM_RESPONSES]: batch.map(item => ({
          DeleteRequest: { Key: { formId: item.formId, responseId: item.responseId } },
        })),
      },
    }));
  }

  await db.send(new DeleteCommand({ TableName: TABLE.FORMS, Key: { formId } }));

  return NextResponse.json({ success: true });
}
