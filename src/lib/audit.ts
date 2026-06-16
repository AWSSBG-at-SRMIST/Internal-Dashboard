import { db, TABLE, PutCommand } from './dynamodb';
import type { SessionUser } from '@/types';

export async function logAction(
  actor: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): Promise<void> {
  const { randomUUID } = await import('crypto');
  await db.send(new PutCommand({
    TableName: TABLE.AUDIT_LOGS,
    Item: {
      logId: randomUUID(),
      action,
      performedBy: actor.memberId,
      performedByName: actor.name,
      targetType,
      targetId,
      details,
      timestamp: new Date().toISOString(),
    },
  }));
}
