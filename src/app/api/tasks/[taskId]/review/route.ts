import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { calculateRating, applyRating } from '@/lib/ratings';
import { canReviewSubmission } from '@/lib/permissions';
import type { Domain, Subdomain, TaskPriority } from '@/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const { submissionId, action, feedback } = await req.json(); // action: 'APPROVE' | 'REJECT' | 'REVISE'
    if (!submissionId || !['APPROVE', 'REJECT', 'REVISE'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (feedback !== undefined && typeof feedback !== 'string') {
      return NextResponse.json({ error: 'feedback must be a string' }, { status: 400 });
    }
    const trimmedFeedback = (feedback || '').trim() || null;

    const [submissionResult, taskResult] = await Promise.all([
      db.send(new GetCommand({ TableName: TABLE.SUBMISSIONS, Key: { submissionId } })),
      db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } })),
    ]);

    const submission = submissionResult.Item;
    const task = taskResult.Item;
    if (!submission || !task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.taskId !== taskId) return NextResponse.json({ error: 'Mismatch' }, { status: 400 });
    if (submission.reviewStatus !== 'PENDING') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
    }

    if (!canReviewSubmission(user, {
      memberId: submission.memberId,
      domain: submission.domain as Domain,
      subdomain: submission.subdomain as Subdomain,
    })) {
      return NextResponse.json({ error: 'Not authorized to review this submission' }, { status: 403 });
    }

    let ratingDelta = 0;
    let late = false;
    if (action === 'APPROVE') {
      const result = calculateRating(submission.submittedAt, submission.deadline, (task.priority as TaskPriority) || 'MEDIUM');
      ratingDelta = result.delta;
      late = result.late;
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVISION_REQUESTED';

    // COLLECTIVE task: approving the first submission closes the task for everyone.
    if (action === 'APPROVE' && task.submissionMode === 'COLLECTIVE') {
      await db.send(new UpdateCommand({
        TableName: TABLE.TASKS,
        Key: { taskId },
        UpdateExpression: 'SET #s = :closed',
        ConditionExpression: '#s = :open',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':closed': 'CLOSED', ':open': 'OPEN' },
      })).catch((err: any) => {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      });
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.SUBMISSIONS,
      Key: { submissionId },
      UpdateExpression: 'SET reviewStatus = :s, reviewedBy = :rb, reviewedByName = :rbn, reviewedAt = :ra, ratingAwarded = :r, reviewFeedback = :fb',
      ExpressionAttributeValues: {
        ':s':   newStatus,
        ':rb':  user.memberId,
        ':rbn': user.name,
        ':ra':  new Date().toISOString(),
        ':r':   action === 'APPROVE' ? ratingDelta : null,
        ':fb':  trimmedFeedback,
      },
    }));

    // REVISE: decrement pendingCount only (no star change, no approval/rejection counter).
    // APPROVE/REJECT: full rating application.
    await applyRating(submission.memberId, ratingDelta, action === 'REVISE' ? 'REVISE' : action, late);

    await logAction(
      user,
      `${action}_SUBMISSION`,
      'SUBMISSION',
      submissionId,
      action === 'REVISE'
        ? `Requested revision from ${submission.memberName} for task: ${task.title}`
        : `${action} submission by ${submission.memberName} for task: ${task.title}. Rating: ${ratingDelta > 0 ? '+' : ''}${ratingDelta}`,
    );

    return NextResponse.json({ success: true, ratingAwarded: action === 'APPROVE' ? ratingDelta : null });
  } catch (error) {
    console.error('Review error:', error);
    return NextResponse.json({ error: 'Failed to review submission' }, { status: 500 });
  }
}
