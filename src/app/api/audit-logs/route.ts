import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const action = searchParams.get('action');
    const performedBy = searchParams.get('performedBy');

    const result = await db.send(new ScanCommand({ TableName: TABLE.AUDIT_LOGS }));
    let logs = result.Items || [];

    if (action) logs = logs.filter((l: any) => l.action === action);
    if (performedBy) logs = logs.filter((l: any) => l.performedBy === performedBy);

    logs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ success: true, data: logs.slice(0, limit) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
