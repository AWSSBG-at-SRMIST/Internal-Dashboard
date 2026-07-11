import { db, TABLE, ScanCommand } from '@/lib/dynamodb';

export interface AnalyticsResponse {
  overview: {
    totalMembers: number;
    totalTasks: number;
    openTasks: number;
    totalSubmissions: number;
    approvalRate: number;
  };
  domainStats: { domain: string; members: number; tasks: number; submissions: number }[];
  submissionStats: { total: number; approved: number; rejected: number; pending: number };
  roleStats: { role: string; count: number }[];
  taskTrend: { date: string; count: number }[];
  ratingTrend: { date: string; stars: number }[];
  topPerformers: { memberId: string; name: string; role: string; totalStars: number }[];
  appliedFilters: { days: number | null; domain: string | null };
}

export interface AnalyticsFilters {
  days?: number | null; // null = all time
  domain?: string | null; // null/'ALL' = every domain
}

const DOMAINS = ['Technical', 'Corporate', 'Creatives'];

function bucketByDay<T>(items: T[], getDate: (item: T) => string, getValue: (item: T) => number): { date: string; value: number }[] {
  const buckets: Record<string, number> = {};
  for (const item of items) {
    const day = new Date(getDate(item)).toISOString().slice(0, 10);
    buckets[day] = (buckets[day] || 0) + getValue(item);
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, value]) => ({
      date: new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      value,
    }));
}

// Mirrors GET /api/analytics — used by both the analytics Server Component
// for the initial render and the route itself for client-side filter
// changes, so there's a single source of truth for the aggregation logic
// (unlike most other lib helpers in this codebase, which intentionally
// duplicate their route's logic — the filtering here is complex enough that
// keeping two copies in sync isn't worth the risk).
export async function getAnalyticsData(filters: AnalyticsFilters = {}): Promise<AnalyticsResponse> {
  const days = filters.days === undefined ? 30 : filters.days;
  const domain = filters.domain && filters.domain !== 'ALL' ? filters.domain : null;
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const [membersRes, tasksRes, submissionsRes] = await Promise.all([
    db.send(new ScanCommand({
      TableName: TABLE.MEMBERS,
      ProjectionExpression: 'memberId, #n, #d, isActive, #r, totalStars',
      ExpressionAttributeNames: { '#n': 'name', '#d': 'domain', '#r': 'role' },
    })),
    db.send(new ScanCommand({
      TableName: TABLE.TASKS,
      ProjectionExpression: '#d, #s, createdAt',
      ExpressionAttributeNames: { '#d': 'domain', '#s': 'status' },
    })),
    db.send(new ScanCommand({
      TableName: TABLE.SUBMISSIONS,
      ProjectionExpression: '#d, reviewStatus, submittedAt, reviewedAt, ratingAwarded',
      ExpressionAttributeNames: { '#d': 'domain' },
    })),
  ]);

  const members = membersRes.Items || [];
  const tasks = tasksRes.Items || [];
  const submissions = submissionsRes.Items || [];

  // The domain-comparison bar chart always shows all 3 domains side by side —
  // that's the whole point of it — but still respects the date range so
  // "last 7 days" narrows what each bar counts.
  const domainScopedTasks = cutoff ? tasks.filter((t: any) => new Date(t.createdAt) >= cutoff) : tasks;
  const domainScopedSubmissions = cutoff ? submissions.filter((s: any) => new Date(s.submittedAt) >= cutoff) : submissions;
  const domainStats = DOMAINS.map(d => ({
    domain: d,
    members: members.filter((m: any) => m.domain === d && m.isActive).length,
    tasks: domainScopedTasks.filter((t: any) => t.domain === d).length,
    submissions: domainScopedSubmissions.filter((s: any) => s.domain === d).length,
  }));

  // Everything else (status split, trends) additionally narrows to the
  // selected domain, if any — this is the actual "drill-down" scope.
  const scopedTasks = domainScopedTasks.filter((t: any) => !domain || t.domain === domain);
  const scopedSubmissions = domainScopedSubmissions.filter((s: any) => !domain || s.domain === domain);

  const submissionStats = {
    total: scopedSubmissions.length,
    approved: scopedSubmissions.filter((s: any) => s.reviewStatus === 'APPROVED').length,
    rejected: scopedSubmissions.filter((s: any) => s.reviewStatus === 'REJECTED').length,
    pending: scopedSubmissions.filter((s: any) => s.reviewStatus === 'PENDING').length,
  };

  // Presidium (SBG_LEADER/SECRETARY) doesn't belong to the regular org
  // hierarchy — excluded here the same way it's excluded from the leaderboard.
  const roleStats = ['DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'].map(role => ({
    role,
    count: members.filter((m: any) => m.role === role && m.isActive && (!domain || m.domain === domain)).length,
  }));

  const taskTrend = bucketByDay(scopedTasks, (t: any) => t.createdAt, () => 1)
    .map(b => ({ date: b.date, count: b.value }));

  // Only counts submissions that were actually reviewed (ratingAwarded set) —
  // a PENDING submission hasn't earned/lost anything yet.
  const ratedSubmissions = scopedSubmissions.filter((s: any) => s.reviewedAt && s.ratingAwarded != null);
  const ratingTrend = bucketByDay(ratedSubmissions, (s: any) => s.reviewedAt, (s: any) => s.ratingAwarded)
    .map(b => ({ date: b.date, stars: b.value }));

  // Lifetime totals, not date-scoped (totalStars is a running total) — but
  // still domain-scoped, so "Technical" shows Technical's own top performers.
  const topPerformers = members
    .filter((m: any) => m.isActive && m.role !== 'SBG_LEADER' && m.role !== 'SECRETARY' && (!domain || m.domain === domain))
    .sort((a: any, b: any) => (b.totalStars || 0) - (a.totalStars || 0))
    .slice(0, 5)
    .map((m: any) => ({ memberId: m.memberId, name: m.name, role: m.role, totalStars: m.totalStars || 0 }));

  return {
    overview: {
      totalMembers: members.filter((m: any) => m.isActive && (!domain || m.domain === domain)).length,
      totalTasks: scopedTasks.length,
      openTasks: scopedTasks.filter((t: any) => t.status === 'OPEN').length,
      totalSubmissions: submissionStats.total,
      approvalRate: submissionStats.total > 0
        ? Math.round((submissionStats.approved / submissionStats.total) * 100)
        : 0,
    },
    domainStats,
    submissionStats,
    roleStats,
    taskTrend,
    ratingTrend,
    topPerformers,
    appliedFilters: { days: days ?? null, domain },
  };
}
