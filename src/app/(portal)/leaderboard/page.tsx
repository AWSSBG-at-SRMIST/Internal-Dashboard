'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Trophy, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getRoleColor, getDomainColor, getStarColor, formatRole } from '@/lib/utils';
import { DOMAIN_SUBDOMAINS } from '@/types';
import Link from 'next/link';

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [subdomainFilter, setSubdomainFilter] = useState('ALL');

  useEffect(() => { fetchLeaderboard(); }, [domainFilter, subdomainFilter]);

  async function fetchLeaderboard() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (domainFilter !== 'ALL') params.set('domain', domainFilter);
      if (subdomainFilter !== 'ALL') params.set('subdomain', subdomainFilter);
      const res = await fetch(`/api/leaderboard?${params}`);
      const data = await res.json();
      if (data.success) setLeaderboard(data.data);
    } catch { toast.error('Failed to load leaderboard'); }
    finally { setLoading(false); }
  }

  const subdomains = domainFilter !== 'ALL'
    ? DOMAIN_SUBDOMAINS[domainFilter as keyof typeof DOMAIN_SUBDOMAINS] || []
    : [];

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const podiumColors = ['text-yellow-400', 'text-slate-400', 'text-orange-500'];
  const podiumBgs = ['bg-yellow-500/10 border-yellow-500/30', 'bg-slate-800 border-slate-700', 'bg-orange-500/10 border-orange-500/30'];
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Leaderboard</h1>
        <p className="text-sm text-slate-400 mt-1">Member performance rankings based on task submissions</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={domainFilter} onValueChange={v => { setDomainFilter(v); setSubdomainFilter('ALL'); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Domain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Domains</SelectItem>
            <SelectItem value="Technical">Technical</SelectItem>
            <SelectItem value="Corporate">Corporate</SelectItem>
            <SelectItem value="Creatives">Creatives</SelectItem>
          </SelectContent>
        </Select>
        {subdomains.length > 0 && (
          <Select value={subdomainFilter} onValueChange={setSubdomainFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Subdomain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Subdomains</SelectItem>
              {subdomains.map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Trophy size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data yet</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {top3.map((member, idx) => (
                <Link href={`/members/${member.memberId}`} key={member.memberId}>
                  <Card className={`border ${podiumBgs[idx]} hover:border-slate-600 transition-all cursor-pointer text-center`}>
                    <CardContent className="p-4">
                      <div className="text-3xl mb-2">{medals[idx]}</div>
                      <Avatar className="h-12 w-12 mx-auto mb-2">
                        <AvatarFallback className="font-bold">
                          {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-semibold text-slate-100 text-sm truncate">{member.name}</p>
                      <Badge className={`${getRoleColor(member.role)} mt-1 text-xs`} variant="secondary">
                        {formatRole(member.role, member.domain)}
                      </Badge>
                      <div className={`text-2xl font-bold mt-2 ${podiumColors[idx]}`}>
                        {member.totalStars > 0 ? '+' : ''}{member.totalStars}⭐
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Rest of leaderboard */}
          {rest.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="table-header text-left w-12">#</th>
                      <th className="table-header text-left">Member</th>
                      <th className="table-header text-left hidden md:table-cell">Role</th>
                      <th className="table-header text-left hidden lg:table-cell">Domain</th>
                      <th className="table-header text-right">Stars</th>
                      <th className="table-header text-right hidden sm:table-cell">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((member, idx) => (
                      <tr key={member.memberId} className="table-row">
                        <td className="px-4 py-3 text-sm text-slate-500 font-mono">{idx + 4}</td>
                        <td className="px-4 py-3">
                          <Link href={`/members/${member.memberId}`} className="flex items-center gap-2 hover:text-orange-500">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-slate-100">{member.name}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge className={getRoleColor(member.role)} variant="secondary" style={{ fontSize: '11px' }}>
                            {formatRole(member.role, member.domain)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {member.domain && member.role !== 'DIRECTOR' && <Badge className={getDomainColor(member.domain)} variant="secondary" style={{ fontSize: '11px' }}>{member.domain}</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${getStarColor(member.totalStars)}`}>
                            {member.totalStars > 0 ? '+' : ''}{member.totalStars}⭐
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell text-sm text-green-400 font-medium">{member.approvedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
