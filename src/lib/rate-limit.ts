import { NextRequest } from 'next/server';
import { db, TABLE, UpdateCommand } from './dynamodb';

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // Use the rightmost IP — added by our load balancer, not spoofable by the client.
    const ips = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Fixed-window limiter backed by a shared DynamoDB table (sbg-rate-limits,
 * partition key `bucketKey`, TTL enabled on `expiresAt`) so the count is
 * consistent across cold starts and multiple serverless instances — an
 * in-memory Map only rate-limits a single process.
 *
 * Requires the sbg-rate-limits table to exist with TTL enabled on
 * `expiresAt`; it is not created automatically.
 *
 * Returns true if the request is allowed, false if it should be rejected.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const bucketKey = `${key}:${windowStart}`;
  const expiresAt = windowStart + windowSeconds + 60; // grace period before DynamoDB's TTL sweep

  try {
    await db.send(new UpdateCommand({
      TableName: TABLE.RATE_LIMITS,
      Key: { bucketKey },
      UpdateExpression: 'SET #c = if_not_exists(#c, :zero) + :one, expiresAt = :ttl',
      ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':limit': limit, ':ttl': expiresAt },
    }));
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}
