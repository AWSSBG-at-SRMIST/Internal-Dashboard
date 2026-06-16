import { db, TABLE, GetCommand, PutCommand, UpdateCommand } from './dynamodb';

export function calculateRating(submittedAt: string, deadline: string): number {
  const sub = new Date(submittedAt).getTime();
  const dead = new Date(deadline).getTime();
  const diffHours = (sub - dead) / (1000 * 60 * 60);

  if (diffHours < -24) return 3;   // >24h before deadline
  if (diffHours <= 0) return 2;     // within last 24h before deadline
  if (diffHours <= 24) return 1;    // within 24h after deadline
  return -1;                         // more than 24h after deadline
}

export async function applyRating(memberId: string, ratingDelta: number, context: 'APPROVED' | 'REJECTED' | 'LATE'): Promise<void> {
  const existing = await db.send(new GetCommand({
    TableName: TABLE.RATINGS,
    Key: { memberId },
  }));

  if (!existing.Item) {
    await db.send(new PutCommand({
      TableName: TABLE.RATINGS,
      Item: {
        memberId,
        totalStars: ratingDelta,
        approvedCount: context === 'APPROVED' ? 1 : 0,
        rejectedCount: context === 'REJECTED' ? 1 : 0,
        pendingCount: 0,
        lastUpdated: new Date().toISOString(),
      },
    }));
  } else {
    const updateExpr: string[] = ['#ts = #ts + :delta', 'lastUpdated = :ts'];
    const exprAttrNames: Record<string, string> = { '#ts': 'totalStars' };
    const exprAttrValues: Record<string, unknown> = {
      ':delta': ratingDelta,
      ':ts': new Date().toISOString(),
    };

    if (context === 'APPROVED') {
      updateExpr.push('approvedCount = approvedCount + :one');
      exprAttrValues[':one'] = 1;
    } else if (context === 'REJECTED') {
      updateExpr.push('rejectedCount = rejectedCount + :one');
      exprAttrValues[':one'] = 1;
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.RATINGS,
      Key: { memberId },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues,
    }));
  }

  // Also update member's totalStars
  await db.send(new UpdateCommand({
    TableName: TABLE.MEMBERS,
    Key: { memberId },
    UpdateExpression: 'SET totalStars = totalStars + :delta',
    ExpressionAttributeValues: { ':delta': ratingDelta },
  }));
}

export function getRatingLabel(stars: number): string {
  return stars > 0 ? `+${stars} ⭐` : `${stars} ⭐`;
}

export function getSubmissionTimingLabel(submittedAt: string, deadline: string): string {
  const sub = new Date(submittedAt).getTime();
  const dead = new Date(deadline).getTime();
  const diffHours = (sub - dead) / (1000 * 60 * 60);

  if (diffHours < -24) return 'Early (>24h before)';
  if (diffHours <= 0) return 'On time (<24h before)';
  if (diffHours <= 24) return 'Late (<24h after)';
  return 'Very late (>24h after)';
}
