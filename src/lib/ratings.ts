import { db, TABLE, UpdateCommand } from './dynamodb';
import type { TaskPriority } from '@/types';

const PRIORITY_MULTIPLIER: Record<TaskPriority, number> = {
  LOW: 1,
  MEDIUM: 1.5,
  HIGH: 2,
};

// Base star scale (new values): +2 early, +1 on-time, 0 late, -1 very late.
// Multiplied by priority (LOW×1, MEDIUM×1.5, HIGH×2) and rounded.
export function calculateRating(
  submittedAt: string,
  deadline: string,
  priority: TaskPriority = 'MEDIUM',
): { delta: number; late: boolean } {
  const diffHours = (new Date(submittedAt).getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60);
  const late = diffHours > 0;

  let base: number;
  if (diffHours < -24) base = 2;      // >24h before deadline
  else if (diffHours <= 0) base = 1;  // within last 24h before deadline
  else if (diffHours <= 24) base = 0; // within 24h after deadline
  else base = -1;                      // more than 24h after deadline

  return { delta: Math.round(base * PRIORITY_MULTIPLIER[priority]), late };
}

// Atomically records a review outcome in the ratings table and updates the
// member's star total. Stars are the single source of truth on sbg-members;
// sbg-ratings only tracks the submission-count buckets.
// Uses if_not_exists throughout so the record is created on first call
// without a separate read-then-write.
export async function applyRating(
  memberId: string,
  ratingDelta: number,
  action: 'APPROVE' | 'REJECT' | 'REVISE',
  late: boolean = false,
): Promise<void> {
  const isLateApproval = action === 'APPROVE' && late;

  await db.send(new UpdateCommand({
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
      ':ts':      new Date().toISOString(),
    },
  }));

  if (ratingDelta !== 0) {
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET totalStars = totalStars + :delta',
      ExpressionAttributeValues: { ':delta': ratingDelta },
    }));
  }
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
  submittedAt: string;
  deadline: string;
}): Promise<void> {
  const { memberId, reviewStatus, ratingAwarded, submittedAt, deadline } = submission;
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
  // Reverse the approval/rejection counter and stars.
  const late = (new Date(submittedAt).getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60) > 0;

  await db.send(new UpdateCommand({
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
  }));

  if (ratingAwarded !== null && ratingAwarded !== 0) {
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET totalStars = totalStars - :delta',
      ExpressionAttributeValues: { ':delta': ratingAwarded },
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
  if (diffHours <= 24) return 'Late (<24h after)';
  return 'Very late (>24h after)';
}
