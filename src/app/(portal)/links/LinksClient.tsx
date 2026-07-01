'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link2, Plus, Copy, Trash2, ExternalLink, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { ShortLink, SessionUser } from '@/types';

const PAGE_SIZE = 10;

type CodeStatus = 'idle' | 'checking' | 'available' | 'taken';

export default function LinksClient({ me, initialLinks }: { me: SessionUser; initialLinks: ShortLink[] }) {
  const [links, setLinks] = useState<ShortLink[]>(initialLinks);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ originalUrl: '', description: '', customCode: '' });
  const [codeStatus, setCodeStatus] = useState<CodeStatus>('idle');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { page, setPage, totalPages, paginatedItems } = usePagination(links, PAGE_SIZE);

  function onCustomCodeChange(value: string) {
    const code = value.replace(/[^a-zA-Z0-9-_]/g, '');
    setForm(f => ({ ...f, customCode: code }));

    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!code) { setCodeStatus('idle'); return; }

    setCodeStatus('checking');
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/links/${code}`);
        setCodeStatus(res.ok ? 'taken' : 'available');
      } catch {
        setCodeStatus('idle');
      }
    }, 400);
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    if (codeStatus === 'taken') { toast.error('That short code is already taken'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          toast.error('That short code was just taken — try a different one.');
        } else {
          toast.error(data.error || 'Failed to create link');
        }
        return;
      }
      toast.success('Short link created!');
      setShowCreate(false);
      setForm({ originalUrl: '', description: '', customCode: '' });
      setCodeStatus('idle');
      setLinks(ls => [data.data, ...ls]);
    } catch { toast.error('Failed to create link'); }
    finally { setCreating(false); }
  }

  async function deleteLink() {
    const code = deleteTarget;
    if (!code) return;
    const removed = links.find(l => l.shortCode === code);
    setLinks(ls => ls.filter(l => l.shortCode !== code));
    setDeleting(true);
    try {
      const res = await fetch(`/api/links/${code}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error();
      toast.success('Link deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete link');
      if (removed) setLinks(ls => [...ls, removed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } finally {
      setDeleting(false);
    }
  }

  function copyLink(code: string) {
    const base = process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || window.location.origin;
    const url = `${base}/s/${code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  }

  const appUrl = process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  if (me.role === 'BUILDER') {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-[#666]">
        <p className="font-mono uppercase tracking-wide">You are not authorized to use the Link Shortener.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Link Shortener</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">{links.length} short links</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Link</Button>
      </div>

      {links.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <Link2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">No short links yet</p>
          <Button className="mt-4" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create your first link
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {paginatedItems.map((link, idx) => (
              <Card key={link.shortCode} className="animate-fadeIn" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="bg-[#FF9900]/15 text-[#FF9900] px-2 py-0.5 font-mono text-sm font-bold border border-[#FF9900]/20">
                          /s/{link.shortCode}
                        </code>
                        <Badge variant="outline" className="text-xs font-mono">{link.clicks} clicks</Badge>
                      </div>
                      {link.description && <p className="text-sm font-bold text-[#f0f0f0] mb-1 uppercase tracking-wide">{link.description}</p>}
                      <a href={link.originalUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#888] hover:text-[#FF9900] flex items-center gap-1 truncate font-mono">
                        {link.originalUrl}<ExternalLink size={10} />
                      </a>
                      <p className="text-xs text-[#888] mt-1 font-mono">
                        by <span className="text-[#888] font-bold">{link.createdByName}</span> · {formatDateTime(link.createdAt)} ({timeAgo(link.createdAt)})
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="icon" onClick={() => copyLink(link.shortCode)}>
                        <Copy size={14} />
                      </Button>
                      <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="icon"><ExternalLink size={14} /></Button>
                      </a>
                      <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => setDeleteTarget(link.shortCode)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Short Link</DialogTitle></DialogHeader>
          <form onSubmit={createLink} className="space-y-4">
            <div className="space-y-2">
              <Label>Original URL *</Label>
              <Input type="url" placeholder="https://..." value={form.originalUrl} onChange={e => setForm(f => ({ ...f, originalUrl: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="What is this link for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Custom Code (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#888] font-mono whitespace-nowrap"><span className="hidden sm:inline">{appUrl}</span>/s/</span>
                <div className="relative flex-1">
                  <Input
                    placeholder="my-link"
                    value={form.customCode}
                    onChange={e => onCustomCodeChange(e.target.value)}
                    className="pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    {codeStatus === 'checking' && <Loader2 size={14} className="animate-spin text-[#555]" />}
                    {codeStatus === 'available' && <Check size={14} className="text-green-400" />}
                    {codeStatus === 'taken' && <X size={14} className="text-red-400" />}
                  </span>
                </div>
              </div>
              {codeStatus === 'taken' && <p className="text-xs text-red-400 font-mono">That code is already taken — try another one.</p>}
              {codeStatus === 'available' && <p className="text-xs text-green-400 font-mono">Available!</p>}
              {codeStatus === 'idle' && <p className="text-xs text-[#555] font-mono">Leave blank for auto-generated code</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || codeStatus === 'checking' || codeStatus === 'taken'}>
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Delete this short link?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={deleteLink}
      />
    </div>
  );
}
