import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, QueryCommand, ScanCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get('memberId');

  const canViewAll = isPresidium(user) || user.role === 'DIRECTOR' || user.role === 'MANAGER';

  try {
    if (memberId) {
      if (memberId !== user.memberId && !canViewAll) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const result = await db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'MemberIndex',
        KeyConditionExpression: 'memberId = :mid',
        ExpressionAttributeValues: { ':mid': memberId },
        ScanIndexForward: false,
      }));
      return NextResponse.json({ success: true, data: result.Items || [] });
    }

    if (!canViewAll) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await db.send(new ScanCommand({ TableName: TABLE.SUBMISSIONS }));
    let subs = result.Items || [];
    subs.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return NextResponse.json({ success: true, data: subs });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}
