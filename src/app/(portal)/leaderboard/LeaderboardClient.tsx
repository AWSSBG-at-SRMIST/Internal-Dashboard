'use client';
import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getDomainColor, getSubdomainColor, getStarColor } from '@/lib/utils';
import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import type { Domain } from '@/types';

const DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];

function initialsOf(name: string) {
  return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
}

function byStars(a: LeaderboardEntry, b: LeaderboardEntry) {
  return b.totalStars - a.totalStars;
}

// One table per role tier. The column header itself names the role
// ("Manager", "Associate"...) instead of a generic "Member" plus a separate
// heading above the table — that's the only label the table gets.
function RoleTable({ roleLabel, members, showDomainColumn }: { roleLabel: string; members: LeaderboardEntry[]; showDomainColumn?: boolean }) {
  if (members.length === 0) return null;
  return (
    <div className="space-y-2">
      {/* Mobile: compact cards */}
      <div className="sm:hidden space-y-2">
        {members.map((m, idx) => (
          <Link key={m.memberId} href={`/members/${m.memberId}`}
            className="block rounded-xl border border-slate-800 bg-slate-900 p-3 active:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 font-mono w-5 flex-shrink-0">{idx + 1}</span>
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="text-xs">{initialsOf(m.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-slate-100 truncate flex-1 min-w-0">{m.name}</span>
              <span className={`text-sm font-bold flex-shrink-0 ${getStarColor(m.totalStars)}`}>
                {m.totalStars > 0 ? '+' : ''}{m.totalStars}⭐
              </span>
            </div>
            {(showDomainColumn && m.domain || m.subdomain) && (
              <div className="flex items-center gap-1.5 mt-2 ml-8">
                {showDomainColumn && m.domain && <Badge className={getDomainColor(m.domain)} variant="secondary">{m.domain}</Badge>}
                {m.subdomain && <Badge className={getSubdomainColor(m.subdomain)} variant="secondary">{m.subdomain}</Badge>}
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* sm and up: table — fixed, evenly-weighted columns */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="table-header text-left w-[8%]">#</th>
                  <th className="table-header text-left w-[28%]">{roleLabel}</th>
                  {showDomainColumn && <th className="table-header text-left w-[16%] hidden md:table-cell">Domain</th>}
                  <th className={`table-header text-left hidden lg:table-cell ${showDomainColumn ? 'w-[22%]' : 'w-[30%]'}`}>Sub-Domain</th>
                  <th className="table-header text-right w-[13%]">Stars</th>
                  <th className="table-header text-right w-[13%] hidden sm:table-cell">Approved</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => (
                  <tr key={m.memberId} className="table-row">
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/members/${m.memberId}`} className="flex items-center gap-2 hover:text-orange-500 min-w-0">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="text-xs">{initialsOf(m.name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-slate-100 truncate">{m.name}</span>
                      </Link>
                    </td>
                    {showDomainColumn && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        {m.domain && <Badge className={getDomainColor(m.domain)} variant="secondary">{m.domain}</Badge>}
                      </td>
                    )}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {m.subdomain && <Badge className={getSubdomainColor(m.subdomain)} variant="secondary">{m.subdomain}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${getStarColor(m.totalStars)}`}>
                        {m.totalStars > 0 ? '+' : ''}{m.totalStars}⭐
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-sm text-green-400 font-medium">{m.approvedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Just a label + line — domain context for the block of tables under it.
// No text divider between the role tables themselves; the column header
// in each RoleTable already says which role it is.
function DomainLabel({ domain }: { domain: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-orange-400/80">{domain}</span>
      <div className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

export default function LeaderboardClient({ initialLeaderboard }: { initialLeaderboard: LeaderboardEntry[] }) {
  const { directors, byDomain } = useMemo(() => {
    const directors = [...initialLeaderboard.filter(m => m.role === 'DIRECTOR')].sort(byStars);
    const byDomain = DOMAINS.map(domain => ({
      domain,
      managers: [...initialLeaderboard.filter(m => m.role === 'MANAGER' && m.domain === domain)].sort(byStars),
      associates: [...initialLeaderboard.filter(m => m.role === 'ASSOCIATE' && m.domain === domain)].sort(byStars),
      builders: [...initialLeaderboard.filter(m => m.role === 'BUILDER' && m.domain === domain)].sort(byStars),
    })).filter(d => d.managers.length > 0 || d.associates.length > 0 || d.builders.length > 0);
    return { directors, byDomain };
  }, [initialLeaderboard]);

  const isEmpty = initialLeaderboard.length === 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Leaderboard</h1>
        <p className="text-sm text-slate-400 mt-1">Member performance rankings based on task submissions</p>
      </div>

      {isEmpty ? (
        <div className="text-center py-16 text-slate-500">
          <Trophy size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {directors.length > 0 && <RoleTable roleLabel="Director" members={directors} showDomainColumn />}

          {byDomain.map(({ domain, managers, associates, builders }, i) => (
            <div key={domain} className={`space-y-3 ${i > 0 || directors.length > 0 ? 'pt-3' : ''}`}>
              <DomainLabel domain={domain} />
              <RoleTable roleLabel="Manager" members={managers} />
              <RoleTable roleLabel="Associate" members={associates} />
              <RoleTable roleLabel="Builder" members={builders} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
