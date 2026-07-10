import { db, TABLE, UpdateCommand, TransactWriteCommand, QueryCommand } from './dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

// Flat star scale — priority does NOT affect the delta.
// +2 early, +1 on-time, -1 late (within the 24h grace window; submissions past grace
// aren't accepted at all since the task auto-closes at that point).
export function calculateRating(
  submittedAt: string,
  deadline: string,
): { delta: number; late: boolean } {
  const diffHours = (new Date(submittedAt).getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60);
  const late = diffHours > 0;

  let delta: number;
  if (diffHours < -24) delta = 2;  // >24h before deadline
  else if (diffHours <= 0) delta = 1;  // within last 24h before deadline
  else delta = -1;  // late — within the 24h grace window after the deadline

  return { delta, late };
}

// Atomically records a review outcome in the ratings table and updates the
// member's star total. Stars are the single source of truth on sbg-members;
// sbg-ratings only tracks the submission-count buckets.
// Uses if_not_exists throughout so the record is created on first call
// without a separate read-then-write. Both table writes go through a single
// TransactWriteItems call so they can never partially apply.
export async function applyRating(
  memberId: string,
  ratingDelta: number,
  action: 'APPROVE' | 'REJECT' | 'REVISE',
  late: boolean = false,
): Promise<void> {
  const isLateApproval = action === 'APPROVE' && late;
  const ts = new Date().toISOString();

  const transactItems: TransactItems = [
    {
      Update: {
        TableName: TABLE.RATINGS,
        Key: { memberId },
        UpdateExpression: `SET
          approvedCount      = if_not_exists(approvedCount, :zero)      + :appInc,
          lateApprovedCount  = if_not_exists(lateApprovedCount, :zero)  + :lateInc,
          rejectedCount      = if_not_exists(rejectedCount, :zero)      + :rejInc,
          pendingCount       = if_not_exists(pendingCount, :one)        - :one,
          lastUpdated        = :ts`,
        ExpressionAttributeValues: {
          ':zero':    0,
          ':one':     1,
          ':appInc':  action === 'APPROVE' && !isLateApproval ? 1 : 0,
          ':lateInc': isLateApproval ? 1 : 0,
          ':rejInc':  action === 'REJECT' ? 1 : 0,
          ':ts':      ts,
        },
      },
    },
  ];

  if (ratingDelta !== 0) {
    transactItems.push({
      Update: {
        TableName: TABLE.MEMBERS,
        Key: { memberId },
        UpdateExpression: 'SET totalStars = totalStars + :delta',
        ExpressionAttributeValues: { ':delta': ratingDelta },
      },
    });
  }

  await db.send(new TransactWriteCommand({ TransactItems: transactItems }));
}

// Called from the submit route when a new submission is created.
export async function incrementPendingCount(memberId: string): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLE.RATINGS,
    Key: { memberId },
    UpdateExpression: 'SET pendingCount = if_not_exists(pendingCount, :zero) + :one, lastUpdated = :ts',
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': new Date().toISOString() },
  }));
}

// Reverses the rating effects of a single submission when its parent task is
// deleted. Mirrors the exact increments applied at review time so counters stay
// consistent. REVISION_REQUESTED has net-zero effect (pendingCount +1 then -1)
// so nothing needs undoing for that status.
export async function reverseSubmissionRating(submission: {
  memberId: string;
  reviewStatus: string;
  ratingAwarded: number | null;
  wasLate: boolean | null;
}): Promise<void> {
  const { memberId, reviewStatus, ratingAwarded, wasLate } = submission;
  const ts = new Date().toISOString();

  if (reviewStatus === 'PENDING') {
    await db.send(new UpdateCommand({
      TableName: TABLE.RATINGS,
      Key: { memberId },
      UpdateExpression: 'SET pendingCount = if_not_exists(pendingCount, :one) - :one, lastUpdated = :ts',
      ExpressionAttributeValues: { ':one': 1, ':ts': ts },
    }));
    return;
  }

  // REVISION_REQUESTED: pendingCount was +1 at submit then -1 at review → net 0.
  if (reviewStatus === 'REVISION_REQUESTED') return;

  // APPROVED or REJECTED — pendingCount is already net-zero (submit +1, review -1).
  // Reverse the approval/rejection counter and stars. Use the wasLate flag
  // recorded at review time (against task.deadline as it stood then), not a
  // recomputation — the task's deadline may have been extended since.
  const late = wasLate === true;

  const transactItems: TransactItems = [
    {
      Update: {
        TableName: TABLE.RATINGS,
        Key: { memberId },
        UpdateExpression: `SET
          approvedCount     = if_not_exists(approvedCount, :zero)     - :appDec,
          lateApprovedCount = if_not_exists(lateApprovedCount, :zero) - :lateDec,
          rejectedCount     = if_not_exists(rejectedCount, :zero)     - :rejDec,
          lastUpdated       = :ts`,
        ExpressionAttributeValues: {
          ':zero':    0,
          ':appDec':  reviewStatus === 'APPROVED' && !late ? 1 : 0,
          ':lateDec': reviewStatus === 'APPROVED' && late  ? 1 : 0,
          ':rejDec':  reviewStatus === 'REJECTED'          ? 1 : 0,
          ':ts':      ts,
        },
      },
    },
  ];

  if (ratingAwarded !== null && ratingAwarded !== 0) {
    transactItems.push({
      Update: {
        TableName: TABLE.MEMBERS,
        Key: { memberId },
        UpdateExpression: 'SET totalStars = totalStars - :delta',
        ExpressionAttributeValues: { ':delta': ratingAwarded },
      },
    });
  }

  await db.send(new TransactWriteCommand({ TransactItems: transactItems }));
}

