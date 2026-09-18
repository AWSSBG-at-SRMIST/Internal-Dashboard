'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BookOpen, Loader2, ExternalLink, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { isPresidium } from '@/lib/permissions';
import type { MoM, MoMScope, SessionUser } from '@/types';

const SCOPE_LABELS: Record<MoMScope, string> = {
  CORE_TEAM: 'Core Team',
  DOMAIN: 'Domain',
  SUBDOMAIN: 'Sub-Domain',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function scopeLabel(mom: MoM) {
  if (mom.scope === 'CORE_TEAM') return 'Core Team';
  if (mom.scope === 'DOMAIN') return mom.domain || 'Domain';
  return mom.subdomain || mom.domain || 'Sub-Domain';
}

function groupByMonth(moms: MoM[]): Array<{ label: string; items: MoM[] }> {
  const map = new Map<string, MoM[]>();
  for (const m of moms) {
    const key = m.date ? m.date.slice(0, 7) : 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      label: key === 'Unknown' ? 'Unknown' : new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      items,
    }));
}

export default function MinutesOfMeetingsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [moms, setMoms] = useState<MoM[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<MoM | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MoMScope | 'ALL'>('ALL');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.success) setMe(d.data); });
    fetch('/api/moms')
      .then(r => r.json())
      .then(d => { if (d.success) setMoms(d.data); else toast.error('Failed to load MoMs'); })
      .catch(() => toast.error('Failed to load MoMs'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/moms/${deleteTarget.momId}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || 'Failed to delete'); return; }
      toast.success('MoM deleted');
      setMoms(ms => ms.filter(m => m.momId !== deleteTarget.momId));
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete MoM');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = scopeFilter === 'ALL' ? moms : moms.filter(m => m.scope === scopeFilter);
  const grouped = groupByMonth(filtered);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BookOpen size={22} className="text-[#FF9900]" />
          <div>
            <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Minutes of Meetings</h1>
            <p className="text-sm text-[#666] font-mono">
              {loading ? 'Loading...' : `${moms.length} record${moms.length !== 1 ? 's' : ''} visible to you`}
            </p>
          </div>
        </div>
        {/* Scope filter chips */}
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'CORE_TEAM', 'DOMAIN', 'SUBDOMAIN'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider border-2 transition-colors ${
                scopeFilter === s
                  ? 'bg-[#FF9900] text-black border-[#FF9900]'
                  : 'bg-transparent text-[#666] border-[#2d2d2d] hover:border-[#555]'
              }`}
            >
              {s === 'ALL' ? 'All' : SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-[#FF9900]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <BookOpen size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide font-mono">No minutes found</p>
          {moms.length === 0 && <p className="text-xs mt-1 font-mono">You'll see MoMs for meetings you attended once they're uploaded.</p>}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.label} className="space-y-3">
              <h2 className="text-xs font-bold text-[#666] uppercase tracking-widest border-l-2 border-[#FF9900] pl-3">
                {group.label} <span className="text-[#444]">({group.items.length})</span>
              </h2>
              <div className="grid gap-3">
                {group.items.map(mom => (
                  <Card key={mom.momId}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-bold text-[#f0f0f0]">{mom.meetingType || 'Meeting'}</p>
                            <Badge variant="outline" className="text-xs font-mono">{scopeLabel(mom)}</Badge>
                            <Badge variant="outline" className="text-xs font-mono text-[#FF9900] border-[#FF9900]/30">{SCOPE_LABELS[mom.scope]}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#666] font-mono">
                            <span>{formatDate(mom.date)}</span>
                            {mom.time && <span>{mom.time}</span>}
                            {mom.platform && <span>{mom.platform}</span>}
                            <span>{mom.attendees.length} attendee{mom.attendees.length !== 1 ? 's' : ''}</span>
                          </div>
                          <p className="text-xs text-[#555] font-mono mt-1">
                            Prepared by {mom.preparedByName}
                            {mom.reviewedBy && ` · Reviewed by ${mom.reviewedBy}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={mom.driveViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm">
                              <ExternalLink size={14} /> View
                            </Button>
                          </a>
                          {me && isPresidium(me) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => setDeleteTarget(mom)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.meetingType}"?`}
        description="This deletes the record from the dashboard and moves the PDF to Drive trash. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
