'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BarChart3, Users, CheckSquare, TrendingUp, Loader2 } from 'lucide-react';
import { formatRole } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const COLORS = ['#FF9900', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B'];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { if (d.success) setAnalytics(d.data); else toast.error('Failed to load analytics'); })
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>;
  if (!analytics) return null;

  const { overview, domainStats, submissionStats, roleStats, taskTrend } = analytics;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">Organization performance overview</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Members', value: overview.totalMembers, icon: <Users size={20} />, color: 'text-blue-400', bg: 'bg-blue-500/20' },
          { label: 'Total Tasks', value: overview.totalTasks, icon: <CheckSquare size={20} />, color: 'text-orange-400', bg: 'bg-orange-500/20' },
          { label: 'Open Tasks', value: overview.openTasks, icon: <TrendingUp size={20} />, color: 'text-green-400', bg: 'bg-green-500/20' },
          { label: 'Approval Rate', value: `${overview.approvalRate}%`, icon: <BarChart3 size={20} />, color: 'text-purple-400', bg: 'bg-purple-500/20' },
        ].map(card => (
          <div key={card.label} className="stats-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-slate-100 mt-1">{card.value}</p>
              </div>
              <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Domain Stats */}
        <Card>
          <CardHeader><CardTitle className="text-base">Domain Overview</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={domainStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="domain" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ color: '#94a3b8' }} />
                <Bar dataKey="members" name="Members" fill="#FF9900" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tasks" name="Tasks" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="submissions" name="Submissions" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Submission Status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Submission Status</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-6">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Approved', value: submissionStats.approved },
                    { name: 'Pending', value: submissionStats.pending },
                    { name: 'Rejected', value: submissionStats.rejected },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {['#10B981', '#F59E0B', '#EF4444'].map((color, i) => <Cell key={i} fill={color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Role Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roleStats.filter((r: any) => r.count > 0).map((r: any, i: number) => (
                <div key={r.role} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-32 flex-shrink-0">{formatRole(r.role)}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.max(4, (r.count / (overview.totalMembers || 1)) * 100)}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-100 w-8 text-right">{r.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Task Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Task Creation Trend (30 days)</CardTitle></CardHeader>
          <CardContent>
            {taskTrend.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">No recent task data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={taskTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                  <Bar dataKey="count" name="Tasks Created" fill="#FF9900" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