// When a task's deadline is extended, every already-APPROVED submission's star
// award was calculated against the old deadline and is now stale. Recomputes
// each one against the new deadline and applies the difference — moving a
// submission between the approved/late-approved buckets and adjusting
// totalStars by (newDelta - oldDelta), then updates the submission row so any
// future reversal (task deletion) uses the corrected values. PENDING/REJECTED/
// REVISION_REQUESTED submissions never had a star award, so there's nothing to
// revise for them — they'll be rated correctly against the new deadline
// whenever they're actually reviewed.
export async function reviseApprovedSubmissionRatings(taskId: string, newDeadline: string): Promise<void> {
  const approved: any[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await db.send(new QueryCommand({
      TableName: TABLE.SUBMISSIONS,
      IndexName: 'TaskIndex',
      KeyConditionExpression: 'taskId = :tid',
      FilterExpression: 'reviewStatus = :approved',
      ExpressionAttributeValues: { ':tid': taskId, ':approved': 'APPROVED' },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    approved.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);

  for (const sub of approved) {
    const { delta: newDelta, late: newLate } = calculateRating(sub.submittedAt, newDeadline);
    const oldDelta = sub.ratingAwarded ?? 0;
    const oldLate = sub.wasLate === true;
    if (newDelta === oldDelta && newLate === oldLate) continue;

    const ts = new Date().toISOString();
    const transactItems: TransactItems = [];
    if (oldLate !== newLate) {
      transactItems.push({
        Update: {
          TableName: TABLE.RATINGS,
          Key: { memberId: sub.memberId },
          UpdateExpression: `SET
            approvedCount     = if_not_exists(approvedCount, :zero)     + :appDelta,
            lateApprovedCount = if_not_exists(lateApprovedCount, :zero) + :lateDelta,
            lastUpdated       = :ts`,
          ExpressionAttributeValues: {
            ':zero': 0,
            ':appDelta': newLate ? -1 : 1,
            ':lateDelta': newLate ? 1 : -1,
            ':ts': ts,
          },
        },
      });
    }
    if (newDelta !== oldDelta) {
      transactItems.push({
        Update: {
          TableName: TABLE.MEMBERS,
          Key: { memberId: sub.memberId },
          UpdateExpression: 'SET totalStars = totalStars + :delta',
          ExpressionAttributeValues: { ':delta': newDelta - oldDelta },
        },
      });
    }
    if (transactItems.length > 0) {
      await db.send(new TransactWriteCommand({ TransactItems: transactItems }));
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.SUBMISSIONS,
      Key: { submissionId: sub.submissionId },
      UpdateExpression: 'SET ratingAwarded = :r, wasLate = :late',
      ExpressionAttributeValues: { ':r': newDelta, ':late': newLate },
    }));
  }
}

export function getRatingLabel(stars: number): string {
  return stars > 0 ? `+${stars} ⭐` : `${stars} ⭐`;
}

export function getSubmissionTimingLabel(submittedAt: string, deadline: string): string {
  const diffHours = (new Date(submittedAt).getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60);
  if (diffHours < -24) return 'Early (>24h before)';
  if (diffHours <= 0)  return 'On time (<24h before)';
  return 'Late (within grace period)';
}
