import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand } from '@/lib/dynamodb';
import { canManageForm } from '@/lib/permissions';
import FormBuilder from '@/components/FormBuilder';
import type { FormDef } from '@/types';

export default async function EditFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { formId } = await params;
  const result = await db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } }));
  const form = result.Item as FormDef | undefined;
  if (!form) notFound();
  if (!canManageForm(user, form)) redirect('/forms');

  return <FormBuilder initial={form} formId={formId} />;
}
