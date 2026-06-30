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

export function getGreeting(): string {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()),
    10
  );
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Hello Night Owl';
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

// Solid pill style for every tag, built from exact hex values chosen by the
// user — do not change the hex values, only edit the `dark` flag if a tag's
// text contrast ever needs flipping.
// Text color is picked per-hex for contrast (bright hues like yellow/lime/
// sky/cyan get dark text, deep hues get white) — flat white-on-everything
// made the lighter tags unreadable/washed out. A subtle inset ring + shadow
// gives the pill some depth instead of a flat color block.
function solidBadge(hex: string, dark: boolean): string {
  const text = dark ? 'text-slate-900' : 'text-white';
  const ring = dark ? 'ring-black/10' : 'ring-white/15';
  return `bg-[${hex}] ${text} font-semibold shadow-sm ring-1 ring-inset ${ring}`;
}

export function getRoleColor(role: string, domain?: string | null): string {
  if (role === 'DIRECTOR') {
    const directorColors: Record<string, string> = {
      Technical: solidBadge('#14B8A6', true),
      Corporate: solidBadge('#EC4899', true),
      Creatives: solidBadge('#F97316', true),
    };
    return (domain && directorColors[domain]) || solidBadge('#14B8A6', true);
  }
  const colors: Record<string, string> = {
    SBG_LEADER: solidBadge('#D7263D', false),
    SECRETARY: solidBadge('#64748B', false),
    MANAGER: solidBadge('#EAB308', true),
    ASSOCIATE: solidBadge('#9333EA', false),
    BUILDER: solidBadge('#22C55E', true),
  };
  return colors[role] || 'bg-slate-700 text-slate-300';
}

export function getDomainColor(domain: string | null): string {
  const colors: Record<string, string> = {
    Technical: solidBadge('#2563EB', false),
    Corporate: solidBadge('#059669', false),
    Creatives: solidBadge('#C026D3', false),
    General: solidBadge('#78716C', false),
  };
  return domain ? (colors[domain] || 'bg-slate-700 text-slate-300') : 'bg-slate-700 text-slate-300';
}

export function getSubdomainColor(subdomain: string | null): string {
  const colors: Record<string, string> = {
    'Software Development': solidBadge('#8B5E3C', false),
    'AI & Machine Learning': solidBadge('#7C3AED', false),
    'Cloud & DevOps': solidBadge('#38BDF8', true),
    'Events & Operations': solidBadge('#84CC16', true),
    'Sponsorship & Finance': solidBadge('#0F766E', false),
    'HR & Admin': solidBadge('#F59E0B', true),
    'PR & Marketing': solidBadge('#EF4444', false),
    'Digital Design': solidBadge('#06B6D4', true),
    'Media Production': solidBadge('#5B214A', false),
  };
  return subdomain ? (colors[subdomain] || 'bg-slate-700 text-slate-300') : 'bg-slate-700 text-slate-300';
}

export function getAssignmentTypeColor(type: string): string {
  const colors: Record<string, string> = {
    ORG_WIDE:             'bg-slate-600/40 text-slate-300',
    ALL_DIRECTORS:        'bg-indigo-500/20 text-indigo-300',
    SINGLE_DIRECTOR:      'bg-indigo-500/20 text-indigo-300',
    DOMAIN_WIDE:          'bg-purple-500/20 text-purple-300',
    SUBDOMAIN_LEADERSHIP: 'bg-teal-500/20 text-teal-300',
    SUBDOMAIN_WIDE:       'bg-blue-500/20 text-blue-300',
    INDIVIDUAL:           'bg-yellow-500/20 text-yellow-300',
    BUILDERS_ONLY:        'bg-orange-500/20 text-orange-300',
    // Legacy values
    PERSONAL:  'bg-yellow-500/20 text-yellow-300',
    BROADCAST: 'bg-purple-500/20 text-purple-300',
    DOMAIN:    'bg-purple-500/20 text-purple-300',
    SUBDOMAIN: 'bg-blue-500/20 text-blue-300',
    GENERAL:   'bg-slate-600/40 text-slate-300',
  };
  return colors[type] || 'bg-slate-700 text-slate-300';
}

export function getAssignmentScopeLabel(type: string): string {
  const labels: Record<string, string> = {
    ORG_WIDE:             'Org-wide',
    ALL_DIRECTORS:        'All Directors',
    SINGLE_DIRECTOR:      'Director',
    DOMAIN_WIDE:          'Domain-wide',
    SUBDOMAIN_LEADERSHIP: 'Subdomain Leadership',
    SUBDOMAIN_WIDE:       'Subdomain-wide',
    INDIVIDUAL:           'Individual',
    BUILDERS_ONLY:        'Builders Only',
    // Legacy
    PERSONAL:  'Personal',
    BROADCAST: 'Broadcast',
    DOMAIN:    'Domain-wide',
    SUBDOMAIN: 'Subdomain-wide',
    GENERAL:   'Org-wide',
  };
  return labels[type] || type;
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    HIGH: 'bg-red-500/20 text-red-300',
    MEDIUM: 'bg-yellow-500/20 text-yellow-300',
    LOW: 'bg-slate-700 text-slate-300',
  };
  return colors[priority] || 'bg-slate-700 text-slate-300';
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
