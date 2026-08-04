import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getHonoraryMembers } from '@/lib/honorary';
import HonoraryMembersClient from './HonoraryMembersClient';

export default async function HonoraryMembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isPresidium(user)) redirect('/dashboard');

  const members = await getHonoraryMembers();

  return <HonoraryMembersClient initialMembers={members} />;
}
