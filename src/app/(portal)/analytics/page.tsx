import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getAnalyticsData } from '@/lib/analytics';
import { AnalyticsTabs } from '@/components/ui/analytics-tabs';
import AnalyticsCharts from './AnalyticsCharts';

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isPresidium(user)) redirect('/dashboard');

  const analytics = await getAnalyticsData();

  return (
    <div>
      <AnalyticsTabs />
      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
