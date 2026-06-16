import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import CohortsClient from './CohortsClient';

export default async function CohortsPage() {
  const user = await getCurrentUser();
  const canManage = !!user && isPresidium(user);

  return <CohortsClient canManage={canManage} />;
}
