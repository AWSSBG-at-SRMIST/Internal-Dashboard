import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, QueryCommand } from '@/lib/dynamodb';
import { canManageForm } from '@/lib/permissions';
import type { FormDef, FormResponseRecord } from '@/types';
import ResponsesClient from './ResponsesClient';

export default async function ResponsesPage({ params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { formId } = await params;
  const formResult = await db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } }));
  const form = formResult.Item as FormDef | undefined;
  if (!form) notFound();
  if (!canManageForm(user, form)) redirect('/forms');

  const result = await db.send(new QueryCommand({
    TableName: TABLE.FORM_RESPONSES,
    KeyConditionExpression: 'formId = :f',
    ExpressionAttributeValues: { ':f': formId },
    ScanIndexForward: false,
  }));

  return <ResponsesClient form={form} responses={(result.Items || []) as FormResponseRecord[]} />;
}
