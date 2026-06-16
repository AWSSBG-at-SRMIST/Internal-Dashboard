'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, Users, Link2, Trophy, BarChart3,
  FileText, LogOut, Menu, X, Layers
} from 'lucide-react';
import { cn, formatRole } from '@/lib/utils';
import type { SessionUser } from '@/types';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare size={18} /> },
  { label: 'Members', href: '/members', icon: <Users size={18} /> },
  { label: 'Cohorts', href: '/cohorts', icon: <Layers size={18} />, roles: ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER'] },
  { label: 'Link Shortener', href: '/links', icon: <Link2 size={18} /> },
  { label: 'Leaderboard', href: '/leaderboard', icon: <Trophy size={18} /> },
  { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} />, roles: ['SBG_LEADER', 'SECRETARY', 'DIRECTOR'] },
  { label: 'Audit Logs', href: '/audit-logs', icon: <FileText size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
];

interface SidebarProps {
  user: SessionUser;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter(item =>
    !item.roles || item.roles.includes(user.role)
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
            <Image src="/logo.png" alt="AWSSBG Logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Internal Dashboard</p>
            <p className="text-slate-400 text-xs">@AWSSBG · SRMIST</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'sidebar-link',
                isActive && 'active'
              )}
            >
              <span className={cn(isActive ? 'text-orange-400' : 'text-slate-500')}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-400 text-xs font-bold">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user.name}</p>
            <p className="text-slate-400 text-xs truncate">{formatRole(user.role, user.domain)}</p>
          </div>
        </div>
        <Link
          href="/api/auth/logout"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all mt-1"
        >
          <LogOut size={16} />
          Sign out
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-white"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'lg:hidden fixed top-0 left-0 h-full w-64 bg-slate-900 z-40 transform transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 h-screen sticky top-0 flex-shrink-0">
        <SidebarContent />
      </aside>
    </>
  );
}
