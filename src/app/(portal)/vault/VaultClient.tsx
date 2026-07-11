'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Lock, Plus, Eye, EyeOff, Copy, Trash2, Pencil, Loader2, X, Search, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { VaultEntrySummary, VaultShareEntry, SessionUser } from '@/types';

const PAGE_SIZE = 10;
const REMASK_MS = 20000;

type ShareCandidate = { memberId: string; name: string; role: string; domain: string | null };

function isPresidium(user: SessionUser) {
  return user.role === 'SBG_LEADER' || user.role === 'SECRETARY';
}

// Mirrors the server-side getShareableMembers() rule, purely for UI
// filtering — the server independently re-validates every share on submit.
function filterShareable(me: SessionUser, members: ShareCandidate[]): ShareCandidate[] {
  if (isPresidium(me)) return members.filter(m => m.role === 'DIRECTOR' || m.role === 'MANAGER' || m.role === 'ASSOCIATE');
  if (me.role === 'DIRECTOR') return members.filter(m => (m.role === 'MANAGER' || m.role === 'ASSOCIATE') && m.domain === me.domain);
  return [];
}

function SharePicker({ me, selected, onChange }: {
  me: SessionUser;
  selected: VaultShareEntry[];
  onChange: (next: VaultShareEntry[]) => void;
}) {
  const [candidates, setCandidates] = useState<ShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    if (candidates || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/members');
      const d = await res.json();
      if (d.success) {
        const eligible = filterShareable(
          me,
          (d.data as any[]).filter(m => m.isActive).map(m => ({ memberId: m.memberId, name: m.name, role: m.role, domain: m.domain })),
        );
        setCandidates(eligible);
      }
    } catch { toast.error('Failed to load members'); }
    finally { setLoading(false); }
  }

  function toggle(c: ShareCandidate) {
    if (selected.some(s => s.memberId === c.memberId)) {
      onChange(selected.filter(s => s.memberId !== c.memberId));
    } else {
      onChange([...selected, { memberId: c.memberId, memberName: c.name, role: c.role as any, domain: c.domain as any }]);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Share with</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(s => (
            <Badge key={s.memberId} variant="outline" className="text-xs font-mono flex items-center gap-1">
              {s.memberName}
              <button type="button" onClick={() => onChange(selected.filter(x => x.memberId !== s.memberId))}>
                <X size={11} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]" />
        <Input
          placeholder="Search members to share with..."
          className="pl-8"
          value={search}
          onFocus={load}
          onChange={e => { setSearch(e.target.value); load(); }}
        />
      </div>
      {loading && <p className="text-xs text-[#555] font-mono">Loading members...</p>}
      {candidates && candidates.length === 0 && (
        <p className="text-xs text-[#555] font-mono">No one eligible to share with.</p>
      )}
      {candidates && search && (
        <div className="border-2 border-[#2d2d2d] max-h-40 overflow-y-auto">
          {candidates
            .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && !selected.some(s => s.memberId === c.memberId))
            .slice(0, 8)
            .map(c => (
              <button
                type="button"
                key={c.memberId}
                onClick={() => { toggle(c); setSearch(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] flex items-center justify-between font-mono"
              >
                <span>{c.name}</span>
                <span className="text-xs text-[#666] uppercase">{c.role}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function VaultClient({ me, initialEntries, canCreate }: {
  me: SessionUser;
  initialEntries: VaultEntrySummary[];
  canCreate: boolean;
}) {
  const [entries, setEntries] = useState<VaultEntrySummary[]>(initialEntries);
  const { page, setPage, totalPages, paginatedItems } = usePagination(entries, PAGE_SIZE);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', value: '', notes: '' });
  const [createShares, setCreateShares] = useState<VaultShareEntry[]>([]);

  // View / reveal
  const [viewEntry, setViewEntry] = useState<VaultEntrySummary | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const remaskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit
  const [editEntry, setEditEntry] = useState<VaultEntrySummary | null>(null);
  const [editForm, setEditForm] = useState({ title: '', notes: '' });
  const [editShares, setEditShares] = useState<VaultShareEntry[]>([]);
  const [changeValue, setChangeValue] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function closeView(open: boolean) {
    if (!open) {
      if (remaskTimer.current) clearTimeout(remaskTimer.current);
      setViewEntry(null);
      setRevealedValue(null);
    }
  }

  async function reveal() {
    if (!viewEntry) return;
    setRevealing(true);
    try {
      const res = await fetch(`/api/vault/${viewEntry.entryId}`);
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to reveal'); return; }
      setRevealedValue(d.data.value);
      if (remaskTimer.current) clearTimeout(remaskTimer.current);
      remaskTimer.current = setTimeout(() => setRevealedValue(null), REMASK_MS);
    } catch { toast.error('Failed to reveal'); }
    finally { setRevealing(false); }
  }

  async function copyValue() {
    let value = revealedValue;
    if (!value) {
      if (!viewEntry) return;
      try {
        const res = await fetch(`/api/vault/${viewEntry.entryId}`);
        const d = await res.json();
        if (!res.ok) { toast.error(d.error || 'Failed to copy'); return; }
        value = d.data.value;
        setRevealedValue(value);
        if (remaskTimer.current) clearTimeout(remaskTimer.current);
        remaskTimer.current = setTimeout(() => setRevealedValue(null), REMASK_MS);
      } catch { toast.error('Failed to copy'); return; }
    }
    if (value) { navigator.clipboard.writeText(value); toast.success('Copied to clipboard'); }
  }

  async function createEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.title.trim() || !createForm.value.trim()) {
      toast.error('Title and value are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, sharedWith: createShares.map(s => s.memberId) }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to create entry'); return; }
      toast.success('Vault entry created');
      setShowCreate(false);
      setCreateForm({ title: '', value: '', notes: '' });
      setCreateShares([]);
      setEntries(es => [d.data, ...es]);
    } catch { toast.error('Failed to create entry'); }
    finally { setCreating(false); }
  }

  function openEdit(entry: VaultEntrySummary) {
    setEditEntry(entry);
    setEditForm({ title: entry.title, notes: entry.notes });
    setEditShares(entry.sharedWith);
    setChangeValue(false);
    setNewValue('');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editEntry) return;
    if (!editForm.title.trim()) { toast.error('Title is required'); return; }
    if (changeValue && !newValue.trim()) { toast.error('Enter the new value, or cancel changing it'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/vault/${editEntry.entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          notes: editForm.notes,
          sharedWith: editShares.map(s => s.memberId),
          ...(changeValue ? { value: newValue } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to update entry'); return; }
      toast.success('Vault entry updated');
      setEntries(es => es.map(en => en.entryId === editEntry.entryId
        ? { ...en, title: editForm.title.trim(), notes: editForm.notes.trim(), sharedWith: editShares, updatedAt: new Date().toISOString() }
        : en));
      setEditEntry(null);
    } catch { toast.error('Failed to update entry'); }
    finally { setSaving(false); }
  }

  async function deleteEntry() {
    const id = deleteTarget;
    if (!id) return;
    const removed = entries.find(en => en.entryId === id);
    setEntries(es => es.filter(en => en.entryId !== id));
    setDeleting(true);
    try {
      const res = await fetch(`/api/vault/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) throw new Error();
      toast.success('Vault entry deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete entry');
      if (removed) setEntries(es => [...es, removed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } finally {
      setDeleting(false);
    }
  }

  if (me.role === 'BUILDER') {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-[#666]">
        <p className="font-mono uppercase tracking-wide">You are not authorized to use the Vault.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide flex items-center gap-2">
            <Lock size={20} /> Vault
          </h1>
          <p className="text-sm text-[#666] mt-1 font-mono">{entries.length} entries you can access</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Entry</Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <Lock size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">Nothing here yet</p>
          <p className="text-sm mt-1 font-mono">
            {canCreate ? 'Create an entry, or wait for one to be shared with you.' : 'Nothing has been shared with you yet.'}
          </p>
          {canCreate && (
            <Button className="mt-4" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create your first entry
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {paginatedItems.map((entry, idx) => (
              <Card key={entry.entryId} className="animate-fadeIn" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">{entry.title}</p>
                      {entry.notes && <p className="text-xs text-[#888] mt-1 font-mono line-clamp-2">{entry.notes}</p>}
                      <p className="text-xs text-[#888] mt-1 font-mono">
                        by <span className="font-bold">{entry.createdByName}</span> · {formatDateTime(entry.createdAt)} ({timeAgo(entry.createdAt)})
                      </p>
                      {entry.sharedWith.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.sharedWith.map(s => (
                            <Badge key={s.memberId} variant="outline" className="text-xs font-mono">{s.memberName}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="icon" onClick={() => setViewEntry(entry)}>
                        <Eye size={14} />
                      </Button>
                      {entry.canManage && (
                        <>
                          <Button variant="outline" size="icon" onClick={() => openEdit(entry)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(entry.entryId)}>
                            <Trash2 size={14} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Vault Entry</DialogTitle></DialogHeader>
          <form onSubmit={createEntry} className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input placeholder="e.g. AWS Root Account" value={createForm.title}
                onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Value *</Label>
              <Textarea placeholder="Password, key, or any text to store — encrypted at rest." className="min-h-[100px] font-mono text-sm"
                value={createForm.value} onChange={e => setCreateForm(f => ({ ...f, value: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Optional context" className="min-h-[60px]"
                value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <SharePicker me={me} selected={createShares} onChange={setCreateShares} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View / reveal */}
      <Dialog open={viewEntry !== null} onOpenChange={closeView}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewEntry?.title}</DialogTitle></DialogHeader>
          {viewEntry && (
            <div className="space-y-4">
              {viewEntry.notes && <p className="text-sm text-[#d0d0d0] font-mono whitespace-pre-wrap">{viewEntry.notes}</p>}
              <div className="space-y-2">
                <Label>Value</Label>
                {revealedValue ? (
                  <Textarea readOnly value={revealedValue} className="min-h-[100px] font-mono text-sm" />
                ) : (
                  <div className="border-2 border-[#2d2d2d] bg-[#111] p-4 text-center text-[#555] font-mono text-sm">
                    •••••••••••••••••••••
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={revealedValue ? () => setRevealedValue(null) : reveal} disabled={revealing}>
                    {revealing ? <Loader2 size={13} className="animate-spin" /> : revealedValue ? <EyeOff size={13} /> : <Eye size={13} />}
                    {revealedValue ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={copyValue} disabled={revealing}>
                    <Copy size={13} /> Copy
                  </Button>
                </div>
                {revealedValue && <p className="text-xs text-[#555] font-mono">Auto-hides in {REMASK_MS / 1000}s. Every reveal is logged.</p>}
              </div>
              {viewEntry.sharedWith.length > 0 && (
                <div className="space-y-1">
                  <Label>Shared with</Label>
                  <div className="flex flex-wrap gap-1">
                    {viewEntry.sharedWith.map(s => (
                      <Badge key={s.memberId} variant="outline" className="text-xs font-mono">{s.memberName} · {s.role}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-[#555] font-mono flex items-center gap-1">
                <ShieldCheck size={12} /> Created by {viewEntry.createdByName} · {formatDateTime(viewEntry.createdAt)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editEntry !== null} onOpenChange={open => { if (!open) setEditEntry(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Vault Entry</DialogTitle></DialogHeader>
          {editEntry && (
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea className="min-h-[60px]" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="space-y-2">
                {!changeValue ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setChangeValue(true)}>Change stored value</Button>
                ) : (
                  <>
                    <Label>New value</Label>
                    <Textarea placeholder="Replaces the currently stored value" className="min-h-[100px] font-mono text-sm"
                      value={newValue} onChange={e => setNewValue(e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setChangeValue(false); setNewValue(''); }}>Cancel value change</Button>
                  </>
                )}
              </div>
              <SharePicker me={me} selected={editShares} onChange={setEditShares} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Delete this vault entry?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={deleteEntry}
      />
    </div>
  );
}
