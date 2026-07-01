import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand, ScanCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { getEligibleMembers } from '@/lib/tasks';
import type { SessionUser } from '@/types';
import { timingSafeEqual } from 'crypto';

export const maxDuration = 60;

const SYSTEM_ACTOR: SessionUser = {
  memberId: 'SYSTEM_CRON', name: 'System (Auto-Close Cron)', email: 'system@internal',
  role: 'SBG_LEADER', domain: null, subdomain: null,
};

const NO_SUBMISSION_PENALTY = -2;

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
    const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // 24h ago

    // Query both OPEN and CLOSED tasks — tasks closed lazily (by autoCloseIfExpired)
    // still need the penalty applied if they had 0 submissions at close time.
    const [openResult, closedResult, membersResult] = await Promise.all([
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
      db.send(new ScanCommand({
        TableName: TABLE.MEMBERS,
        ProjectionExpression: 'memberId, #n, #d, subdomain, #r, isActive',
        ExpressionAttributeNames: { '#n': 'name', '#d': 'domain', '#r': 'role' },
      })),
    ]);

    const allTasks = [...(openResult.Items || []), ...(closedResult.Items || [])];
    const activeMembers = (membersResult.Items || []).filter((m: any) => m.isActive !== false);

    // Tasks that qualify: 0 submissions, deadline passed >24h ago, penalty not yet applied
    const qualifying = allTasks.filter((t: any) =>
      (t.totalSubmissions ?? 0) === 0 &&
      t.deadline < cutoff &&
      !t.noSubmissionPenaltyAt
    );

    let tasksClosed = 0;
    let penaltiesApplied = 0;

    for (const task of qualifying) {
      const eligible = getEligibleMembers(task, activeMembers);

      // Close the task if still OPEN
      if (task.status === 'OPEN') {
        await db.send(new UpdateCommand({
          TableName: TABLE.TASKS,
          Key: { taskId: task.taskId },
          UpdateExpression: 'SET #s = :closed, noSubmissionPenaltyAt = :ts',
          ConditionExpression: '#s = :open',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':closed': 'CLOSED',
            ':open': 'OPEN',
            ':ts': new Date().toISOString(),
          },
        })).catch((err: any) => {
          // Already closed by lazy mechanism — that's fine, still mark penalty
          if (err.name !== 'ConditionalCheckFailedException') throw err;
        });
        tasksClosed++;
      } else {
        // Already CLOSED — just stamp the penalty marker
        await db.send(new UpdateCommand({
          TableName: TABLE.TASKS,
          Key: { taskId: task.taskId },
          UpdateExpression: 'SET noSubmissionPenaltyAt = :ts',
          ExpressionAttributeValues: { ':ts': new Date().toISOString() },
        }));
      }

      // Apply -2 to every eligible member
      await Promise.allSettled(
        eligible.map((m: any) =>
          db.send(new UpdateCommand({
            TableName: TABLE.MEMBERS,
            Key: { memberId: m.memberId },
            UpdateExpression: 'SET totalStars = totalStars + :delta',
            ExpressionAttributeValues: { ':delta': NO_SUBMISSION_PENALTY },
          }))
        )
      );
      penaltiesApplied += eligible.length;

      await logAction(
        SYSTEM_ACTOR,
        'AUTO_CLOSE_TASK',
        'TASK',
        task.taskId,
        `Auto-closed "${task.title}" — no submissions after 24h past deadline. ${eligible.length} member(s) penalised ${NO_SUBMISSION_PENALTY} stars.`
      );
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
