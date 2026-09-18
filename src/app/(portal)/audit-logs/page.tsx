import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getAuditLogs } from '@/lib/audit';
import { AnalyticsTabs } from '@/components/ui/analytics-tabs';
import AuditLogsClient from './AuditLogsClient';

export default async function AuditLogsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isPresidium(user)) redirect('/dashboard');

  const logs = await getAuditLogs(200);

  return (
    <div>
      <AnalyticsTabs />
      <AuditLogsClient initialLogs={logs} />
    </div>
  );
}
