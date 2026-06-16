import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canViewCohort, isPresidium } from '@/lib/permissions';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [cohortsResult, membersResult] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.COHORTS })),
      db.send(new ScanCommand({ TableName: TABLE.MEMBERS, ProjectionExpression: 'memberId, #d, subdomain', ExpressionAttributeNames: { '#d': 'domain' } })),
    ]);

    const members = membersResult.Items || [];
    const cohorts = (cohortsResult.Items || []).filter((c: any) => canViewCohort(user, c));

    // Compute memberCount dynamically for SUBDOMAIN/GENERAL cohorts
    const enriched = cohorts.map((c: any) => {
      if (c.type === 'GENERAL') {
        return { ...c, memberCount: members.length };
      }
      if (c.type === 'SUBDOMAIN') {
        return { ...c, memberCount: members.filter((m: any) => m.domain === c.domain && m.subdomain === c.subdomain).length };
      }
      // CUSTOM — use stored memberIds length
      return { ...c, memberCount: (c.memberIds || []).length };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cohorts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Only the presidium can create cohorts' }, { status: 403 });
  }

  try {
    const { name, type, domain, subdomain, memberIds } = await req.json();
    const cohortId = randomUUID();

    const cohort: Record<string, any> = {
      cohortId,
      name,
      type,
      domain: domain || undefined,
      subdomain: subdomain || undefined,
      createdBy: user.memberId,
      createdAt: new Date().toISOString(),
    };

    // Only CUSTOM cohorts store a memberIds list
    if (type === 'CUSTOM') {
      cohort.memberIds = memberIds || [];
    }

    await db.send(new PutCommand({ TableName: TABLE.COHORTS, Item: cohort }));
    await logAction(user, 'CREATE_COHORT', 'COHORT', cohortId, `Created cohort: ${name}`);
    return NextResponse.json({ success: true, data: cohort });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create cohort' }, { status: 500 });
  }
}
