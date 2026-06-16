import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');
    const subdomain = searchParams.get('subdomain');
    const limit = parseInt(searchParams.get('limit') || '50');

    const [membersResult, ratingsResult] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.MEMBERS })),
      db.send(new ScanCommand({ TableName: TABLE.RATINGS })),
    ]);

    const members = membersResult.Items || [];
    const ratings = ratingsResult.Items || [];

    const ratingsMap = new Map(ratings.map((r: any) => [r.memberId, r]));

    let leaderboard = members
      .filter((m: any) => m.isActive)
      .filter((m: any) => m.role !== 'SBG_LEADER' && m.role !== 'SECRETARY') // Presidium doesn't participate in the star/rating system
      .filter((m: any) => !domain || m.domain === domain)
      .filter((m: any) => !subdomain || m.subdomain === subdomain)
      .map((m: any) => {
        const r = ratingsMap.get(m.memberId) as any || {};
        return {
          memberId: m.memberId,
          name: m.name,
          role: m.role,
          domain: m.domain,
          subdomain: m.subdomain,
          totalStars: m.totalStars || 0,
          approvedCount: r.approvedCount || 0,
          rejectedCount: r.rejectedCount || 0,
          pendingCount: r.pendingCount || 0,
        };
      })
      .sort((a: any, b: any) => b.totalStars - a.totalStars)
      .slice(0, limit);

    return NextResponse.json({ success: true, data: leaderboard });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
