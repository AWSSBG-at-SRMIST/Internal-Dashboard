'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Analytics', href: '/analytics' },
  { label: 'Activity', href: '/activity' },
  { label: 'Audit Logs', href: '/audit-logs' },
];

export function AnalyticsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-0 border-b-2 border-[#2d2d2d] mb-6">
      {TABS.map(tab => {
        const active = pathname === tab.href;
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
