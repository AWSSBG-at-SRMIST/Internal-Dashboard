import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getAnalyticsData } from '@/lib/analytics';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get('days');
    let days: number | null | undefined;
    if (daysParam === 'all') days = null;
    else if (daysParam) {
      const parsed = parseInt(daysParam, 10);
      days = Number.isFinite(parsed) ? parsed : undefined;
    }
    const domain = searchParams.get('domain');

    const data = await getAnalyticsData({ days, domain });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
