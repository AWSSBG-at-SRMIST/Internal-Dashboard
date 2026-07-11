import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canCreateVaultEntry } from '@/lib/permissions';
import { getVisibleVaultEntries } from '@/lib/vault';
import VaultClient from './VaultClient';

export default async function VaultPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entries = await getVisibleVaultEntries(user);
  return <VaultClient me={user} initialEntries={entries} canCreate={canCreateVaultEntry(user)} />;
}
