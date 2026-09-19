'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { canEditMembers, isPresidium } from '@/lib/permissions';
import type { SessionUser } from '@/types';

export function MembersTabs({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Directory', href: '/members', always: true },
    { label: 'Free Slots', href: '/free-slots', always: true },
    { label: 'Manage', href: '/members/manage', show: canEditMembers(user) },
    { label: 'Honorary', href: '/honorary-members', show: isPresidium(user) },
  ].filter(t => t.always || t.show);

  return (
    <div className="flex gap-0 border-b-2 border-[#2d2d2d] mb-6">
      {tabs.map(tab => {
        const active = pathname === tab.href || (tab.href !== '/members' && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2.5 text-xs font-bold uppercase tracking-widest font-mono border-b-2 -mb-[2px] transition-colors',
              active
                ? 'border-[#FF9900] text-[#FF9900]'
                : 'border-transparent text-[#555] hover:text-[#999]'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
