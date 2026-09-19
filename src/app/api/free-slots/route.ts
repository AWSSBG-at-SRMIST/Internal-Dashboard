import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'BUILDER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch slot records and member directory in parallel
  const [slotsRes, membersRes] = await Promise.all([
    db.send(new ScanCommand({ TableName: TABLE.FREE_SLOTS })),
    db.send(new ScanCommand({
      TableName: TABLE.MEMBERS,
      ProjectionExpression: 'memberId, #n, #d, subdomain',
      ExpressionAttributeNames: { '#n': 'name', '#d': 'domain' },
    })),
  ]);

  const memberMap = new Map((membersRes.Items || []).map((m: any) => [m.memberId, m]));

  // Join: enrich slot records with live name/domain/subdomain from sbg-members
  let records = (slotsRes.Items || [])
    .map((r: any) => {
      const m = memberMap.get(r.memberId);
      if (!m) return null;
      return { memberId: r.memberId, clubId: r.clubId, memberName: m.name, domain: m.domain ?? null, subdomain: m.subdomain ?? null, slots: r.slots };
    })
    .filter(Boolean);

  // Scope filter
  if (!isPresidium(user)) {
    if (user.role === 'DIRECTOR') {
      records = records.filter((r: any) => r.domain === user.domain);
    } else {
      // Manager / Associate — subdomain only
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

  // Lean record — no denormalized name/domain/subdomain
  await db.send(new PutCommand({
    TableName: TABLE.FREE_SLOTS,
    Item: {
      memberId: user.memberId,
      clubId: user.clubId,
      slots,
      updatedAt: new Date().toISOString(),
    },
  }));

  return NextResponse.json({ success: true });
}
