import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { canCreateForm } from '@/lib/permissions';
import { canViewFormResponses } from '@/lib/permissions';
import { loadActiveMembers } from '@/lib/permission-sync';
import type { FormDef } from '@/types';
import FormsListClient from './FormsListClient';

export default async function FormsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [result, allMembers] = await Promise.all([
    db.send(new ScanCommand({ TableName: TABLE.FORMS })),
    loadActiveMembers(),
  ]);
  const all = (result.Items || []) as FormDef[];
  const forms = all.filter(f => canViewFormResponses(user, f, allMembers));
  forms.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <FormsListClient forms={forms} canCreate={canCreateForm(user)} />;
}
