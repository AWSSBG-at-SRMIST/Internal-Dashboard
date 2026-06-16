'use client';
import { Badge } from '@/components/ui/badge';
import { getRoleColor, getDomainColor, formatRole } from '@/lib/utils';
import type { SessionUser } from '@/types';

interface HeaderProps {
  user: SessionUser;
  title?: string;
}

export function Header({ user, title }: HeaderProps) {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-lg font-semibold text-slate-100 hidden sm:block">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        {user.domain && user.role !== 'DIRECTOR' && (
          <Badge className={getDomainColor(user.domain)} variant="secondary">
            {user.domain}
          </Badge>
        )}
        <Badge className={getRoleColor(user.role)} variant="secondary">
          {formatRole(user.role, user.domain)}
        </Badge>
        <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
          <span className="text-orange-400 text-xs font-bold">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}
