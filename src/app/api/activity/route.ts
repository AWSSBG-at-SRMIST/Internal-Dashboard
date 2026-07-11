import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getActivitySummary } from '@/lib/activity';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPresidium(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const data = await getActivitySummary();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Activity summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity summary' }, { status: 500 });
  }
}
