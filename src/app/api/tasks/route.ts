import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canCreateTask, isTaskVisible } from '@/lib/permissions';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const myTasks = searchParams.get('my') === 'true';

    const [tasksResult, cohortsResult] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.TASKS })),
      db.send(new ScanCommand({ TableName: TABLE.COHORTS })),
    ]);

    let tasks = tasksResult.Items || [];
    const cohorts = cohortsResult.Items || [];
    const cohortMap = new Map(cohorts.map((c: any) => [c.cohortId, c]));

    // Filter visible tasks based on role
    tasks = tasks.filter((task: any) => isTaskVisible(user, task, cohortMap));

    if (status) tasks = tasks.filter((t: any) => t.status === status);
    if (myTasks) tasks = tasks.filter((t: any) => t.assignedToId === user.memberId || t.assignmentType === 'GENERAL');

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
    const { title, description, deadline, assignmentType, assignedToId, assignedToName, domain, subdomain } = body;

    if (!title || !description || !deadline || !assignmentType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const taskId = randomUUID();
    const task = {
      taskId,
      title,
      description,
      deadline,
      assignmentType,
      assignedToId: assignedToId || undefined,
      assignedToName: assignedToName || 'Everyone',
      domain: domain || undefined,
      subdomain: subdomain || undefined,
      createdBy: user.memberId,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      status: 'OPEN',
      totalSubmissions: 0,
    };

    await db.send(new PutCommand({ TableName: TABLE.TASKS, Item: task }));
    await logAction(user, 'CREATE_TASK', 'TASK', taskId, `Created task: ${title}`);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
