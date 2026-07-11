import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { recordHeartbeat } from '@/lib/activity';

// Fired by every logged-in member's client every ~60s while their tab is
// visible/focused (see HeartbeatTracker). Deliberately tiny — no audit log,
// no response body beyond success, since this runs constantly in the
// background and isn't a user-initiated action worth cluttering the audit
// trail with.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await recordHeartbeat(user);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 });
  }
}
