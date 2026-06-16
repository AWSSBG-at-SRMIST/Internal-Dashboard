import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isUserInCohort, isPresidium } from '@/lib/permissions';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.Item.status === 'CLOSED') return NextResponse.json({ error: 'Task is closed' }, { status: 400 });

    // Validate cohort membership for COHORT tasks
    if (task.Item.assignmentType === 'COHORT' && !isPresidium(user)) {
      const cohortResult = await db.send(new GetCommand({ TableName: TABLE.COHORTS, Key: { cohortId: task.Item.assignedToId } }));
      if (!cohortResult.Item || !isUserInCohort(user, cohortResult.Item as any)) {
        return NextResponse.json({ error: 'You are not part of this cohort' }, { status: 403 });
      }
    }

    // Check if already submitted
    const existing = await db.send(new QueryCommand({
      TableName: TABLE.SUBMISSIONS,
      IndexName: 'MemberIndex',
      KeyConditionExpression: 'memberId = :mid',
      FilterExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':mid': user.memberId, ':tid': taskId },
    }));
    if (existing.Items && existing.Items.length > 0) {
      return NextResponse.json({ error: 'You have already submitted for this task' }, { status: 409 });
    }

    const { content, links } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });

    // Validate links
    const validLinks = (links || []).filter((l: string) => {
      try { new URL(l); return true; } catch { return false; }
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
      ratingAwarded: null,
      deadline: task.Item.deadline,
      domain: task.Item.domain,
      subdomain: task.Item.subdomain,
    };

    await db.send(new PutCommand({ TableName: TABLE.SUBMISSIONS, Item: submission }));

    // Increment task submission count
    await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId },
      UpdateExpression: 'SET totalSubmissions = totalSubmissions + :one',
      ExpressionAttributeValues: { ':one': 1 },
    }));

    await logAction(user, 'SUBMIT_TASK', 'SUBMISSION', submissionId, `Submitted task: ${task.Item.title}`);

    return NextResponse.json({ success: true, data: submission });
  } catch (error) {
    console.error('Submit error:', error);
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
