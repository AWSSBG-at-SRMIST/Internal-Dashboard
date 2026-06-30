'use client';
import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { getRoleColor, getDomainColor, getSubdomainColor, getStarColor, formatRole } from '@/lib/utils';
import { DOMAIN_SUBDOMAINS, ROLE_HIERARCHY } from '@/types';
import type { Domain } from '@/types';
import Link from 'next/link';
import type { Member } from '@/types';

const PAGE_SIZE = 10;

function MemberMobileCard({ member, hideDomain, hideStars, hideSubdomain, delay }: {
  member: Member; hideDomain?: boolean; hideStars?: boolean; hideSubdomain?: boolean; delay: number;
}) {
  return (
    <Link
      href={`/members/${member.memberId}`}
      className="block rounded-xl border border-slate-800 bg-slate-900 p-4 animate-fadeIn active:bg-slate-800/60"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100 truncate">{member.name}</p>
          <p className="text-xs text-slate-500 truncate">{member.officialEmail}</p>
        </div>
        {!hideStars && (
          <span className={`text-sm font-bold flex-shrink-0 ${getStarColor(member.totalStars)}`}>
            {member.totalStars > 0 ? '+' : ''}{member.totalStars}⭐
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <Badge className={getRoleColor(member.role, member.domain)} variant="secondary">{formatRole(member.role, member.domain)}</Badge>
        {!hideDomain && member.domain && <Badge className={getDomainColor(member.domain)} variant="secondary">{member.domain}</Badge>}
        {!hideSubdomain && member.subdomain && <Badge className={getSubdomainColor(member.subdomain)}>{member.subdomain}</Badge>}
      </div>
    </Link>
  );
}

function MemberTable({ members, hideDomain, hideStars, hideSubdomain }: { members: Member[]; hideDomain?: boolean; hideStars?: boolean; hideSubdomain?: boolean }) {
  const { page, setPage, totalPages, paginatedItems } = usePagination(members, PAGE_SIZE);

  return (
    <>
      {/* Mobile: compact cards carrying the same info the table hides below `sm` */}
      <div className="sm:hidden space-y-2">
        {paginatedItems.map((member, idx) => (
          <MemberMobileCard
            key={member.memberId}
            member={member}
            hideDomain={hideDomain}
            hideStars={hideStars}
            hideSubdomain={hideSubdomain}
            delay={Math.min(idx, 10) * 30}
          />
        ))}
      </div>

      {/* sm and up: full table */}
      <div className="table-container hidden sm:block">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="table-header text-left">Member</th>
            <th className="table-header text-left hidden md:table-cell">Role</th>
            {!hideDomain && <th className="table-header text-left hidden lg:table-cell">Domain</th>}
            {!hideSubdomain && <th className="table-header text-left hidden lg:table-cell">Sub-Domain</th>}
            {!hideStars && <th className="table-header text-right hidden sm:table-cell">Stars</th>}
            <th className="table-header text-left hidden lg:table-cell">Club ID</th>
            <th className="table-header text-center">Profile</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((member, idx) => (
            <tr key={member.memberId} className="table-row animate-fadeIn-row" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{member.name}</p>
                    <p className="text-xs text-slate-500 truncate">{member.officialEmail}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <Badge className={getRoleColor(member.role, member.domain)} variant="secondary">{formatRole(member.role, member.domain)}</Badge>
              </td>
              {!hideDomain && (
                <td className="px-4 py-3 hidden lg:table-cell">
                  {member.domain
                    ? <Badge className={getDomainColor(member.domain)} variant="secondary">{member.domain}</Badge>
                    : <span className="text-xs text-slate-600">—</span>
                  }
                </td>
              )}
              {!hideSubdomain && (
                <td className="px-4 py-3 hidden lg:table-cell">
                  {member.subdomain
                    ? <Badge className={getSubdomainColor(member.subdomain)}>{member.subdomain}</Badge>
                    : <span className="text-xs text-slate-600">—</span>
                  }
                </td>
              )}
              {!hideStars && (
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className={`text-sm font-bold ${getStarColor(member.totalStars)}`}>
                    {member.totalStars > 0 ? '+' : ''}{member.totalStars}⭐
                  </span>
                </td>
              )}
              <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">{member.clubId}</td>
              <td className="px-4 py-3 text-center">
                <Link href={`/members/${member.memberId}`}>
                  <Button variant="ghost" size="sm" className="text-xs">View</Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

export default function MembersClient({ initialMembers }: { initialMembers: Member[] }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');

  const filtered = useMemo(() => initialMembers.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.officialEmail.toLowerCase().includes(search.toLowerCase()) ||
      (m.clubId || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || m.role === roleFilter;
    const matchDomain = domainFilter === 'ALL' || m.domain === domainFilter;
    return matchSearch && matchRole && matchDomain;
  }), [initialMembers, search, roleFilter, domainFilter]);

  // Presidium (SBG Leader + Secretary) and Board of Directors sit above the
  // domain split; everyone else is grouped by domain, then by subdomain.
  const { presidium, directors, domainGroups } = useMemo(() => {
    const presidium = filtered
      .filter(m => m.role === 'SBG_LEADER' || m.role === 'SECRETARY')
      .sort((a, b) => (a.role === 'SBG_LEADER' ? 0 : 1) - (b.role === 'SBG_LEADER' ? 0 : 1));
    const directors = filtered.filter(m => m.role === 'DIRECTOR');
    const domains: Exclude<Domain, 'General'>[] = ['Technical', 'Corporate', 'Creatives'];
    const domainGroups = domains
      .map(domain => {
        const domainMembers = filtered.filter(m => m.domain === domain && m.role !== 'DIRECTOR');
        const subdomains = DOMAIN_SUBDOMAINS[domain] || [];
        const subdomainGroups = subdomains
          .map((subdomain: string) => ({
            subdomain,
            members: domainMembers
              .filter(m => m.subdomain === subdomain)
              .sort((a, b) => ROLE_HIERARCHY[a.role] - ROLE_HIERARCHY[b.role]),
          }))
          .filter((g: { members: Member[] }) => g.members.length > 0);
        return { domain, subdomainGroups };
      })
      .filter(g => g.subdomainGroups.length > 0);
    return { presidium, directors, domainGroups };
  }, [filtered]);

  const hasGroups = presidium.length > 0 || directors.length > 0 || domainGroups.length > 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Members</h1>
          <p className="text-sm text-slate-400 mt-1">{initialMembers.length} members</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input placeholder="Search by name, email, Club ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Roles</SelectItem>
            <SelectItem value="SBG_LEADER">SBG Leader</SelectItem>
            <SelectItem value="SECRETARY">Secretary</SelectItem>
            <SelectItem value="DIRECTOR">Board of Directors</SelectItem>
            <SelectItem value="MANAGER">Manager</SelectItem>
            <SelectItem value="ASSOCIATE">Associate</SelectItem>
            <SelectItem value="BUILDER">Builder</SelectItem>
          </SelectContent>
        </Select>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Domain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Domains</SelectItem>
            <SelectItem value="Technical">Technical</SelectItem>
            <SelectItem value="Corporate">Corporate</SelectItem>
            <SelectItem value="Creatives">Creatives</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!hasGroups ? (
        <div className="text-center py-16 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No members found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {presidium.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Presidium</h2>
              <MemberTable members={presidium} hideDomain hideStars hideSubdomain />
            </div>
          )}

          {directors.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Board of Directors</h2>
              <MemberTable members={directors} hideDomain hideSubdomain />
            </div>
          )}

          {domainGroups.map(group => (
            <div key={group.domain} className="space-y-5">
              <div className="flex items-center gap-2">
                <Badge className={getDomainColor(group.domain)} variant="secondary">{group.domain}</Badge>
              </div>
              {group.subdomainGroups.map(sg => (
                <div key={sg.subdomain} className="space-y-2 pl-1 border-l-2 border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 pl-3">{sg.subdomain}</h3>
                  <MemberTable members={sg.members} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
