import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canCreateTask, isTaskVisible, getTaskRelationship, canSubmitTask, hasHierarchicalReviewAccess } from '@/lib/permissions';
import { reverseSubmissionRating, reviseApprovedSubmissionRatings } from '@/lib/ratings';
import { autoCloseIfExpired, reverseNoSubmissionPenalty, resolveHierarchicalReviewers } from '@/lib/tasks';
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

    // Task creator and delegated reviewers always see all submissions and can
    // act on them. Presidium tasks are centralised — if the creator was
    // presidium, any presidium member can act too. On top of that, the
    // hierarchy directly above whoever created the task (e.g. a Manager's
    // Director, an Associate's Manager+Director) also gets full action power —
    // see hasHierarchicalReviewAccess for the exact rule per scope.
    const creatorIsPresidium = taskResult.Item.createdByRole === 'SBG_LEADER' || taskResult.Item.createdByRole === 'SECRETARY';
    const hasHierarchyAccess = hasHierarchicalReviewAccess(user, taskResult.Item as any);
    const canReview = taskResult.Item.createdBy === user.memberId
      || isDelegatedReviewer
      || (isPresidium(user) && creatorIsPresidium)
      || hasHierarchyAccess;

    // Broader than canReview: everyone with any oversight relationship to the
    // task (not just those with action power) can see every submission —
    // they just can't approve/reject/close/edit unless canReview is also true.
    const canViewSubmissions = canReview || getTaskRelationship(user, taskResult.Item as any) === 'VISIBLE_ONLY';
    const visibleSubmissions = canViewSubmissions ? submissions : mySubmissions;

    const canSubmit = taskResult.Item.status === 'OPEN'
      && !collectiveLockedBy
      && !isDelegatedReviewer
      && (!mySubmission || mySubmission.reviewStatus === 'REJECTED' || mySubmission.reviewStatus === 'REVISION_REQUESTED')
      && canSubmitTask(user, taskResult.Item as any);
    const canDelete = isPresidium(user) || taskResult.Item.createdBy === user.memberId;
    const canEdit = taskResult.Item.createdBy === user.memberId || canReview;
    // Presidium can delegate on any task; directors can delegate only on their own tasks.
    const canDelegate = isPresidium(user) || (user.role === 'DIRECTOR' && taskResult.Item.createdBy === user.memberId);
    // Tells the picker what members to show: 'ANY' for presidium, or a domain string for directors.
    const delegateFilter: string = isPresidium(user) ? 'ANY' : (user.domain ?? 'ANY');

    // Named hierarchy reviewers (e.g. "the Director") shown alongside manually
    // delegated ones in the UI so it's clear who else can review this task.
    let hierarchyReviewers: Array<{ memberId: string; memberName: string; role: string }> = [];
    if (canViewSubmissions) {
      const membersResult = await db.send(new ScanCommand({
        TableName: TABLE.MEMBERS,
        ProjectionExpression: 'memberId, #n, #r, #d, subdomain, isActive',
        ExpressionAttributeNames: { '#n': 'name', '#r': 'role', '#d': 'domain' },
      }));
      const activeMembers = (membersResult.Items || []).filter((m: any) => m.isActive !== false);
      hierarchyReviewers = resolveHierarchicalReviewers(taskResult.Item, activeMembers)
        .map((m: any) => ({ memberId: m.memberId, memberName: m.name, role: m.role }));
    }

    return NextResponse.json({
      success: true,
      data: {
        task: taskResult.Item,
        submissions: visibleSubmissions.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
        mySubmission: mySubmission || null,
        canReview,
        canViewSubmissions,
        canSubmit,
        canDelete,
        canEdit,
        canDelegate,
        delegateFilter,
        hierarchyReviewers,
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
    const { title, description, deadline, priority, delegatedReviewers } = body;

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

    const isCreator = task.Item.createdBy === user.memberId;
    const taskCreatorIsPresidium = task.Item.createdByRole === 'SBG_LEADER' || task.Item.createdByRole === 'SECRETARY';
    const canReview = isCreator
      || isDelegatedReviewer
      || (isPresidium(user) && taskCreatorIsPresidium)
      || hasHierarchicalReviewAccess(user, task.Item as any);

    // Mirrors GET's canEdit — only the creator or a reviewer may edit the task.
    if (!isCreator && !canReview) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (delegatedReviewers !== undefined) {
      const isDirectorOwner = user.role === 'DIRECTOR' && isCreator;
      if (!isPresidium(user) && !isDirectorOwner) {
        return NextResponse.json({ error: 'Only Presidium or the task creator (Director) can manage delegates' }, { status: 403 });
      }
      if (!Array.isArray(delegatedReviewers)) {
        return NextResponse.json({ error: 'Invalid delegatedReviewers' }, { status: 400 });
      }
      // Validate each proposed delegate entry
      const uniqueIds = new Set<string>();
      for (const d of delegatedReviewers) {
        if (!d.memberId || !d.memberName) {
          return NextResponse.json({ error: 'Invalid delegate entry' }, { status: 400 });
        }
        if (d.memberId === task.Item.createdBy) {
          return NextResponse.json({ error: 'Task creator cannot be a delegate' }, { status: 400 });
        }
        if (uniqueIds.has(d.memberId)) {
          return NextResponse.json({ error: 'Duplicate delegate entries are not allowed' }, { status: 400 });
        }
        uniqueIds.add(d.memberId);
      }
      // Directors: verify all delegates belong to their domain
      if (isDirectorOwner && !isPresidium(user)) {
        const memberLookups = await Promise.all(
          (delegatedReviewers as Array<{ memberId: string }>).map(d =>
            db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: d.memberId } }))
          )
        );
        for (const lookup of memberLookups) {
          if (!lookup.Item || lookup.Item.domain !== user.domain) {
            return NextResponse.json({ error: 'Directors can only delegate to members within their domain' }, { status: 403 });
          }
        }
      }
    }

    // There's no manual close/reopen action anymore — status only ever
    // changes automatically (deadline passing, COLLECTIVE approval) or
    // implicitly here when the deadline is extended on a closed task (below).

    // The edit form always resends the deadline field even when the user
    // didn't touch it, so only treat it as an actual change (and trigger the
    // reopen/revise logic below) if the resulting instant is different from
    // what's already stored — a raw string compare would false-positive on
    // format differences alone (e.g. datetime-local vs stored ISO).
    const deadlineChanged = deadline !== undefined
      && new Date(deadline).getTime() !== new Date(task.Item.deadline).getTime();

    // Extending the deadline on a closed task is only ever done to give it a
    // fresh shot — reopen it implicitly. If the task had already taken the
    // no-submission penalty, that verdict was against the old deadline and no
    // longer holds, so reverse it and let auto-close re-evaluate fresh.
    const hadNoSubmissionPenalty = !!task.Item.noSubmissionPenaltyAt;
    const isReopeningViaDeadlineExtend = deadlineChanged && task.Item.status === 'CLOSED';
    const effectiveStatus = isReopeningViaDeadlineExtend ? 'OPEN' : undefined;

    if (deadlineChanged && hadNoSubmissionPenalty) {
      await reverseNoSubmissionPenalty(task.Item as any);
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
      if (deadlineChanged && hadNoSubmissionPenalty) {
        setParts.push('noSubmissionPenaltyAt = :nspNull', 'noSubmissionPenalisedMemberIds = :emptyIds');
        exprValues[':nspNull'] = null;
        exprValues[':emptyIds'] = [];
      }
    }
    if (effectiveStatus !== undefined)   { exprNames['#s'] = 'status'; setParts.push('#s = :s'); exprValues[':s'] = effectiveStatus; }
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

    // Every already-approved submission's star award was calculated against
    // the old deadline — recompute against the new one so a straggler who was
    // "late" under the old deadline (and got -1⭐) correctly becomes "on time"
    // (or vice versa) once the deadline moves.
    if (deadlineChanged) {
      await reviseApprovedSubmissionRatings(taskId, deadline);
    }

    await logAction(user, 'UPDATE_TASK', 'TASK', taskId, `Updated task: ${title ?? taskId}`);

    // Send email to any newly added delegates
    if (delegatedReviewers !== undefined) {
      const newDelegates = (delegatedReviewers as Array<{ memberId: string; memberName: string }>)
        .filter(d => !existingDelegates.some(e => e.memberId === d.memberId));
      if (newDelegates.length > 0) {
        const proto = req.headers.get('x-forwarded-proto');
        const host = req.headers.get('host');
        const origin = (proto && host)
          ? `${proto}://${host}`
          : (req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
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

    // Also reverse the blanket no-submission penalty, if one was applied —
    // it isn't tied to any submission row so the loop above never touches it.
    await reverseNoSubmissionPenalty(task.Item as any);

    await db.send(new DeleteCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    await logAction(user, 'DELETE_TASK', 'TASK', taskId, `Deleted task: ${task.Item.title}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
