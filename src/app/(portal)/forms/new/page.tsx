import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canCreateForm } from '@/lib/permissions';
import FormBuilder from '@/components/FormBuilder';

export default async function NewFormPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canCreateForm(user)) redirect('/forms');

  return <FormBuilder />;
}
