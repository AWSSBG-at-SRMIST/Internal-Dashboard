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
}

// Mirrors GET /api/analytics — used by the analytics Server Component for
// the initial render. Keep in sync if the route's aggregation logic changes.
export async function getAnalyticsData(): Promise<AnalyticsResponse> {
  const [membersRes, tasksRes, submissionsRes] = await Promise.all([
    db.send(new ScanCommand({
      TableName: TABLE.MEMBERS,
      ProjectionExpression: '#d, isActive, #r',
      ExpressionAttributeNames: { '#d': 'domain', '#r': 'role' },
    })),
    db.send(new ScanCommand({
      TableName: TABLE.TASKS,
      ProjectionExpression: '#d, #s, createdAt',
      ExpressionAttributeNames: { '#d': 'domain', '#s': 'status' },
    })),
    db.send(new ScanCommand({
      TableName: TABLE.SUBMISSIONS,
      ProjectionExpression: '#d, reviewStatus',
      ExpressionAttributeNames: { '#d': 'domain' },
    })),
  ]);

  const members = membersRes.Items || [];
  const tasks = tasksRes.Items || [];
  const submissions = submissionsRes.Items || [];

  const domainStats = ['Technical', 'Corporate', 'Creatives'].map(domain => ({
    domain,
    members: members.filter((m: any) => m.domain === domain && m.isActive).length,
    tasks: tasks.filter((t: any) => t.domain === domain).length,
    submissions: submissions.filter((s: any) => s.domain === domain).length,
  }));

  const submissionStats = {
    total: submissions.length,
    approved: submissions.filter((s: any) => s.reviewStatus === 'APPROVED').length,
    rejected: submissions.filter((s: any) => s.reviewStatus === 'REJECTED').length,
    pending: submissions.filter((s: any) => s.reviewStatus === 'PENDING').length,
  };

  // Presidium (SBG_LEADER/SECRETARY) doesn't belong to the regular org
  // hierarchy — excluded here the same way it's excluded from the leaderboard.
  const roleStats = ['DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'].map(role => ({
    role,
    count: members.filter((m: any) => m.role === role && m.isActive).length,
  }));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentTasks = tasks.filter((t: any) => new Date(t.createdAt) >= thirtyDaysAgo);

  const dailyTasks: Record<string, number> = {};
  recentTasks.forEach((t: any) => {
    const day = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    dailyTasks[day] = (dailyTasks[day] || 0) + 1;
  });

  const taskTrend = Object.entries(dailyTasks)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-10);

  return {
    overview: {
      totalMembers: members.filter((m: any) => m.isActive).length,
      totalTasks: tasks.length,
      openTasks: tasks.filter((t: any) => t.status === 'OPEN').length,
      totalSubmissions: submissions.length,
      approvalRate: submissionStats.total > 0
        ? Math.round((submissionStats.approved / submissionStats.total) * 100)
        : 0,
    },
    domainStats,
    submissionStats,
    roleStats,
    taskTrend,
  };
}
