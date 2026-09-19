import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'BUILDER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await db.send(new ScanCommand({ TableName: TABLE.FREE_SLOTS }));
  let records = result.Items || [];

  if (!isPresidium(user)) {
    if (user.role === 'DIRECTOR') {
      records = records.filter((r: any) => r.domain === user.domain);
    } else {
      records = records.filter((r: any) => r.subdomain === user.subdomain);
    }
  }

  return NextResponse.json({ success: true, data: records });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isPresidium(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { slots } = body;
  if (!Array.isArray(slots)) return NextResponse.json({ error: 'Invalid slots' }, { status: 400 });

  await db.send(new PutCommand({
    TableName: TABLE.FREE_SLOTS,
    Item: {
      memberId: user.memberId,
      memberName: user.name,
      domain: user.domain ?? null,
      subdomain: user.subdomain ?? null,
      slots,
      updatedAt: new Date().toISOString(),
    },
  }));

  return NextResponse.json({ success: true });
}
