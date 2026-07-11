import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getActiveMembers } from '@/lib/members';
import MembersClient from './MembersClient';

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const members = await getActiveMembers(user);

  return <MembersClient initialMembers={members} />;
}
