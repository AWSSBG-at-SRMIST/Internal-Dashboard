import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccessSponsorshipMail } from '@/lib/permissions';
import { getSponsorshipOutreachLog } from '@/lib/sponsorship-outreach';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canAccessSponsorshipMail(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const data = await getSponsorshipOutreachLog();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sponsorship outreach log error:', error);
    return NextResponse.json({ error: 'Failed to fetch outreach log' }, { status: 500 });
  }
}
