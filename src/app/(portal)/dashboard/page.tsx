import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, QueryCommand } from '@/lib/dynamodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Users, Link2, TrendingUp, Clock, Star, CalendarClock } from 'lucide-react';
import { formatDateTime, getRoleColor, getDomainColor, getSubdomainColor, getAssignmentTypeColor, getAssignmentScopeLabel, getGreeting, timeAgo, formatRole, parseTaskDeadline } from '@/lib/utils';
import { isTaskVisible, getTaskRelationship } from '@/lib/permissions';
import type { SessionUser, Domain, Subdomain } from '@/types';
import Link from 'next/link';

// A task is "mine" if I can actually submit to it — delegates to the same
// single source of truth used everywhere else (getTaskRelationship), so the
// dashboard can't drift out of sync with the real permission model. Team
// tasks are ones I oversee but don't submit.
function isMyTask(
  user: SessionUser,
  task: { assignmentType: string; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null; createdBy: string; createdByRole?: string | null },
): boolean {
  return getTaskRelationship(user, task) === 'CAN_SUBMIT';
}

async function getDashboardStats(user: SessionUser) {
  try {
    const [tasksRes, submissionsRes, linksRes, mySubmissions] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.TASKS })),
      db.send(new ScanCommand({ TableName: TABLE.SUBMISSIONS })),
      db.send(new ScanCommand({ TableName: TABLE.LINKS, ProjectionExpression: 'createdAt' })),
      db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'MemberIndex',
        KeyConditionExpression: 'memberId = :mid',
        ExpressionAttributeValues: { ':mid': user.memberId },
        Limit: 5,
        ScanIndexForward: false,
      })),
    ]);

    const visibleTasks = (tasksRes.Items || []).filter((t: any) => isTaskVisible(user, t));
    const visibleTaskIds = new Set(visibleTasks.map((t: any) => t.taskId));

    const openTasksAll = visibleTasks
      .filter((t: any) => t.status === 'OPEN')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const isBuilder = user.role === 'BUILDER';
    const myTasks = (isBuilder ? openTasksAll : openTasksAll.filter((t: any) => isMyTask(user, t))).slice(0, 5);
    const teamTasks = isBuilder ? [] : openTasksAll.filter((t: any) => !isMyTask(user, t)).slice(0, 5);

    const visibleSubmissions = (submissionsRes.Items || []).filter((s: any) => visibleTaskIds.has(s.taskId));
    const links = linksRes.Items || [];

    // "+N this week" deltas — a simple point-in-time count, not a true
    // historical snapshot (this app doesn't keep one), but still useful as a
    // sense of recent activity.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const tasksThisWeek = visibleTasks.filter((t: any) => new Date(t.createdAt).getTime() >= weekAgo).length;
    const submissionsThisWeek = visibleSubmissions.filter((s: any) => new Date(s.submittedAt).getTime() >= weekAgo).length;
    const linksThisWeek = links.filter((l: any) => new Date(l.createdAt).getTime() >= weekAgo).length;

    // Open tasks (visible to me) with a deadline in the next 7 days —
    // regardless of whether I can submit or am just overseeing them.
    const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const upcomingDeadlines = openTasksAll
      .filter((t: any) => {
        const deadline = parseTaskDeadline(t.deadline).getTime();
        return deadline >= Date.now() && deadline <= weekAhead;
      })
      .sort((a: any, b: any) => parseTaskDeadline(a.deadline).getTime() - parseTaskDeadline(b.deadline).getTime())
      .slice(0, 5);

    return {
      totalTasks: visibleTasks.length,
      totalSubmissions: visibleSubmissions.length,
      totalLinks: links.length,
      tasksThisWeek,
      submissionsThisWeek,
      linksThisWeek,
      myTasks,
      teamTasks,
      myRecentSubmissions: mySubmissions.Items || [],
      upcomingDeadlines,
    };
  } catch (e) {
    return {
      totalTasks: 0, totalSubmissions: 0, totalLinks: 0,
      tasksThisWeek: 0, submissionsThisWeek: 0, linksThisWeek: 0,
      myTasks: [], teamTasks: [], myRecentSubmissions: [], upcomingDeadlines: [],
    };
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const stats = await getDashboardStats(user);

  const statCards = [
    { label: 'Active Tasks', value: stats.totalTasks, delta: stats.tasksThisWeek, icon: <CheckSquare size={20} />, color: 'text-[#FF9900]', bg: 'bg-[#FF9900]/10 border border-[#FF9900]/20', href: '/tasks' },
    { label: 'Submissions', value: stats.totalSubmissions, delta: stats.submissionsThisWeek, icon: <TrendingUp size={20} />, color: 'text-green-400', bg: 'bg-green-400/10 border border-green-400/20', href: '/tasks' },
    { label: 'Short Links', value: stats.totalLinks, delta: stats.linksThisWeek, icon: <Link2 size={20} />, color: 'text-purple-400', bg: 'bg-purple-400/10 border border-purple-400/20', href: '/links' },
  ];

  const isBuilder = user.role === 'BUILDER';
  const firstName = user.name.split(' ')[0];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">
          {getGreeting()}, {firstName}<span className="animate-blink text-[#FF9900]">_</span>
        </h1>
        <p className="text-[#666] text-sm mt-1">
          AWSSBG Internal Dashboard
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(card => (
          <Link href={card.href} key={card.label}>
            <div className="stats-card cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#666] font-bold uppercase tracking-widest">{card.label}</p>
                  <p className="text-3xl font-bold text-[#f0f0f0] mt-1">{card.value}</p>
                  {card.delta > 0 && (
                    <p className="text-xs text-green-400 mt-1 font-mono">+{card.delta} this week</p>
                  )}
                </div>
                <div className={`${card.bg} ${card.color} p-3 transition-all`}>
                  {card.icon}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Upcoming Deadlines */}
      {stats.upcomingDeadlines.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} className="text-orange-400" />
              <CardTitle className="text-base">Deadlines This Week</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2 sm:grid-cols-2">
              {stats.upcomingDeadlines.map((task: any) => (
                <Link href={`/tasks/${task.taskId}`} key={task.taskId} className="block overflow-hidden">
                  <div className="flex items-center gap-2 p-3 hover:bg-[#1a1a1a] transition-colors border-2 border-[#2d2d2d] overflow-hidden">
                    <Clock size={14} className="text-orange-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#f0f0f0] truncate">{task.title}</p>
                      <p className="text-xs text-orange-300 font-mono">Due {formatDateTime(task.deadline)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className={isBuilder ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}>
        {/* My Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Tasks</CardTitle>
              <Link href="/tasks" className="text-xs text-[#FF9900] hover:text-orange-300">View all →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.myTasks.length === 0 ? (
              <div className="text-center py-8 text-[#555]">
                <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No open tasks right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.myTasks.map((task: any) => (
                  <Link href={`/tasks/${task.taskId}`} key={task.taskId} className="block overflow-hidden">
                    <div className="flex items-start gap-2 p-3 hover:bg-[#1a1a1a] transition-colors border-2 border-[#2d2d2d] overflow-hidden">
                      <div className="w-2 h-2 bg-[#FF9900] mt-1.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="text-sm font-medium text-[#f0f0f0] truncate">{task.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge className={`${getAssignmentTypeColor(task.assignmentType)} text-xs`}>
                            {getAssignmentScopeLabel(task.assignmentType)}
                          </Badge>
                          <span className="text-xs text-[#555] truncate">Due {formatDateTime(task.deadline)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Tasks */}
        {!isBuilder && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Team Tasks</CardTitle>
                <Link href="/tasks" className="text-xs text-[#FF9900] hover:text-orange-300">View all →</Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {stats.teamTasks.length === 0 ? (
                <div className="text-center py-8 text-[#555]">
                  <Users size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No team tasks right now</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.teamTasks.map((task: any) => (
                    <Link href={`/tasks/${task.taskId}`} key={task.taskId} className="block overflow-hidden">
                      <div className="flex items-start gap-2 p-3 hover:bg-[#1a1a1a] transition-colors border-2 border-[#2d2d2d] overflow-hidden">
                        <div className="w-2 h-2 bg-purple-400 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-[#f0f0f0] truncate">{task.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {getAssignmentScopeLabel(task.assignmentType)}
                            </Badge>
                            <span className="text-xs text-[#555] truncate">Due {formatDateTime(task.deadline)}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* My Recent Submissions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Submissions</CardTitle>
              <Link href="/tasks" className="text-xs text-[#FF9900] hover:text-orange-300">View tasks →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.myRecentSubmissions.length === 0 ? (
              <div className="text-center py-8 text-[#555]">
                <Star size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No submissions yet</p>
                <Link href="/tasks" className="text-xs text-[#FF9900] hover:text-orange-300 mt-1 inline-block">Browse tasks →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.myRecentSubmissions.map((sub: any) => (
                  <div key={sub.submissionId} className="flex items-center gap-3 p-3 border-2 border-[#2d2d2d]">
                    <div className={`w-2 h-2 flex-shrink-0 ${
                      sub.reviewStatus === 'APPROVED' ? 'bg-green-400' :
                      sub.reviewStatus === 'REJECTED' ? 'bg-red-400' : 'bg-yellow-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#f0f0f0] truncate">{sub.taskTitle}</p>
                      <p className="text-xs text-[#888]">{timeAgo(sub.submittedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {sub.ratingAwarded != null && (
                        <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                        </span>
                      )}
                      <Badge
                        variant={sub.reviewStatus === 'APPROVED' ? 'success' : sub.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'}
                        className="text-xs"
                      >
                        {sub.reviewStatus === 'REVISION_REQUESTED' ? 'Revision' : sub.reviewStatus}
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
              <p className="text-xs text-[#555] mb-1 uppercase tracking-wide">Role</p>
              <Badge className={getRoleColor(user.role, user.domain)}>{formatRole(user.role, user.domain)}</Badge>
            </div>
            {user.domain && user.role !== 'DIRECTOR' && (
              <div>
                <p className="text-xs text-[#555] mb-1 uppercase tracking-wide">Domain</p>
                <Badge className={getDomainColor(user.domain)}>{user.domain}</Badge>
              </div>
            )}
            {user.subdomain && (
              <div>
                <p className="text-xs text-[#555] mb-1 uppercase tracking-wide">Subdomain</p>
                <Badge className={getSubdomainColor(user.subdomain)}>{user.subdomain}</Badge>
              </div>
            )}
            <div>
              <p className="text-xs text-[#555] mb-1 uppercase tracking-wide">Email</p>
              <p className="text-sm text-[#d0d0d0] font-mono">{user.email}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link href="/profile" className="text-sm text-[#FF9900] hover:text-orange-300">
              View full profile →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
