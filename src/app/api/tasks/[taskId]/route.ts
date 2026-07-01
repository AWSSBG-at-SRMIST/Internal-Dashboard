import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canCreateTask, isTaskVisible, canSubmitTask } from '@/lib/permissions';
import { reverseSubmissionRating } from '@/lib/ratings';
import { autoCloseIfExpired } from '@/lib/tasks';
import { sendDelegateReviewEmail } from '@/lib/email';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const [taskResult, submissionsResult] = await Promise.all([
      db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } })),
      db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'TaskIndex',
        KeyConditionExpression: 'taskId = :tid',
        ExpressionAttributeValues: { ':tid': taskId },
      })),
    ]);

    if (!taskResult.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    taskResult.Item.status = await autoCloseIfExpired(taskResult.Item as any);

    const delegatedReviewers = (taskResult.Item.delegatedReviewers || []) as Array<{ memberId: string; memberName: string }>;
    const isDelegatedReviewer = delegatedReviewers.some(d => d.memberId === user.memberId);

    if (!isDelegatedReviewer && !isTaskVisible(user, taskResult.Item as any)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const submissions = submissionsResult.Items || [];
    const mySubmissions = submissions.filter((s: any) => s.memberId === user.memberId)
      .sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    const mySubmission = mySubmissions[0];

    // COLLECTIVE tasks: once any PENDING or APPROVED submission exists, the task is
    // locked — nobody else can submit until that submission is rejected.
    const isCollective = taskResult.Item.submissionMode === 'COLLECTIVE';
    let collectiveLockedBy: { memberId: string; memberName: string } | null = null;
    if (isCollective) {
      const active = submissions.find((s: any) => s.reviewStatus === 'PENDING' || s.reviewStatus === 'APPROVED');
      if (active) collectiveLockedBy = { memberId: active.memberId, memberName: active.memberName };
    }

    // Scope-gate canReview: a DIRECTOR can only review submissions within their domain,
    // a MANAGER within their domain+subdomain, or explicitly delegated reviewers.
    const canReview = isPresidium(user)
      || (user.role === 'DIRECTOR' && (!taskResult.Item.domain || taskResult.Item.domain === user.domain))
      || (user.role === 'MANAGER' && (!taskResult.Item.domain || (taskResult.Item.domain === user.domain && (!taskResult.Item.subdomain || taskResult.Item.subdomain === user.subdomain))))
      || isDelegatedReviewer;
    const visibleSubmissions = canReview ? submissions : mySubmissions;
    const canSubmit = taskResult.Item.status === 'OPEN'
      && !collectiveLockedBy
      && (!mySubmission || mySubmission.reviewStatus === 'REJECTED' || mySubmission.reviewStatus === 'REVISION_REQUESTED')
      && canSubmitTask(user, taskResult.Item as any);
    const canDelete = isPresidium(user) || taskResult.Item.createdBy === user.memberId;
    const canClose = canReview || taskResult.Item.createdBy === user.memberId;
    const canEdit = taskResult.Item.createdBy === user.memberId || canReview;
    const canDelegate = isPresidium(user) || taskResult.Item.createdBy === user.memberId;

    return NextResponse.json({
      success: true,
      data: {
        task: taskResult.Item,
        submissions: visibleSubmissions.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
        mySubmission: mySubmission || null,
        canReview,
        canSubmit,
        canDelete,
        canClose,
        canEdit,
        canDelegate,
        collectiveLockedBy,
      },
    });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canCreateTask(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { taskId } = await params;

  try {
    const body = await req.json();
    const { title, description, deadline, status, priority, delegatedReviewers } = body;

    if (status !== undefined && !['OPEN', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }
    if (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
    }

    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const existingDelegates = (task.Item.delegatedReviewers || []) as Array<{ memberId: string; memberName: string }>;
    const isDelegatedReviewer = existingDelegates.some(d => d.memberId === user.memberId);

    // Prevent leaking task existence — non-visible tasks appear as 404.
    if (!isDelegatedReviewer && !isTaskVisible(user, task.Item as any)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const canReview = isPresidium(user) || user.role === 'DIRECTOR' || user.role === 'MANAGER' || isDelegatedReviewer;
    const isCreator = task.Item.createdBy === user.memberId;

    // Mirrors GET's canClose (canReview || isCreator) — a reviewer who didn't
    // create the task must still be able to close it, not just see the button.
    if (!isCreator && !canReview) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (delegatedReviewers !== undefined) {
      if (!isCreator && !isPresidium(user)) {
        return NextResponse.json({ error: 'Only the task creator can manage delegates' }, { status: 403 });
      }
      if (!Array.isArray(delegatedReviewers) || delegatedReviewers.length > 2) {
        return NextResponse.json({ error: 'Maximum 2 delegates allowed' }, { status: 400 });
      }
      for (const d of delegatedReviewers) {
        if (!d.memberId || !d.memberName) {
          return NextResponse.json({ error: 'Invalid delegate entry' }, { status: 400 });
        }
        if (d.memberId === task.Item.createdBy) {
          return NextResponse.json({ error: 'Task creator cannot be a delegate' }, { status: 400 });
        }
      }
    }

    // Only reviewers (or the task creator) may close a task; regular creators
    // who can't review cannot reopen a task either.
    if (status === 'OPEN' && task.Item.status === 'CLOSED' && !canReview) {
      return NextResponse.json({ error: 'Only reviewers can reopen a closed task' }, { status: 403 });
    }

    const setParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, any> = {};

    if (title !== undefined)             { setParts.push('title = :t');                exprValues[':t']  = title; }
    if (description !== undefined)       { setParts.push('description = :d');          exprValues[':d']  = description; }
    if (priority !== undefined)          { setParts.push('priority = :p');             exprValues[':p']  = priority; }
    if (deadline !== undefined) {
      setParts.push('deadline = :dl', 'reminderSentAt = :null');
      exprValues[':dl'] = deadline;
      exprValues[':null'] = null;
    }
    if (status !== undefined)            { exprNames['#s'] = 'status'; setParts.push('#s = :s'); exprValues[':s'] = status; }
    if (delegatedReviewers !== undefined){ setParts.push('delegatedReviewers = :dr'); exprValues[':dr'] = delegatedReviewers; }

    if (setParts.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ...(Object.keys(exprNames).length > 0 && { ExpressionAttributeNames: exprNames }),
      ExpressionAttributeValues: exprValues,
    }));

    await logAction(user, 'UPDATE_TASK', 'TASK', taskId, `Updated task: ${title ?? taskId}`);

    // Send email to any newly added delegates
    if (delegatedReviewers !== undefined) {
      const newDelegates = (delegatedReviewers as Array<{ memberId: string; memberName: string }>)
        .filter(d => !existingDelegates.some(e => e.memberId === d.memberId));
      if (newDelegates.length > 0) {
        const origin = req.headers.get('origin') || req.headers.get('x-forwarded-proto')
          ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
          : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const taskUrl = `${origin}/tasks/${taskId}`;
        await Promise.allSettled(
          newDelegates.map(async d => {
            const member = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: d.memberId } }));
            if (member.Item?.officialEmail) {
              await sendDelegateReviewEmail(member.Item.officialEmail, d.memberName, task.Item!.title, user.name, taskUrl);
            }
          })
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.Item.createdBy !== user.memberId && !isPresidium(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cascade-delete all submissions for this task so they don't become
    // permanently orphaned (unrevievable, unreachable) after the task is gone.
    const subsResult = await db.send(new QueryCommand({
      TableName: TABLE.SUBMISSIONS,
      IndexName: 'TaskIndex',
      KeyConditionExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':tid': taskId },
    }));
    const subs = subsResult.Items || [];
    if (subs.length > 0) {
      // Reverse rating effects before deleting — each approved submission added
      // stars to the member's total; deletion must undo that.
      await Promise.all(subs.map((s: any) => reverseSubmissionRating(s)));
      await Promise.all(subs.map((s: any) =>
        db.send(new DeleteCommand({ TableName: TABLE.SUBMISSIONS, Key: { submissionId: s.submissionId } }))
      ));
    }

    await db.send(new DeleteCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    await logAction(user, 'DELETE_TASK', 'TASK', taskId, `Deleted task: ${task.Item.title}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
