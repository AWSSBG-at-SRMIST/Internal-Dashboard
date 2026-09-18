import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { getActivitySummary } from '@/lib/activity';
import { AnalyticsTabs } from '@/components/ui/analytics-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Activity as ActivityIcon } from 'lucide-react';
import Link from 'next/link';

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isPresidium(user)) redirect('/dashboard');

  const summary = await getActivitySummary();
  const byFrequency = [...summary].sort((a, b) => b.daysVisitedLast30 - a.daysVisitedLast30);

  return (
    <div>
      <AnalyticsTabs />
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#FF9900]/10 border-2 border-[#FF9900]/30 flex items-center justify-center flex-shrink-0">
            <ActivityIcon size={22} className="text-[#FF9900]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Member Activity</h1>
            <p className="text-sm text-[#666] mt-1 font-mono">Active hours &amp; visit frequency — based on time spent with the app open and focused</p>
          </div>
        </div>

        {summary.length === 0 ? (
          <div className="text-center py-16 text-[#555]">
            <ActivityIcon size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold uppercase tracking-wide">No activity recorded yet</p>
            <p className="text-sm mt-1 font-mono">Data starts accumulating as members use the app.</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="table-container">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-[#1e1e1e]">
                        <th className="table-header text-left">Member</th>
                        <th className="table-header text-right">This Week</th>
                        <th className="table-header text-right">This Month</th>
                        <th className="table-header text-right">All Time</th>
                        <th className="table-header text-right">Days Active (30d)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((m, idx) => (
                        <tr key={m.memberId} className="table-row animate-fadeIn-row" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                          <td className="px-4 py-3">
                            <Link href={`/members/${m.memberId}`} className="text-sm font-bold text-[#f0f0f0] hover:text-[#FF9900] transition-colors">
                              {m.memberName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-[#e0e0e0]">{m.weekHours}h</td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-[#e0e0e0]">{m.monthHours}h</td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-[#e0e0e0]">{m.allTimeHours}h</td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-[#888]">{m.daysVisitedLast30}/30</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {byFrequency.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-bold text-[#aaa] uppercase tracking-wide mb-3">Most Frequent Visitors (last 30 days)</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {byFrequency.slice(0, 6).map((m, i) => (
                  <div key={m.memberId} className="flex items-center justify-between p-2.5 border-2 border-[#2d2d2d] bg-[#111]">
                    <span className="text-sm font-bold text-[#f0f0f0] truncate uppercase tracking-wide">#{i + 1} {m.memberName}</span>
                    <span className="text-xs text-[#666] font-mono flex-shrink-0">{m.daysVisitedLast30}/30 days</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
