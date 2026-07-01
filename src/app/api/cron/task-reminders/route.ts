import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand, ScanCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { sendTaskReminderEmail } from '@/lib/email';
import { getEligibleMembers } from '@/lib/tasks';
import type { SessionUser } from '@/types';
import { timingSafeEqual } from 'crypto';

// Loops over every due task and emails each pending member sequentially across
// tasks — can run past Vercel's default function timeout once there are more
// than a handful of pending reminders. Raises the cap to this route's plan
// limit (Vercel silently clamps to whatever your plan allows).
export const maxDuration = 60;

const SYSTEM_ACTOR: SessionUser = {
  memberId: 'SYSTEM_CRON', name: 'System (Reminder Cron)', email: 'system@internal',
  role: 'SBG_LEADER', domain: null, subdomain: null,
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if no secret is configured
  const bearer = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  return (!!bearer && safeEqual(bearer, `Bearer ${secret}`)) || (!!headerSecret && safeEqual(headerSecret, secret));
}

// Triggered by an external scheduler (GitHub Actions cron, EventBridge Scheduler,
// cron-job.org, etc.) — there's no in-app cron, so nothing runs unless something
// hits this endpoint on a schedule with the CRON_SECRET. See AGENTS/README for setup.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const hoursBefore = parseInt(searchParams.get('hoursBefore') || '24');

  try {
    const now = Date.now();
    const windowEnd = now + hoursBefore * 60 * 60 * 1000;

    const [tasksResult, membersResult] = await Promise.all([
      db.send(new QueryCommand({
        TableName: TABLE.TASKS,
        IndexName: 'StatusCreatedIndex',
        KeyConditionExpression: '#s = :open',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':open': 'OPEN' },
      })),
      db.send(new ScanCommand({
        TableName: TABLE.MEMBERS,
        ProjectionExpression: 'memberId, #n, officialEmail, #d, subdomain, isActive',
        ExpressionAttributeNames: { '#n': 'name', '#d': 'domain' },
      })),
    ]);

    const dueSoonTasks = (tasksResult.Items || []).filter((t: any) => {
      if (t.reminderSentAt) return false;
      const deadline = new Date(t.deadline).getTime();
      return deadline > now && deadline <= windowEnd;
    });

    const activeMembers = (membersResult.Items || []).filter((m: any) => m.isActive !== false);

    let emailsSent = 0;
    const taskUrl = (taskId: string) => `${process.env.NEXT_PUBLIC_APP_URL || ''}/tasks/${taskId}`;

    for (const task of dueSoonTasks) {
      const eligibleMembers = getEligibleMembers(task, activeMembers);
      const submissionsResult = await db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'TaskIndex',
        KeyConditionExpression: 'taskId = :tid',
        ExpressionAttributeValues: { ':tid': task.taskId },
      }));

      const submittedMemberIds = new Set((submissionsResult.Items || []).map((s: any) => s.memberId));
      const pendingMembers = eligibleMembers.filter(m => !submittedMemberIds.has(m.memberId) && m.officialEmail);

      const results = await Promise.allSettled(
        pendingMembers.map(m => sendTaskReminderEmail(m.officialEmail, m.name, task.title, task.deadline, taskUrl(task.taskId)))
      );
      emailsSent += results.filter(r => r.status === 'fulfilled').length;

      await db.send(new UpdateCommand({
        TableName: TABLE.TASKS,
        Key: { taskId: task.taskId },
        UpdateExpression: 'SET reminderSentAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      }));
    }

    await logAction(
      SYSTEM_ACTOR, 'SEND_TASK_REMINDERS', 'TASK', 'BATCH',
      `Reminder cron: ${dueSoonTasks.length} task(s) due within ${hoursBefore}h, ${emailsSent} email(s) sent`
    );

    return NextResponse.json({ success: true, tasksProcessed: dueSoonTasks.length, emailsSent });
  } catch (error) {
    console.error('Task reminder cron error:', error);
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 });
  }
}
