import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPresidium(user) && user.role !== 'DIRECTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [membersRes, tasksRes, submissionsRes] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.MEMBERS })),
      db.send(new ScanCommand({ TableName: TABLE.TASKS })),
      db.send(new ScanCommand({ TableName: TABLE.SUBMISSIONS })),
    ]);

    const members = membersRes.Items || [];
    const tasks = tasksRes.Items || [];
    const submissions = submissionsRes.Items || [];

    // Domain distribution
    const domainStats = ['Technical', 'Corporate', 'Creatives'].map(domain => ({
      domain,
      members: members.filter((m: any) => m.domain === domain && m.isActive).length,
      tasks: tasks.filter((t: any) => t.domain === domain).length,
      submissions: submissions.filter((s: any) => s.domain === domain).length,
    }));

    // Submission status
    const submissionStats = {
      total: submissions.length,
      approved: submissions.filter((s: any) => s.reviewStatus === 'APPROVED').length,
      rejected: submissions.filter((s: any) => s.reviewStatus === 'REJECTED').length,
      pending: submissions.filter((s: any) => s.reviewStatus === 'PENDING').length,
    };

    // Role distribution
    const roleStats = ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'].map(role => ({
      role,
      count: members.filter((m: any) => m.role === role && m.isActive).length,
    }));

    // Task trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTasks = tasks.filter((t: any) => new Date(t.createdAt) >= thirtyDaysAgo);

    // Group by week
    const weeklyTasks: Record<string, number> = {};
    recentTasks.forEach((t: any) => {
      const week = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      weeklyTasks[week] = (weeklyTasks[week] || 0) + 1;
    });

    const taskTrend = Object.entries(weeklyTasks)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
