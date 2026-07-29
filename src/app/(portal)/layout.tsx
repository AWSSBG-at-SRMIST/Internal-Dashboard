import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { hasVaultAccess } from '@/lib/vault';
import { db, TABLE, GetCommand } from '@/lib/dynamodb';
import { Sidebar } from '@/components/layout/Sidebar';
import HeartbeatTracker from '@/components/layout/HeartbeatTracker';

// Mirrors the field list EditContactDialog checks on the Profile page itself
// — kept in sync so the sidebar's completion count always matches what
// clicking through to /profile actually shows as missing.
const CONTACT_FIELDS = ['phone', 'personalEmail', 'github', 'linkedin', 'instagram', 'meetup', 'builderId'] as const;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '/dashboard';
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  const [showVault, memberResult] = await Promise.all([
    hasVaultAccess(user),
    db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: user.memberId } })),
  ]);

  const member = memberResult.Item;
  const profileMissingCount = member
    ? CONTACT_FIELDS.filter(f => !String(member[f] || '').trim()).length
    : 0;

  return (
    <>
      <HeartbeatTracker />
      <Sidebar user={user} showVault={showVault} profileMissingCount={profileMissingCount}>{children}</Sidebar>
    </>
  );
}
