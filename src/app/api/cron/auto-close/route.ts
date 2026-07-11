import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import { closeWithNoSubmissionPenalty } from '@/lib/tasks';
import { parseTaskDeadline } from '@/lib/utils';
import { timingSafeEqual } from 'crypto';

export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  return (!!bearer && safeEqual(bearer, `Bearer ${secret}`)) || (!!headerSecret && safeEqual(headerSecret, secret));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000; // 24h ago

    // Query both OPEN and CLOSED tasks — tasks closed lazily (by autoCloseIfExpired)
    // still need the penalty pass if it hasn't been claimed yet.
    const [openResult, closedResult] = await Promise.all([
      db.send(new QueryCommand({
        TableName: TABLE.TASKS,
        IndexName: 'StatusCreatedIndex',
        KeyConditionExpression: '#s = :open',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':open': 'OPEN' },
      })),
      db.send(new QueryCommand({
        TableName: TABLE.TASKS,
        IndexName: 'StatusCreatedIndex',
        KeyConditionExpression: '#s = :closed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':closed': 'CLOSED' },
      })),
    ]);

    const allTasks = [...(openResult.Items || []), ...(closedResult.Items || [])];

    // Tasks that qualify for the grace-expiry penalty pass: deadline passed >24h ago,
    // penalty not yet claimed, and either zero submissions (any mode) or a multi-assignee
    // Individual task (which may have partial submissions still needing the pass to
    // penalise whoever hasn't submitted).
    const qualifying = allTasks.filter((t: any) =>
      !t.noSubmissionPenaltyAt &&
      parseTaskDeadline(t.deadline).getTime() < cutoff &&
      ((t.totalSubmissions ?? 0) === 0 || (t.submissionMode === 'INDIVIDUAL' && !t.assignedToId))
    );

    let tasksClosed = 0;
    let penaltiesApplied = 0;

    for (const task of qualifying) {
      const wasOpen = task.status === 'OPEN';
      const result = await closeWithNoSubmissionPenalty(task as any);
      if (result.applied) {
        if (wasOpen) tasksClosed++;
        penaltiesApplied += result.penalisedCount;
      }
    }

    return NextResponse.json({
      success: true,
      tasksProcessed: qualifying.length,
      tasksClosed,
      penaltiesApplied,
    });
  } catch (error) {
    console.error('Auto-close cron error:', error);
    return NextResponse.json({ error: 'Failed to run auto-close' }, { status: 500 });
  }
}
