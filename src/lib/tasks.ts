import { db, TABLE, UpdateCommand, ScanCommand } from '@/lib/dynamodb';

// Resolves which members are eligible for a task's assignment scope.
// Handles all current scopes and legacy types (PERSONAL/BROADCAST/INDIVIDUAL/GENERAL/DOMAIN/SUBDOMAIN).
export function getEligibleMembers(task: any, members: any[]): any[] {
  const type = task.assignmentType;
  if (type === 'ORG_WIDE' || type === 'GENERAL') return members;
  if (type === 'ALL_DIRECTORS') return members.filter((m: any) => m.role === 'DIRECTOR');
  if (type === 'SINGLE_DIRECTOR' || type === 'INDIVIDUAL' || type === 'PERSONAL')
    return members.filter((m: any) => m.memberId === task.assignedToId);
  if (type === 'DOMAIN_WIDE' || type === 'DOMAIN') return members.filter((m: any) => m.domain === task.domain);
  if (type === 'SUBDOMAIN_LEADERSHIP') return members.filter((m: any) =>
    m.domain === task.domain && m.subdomain === task.subdomain &&
    (m.role === 'MANAGER' || m.role === 'ASSOCIATE')
  );
  if (type === 'SUBDOMAIN_WIDE' || type === 'SUBDOMAIN') return members.filter((m: any) => m.domain === task.domain && m.subdomain === task.subdomain);
  if (type === 'BUILDERS_ONLY') return members.filter((m: any) => m.domain === task.domain && m.subdomain === task.subdomain && m.role === 'BUILDER');
  if (type === 'BROADCAST') {
    if (!task.domain) return members;
    if (!task.subdomain) return members.filter((m: any) => m.domain === task.domain);
    return members.filter((m: any) => m.domain === task.domain && m.subdomain === task.subdomain);
  }
  return [];
}
import { isDeadlinePassed } from '@/lib/utils';
import { isTaskVisible } from '@/lib/permissions';
import type { SessionUser, Task } from '@/types';

// Tasks aren't closed by any scheduled job — we lazily flip OPEN -> CLOSED
// the moment anyone reads/touches a task past its deadline, so the status
// is always correct without needing a cron/Lambda (keeps this $0 infra).
export async function autoCloseIfExpired(task: { taskId: string; status: string; deadline: string }): Promise<string> {
  if (task.status !== 'OPEN' || !isDeadlinePassed(task.deadline)) return task.status;

  await db.send(new UpdateCommand({
    TableName: TABLE.TASKS,
    Key: { taskId: task.taskId },
    UpdateExpression: 'SET #s = :closed',
    ConditionExpression: '#s = :open',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':closed': 'CLOSED', ':open': 'OPEN' },
  })).catch((err: any) => {
    // Another concurrent request already closed it — fine, ignore.
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  });

  return 'CLOSED';
}

// Mirrors the GET /api/tasks (no status/my filters) logic — used by the
// tasks list Server Component for the initial render. Keep in sync if the
// route's base query/visibility logic changes.
export async function getVisibleTasksForUser(user: SessionUser): Promise<Task[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.TASKS }));
  const tasks = (result.Items || []) as Task[];

  await Promise.all(
    tasks
      .filter(t => t.status === 'OPEN' && isDeadlinePassed(t.deadline))
      .map(async t => { t.status = (await autoCloseIfExpired(t)) as Task['status']; })
  );

  const visible = tasks.filter(t => isTaskVisible(user, t));
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return visible;
}
