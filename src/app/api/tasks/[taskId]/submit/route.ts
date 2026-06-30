import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canSubmitTask } from '@/lib/permissions';
import { incrementPendingCount } from '@/lib/ratings';
import { autoCloseIfExpired } from '@/lib/tasks';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    task.Item.status = await autoCloseIfExpired(task.Item as any);
    if (task.Item.status === 'CLOSED') return NextResponse.json({ error: 'Task is closed' }, { status: 400 });

    if (!canSubmitTask(user, task.Item as any)) {
      return NextResponse.json({ error: 'You are not eligible to submit to this task' }, { status: 403 });
    }

    const isCollective = task.Item.submissionMode === 'COLLECTIVE';

    if (isCollective) {
      // COLLECTIVE: lock the task once anyone submits — only one active submission allowed.
      // Paginate to be safe (FilterExpression applies post-1MB-page).
      let lastKey: Record<string, any> | undefined;
      do {
        const existing = await db.send(new QueryCommand({
          TableName: TABLE.SUBMISSIONS,
          IndexName: 'TaskIndex',
          KeyConditionExpression: 'taskId = :tid',
          FilterExpression: 'reviewStatus = :pending OR reviewStatus = :approved',
          ExpressionAttributeValues: { ':tid': taskId, ':pending': 'PENDING', ':approved': 'APPROVED' },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }));
        if (existing.Items && existing.Items.length > 0) {
          const blocker = existing.Items[0];
          return NextResponse.json({
            error: `This task has already been submitted by ${blocker.memberName}`,
          }, { status: 409 });
        }
        lastKey = existing.LastEvaluatedKey as Record<string, any> | undefined;
      } while (lastKey);
    } else {
      // INDIVIDUAL: only block if *this* member already has an active submission.
      let lastKey: Record<string, any> | undefined;
      do {
        const existing = await db.send(new QueryCommand({
          TableName: TABLE.SUBMISSIONS,
          IndexName: 'MemberIndex',
          KeyConditionExpression: 'memberId = :mid',
          FilterExpression: 'taskId = :tid AND (reviewStatus = :pending OR reviewStatus = :approved)',
          ExpressionAttributeValues: { ':mid': user.memberId, ':tid': taskId, ':pending': 'PENDING', ':approved': 'APPROVED' },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }));
        if (existing.Items && existing.Items.length > 0) {
          return NextResponse.json({ error: 'You have already submitted for this task' }, { status: 409 });
        }
        lastKey = existing.LastEvaluatedKey as Record<string, any> | undefined;
      } while (lastKey);
    }

    const { content, links } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });

    const validLinks = (links || []).filter((l: string) => {
      try {
        const p = new URL(l);
        return p.protocol === 'https:' || p.protocol === 'http:';
      } catch { return false; }
    });

    const submissionId = randomUUID();
    const submission = {
      submissionId,
      taskId,
      taskTitle: task.Item.title,
      memberId: user.memberId,
      memberName: user.name,
      content: content.trim(),
      links: validLinks,
      submittedAt: new Date().toISOString(),
      reviewStatus: 'PENDING',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewFeedback: null,
      ratingAwarded: null,
      deadline: task.Item.deadline,
      domain: task.Item.domain,
      subdomain: task.Item.subdomain,
    };

    await db.send(new PutCommand({ TableName: TABLE.SUBMISSIONS, Item: submission }));
    await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId },
      UpdateExpression: 'SET totalSubmissions = totalSubmissions + :one',
      ExpressionAttributeValues: { ':one': 1 },
    }));
    await incrementPendingCount(user.memberId);
    await logAction(user, 'SUBMIT_TASK', 'SUBMISSION', submissionId, `Submitted task: ${task.Item.title}`);

    return NextResponse.json({ success: true, data: submission });
  } catch (error) {
    console.error('Submit error:', error);
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
