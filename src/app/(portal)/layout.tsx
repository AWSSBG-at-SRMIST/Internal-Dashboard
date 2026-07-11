import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { hasVaultAccess } from '@/lib/vault';
import { Sidebar } from '@/components/layout/Sidebar';
import HeartbeatTracker from '@/components/layout/HeartbeatTracker';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '/dashboard';
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  const showVault = await hasVaultAccess(user);

  return (
    <>
      <HeartbeatTracker />
      <Sidebar user={user} showVault={showVault}>{children}</Sidebar>
    </>
  );
}
