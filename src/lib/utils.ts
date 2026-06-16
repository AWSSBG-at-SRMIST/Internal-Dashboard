import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(date: string | Date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function generateOTP(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return ((arr[0] % 900000) + 100000).toString();
}

export function formatRole(role: string, domain?: string | null): string {
  if (role === 'DIRECTOR') return domain ? `Director of ${domain}` : 'Director';
  const labels: Record<string, string> = {
    SBG_LEADER: 'SBG Leader',
    SECRETARY: 'Secretary',
    MANAGER: 'Manager',
    ASSOCIATE: 'Associate',
    BUILDER: 'Builder',
  };
  return labels[role] || role.replace('_', ' ');
}

// Kept deliberately distinct from getDomainColor's palette (blue/green/pink/orange)
// so a Director's Role badge never matches their Domain badge.
export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    SBG_LEADER: 'bg-red-500/20 text-red-300',
    SECRETARY: 'bg-purple-500/20 text-purple-300',
    DIRECTOR: 'bg-indigo-500/20 text-indigo-300',
    MANAGER: 'bg-teal-500/20 text-teal-300',
    ASSOCIATE: 'bg-yellow-500/20 text-yellow-300',
    BUILDER: 'bg-slate-700 text-slate-300',
  };
  return colors[role] || 'bg-slate-700 text-slate-300';
}

export function getDomainColor(domain: string | null): string {
  const colors: Record<string, string> = {
    Technical: 'bg-blue-500/20 text-blue-300',
    Corporate: 'bg-green-500/20 text-green-300',
    Creatives: 'bg-pink-500/20 text-pink-300',
    General: 'bg-orange-500/20 text-orange-300',
  };
  return domain ? (colors[domain] || 'bg-slate-700 text-slate-300') : 'bg-slate-700 text-slate-300';
}

export function getStarColor(stars: number): string {
  if (stars >= 20) return 'text-yellow-400';
  if (stars >= 10) return 'text-orange-400';
  if (stars >= 5) return 'text-blue-400';
  return 'text-slate-400';
}

export function isDeadlinePassed(deadline: string): boolean {
  return new Date(deadline) < new Date();
}

export function hoursFromDeadline(submittedAt: string, deadline: string): number {
  const sub = new Date(submittedAt).getTime();
  const dead = new Date(deadline).getTime();
  return (sub - dead) / (1000 * 60 * 60);
}
