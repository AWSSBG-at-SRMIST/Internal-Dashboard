import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, QueryCommand } from '@/lib/dynamodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Users, Trophy, Link2, TrendingUp, Clock, Star } from 'lucide-react';
import { formatDateTime, getRoleColor, getDomainColor, timeAgo, formatRole } from '@/lib/utils';
import { isTaskVisible, isPresidium } from '@/lib/permissions';
import type { SessionUser } from '@/types';
import Link from 'next/link';

// Every count here is scoped to what the user is actually allowed to see —
// subdomains must stay anonymous from each other, so no global numbers leak
// to MANAGER/ASSOCIATE/BUILDER roles.
async function getDashboardStats(user: SessionUser) {
  try {
    let membersCount = 0;
    if (isPresidium(user)) {
      const r = await db.send(new ScanCommand({ TableName: TABLE.MEMBERS, Select: 'COUNT' }));
      membersCount = r.Count || 0;
    } else if (user.role === 'DIRECTOR') {
      const r = await db.send(new ScanCommand({
        TableName: TABLE.MEMBERS,
        Select: 'COUNT',
        FilterExpression: '#d = :domain',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':domain': user.domain },
      }));
      membersCount = r.Count || 0;
    } else {
      const r = await db.send(new ScanCommand({
        TableName: TABLE.MEMBERS,
        Select: 'COUNT',
        FilterExpression: '#d = :domain AND subdomain = :subdomain',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':domain': user.domain, ':subdomain': user.subdomain },
      }));
      membersCount = r.Count || 0;
    }

    const [tasksRes, cohortsRes, submissionsRes, linksRes] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.TASKS })),
      db.send(new ScanCommand({ TableName: TABLE.COHORTS })),
      db.send(new ScanCommand({ TableName: TABLE.SUBMISSIONS })),
      db.send(new ScanCommand({ TableName: TABLE.LINKS, Select: 'COUNT' })),
    ]);

    const cohortMap = new Map((cohortsRes.Items || []).map((c: any) => [c.cohortId, c]));
    const visibleTasks = (tasksRes.Items || []).filter((t: any) => isTaskVisible(user, t, cohortMap));
    const visibleTaskIds = new Set(visibleTasks.map((t: any) => t.taskId));

    const openTasks = visibleTasks
      .filter((t: any) => t.status === 'OPEN')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    const visibleSubmissionsCount = (submissionsRes.Items || []).filter((s: any) => visibleTaskIds.has(s.taskId)).length;

    const mySubmissions = await db.send(new QueryCommand({
      TableName: TABLE.SUBMISSIONS,
      IndexName: 'MemberIndex',
      KeyConditionExpression: 'memberId = :mid',
      ExpressionAttributeValues: { ':mid': user.memberId },
      Limit: 5,
      ScanIndexForward: false,
    }));

    return {
      totalMembers: membersCount,
      totalTasks: visibleTasks.length,
      totalSubmissions: visibleSubmissionsCount,
      totalLinks: linksRes.Count || 0,
      recentTasks: openTasks,
      myRecentSubmissions: mySubmissions.Items || [],
    };
  } catch (e) {
    return { totalMembers: 0, totalTasks: 0, totalSubmissions: 0, totalLinks: 0, recentTasks: [], myRecentSubmissions: [] };
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const stats = await getDashboardStats(user);

  const statCards = [
    { label: 'Total Members', value: stats.totalMembers, icon: <Users size={20} />, color: 'text-blue-400', bg: 'bg-blue-500/20', href: '/members' },
    { label: 'Active Tasks', value: stats.totalTasks, icon: <CheckSquare size={20} />, color: 'text-orange-400', bg: 'bg-orange-500/20', href: '/tasks' },
    { label: 'Submissions', value: stats.totalSubmissions, icon: <TrendingUp size={20} />, color: 'text-green-400', bg: 'bg-green-500/20', href: '/tasks' },
    { label: 'Short Links', value: stats.totalLinks, icon: <Link2 size={20} />, color: 'text-purple-400', bg: 'bg-purple-500/20', href: '/links' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">
          Welcome back, {user.name.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Here&apos;s what&apos;s happening in the AWSSBG dashboard
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <Link href={card.href} key={card.label}>
            <div className="stats-card hover:border-slate-700 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-100 mt-1">{card.value}</p>
                </div>
                <div className={`${card.bg} ${card.color} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Open Tasks</CardTitle>
              <Link href="/tasks" className="text-xs text-orange-500 hover:text-orange-400">View all →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.recentTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No open tasks right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentTasks.map((task: any) => (
                  <Link href={`/tasks/${task.taskId}`} key={task.taskId}>
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors border border-slate-800">
                      <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-100 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock size={12} className="text-slate-500" />
                          <p className="text-xs text-slate-500">
                            Due {formatDateTime(task.deadline)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {task.assignmentType}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Recent Submissions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Submissions</CardTitle>
              <Link href="/tasks" className="text-xs text-orange-500 hover:text-orange-400">View tasks →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.myRecentSubmissions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Star size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No submissions yet</p>
                <Link href="/tasks" className="text-xs text-orange-500 hover:text-orange-400 mt-1 inline-block">Browse tasks →</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.myRecentSubmissions.map((sub: any) => (
                  <div key={sub.submissionId} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      sub.reviewStatus === 'APPROVED' ? 'bg-green-400' :
                      sub.reviewStatus === 'REJECTED' ? 'bg-red-400' : 'bg-yellow-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{sub.taskTitle}</p>
                      <p className="text-xs text-slate-500">{timeAgo(sub.submittedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {sub.ratingAwarded != null && (
                        <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                        </span>
                      )}
                      <Badge
                        variant={sub.reviewStatus === 'APPROVED' ? 'success' : sub.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'}
                        className="text-xs"
                      >
                        {sub.reviewStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Role</p>
              <Badge className={getRoleColor(user.role)}>{formatRole(user.role, user.domain)}</Badge>
            </div>
            {user.domain && user.role !== 'DIRECTOR' && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Domain</p>
                <Badge className={getDomainColor(user.domain)}>{user.domain}</Badge>
              </div>
            )}
            {user.subdomain && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Subdomain</p>
                <Badge variant="outline">{user.subdomain}</Badge>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">Email</p>
              <p className="text-sm text-slate-300">{user.email}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link href="/profile" className="text-sm text-orange-500 hover:text-orange-400">
              View full profile →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
