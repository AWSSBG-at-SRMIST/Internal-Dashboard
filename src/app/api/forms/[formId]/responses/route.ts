import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, GetCommand, QueryCommand } from '@/lib/dynamodb';
import { getCurrentUser } from '@/lib/auth';
import { canViewFormResponses } from '@/lib/permissions';
import { loadActiveMembers } from '@/lib/permission-sync';
import type { FormDef } from '@/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { formId } = await params;
  const formResult = await db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } }));
  const form = formResult.Item as FormDef | undefined;
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const allMembers = await loadActiveMembers();
  if (!canViewFormResponses(user, form, allMembers)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await db.send(new QueryCommand({
    TableName: TABLE.FORM_RESPONSES,
    KeyConditionExpression: 'formId = :f',
    ExpressionAttributeValues: { ':f': formId },
    ScanIndexForward: false,
  }));

  return NextResponse.json({ success: true, data: { form, responses: result.Items || [] } });
}
