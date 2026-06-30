import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, QueryCommand, PutCommand, GetCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canCreateTask, isTaskVisible, canCreateScope } from '@/lib/permissions';
import { autoCloseIfExpired } from '@/lib/tasks';
import { isDeadlinePassed } from '@/lib/utils';
import { randomUUID } from 'crypto';
import type { TaskAssignmentScope, SubmissionMode } from '@/types';

const VALID_SCOPES: TaskAssignmentScope[] = [
  'ORG_WIDE', 'ALL_DIRECTORS', 'SINGLE_DIRECTOR',
  'DOMAIN_WIDE', 'SUBDOMAIN_LEADERSHIP',
  'SUBDOMAIN_WIDE', 'INDIVIDUAL', 'BUILDERS_ONLY',
];

// Scopes where submissionMode is forced to INDIVIDUAL (group logic doesn't apply)
const FORCE_INDIVIDUAL_SCOPES: TaskAssignmentScope[] = ['SINGLE_DIRECTOR', 'INDIVIDUAL'];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const myTasks = searchParams.get('my') === 'true';

    if (status !== null && !['OPEN', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const tasksResult = status
      ? await db.send(new QueryCommand({
          TableName: TABLE.TASKS,
          IndexName: 'StatusCreatedIndex',
          KeyConditionExpression: '#s = :status',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':status': status },
          ScanIndexForward: false,
        }))
      : await db.send(new ScanCommand({ TableName: TABLE.TASKS }));

    let tasks = tasksResult.Items || [];

    if (status !== 'CLOSED') {
      await Promise.all(
        tasks
          .filter((t: any) => t.status === 'OPEN' && isDeadlinePassed(t.deadline))
          .map(async (t: any) => { t.status = await autoCloseIfExpired(t); })
      );
    }

    tasks = tasks.filter((task: any) => isTaskVisible(user, task));
    if (status) tasks = tasks.filter((t: any) => t.status === status);

    // "My tasks" = tasks aimed directly at the user (not scoped group tasks)
    if (myTasks) tasks = tasks.filter((t: any) => {
      const s = t.assignmentType;
      return (
        s === 'ORG_WIDE' || s === 'GENERAL' ||
        (s === 'ALL_DIRECTORS' && user.role === 'DIRECTOR') ||
        ((s === 'SINGLE_DIRECTOR' || s === 'INDIVIDUAL' || s === 'PERSONAL') && t.assignedToId === user.memberId) ||
        // legacy BROADCAST org-wide
        (s === 'BROADCAST' && !t.domain)
      );
    });

    tasks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateTask(user)) {
    return NextResponse.json({ error: 'Unauthorized to create tasks' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, description, deadline, assignmentType: scope, assignedToId, domain, subdomain, priority, submissionMode } = body;

    if (!title || !description || !deadline || !scope) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid assignment scope' }, { status: 400 });
    }
    if (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
    }

    // Validate scope permission
    const scopeError = canCreateScope(user, scope, domain || null, subdomain || null, assignedToId || null);
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 403 });

    // Resolve assignedToName and verify target member where needed
    let resolvedAssignedToName = '';
    let resolvedDomain = domain || null;
    let resolvedSubdomain = subdomain || null;
    let resolvedAssignedToId: string | null = null;

    if (scope === 'ORG_WIDE') {
      resolvedAssignedToName = 'Everyone';
    } else if (scope === 'ALL_DIRECTORS') {
      resolvedAssignedToName = 'All Directors';
    } else if (scope === 'SINGLE_DIRECTOR') {
      const t = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: assignedToId } }));
      if (!t.Item || t.Item.role !== 'DIRECTOR') {
        return NextResponse.json({ error: 'Target must be an active Director' }, { status: 400 });
      }
      resolvedAssignedToName = t.Item.name;
      resolvedAssignedToId = assignedToId;
    } else if (scope === 'DOMAIN_WIDE') {
      resolvedAssignedToName = domain;
      resolvedDomain = domain;
    } else if (scope === 'SUBDOMAIN_LEADERSHIP') {
      resolvedAssignedToName = `${subdomain} Leadership`;
      resolvedDomain = domain;
      resolvedSubdomain = subdomain;
    } else if (scope === 'SUBDOMAIN_WIDE') {
      resolvedAssignedToName = user.subdomain || subdomain;
      resolvedDomain = user.domain;
      resolvedSubdomain = user.subdomain;
    } else if (scope === 'INDIVIDUAL') {
      const t = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: assignedToId } }));
      if (!t.Item) return NextResponse.json({ error: 'Target member not found' }, { status: 404 });
      if (t.Item.domain !== user.domain || t.Item.subdomain !== user.subdomain) {
        return NextResponse.json({ error: 'Target member must be in your subdomain' }, { status: 403 });
      }
      if (t.Item.memberId === user.memberId) {
        return NextResponse.json({ error: 'You cannot assign a task to yourself' }, { status: 400 });
      }
      resolvedAssignedToName = t.Item.name;
      resolvedAssignedToId = assignedToId;
      resolvedDomain = user.domain;
      resolvedSubdomain = user.subdomain;
    } else if (scope === 'BUILDERS_ONLY') {
      resolvedAssignedToName = `${user.subdomain} Builders`;
      resolvedDomain = user.domain;
      resolvedSubdomain = user.subdomain;
    }

    // Force INDIVIDUAL submission mode for personal scopes
    const resolvedMode: SubmissionMode =
      FORCE_INDIVIDUAL_SCOPES.includes(scope)
        ? 'INDIVIDUAL'
        : (['INDIVIDUAL', 'COLLECTIVE'].includes(submissionMode) ? submissionMode : 'INDIVIDUAL');

    const taskId = randomUUID();
    const task = {
      taskId,
      title,
      description,
      deadline,
      priority: priority || 'MEDIUM',
      assignmentType: scope,
      assignedToId: resolvedAssignedToId,
      assignedToName: resolvedAssignedToName,
      domain: resolvedDomain,
      subdomain: resolvedSubdomain,
      createdBy: user.memberId,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      status: 'OPEN',
      submissionMode: resolvedMode,
      totalSubmissions: 0,
    };

    await db.send(new PutCommand({ TableName: TABLE.TASKS, Item: task }));
    await logAction(user, 'CREATE_TASK', 'TASK', taskId, `Created task: ${title} [${scope}/${resolvedMode}]`);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
