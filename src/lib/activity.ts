import { db, TABLE, UpdateCommand, ScanCommand } from '@/lib/dynamodb';
import type { SessionUser } from '@/types';

// Minimum gap between two heartbeats that both count toward activeMinutes —
// stops multiple tabs/devices from the same member double-counting minutes
// when their heartbeats land within the same window.
const MIN_HEARTBEAT_GAP_MS = 55_000;

function getISTDateString(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which also happens to sort correctly as a
  // plain string — exactly what date-range comparisons below rely on.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

// Called on every heartbeat ping while a member has the app open and
// focused. Accumulates activeMinutes on a per-member-per-day row
// (activityId = "memberId#YYYY-MM-DD"), incrementing at most once per
// MIN_HEARTBEAT_GAP_MS via a single atomic conditional update — mirrors the
// same conditional-UpdateCommand pattern used by checkRateLimit().
export async function recordHeartbeat(user: SessionUser): Promise<void> {
  const today = getISTDateString();
  const activityId = `${user.memberId}#${today}`;
  const now = Date.now();

  try {
    await db.send(new UpdateCommand({
      TableName: TABLE.ACTIVITY,
      Key: { activityId },
      UpdateExpression: `SET
        memberId = :mid,
        memberName = :name,
        #d = :date,
        activeMinutes = if_not_exists(activeMinutes, :zero) + :one,
        lastActiveAt = :now`,
      ConditionExpression: 'attribute_not_exists(lastActiveAt) OR lastActiveAt < :cutoff',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: {
        ':mid': user.memberId,
        ':name': user.name,
        ':date': today,
        ':zero': 0,
        ':one': 1,
        ':now': now,
        ':cutoff': now - MIN_HEARTBEAT_GAP_MS,
      },
    }));
  } catch (err: any) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    // A heartbeat already landed within the last minute (another tab beat us
    // to it) — just refresh lastActiveAt without double-incrementing.
    await db.send(new UpdateCommand({
      TableName: TABLE.ACTIVITY,
      Key: { activityId },
      UpdateExpression: 'SET lastActiveAt = :now',
      ExpressionAttributeValues: { ':now': now },
    })).catch(() => {}); // best-effort; losing this race too just means a slightly stale lastActiveAt
  }
}

export interface MemberActivitySummary {
  memberId: string;
  memberName: string;
  weekHours: number;
  monthHours: number;
  allTimeHours: number;
  daysVisitedLast30: number;
}

// Aggregates every per-day row into per-member totals. Cheap at this club's
// scale (one row per member per active day) — a plain Scan + in-memory
// grouping, same pattern used by every other analytics-style helper here.
export async function getActivitySummary(): Promise<MemberActivitySummary[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.ACTIVITY }));
  const rows = (result.Items || []) as Array<{ memberId: string; memberName: string; date: string; activeMinutes: number }>;

  const weekCutoff = getISTDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const monthCutoff = getISTDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const byMember = new Map<string, { memberName: string; weekMin: number; monthMin: number; allMin: number; daysLast30: number }>();

  for (const row of rows) {
    const entry = byMember.get(row.memberId) ?? { memberName: row.memberName, weekMin: 0, monthMin: 0, allMin: 0, daysLast30: 0 };
    entry.memberName = row.memberName;
    entry.allMin += row.activeMinutes || 0;
    if (row.date >= monthCutoff) {
      entry.monthMin += row.activeMinutes || 0;
      entry.daysLast30 += 1;
    }
    if (row.date >= weekCutoff) entry.weekMin += row.activeMinutes || 0;
    byMember.set(row.memberId, entry);
  }

  return Array.from(byMember.entries())
    .map(([memberId, e]) => ({
      memberId,
      memberName: e.memberName,
      weekHours: Math.round((e.weekMin / 60) * 10) / 10,
      monthHours: Math.round((e.monthMin / 60) * 10) / 10,
      allTimeHours: Math.round((e.allMin / 60) * 10) / 10,
      daysVisitedLast30: e.daysLast30,
    }))
    .sort((a, b) => b.weekHours - a.weekHours);
}
