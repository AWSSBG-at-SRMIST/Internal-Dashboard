import { db, TABLE, UpdateCommand, ScanCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';

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

const NO_SUBMISSION_PENALTY = -2;
const GRACE_MS = 24 * 60 * 60 * 1000;

const SYSTEM_ACTOR: SessionUser = {
  memberId: 'SYSTEM_CRON', name: 'System (Auto-Close)', email: 'system@internal',
  role: 'SBG_LEADER', domain: null, subdomain: null,
};

type AutoCloseTask = Pick<Task,
  'taskId' | 'title' | 'status' | 'deadline' | 'totalSubmissions' | 'submissionMode' |
  'assignmentType' | 'assignedToId' | 'domain' | 'subdomain' | 'noSubmissionPenaltyAt'
>;

// A group-scoped task (no single assignedToId) where every eligible member submits their
// own independent entry — one person submitting must not lock the others out.
function isMultiAssigneeIndividual(task: Pick<Task, 'submissionMode' | 'assignedToId'>): boolean {
  return task.submissionMode === 'INDIVIDUAL' && !task.assignedToId;
}

async function closeSimple(taskId: string): Promise<string> {
  await db.send(new UpdateCommand({
    TableName: TABLE.TASKS,
    Key: { taskId },
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

// Tasks aren't closed by any scheduled job — we lazily evaluate this the moment anyone
// reads/touches a task past its deadline, so the status is always correct without needing
// a cron/Lambda (keeps this $0 infra). Two rules:
//  1. Single-assignee Individual or Collective: a valid submission is final (no edit/
//     resubmit except via a reviewer-requested revision), so once one exists and the
//     deadline has passed there's no reason to keep the task open — close immediately.
//  2. Everything else rides a 24h grace window past the deadline: zero-submission tasks
//     (any mode) get a chance for a straggler, and multi-assignee Individual tasks stay
//     open regardless of partial submissions so every assignee gets their own window.
//     Once grace expires, closeWithNoSubmissionPenalty() closes it and penalises whoever
//     (mode-aware) never submitted.
export async function autoCloseIfExpired(task: AutoCloseTask): Promise<string> {
  if (task.status !== 'OPEN' || !isDeadlinePassed(task.deadline)) return task.status;

  const totalSubmissions = task.totalSubmissions ?? 0;
  const multiAssignee = isMultiAssigneeIndividual(task);

  if (!multiAssignee && totalSubmissions > 0) {
    return closeSimple(task.taskId);
  }

  const graceEndMs = new Date(task.deadline).getTime() + GRACE_MS;
  if (Date.now() <= graceEndMs) return 'OPEN';

  return (await closeWithNoSubmissionPenalty(task)).status;
}

// Closes an expired, past-grace task and penalises whoever never submitted:
//  - Zero-submission tasks (any mode): every eligible member is a non-submitter.
//  - Multi-assignee Individual tasks: only the specific assignees who never submitted —
//    those who did keep whatever their own submission earns at review.
// The close+claim write is a single atomic conditional update gated on
// `attribute_not_exists(noSubmissionPenaltyAt)`, so concurrent callers (any number of
// simultaneous page loads/API touches can reach this once grace expires) can't
// double-apply the penalty — only the winner scans members and hands out -2s.
export async function closeWithNoSubmissionPenalty(
  task: AutoCloseTask
): Promise<{ status: string; applied: boolean; penalisedCount: number }> {
  const ts = new Date().toISOString();
  let won: boolean;

  if (task.status === 'OPEN') {
    won = await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId: task.taskId },
      UpdateExpression: 'SET #s = :closed, noSubmissionPenaltyAt = :ts',
      ConditionExpression: '#s = :open AND attribute_not_exists(noSubmissionPenaltyAt)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':closed': 'CLOSED', ':open': 'OPEN', ':ts': ts },
    })).then(() => true).catch((err: any) => {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      return false;
    });
  } else {
    // Already CLOSED via another path (e.g. closeSimple beat us here) — still claim the
    // penalty pass atomically so it only ever runs once.
    won = await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId: task.taskId },
      UpdateExpression: 'SET noSubmissionPenaltyAt = :ts',
      ConditionExpression: 'attribute_not_exists(noSubmissionPenaltyAt)',
      ExpressionAttributeValues: { ':ts': ts },
    })).then(() => true).catch((err: any) => {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      return false;
    });
  }

  if (!won) return { status: 'CLOSED', applied: false, penalisedCount: 0 };

  const membersResult = await db.send(new ScanCommand({
    TableName: TABLE.MEMBERS,
    ProjectionExpression: 'memberId, #n, #d, subdomain, #r, isActive',
    ExpressionAttributeNames: { '#n': 'name', '#d': 'domain', '#r': 'role' },
  }));
  const activeMembers = (membersResult.Items || []).filter((m: any) => m.isActive !== false);
  const eligible = getEligibleMembers(task, activeMembers);

  let nonSubmitters = eligible;
  if (isMultiAssigneeIndividual(task)) {
    const submittedIds = new Set<string>();
    let lastKey: Record<string, any> | undefined;
    do {
      const subs = await db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'TaskIndex',
        KeyConditionExpression: 'taskId = :tid',
        ExpressionAttributeValues: { ':tid': task.taskId },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      (subs.Items || []).forEach((s: any) => submittedIds.add(s.memberId));
      lastKey = subs.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
    nonSubmitters = eligible.filter((m: any) => !submittedIds.has(m.memberId));
  }

  await Promise.allSettled(
    nonSubmitters.map((m: any) =>
      db.send(new UpdateCommand({
        TableName: TABLE.MEMBERS,
        Key: { memberId: m.memberId },
        UpdateExpression: 'SET totalStars = totalStars + :delta',
        ExpressionAttributeValues: { ':delta': NO_SUBMISSION_PENALTY },
      }))
    )
  );

  await logAction(
    SYSTEM_ACTOR,
    'AUTO_CLOSE_TASK',
    'TASK',
    task.taskId,
    `Auto-closed "${task.title}" — ${nonSubmitters.length} of ${eligible.length} eligible member(s) had not submitted by the 24h grace deadline; penalised ${NO_SUBMISSION_PENALTY} stars each.`
  );

  return { status: 'CLOSED', applied: true, penalisedCount: nonSubmitters.length };
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
