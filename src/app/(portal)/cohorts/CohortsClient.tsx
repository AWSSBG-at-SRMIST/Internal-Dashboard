'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Layers, Plus, Trash2, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDomainColor, timeAgo } from '@/lib/utils';
import { DOMAIN_SUBDOMAINS } from '@/types';
import type { Cohort, Domain } from '@/types';

function CohortCard({ cohort, canManage, onDelete }: { cohort: Cohort; canManage: boolean; onDelete: (cohortId: string) => void }) {
  return (
    <Card className="hover:border-slate-700 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-100">{cohort.name}</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="text-xs">{cohort.type}</Badge>
              {cohort.subdomain && <Badge variant="outline" className="text-xs">{cohort.subdomain}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-slate-400">
              <Users size={14} />
              <span>{cohort.memberCount ?? cohort.memberIds?.length ?? 0}</span>
            </div>
            {canManage && (
              <button
                onClick={() => onDelete(cohort.cohortId)}
                className="text-slate-500 hover:text-red-400 transition-colors"
                title="Delete cohort"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Created {timeAgo(cohort.createdAt)}</p>
      </CardContent>
    </Card>
  );
}

export default function CohortsClient({ canManage }: { canManage: boolean }) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'SUBDOMAIN', domain: '', subdomain: '' });

  useEffect(() => {
    fetch('/api/cohorts').then(r => r.json()).then(d => { if (d.success) setCohorts(d.data); }).finally(() => setLoading(false));
  }, []);

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, domain: form.domain || null, subdomain: form.subdomain || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create cohort'); return; }
      toast.success('Cohort created!');
      setCohorts(c => [data.data, ...c]);
      setShowCreate(false);
      setForm({ name: '', type: 'SUBDOMAIN', domain: '', subdomain: '' });
    } catch { toast.error('Failed to create cohort'); }
    finally { setCreating(false); }
  }

  async function deleteCohort(cohortId: string) {
    if (!confirm('Delete this cohort? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/cohorts/${cohortId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete cohort'); return; }
      toast.success('Cohort deleted');
      setCohorts(c => c.filter(co => co.cohortId !== cohortId));
    } catch { toast.error('Failed to delete cohort'); }
  }

  const subdomains = form.domain ? DOMAIN_SUBDOMAINS[form.domain as keyof typeof DOMAIN_SUBDOMAINS] || [] : [];

  const generalCohorts = cohorts.filter(c => c.type === 'GENERAL');
  const customCohorts = cohorts.filter(c => c.type === 'CUSTOM');
  const subdomainCohorts = cohorts.filter(c => c.type === 'SUBDOMAIN');
  const domainGroups: { domain: Domain; cohorts: Cohort[] }[] = (Object.keys(DOMAIN_SUBDOMAINS) as Domain[])
    .map(domain => ({ domain, cohorts: subdomainCohorts.filter(c => c.domain === domain) }))
    .filter(g => g.cohorts.length > 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cohorts</h1>
          <p className="text-sm text-slate-400 mt-1">Group members for targeted task assignments</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Cohort</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>
      ) : cohorts.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Layers size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cohorts yet</p>
          {canManage && (
            <Button className="mt-4" variant="outline" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Cohort</Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {generalCohorts.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {generalCohorts.map(cohort => <CohortCard key={cohort.cohortId} cohort={cohort} canManage={canManage} onDelete={deleteCohort} />)}
            </div>
          )}

          {domainGroups.map(group => (
            <div key={group.domain} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={getDomainColor(group.domain)} variant="secondary">{group.domain}</Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {group.cohorts.map(cohort => <CohortCard key={cohort.cohortId} cohort={cohort} canManage={canManage} onDelete={deleteCohort} />)}
              </div>
            </div>
          ))}

          {customCohorts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Custom Cohorts</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {customCohorts.map(cohort => <CohortCard key={cohort.cohortId} cohort={cohort} canManage={canManage} onDelete={deleteCohort} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Cohort</DialogTitle></DialogHeader>
            <form onSubmit={createCohort} className="space-y-4">
              <div className="space-y-2">
                <Label>Cohort Name *</Label>
                <Input placeholder="e.g., ML Team" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUBDOMAIN">Subdomain-based</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'SUBDOMAIN' && (
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select value={form.domain} onValueChange={v => setForm(f => ({ ...f, domain: v, subdomain: '' }))}>
                    <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Technical">Technical</SelectItem>
                      <SelectItem value="Corporate">Corporate</SelectItem>
                      <SelectItem value="Creatives">Creatives</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === 'SUBDOMAIN' && subdomains.length > 0 && (
                <div className="space-y-2">
                  <Label>Subdomain</Label>
                  <Select value={form.subdomain} onValueChange={v => setForm(f => ({ ...f, subdomain: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select subdomain" /></SelectTrigger>
                    <SelectContent>
                      {subdomains.map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Cohort'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
