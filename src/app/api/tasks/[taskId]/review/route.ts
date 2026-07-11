import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { calculateRating, applyRating } from '@/lib/ratings';
import { isPresidium, hasHierarchicalReviewAccess } from '@/lib/permissions';

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
    if (action === 'REVISE' && !trimmedFeedback) {
      return NextResponse.json({ error: 'Feedback is required when requesting a revision' }, { status: 400 });
    }

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

    // Mirror the same canReview logic as GET: creator, delegated reviewer,
    // presidium on a presidium-created task, or the hierarchy directly above
    // whoever created the task (e.g. a Manager's Director).
    const delegatedReviewers = (task.delegatedReviewers || []) as Array<{ memberId: string }>;
    const isDelegatedReviewer = delegatedReviewers.some(d => d.memberId === user.memberId);
    const taskCreatorIsPresidium = task.createdByRole === 'SBG_LEADER' || task.createdByRole === 'SECRETARY';
    const canReview = task.createdBy === user.memberId
      || isDelegatedReviewer
      || (isPresidium(user) && taskCreatorIsPresidium)
      || hasHierarchicalReviewAccess(user, task as any);

    if (!canReview) {
      return NextResponse.json({ error: 'Not authorized to review this submission' }, { status: 403 });
    }
    // Reviewers cannot review their own submissions
    if (submission.memberId === user.memberId) {
      return NextResponse.json({ error: 'You cannot review your own submission' }, { status: 403 });
    }

    let ratingDelta = 0;
    let late = false;
    if (action === 'APPROVE') {
      // Use task.deadline (current, possibly extended) not submission.deadline (captured at submit time)
      const result = calculateRating(submission.submittedAt, task.deadline);
      ratingDelta = result.delta;
      late = result.late;
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVISION_REQUESTED';

    if (task.submissionMode === 'COLLECTIVE') {
      if (action === 'APPROVE') {
        // Approving the first submission closes the task for everyone. If this
        // fails (task no longer OPEN), another submission for this same task
        // was already approved first — don't silently continue and award a
        // second star for a task that's already been credited once.
        const closed = await db.send(new UpdateCommand({
          TableName: TABLE.TASKS,
          Key: { taskId },
          UpdateExpression: 'SET #s = :closed',
          ConditionExpression: '#s = :open',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':closed': 'CLOSED', ':open': 'OPEN' },
        })).then(() => true).catch((err: any) => {
          if (err.name !== 'ConditionalCheckFailedException') throw err;
          return false;
        });
        if (!closed) {
          return NextResponse.json({ error: 'This task was already closed by another approved submission' }, { status: 409 });
        }
      } else {
        // REJECT or REVISE both allow a fresh submission afterwards (see the
        // resubmission check in tasks/[taskId]/route.ts) — release the
        // active-submission claim taken at submit time so that can happen.
        await db.send(new UpdateCommand({
          TableName: TABLE.TASKS,
          Key: { taskId },
          UpdateExpression: 'REMOVE activeSubmissionId',
        }));
      }
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.SUBMISSIONS,
      Key: { submissionId },
      UpdateExpression: 'SET reviewStatus = :s, reviewedBy = :rb, reviewedByName = :rbn, reviewedAt = :ra, ratingAwarded = :r, reviewFeedback = :fb, wasLate = :late',
      ConditionExpression: 'reviewStatus = :pending',
      ExpressionAttributeValues: {
        ':s':       newStatus,
        ':rb':      user.memberId,
        ':rbn':     user.name,
        ':ra':      new Date().toISOString(),
        ':r':       action === 'APPROVE' ? ratingDelta : null,
        ':fb':      trimmedFeedback,
        ':late':    action === 'APPROVE' ? late : null,
        ':pending': 'PENDING',
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
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Submission has already been reviewed' }, { status: 409 });
    }
    console.error('Review error:', error);
    return NextResponse.json({ error: 'Failed to review submission' }, { status: 500 });
  }
}
