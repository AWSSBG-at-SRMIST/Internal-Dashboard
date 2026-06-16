'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DOMAIN_SUBDOMAINS } from '@/types';
import Link from 'next/link';
import type { Member, Cohort } from '@/types';

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    deadline: '',
    assignmentType: 'GENERAL',
    assignedToId: '',
    assignedToName: 'Everyone',
    domain: '',
    subdomain: '',
  });

  useEffect(() => {
    fetch('/api/members').then(r => r.json()).then(d => { if (d.success) setMembers(d.data); });
    fetch('/api/cohorts').then(r => r.json()).then(d => { if (d.success) setCohorts(d.data); });
  }, []);

  const subdomains = form.domain && form.domain !== 'General'
    ? DOMAIN_SUBDOMAINS[form.domain as keyof typeof DOMAIN_SUBDOMAINS] || []
    : [];

  function handleDomainChange(domain: string) {
    setForm(f => ({ ...f, domain, subdomain: '', assignedToName: getAssignedToName({ ...f, domain, subdomain: '' }) }));
  }

  function getAssignedToName(f: typeof form): string {
    if (f.assignmentType === 'GENERAL') return 'Everyone';
    if (f.assignmentType === 'DOMAIN') return f.domain || 'All';
    if (f.assignmentType === 'SUBDOMAIN') return f.subdomain || f.domain || 'All';
    if (f.assignmentType === 'INDIVIDUAL' && f.assignedToId) {
      return members.find(m => m.memberId === f.assignedToId)?.name || 'Unknown';
    }
    if (f.assignmentType === 'COHORT' && f.assignedToId) {
      return cohorts.find(c => c.cohortId === f.assignedToId)?.name || 'Unknown Cohort';
    }
    return 'Everyone';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.deadline) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      // For COHORT tasks, carry the cohort's domain/subdomain onto the task
      let domain = form.domain || null;
      let subdomain = form.subdomain || null;
      if (form.assignmentType === 'COHORT' && form.assignedToId) {
        const cohort = cohorts.find(c => c.cohortId === form.assignedToId);
        domain = cohort?.domain || null;
        subdomain = cohort?.subdomain || null;
      }

      const payload = {
        ...form,
        assignedToName: getAssignedToName(form),
        domain,
        subdomain,
        assignedToId: form.assignedToId || null,
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create task'); return; }
      toast.success('Task created successfully!');
      router.push(`/tasks/${data.data.taskId}`);
    } catch {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4">
        <Link href="/tasks">
          <Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Create Task</h1>
          <p className="text-sm text-slate-400">Assign work to individuals, teams, or cohorts</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Task Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Build a REST API"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description *</Label>
              <Textarea
                id="desc"
                placeholder="Detailed task description, requirements, and deliverables..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[120px]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline *</Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                min={minDateTime}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Assignment Type *</Label>
              <Select value={form.assignmentType} onValueChange={v => setForm(f => ({ ...f, assignmentType: v, assignedToId: '', assignedToName: getAssignedToName({ ...f, assignmentType: v }) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General (Everyone)</SelectItem>
                  <SelectItem value="DOMAIN">Domain-wide</SelectItem>
                  <SelectItem value="SUBDOMAIN">Subdomain-wide</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual Member</SelectItem>
                  <SelectItem value="COHORT">Cohort</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.assignmentType === 'DOMAIN' || form.assignmentType === 'SUBDOMAIN') && (
              <div className="space-y-2">
                <Label>Domain *</Label>
                <Select value={form.domain} onValueChange={handleDomainChange}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                    <SelectItem value="Creatives">Creatives</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignmentType === 'SUBDOMAIN' && form.domain && subdomains.length > 0 && (
              <div className="space-y-2">
                <Label>Subdomain *</Label>
                <Select value={form.subdomain} onValueChange={v => setForm(f => ({ ...f, subdomain: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select subdomain" /></SelectTrigger>
                  <SelectContent>
                    {subdomains.map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignmentType === 'INDIVIDUAL' && (
              <div className="space-y-2">
                <Label>Member *</Label>
                <Select value={form.assignedToId} onValueChange={v => {
                  const member = members.find(m => m.memberId === v);
                  setForm(f => ({ ...f, assignedToId: v, assignedToName: member?.name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                  <SelectContent>
                    {members.map(m => (
                      <SelectItem key={m.memberId} value={m.memberId}>
                        {m.name} ({m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignmentType === 'COHORT' && (
              <div className="space-y-2">
                <Label>Cohort *</Label>
                <Select value={form.assignedToId} onValueChange={v => setForm(f => ({ ...f, assignedToId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map(c => (
                      <SelectItem key={c.cohortId} value={c.cohortId}>
                        {c.name} <span className="text-slate-400 text-xs">({c.type} · {c.memberCount ?? 0} members)</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Preview */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-300">
                <span className="font-medium">Assignment preview: </span>
                This task will be assigned to{' '}
                <Badge variant="default" className="mx-1 text-xs">
                  {form.assignmentType === 'GENERAL' ? 'Everyone' :
                   form.assignmentType === 'DOMAIN' ? `${form.domain || '?'} domain` :
                   form.assignmentType === 'SUBDOMAIN' ? `${form.subdomain || form.domain || '?'}` :
                   form.assignmentType === 'COHORT' ? (form.assignedToId ? cohorts.find(c => c.cohortId === form.assignedToId)?.name || '?' : '?') :
                   form.assignedToId ? members.find(m => m.memberId === form.assignedToId)?.name || '?' : '?'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rating Info */}
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Rating System</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-400">
              <div className="flex items-center gap-2"><span className="font-bold text-green-400">+3⭐</span> Submitted &gt;24h before deadline</div>
              <div className="flex items-center gap-2"><span className="font-bold text-blue-400">+2⭐</span> Submitted within last 24h before</div>
              <div className="flex items-center gap-2"><span className="font-bold text-yellow-400">+1⭐</span> Submitted within 24h after deadline</div>
              <div className="flex items-center gap-2"><span className="font-bold text-red-400">-1⭐</span> Submitted more than 24h after</div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Link href="/tasks" className="flex-1">
            <Button type="button" variant="outline" className="w-full">Cancel</Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Task'}
          </Button>
        </div>
      </form>
    </div>
  );
}
