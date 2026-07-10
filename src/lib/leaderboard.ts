import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';
import type { Domain, Role, Subdomain, SessionUser } from '@/types';

export interface LeaderboardEntry {
  memberId: string;
  name: string;
  role: Role;
  domain: Domain | null;
  subdomain: Subdomain | null;
  totalStars: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
}

// Mirrors GET /api/leaderboard but without the domain/subdomain/limit
// params — returns every eligible member so the client can filter and
// paginate without a network round-trip per filter change. Keep in sync if
// the route's eligibility/sorting logic changes.
//
// Director stars are private to Presidium and to Directors themselves (peer
// visibility) — Managers/Associates/Builders never see a Director's rating.
export async function getFullLeaderboard(viewer: SessionUser): Promise<LeaderboardEntry[]> {
  const canSeeDirectors = isPresidium(viewer) || viewer.role === 'DIRECTOR';
  const memberProjection = {
    ProjectionExpression: 'memberId, #n, #r, #d, subdomain, totalStars, isActive',
    ExpressionAttributeNames: { '#n': 'name', '#r': 'role', '#d': 'domain' },
  };
  const [membersResult, ratingsResult] = await Promise.all([
    db.send(new ScanCommand({ TableName: TABLE.MEMBERS, ...memberProjection })),
    db.send(new ScanCommand({
      TableName: TABLE.RATINGS,
      ProjectionExpression: 'memberId, approvedCount, rejectedCount, pendingCount',
    })),
  ]);

  const members = membersResult.Items || [];
  const ratings = ratingsResult.Items || [];
  const ratingsMap = new Map(ratings.map((r: any) => [r.memberId, r]));

  return members
    .filter((m: any) => m.isActive)
    .filter((m: any) => m.role !== 'SBG_LEADER' && m.role !== 'SECRETARY')
    .filter((m: any) => canSeeDirectors || m.role !== 'DIRECTOR')
    .map((m: any) => {
      const r = ratingsMap.get(m.memberId) || {};
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
    .sort((a, b) => b.totalStars - a.totalStars);
}
