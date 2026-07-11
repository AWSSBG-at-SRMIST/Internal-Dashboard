'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Users, CheckSquare, TrendingUp, Crown, ShieldCheck, Briefcase, UserCog, GraduationCap, User, Star, Loader2 } from 'lucide-react';
import { formatRole, getStarColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import type { AnalyticsResponse } from '@/lib/analytics';

const DAYS_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];
const DOMAIN_OPTIONS = ['ALL', 'Technical', 'Corporate', 'Creatives'];

const COLORS = ['#FF9900', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B'];

const ROLE_ICONS: Record<string, React.ReactNode> = {
  SBG_LEADER: <Crown size={14} />,
  SECRETARY: <ShieldCheck size={14} />,
  DIRECTOR: <Briefcase size={14} />,
  MANAGER: <UserCog size={14} />,
  ASSOCIATE: <User size={14} />,
  BUILDER: <GraduationCap size={14} />,
};

const tooltipStyle = {
  backgroundColor: '#111',
  border: '2px solid #2d2d2d',
  borderRadius: '0',
  color: '#e0e0e0',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
};

export default function AnalyticsCharts({ analytics: initialAnalytics }: { analytics: AnalyticsResponse }) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [days, setDays] = useState('30');
  const [domain, setDomain] = useState('ALL');
  const [loading, setLoading] = useState(false);

  const { overview, domainStats, submissionStats, roleStats, taskTrend, ratingTrend, topPerformers } = analytics;

  async function applyFilters(nextDays: string, nextDomain: string) {
    setDays(nextDays);
    setDomain(nextDomain);
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: nextDays, domain: nextDomain });
      const res = await fetch(`/api/analytics?${params}`);
      const d = await res.json();
      if (d.success) setAnalytics(d.data);
    } finally {
      setLoading(false);
    }
  }

  const rangeLabel = DAYS_OPTIONS.find(o => o.value === days)?.label.toLowerCase() ?? 'selected range';

  const overviewCards = [
    { label: 'Active Members',  value: overview.totalMembers,       hint: domain === 'ALL' ? 'across all domains' : domain,   icon: <Users size={20} />,      color: 'text-blue-400',   border: 'hover:border-blue-400/50' },
    { label: 'Total Tasks',     value: overview.totalTasks,         hint: `${overview.openTasks} currently open`,            icon: <CheckSquare size={20} />, color: 'text-[#FF9900]',  border: 'hover:border-[#FF9900]/50' },
    { label: 'Open Tasks',      value: overview.openTasks,          hint: 'awaiting submissions',                            icon: <TrendingUp size={20} />,  color: 'text-green-400',  border: 'hover:border-green-400/50' },
    { label: 'Approval Rate',   value: `${overview.approvalRate}%`, hint: `${submissionStats.approved}/${submissionStats.total} submissions`, icon: <BarChart3 size={20} />,  color: 'text-purple-400', border: 'hover:border-purple-400/50' },
  ];

  const pieData = [
    { name: 'Approved', value: submissionStats.approved, color: '#10B981' },
    { name: 'Pending',  value: submissionStats.pending,  color: '#F59E0B' },
    { name: 'Rejected', value: submissionStats.rejected, color: '#EF4444' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#FF9900]/10 border-2 border-[#FF9900]/30 flex items-center justify-center flex-shrink-0">
            <BarChart3 size={22} className="text-[#FF9900]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Analytics</h1>
            <p className="text-sm text-[#666] mt-1 font-mono">Organization performance overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-[#666]" />}
          <Select value={domain} onValueChange={v => applyFilters(days, v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOMAIN_OPTIONS.map(d => (
                <SelectItem key={d} value={d}>{d === 'ALL' ? 'All Domains' : d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={v => applyFilters(v, domain)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map(card => (
          <div
            key={card.label}
            className={`border-2 border-[#2d2d2d] bg-[#111] p-5 transition-all ${card.border}`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-[#666] font-bold uppercase tracking-widest truncate">{card.label}</p>
                <p className="text-3xl font-bold text-[#f0f0f0] mt-1 font-mono">{card.value}</p>
                <p className="text-[11px] text-[#555] mt-1 truncate font-mono">{card.hint}</p>
              </div>
              <div className={`${card.color} p-3 flex-shrink-0`}>{card.icon}</div>
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
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="domain" tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} />
                <YAxis tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ color: '#666', fontSize: 11, fontFamily: 'monospace' }} />
                <Bar dataKey="members" name="Members" fill="#FF9900" radius={[0, 0, 0, 0]} />
                <Bar dataKey="tasks" name="Tasks" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="submissions" name="Submissions" fill="#10B981" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Submission Status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Submission Status</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-[#f0f0f0] font-mono">{overview.approvalRate}%</span>
                <span className="text-[10px] text-[#555] uppercase tracking-widest font-mono">Approved</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {pieData.map(item => (
                <div key={item.name} className="flex flex-col items-center gap-1 bg-[#1a1a1a] border-2 border-[#2d2d2d] py-2">
                  <span className="flex items-center gap-1.5 text-xs text-[#888] font-mono">
                    <span className="w-2 h-2 flex-shrink-0" style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <span className="text-sm font-bold text-[#f0f0f0] font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Role Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3.5">
              {roleStats.filter(r => r.count > 0).map((r, i) => {
                const pct = Math.round((r.count / (overview.totalMembers || 1)) * 100);
                return (
                  <div key={r.role} className="flex items-center gap-3">
                    <span
                      className="flex items-center justify-center w-6 h-6 flex-shrink-0"
                      style={{ backgroundColor: `${COLORS[i % COLORS.length]}26`, color: COLORS[i % COLORS.length] }}
                    >
                      {ROLE_ICONS[r.role]}
                    </span>
                    <span className="text-xs text-[#888] w-16 sm:w-28 flex-shrink-0 truncate font-mono uppercase">{formatRole(r.role)}</span>
                    <div className="flex-1 bg-[#1a1a1a] h-2 overflow-hidden">
                      <div
                        className="h-2 transition-all duration-500"
                        style={{ width: `${Math.max(4, pct)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <span className="text-sm font-bold text-[#f0f0f0] w-8 text-right flex-shrink-0 font-mono">{r.count}</span>
                    <span className="text-[11px] text-[#555] w-9 text-right flex-shrink-0 font-mono">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Task Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Task Creation Trend ({rangeLabel})</CardTitle></CardHeader>
          <CardContent>
            {taskTrend.length === 0 ? (
              <p className="text-center text-[#555] py-8 text-sm font-mono uppercase tracking-wide">No task data in this range</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={taskTrend}>
                  <defs>
                    <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9900" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#FF9900" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Tasks Created"
                    stroke="#FF9900"
                    strokeWidth={2}
                    fill="url(#gradTrend)"
                    dot={{ r: 3, fill: '#FF9900', strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: '#FF9900' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Rating Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Stars Awarded Trend ({rangeLabel})</CardTitle></CardHeader>
          <CardContent>
            {ratingTrend.length === 0 ? (
              <p className="text-center text-[#555] py-8 text-sm font-mono uppercase tracking-wide">No reviewed submissions in this range</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={ratingTrend}>
                  <defs>
                    <linearGradient id="gradStars" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#666', fontFamily: 'monospace' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="stars"
                    name="Net Stars Awarded"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#gradStars)"
                    dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: '#10B981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Performers{domain !== 'ALL' ? ` · ${domain}` : ''}</CardTitle>
              <Link href="/leaderboard" className="text-xs text-[#FF9900] hover:text-orange-300 font-mono uppercase tracking-wide">
                Full Leaderboard →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {topPerformers.length === 0 ? (
              <p className="text-center text-[#555] py-8 text-sm font-mono uppercase tracking-wide">No rated members yet</p>
            ) : (
              <div className="space-y-2">
                {topPerformers.map((p, i) => (
                  <Link
                    key={p.memberId}
                    href={`/members/${p.memberId}`}
                    className="flex items-center gap-3 p-2.5 border-2 border-[#2d2d2d] hover:border-[#FF9900]/40 transition-colors"
                  >
                    <span className="w-6 text-center text-xs font-bold text-[#666] font-mono flex-shrink-0">#{i + 1}</span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-[#f0f0f0] truncate uppercase tracking-wide">{p.name}</span>
                    <span className="text-xs text-[#666] font-mono uppercase flex-shrink-0">{formatRole(p.role)}</span>
                    <span className={`flex items-center gap-1 text-sm font-bold font-mono flex-shrink-0 ${getStarColor(p.totalStars)}`}>
                      <Star size={12} />{p.totalStars > 0 ? '+' : ''}{p.totalStars}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
