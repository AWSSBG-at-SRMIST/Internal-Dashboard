'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, Users, Link2, Trophy, BarChart3,
  FileText, NotebookPen, LogOut, Menu, X, Download, Lock, Activity, Mail, UserCog, AlertTriangle, Award, BookOpen
} from 'lucide-react';
import { cn, formatRole } from '@/lib/utils';
import { canGenerateMoM, canAccessSponsorshipMail, canEditMembers } from '@/lib/permissions';
import type { SessionUser } from '@/types';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  visible?: (user: SessionUser, flags: { showVault: boolean }) => boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare size={18} /> },
  { label: 'Members', href: '/members', icon: <Users size={18} /> },
  // Presidium + HR & Admin Manager/Associate: add/edit/permanently-delete members.
  { label: 'Manage Members', href: '/members/manage', icon: <UserCog size={18} />, visible: canEditMembers },
  { label: 'Leaderboard', href: '/leaderboard', icon: <Trophy size={18} /> },
  { label: 'Link Shortener', href: '/links', icon: <Link2 size={18} />, roles: ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE'] },
  { label: 'Generate MoM', href: '/mom', icon: <NotebookPen size={18} />, visible: canGenerateMoM },
  { label: 'Minutes of Meetings', href: '/minutes-of-meetings', icon: <BookOpen size={18} /> },
  // Sponsorship & Finance only (Manager/Associate/Builder all included).
  { label: 'Sponsorship Outreach', href: '/sponsorship-outreach', icon: <Mail size={18} />, visible: canAccessSponsorshipMail },
  // Director-tier (Presidium always sees it too): Presidium/Directors always;
  // Managers/Associates only once something's been shared with them
  // (showVault is precomputed server-side in PortalLayout since it depends
  // on vault data, not just the user's role).
  { label: 'Vault', href: '/vault', icon: <Lock size={18} />, visible: (_user, flags) => flags.showVault },
  // Presidium-only tier, grouped together at the end so the list reads as
  // increasingly restricted rather than interleaving privilege levels.
  { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
  { label: 'Audit Logs', href: '/audit-logs', icon: <FileText size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
  { label: 'Member Activity', href: '/activity', icon: <Activity size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
  // Faculty/Industry mentors & founding members shown on the public website's
  // Team page — Presidium-only since only they manage that roster.
  { label: 'Honorary Members', href: '/honorary-members', icon: <Award size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
  { label: 'Install App', href: '/install', icon: <Download size={18} /> },
];

function NavPanel({ user, visibleItems, pathname, profileMissingCount, onNavigate, onLogout }: {
  user: SessionUser; visibleItems: NavItem[]; pathname: string; profileMissingCount: number; onNavigate: () => void; onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b-2 border-[#2d2d2d]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 overflow-hidden flex-shrink-0 bg-[#1a1a1a] border-2 border-[#2d2d2d]">
            <Image src="/logo.png" alt="AWSSBG Logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight tracking-wide uppercase">Internal Dashboard</p>
            <p className="text-[#f0f0f0] text-xs font-mono">@AWSSBG · SRMIST</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {(() => {
          // Pick the single longest (most specific) matching href instead of
          // letting every prefix match independently — otherwise "Members"
          // (/members) and "Manage Members" (/members/manage) both light up
          // at once when you're actually on /members/manage.
          const activeHref = visibleItems.reduce<string | null>((best, item) => {
            const matches = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
            if (!matches) return best;
            return (!best || item.href.length > best.length) ? item.href : best;
          }, null);

          return visibleItems.map(item => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn('sidebar-link', isActive && 'active')}
              >
                <span className={cn(isActive ? 'text-black' : 'text-[#555]')}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          });
        })()}
      </nav>

      {/* User */}
      <div className="p-3 border-t-2 border-[#2d2d2d]">
        <Link
          href="/profile"
          onClick={onNavigate}
          className={cn('flex items-center gap-3 px-3 py-2 -mx-1 transition-colors hover:bg-[#1a1a1a]', pathname === '/profile' && 'bg-[#1a1a1a]')}
        >
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold uppercase truncate">{user.name}</p>
            <p className="text-[#555] text-xs font-mono truncate">{formatRole(user.role, user.domain)}</p>
            {profileMissingCount > 0 && (
              <p className="flex items-center gap-1 text-[10px] text-yellow-400 font-mono mt-0.5">
                <AlertTriangle size={10} className="flex-shrink-0" />
                Profile incomplete ({profileMissingCount})
              </p>
            )}
          </div>
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 mt-2 text-xs font-mono font-bold uppercase tracking-widest text-[#888] border-2 border-[#2d2d2d] hover:text-[#ff4444] hover:border-[#ff4444] hover:bg-[#1a0000] transition-all"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  user: SessionUser;
  showVault: boolean;
  profileMissingCount: number;
  children: React.ReactNode;
}

export function Sidebar({ user, showVault, profileMissingCount, children }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter(item =>
    item.visible ? item.visible(user, { showVault }) : !item.roles || item.roles.includes(user.role)
  );
  const closeMobile = () => setMobileOpen(false);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Purge the SW cache so a subsequent login on the same (possibly shared)
    // device doesn't get served this session's cached pages/state.
    navigator.serviceWorker?.controller?.postMessage('CLEAR_CACHE');
    window.location.href = '/login';
  }

  return (
    <div className="flex h-dvh w-full bg-[#050505] overflow-hidden overscroll-none">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/70"
          onClick={closeMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        'lg:hidden fixed top-0 left-0 h-dvh w-72 bg-black border-r-2 border-[#2d2d2d] z-50 transform transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <NavPanel user={user} visibleItems={visibleItems} pathname={pathname} profileMissingCount={profileMissingCount} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-black border-r-2 border-[#2d2d2d] h-full flex-shrink-0">
        <NavPanel user={user} visibleItems={visibleItems} pathname={pathname} profileMissingCount={profileMissingCount} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden h-14 flex items-center gap-3 px-3 border-b-2 border-[#2d2d2d] bg-black flex-shrink-0">
          <button
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="w-11 h-11 flex items-center justify-center bg-[#1a1a1a] border-2 border-[#2d2d2d] text-white flex-shrink-0 hover:border-[#FF9900] transition-colors"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="w-7 h-7 overflow-hidden flex-shrink-0 bg-[#1a1a1a] border border-[#333]">
            <Image src="/logo.png" alt="AWSSBG Logo" width={28} height={28} className="object-contain" />
          </div>
          <p className="text-white font-bold text-sm truncate uppercase tracking-wide">Internal Dashboard</p>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 overscroll-contain flex flex-col">
          <div className="flex-1 p-4 lg:p-6">
            {children}
          </div>
          <footer className="border-t border-[#2d2d2d] py-2.5 px-4 lg:px-6">
            <p className="text-[10px] text-[#f0f0f0] font-mono text-center tracking-wide">
              Made with ♥ by Tech Team for AWS SBG at SRMIST &nbsp;·&nbsp; Strictly for internal use only.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
