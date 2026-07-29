import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canEditMembers } from '@/lib/permissions';
import { getAllMembersForAdmin } from '@/lib/members';
import ManageMembersClient from './ManageMembersClient';

export default async function ManageMembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canEditMembers(user)) redirect('/members');

  const members = await getAllMembersForAdmin();

  return <ManageMembersClient me={user} initialMembers={members} />;
}
