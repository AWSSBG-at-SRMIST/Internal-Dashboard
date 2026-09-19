import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isPresidium(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await db.send(new GetCommand({
    TableName: TABLE.FREE_SLOTS,
    Key: { memberId: user.memberId },
  }));

  return NextResponse.json({ success: true, data: result.Item ?? null });
}
