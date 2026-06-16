'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Link2, Plus, Copy, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { ShortLink } from '@/types';

export default function LinksPage() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ originalUrl: '', description: '', customCode: '' });

  useEffect(() => { fetchLinks(); }, []);

  async function fetchLinks() {
    setLoading(true);
    try {
      const res = await fetch('/api/links');
      const data = await res.json();
      if (data.success) setLinks(data.data);
    } catch { toast.error('Failed to load links'); }
    finally { setLoading(false); }
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create link'); return; }
      toast.success('Short link created!');
      setShowCreate(false);
      setForm({ originalUrl: '', description: '', customCode: '' });
      fetchLinks();
    } catch { toast.error('Failed to create link'); }
    finally { setCreating(false); }
  }

  async function deleteLink(code: string) {
    if (!confirm('Delete this short link?')) return;
    try {
      const res = await fetch(`/api/links/${code}`, { method: 'DELETE' });
      if ((await res.json()).success) {
        toast.success('Link deleted');
        setLinks(ls => ls.filter(l => l.shortCode !== code));
      }
    } catch { toast.error('Failed to delete link'); }
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/s/${code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Link Shortener</h1>
          <p className="text-sm text-slate-400 mt-1">{links.length} short links</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Link</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>
      ) : links.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Link2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No short links yet</p>
          <Button className="mt-4" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create your first link
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {links.map(link => (
            <Card key={link.shortCode} className="hover:border-slate-700 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-mono text-sm font-bold">
                        /s/{link.shortCode}
                      </code>
                      <Badge variant="outline" className="text-xs">{link.clicks} clicks</Badge>
                    </div>
                    {link.description && <p className="text-sm font-medium text-slate-100 mb-1">{link.description}</p>}
                    <a href={link.originalUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-orange-500 flex items-center gap-1 truncate">
                      {link.originalUrl}<ExternalLink size={10} />
                    </a>
                    <p className="text-xs text-slate-500 mt-1">
                      By {link.createdByName} · {timeAgo(link.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copyLink(link.shortCode)}>
                      <Copy size={14} />
                    </Button>
                    <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><ExternalLink size={14} /></Button>
                    </a>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteLink(link.shortCode)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
                <span className="text-sm text-slate-500 whitespace-nowrap">{appUrl}/s/</span>
                <Input placeholder="my-link" value={form.customCode} onChange={e => setForm(f => ({ ...f, customCode: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '') }))} />
              </div>
              <p className="text-xs text-slate-500">Leave blank for auto-generated code</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
