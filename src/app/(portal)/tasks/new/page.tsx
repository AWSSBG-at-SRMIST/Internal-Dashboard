'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, CalendarClock, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DOMAIN_SUBDOMAINS } from '@/types';
import { canCreateTask } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import type { Member, Domain, Subdomain, SessionUser, TaskAssignmentScope, SubmissionMode } from '@/types';

const ALL_DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// Scopes available per role
function getAvailableScopes(me: SessionUser): { value: TaskAssignmentScope; label: string; description: string }[] {
  if (me.role === 'SBG_LEADER' || me.role === 'SECRETARY') return [
    { value: 'ORG_WIDE',        label: 'Org-wide',       description: 'Assign to every member of the club' },
    { value: 'ALL_DIRECTORS',   label: 'All Directors',  description: 'Assign to all Directors across every domain' },
    { value: 'SINGLE_DIRECTOR', label: 'Single Director',description: 'Assign to one specific Director' },
  ];
  if (me.role === 'DIRECTOR') return [
    { value: 'DOMAIN_WIDE',          label: 'Domain-wide',          description: `Assign to all members of ${me.domain}` },
    { value: 'SUBDOMAIN_LEADERSHIP', label: 'Subdomain Leadership',  description: 'Assign to the Manager + Associates of one subdomain' },
  ];
  if (me.role === 'MANAGER') return [
    { value: 'SUBDOMAIN_WIDE', label: 'Subdomain-wide', description: `Assign to everyone in ${me.subdomain}` },
    { value: 'INDIVIDUAL',     label: 'Individual',     description: 'Assign to one specific member in your subdomain' },
  ];
  if (me.role === 'ASSOCIATE') return [
    { value: 'BUILDERS_ONLY', label: 'Builders Only', description: `Assign to all Builders in ${me.subdomain}` },
  ];
  return [];
}

// Scopes where collective mode is meaningful
const COLLECTIVE_ELIGIBLE: TaskAssignmentScope[] = [
  'ORG_WIDE', 'ALL_DIRECTORS', 'DOMAIN_WIDE', 'SUBDOMAIN_LEADERSHIP', 'SUBDOMAIN_WIDE', 'BUILDERS_ONLY',
];

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [scope, setScope] = useState<TaskAssignmentScope | ''>('');
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('INDIVIDUAL');
  const [assignedToId, setAssignedToId] = useState('');
  // For Director → Subdomain Leadership
  const [leadershipSubdomain, setLeadershipSubdomain] = useState<Subdomain | ''>('');
  const [form, setForm] = useState({ title: '', description: '', deadline: '', priority: 'MEDIUM' });

  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineHour, setDeadlineHour] = useState('12');
  const [deadlineMinute, setDeadlineMinute] = useState('00');
  const [deadlinePeriod, setDeadlinePeriod] = useState<'AM' | 'PM'>('PM');

  useEffect(() => {
    const now = new Date();
    let minutes = Math.ceil(now.getMinutes() / 15) * 15;
    let hours = now.getHours();
    if (minutes === 60) { minutes = 0; hours = (hours + 1) % 24; }
    setDeadlineMinute(String(minutes).padStart(2, '0'));
    setDeadlinePeriod(hours >= 12 ? 'PM' : 'AM');
    setDeadlineHour(String(hours % 12 === 0 ? 12 : hours % 12).padStart(2, '0'));
  }, []);

  useEffect(() => {
    if (!deadlineDate) { setForm(f => ({ ...f, deadline: '' })); return; }
    let h24 = parseInt(deadlineHour, 10) % 12;
    if (deadlinePeriod === 'PM') h24 += 12;
    setForm(f => ({ ...f, deadline: `${deadlineDate}T${String(h24).padStart(2, '0')}:${deadlineMinute}` }));
  }, [deadlineDate, deadlineHour, deadlineMinute, deadlinePeriod]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setMe(d.data);
        const scopes = getAvailableScopes(d.data);
        if (scopes.length > 0) setScope(scopes[0].value);
      }
    });
    fetch('/api/members').then(r => r.json()).then(d => { if (d.success) setMembers(d.data); });
  }, []);

  const availableScopes = me ? getAvailableScopes(me) : [];
  const showCollectiveToggle = COLLECTIVE_ELIGIBLE.includes(scope as TaskAssignmentScope);

  // Director picker (Presidium → SINGLE_DIRECTOR)
  const directors = members.filter(m => m.role === 'DIRECTOR' && m.isActive !== false);

  // Individual picker (Manager → INDIVIDUAL): Associates + Builders in their subdomain, not themselves
  const individualTargets = me ? members.filter(m =>
    m.isActive !== false &&
    m.domain === me.domain &&
    m.subdomain === me.subdomain &&
    (m.role === 'ASSOCIATE' || m.role === 'BUILDER') &&
    m.memberId !== me.memberId
  ) : [];

  // Subdomain list for Director → SUBDOMAIN_LEADERSHIP
  const directorSubdomains = me?.role === 'DIRECTOR' && me.domain
    ? (DOMAIN_SUBDOMAINS[me.domain as keyof typeof DOMAIN_SUBDOMAINS] || [])
    : [];

  function getPreviewText(): string {
    if (!scope || !me) return '—';
    if (scope === 'ORG_WIDE') return 'Everyone in the club';
    if (scope === 'ALL_DIRECTORS') return 'All Directors';
    if (scope === 'SINGLE_DIRECTOR') {
      const d = directors.find(m => m.memberId === assignedToId);
      return d ? `Director ${d.name}` : '(select Director)';
    }
    if (scope === 'DOMAIN_WIDE') return `Everyone in ${me.domain}`;
    if (scope === 'SUBDOMAIN_LEADERSHIP') return leadershipSubdomain ? `${leadershipSubdomain} Leadership` : '(select subdomain)';
    if (scope === 'SUBDOMAIN_WIDE') return `Everyone in ${me.subdomain}`;
    if (scope === 'INDIVIDUAL') {
      const t = individualTargets.find(m => m.memberId === assignedToId);
      return t ? t.name : '(select member)';
    }
    if (scope === 'BUILDERS_ONLY') return `All Builders in ${me.subdomain}`;
    return '—';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.deadline || !scope) {
      toast.error('Please fill all required fields');
      return;
    }
    if ((scope === 'SINGLE_DIRECTOR' || scope === 'INDIVIDUAL') && !assignedToId) {
      toast.error('Please select a target member');
      return;
    }
    if (scope === 'SUBDOMAIN_LEADERSHIP' && !leadershipSubdomain) {
      toast.error('Please select a subdomain');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        ...form,
        assignmentType: scope,
        submissionMode,
        assignedToId: assignedToId || null,
        domain: null,
        subdomain: null,
      };

      // Attach domain/subdomain where needed (server also validates, this is for clarity)
      if (scope === 'DOMAIN_WIDE') { payload.domain = me?.domain; }
      if (scope === 'SUBDOMAIN_LEADERSHIP') { payload.domain = me?.domain; payload.subdomain = leadershipSubdomain; }
      if (scope === 'SUBDOMAIN_WIDE') { payload.domain = me?.domain; payload.subdomain = me?.subdomain; }
      if (scope === 'INDIVIDUAL') { payload.domain = me?.domain; payload.subdomain = me?.subdomain; }
      if (scope === 'BUILDERS_ONLY') { payload.domain = me?.domain; payload.subdomain = me?.subdomain; }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create task'); return; }
      toast.success('Task created!');
      router.push(`/tasks/${data.data.taskId}`);
    } catch {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDate = now.toISOString().slice(0, 10);

  if (!me) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>;

  if (!canCreateTask(me) || availableScopes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-slate-400">
        <p>You are not authorized to create tasks.</p>
        <Link href="/tasks" className="text-sm text-orange-500 hover:text-orange-400 mt-2 inline-block">Back to tasks →</Link>
      </div>
    );
  }

  const selectedScopeInfo = availableScopes.find(s => s.value === scope);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4">
        <Link href="/tasks"><Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Create Task</h1>
          <p className="text-sm text-slate-400">Assign work according to your hierarchy level</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Task Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Task Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" placeholder="e.g., Build the landing page" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description *</Label>
              <Textarea id="desc" placeholder="Requirements, deliverables, context..."
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[120px]" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline-date">Deadline *</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="deadline-date" type="date" value={deadlineDate}
                  onChange={e => setDeadlineDate(e.target.value)} min={minDate}
                  className="flex-1 min-w-[150px] [color-scheme:dark]" required />
                <div className="flex items-center gap-1.5">
                  <Select value={deadlineHour} onValueChange={setDeadlineHour}>
                    <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-slate-500 font-semibold">:</span>
                  <Select value={deadlineMinute} onValueChange={setDeadlineMinute}>
                    <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={deadlinePeriod} onValueChange={v => setDeadlinePeriod(v as 'AM' | 'PM')}>
                    <SelectTrigger className="w-[64px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.deadline && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CalendarClock size={12} className="flex-shrink-0" />Due {formatDateTime(form.deadline)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Assignment */}
        <Card>
          <CardHeader><CardTitle className="text-base">Assignment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Scope selector */}
            <div className="space-y-2">
              <Label>Assign To *</Label>
              {availableScopes.length === 1 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  <p className="text-sm font-medium text-slate-200">{availableScopes[0].label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{availableScopes[0].description}</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {availableScopes.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => { setScope(s.value); setAssignedToId(''); setLeadershipSubdomain(''); }}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        scope === s.value
                          ? 'border-orange-500/60 bg-orange-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-200">{s.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Target picker for SINGLE_DIRECTOR */}
            {scope === 'SINGLE_DIRECTOR' && (
              <div className="space-y-2">
                <Label>Select Director *</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger><SelectValue placeholder="Choose a Director" /></SelectTrigger>
                  <SelectContent>
                    {directors.map(m => (
                      <SelectItem key={m.memberId} value={m.memberId}>
                        {m.name} — {m.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Subdomain picker for SUBDOMAIN_LEADERSHIP */}
            {scope === 'SUBDOMAIN_LEADERSHIP' && (
              <div className="space-y-2">
                <Label>Select Subdomain *</Label>
                <Select value={leadershipSubdomain} onValueChange={v => setLeadershipSubdomain(v as Subdomain)}>
                  <SelectTrigger><SelectValue placeholder="Choose a subdomain" /></SelectTrigger>
                  <SelectContent>
                    {directorSubdomains.map(sd => (
                      <SelectItem key={sd} value={sd}>{sd}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">Manager + Associates of this subdomain will be assigned — no Builders.</p>
              </div>
            )}

            {/* Member picker for INDIVIDUAL */}
            {scope === 'INDIVIDUAL' && (
              <div className="space-y-2">
                <Label>Select Member *</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger><SelectValue placeholder="Choose a member" /></SelectTrigger>
                  <SelectContent>
                    {individualTargets.map(m => (
                      <SelectItem key={m.memberId} value={m.memberId}>
                        {m.name} ({m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Submission mode toggle (only for group scopes) */}
            {showCollectiveToggle && (
              <div className="space-y-2">
                <Label>Submission Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmissionMode('INDIVIDUAL')}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      submissionMode === 'INDIVIDUAL'
                        ? 'border-orange-500/60 bg-orange-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-200">Individual</span>
                    </div>
                    <p className="text-xs text-slate-400">Everyone submits their own work</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionMode('COLLECTIVE')}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      submissionMode === 'COLLECTIVE'
                        ? 'border-orange-500/60 bg-orange-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-200">Collective</span>
                    </div>
                    <p className="text-xs text-slate-400">First approved submission closes the task</p>
                  </button>
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-300 space-y-0.5">
                <div><span className="font-medium">Assigned to: </span>
                  <Badge variant="default" className="mx-1 text-xs">{getPreviewText()}</Badge>
                </div>
                {showCollectiveToggle && (
                  <div className="text-xs text-orange-400">
                    {submissionMode === 'COLLECTIVE'
                      ? 'Collective — first person to submit locks the task'
                      : 'Individual — everyone submits independently'}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rating guide */}
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Rating System</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-blue-400">
              <div className="flex items-center gap-2"><span className="font-bold text-green-400 flex-shrink-0">+2⭐</span><span>Submitted &gt;24h before deadline</span></div>
              <div className="flex items-center gap-2"><span className="font-bold text-blue-400 flex-shrink-0">+1⭐</span><span>Submitted within last 24h before</span></div>
              <div className="flex items-center gap-2"><span className="font-bold text-slate-400 flex-shrink-0">+0⭐</span><span>Submitted within 24h after deadline</span></div>
              <div className="flex items-center gap-2"><span className="font-bold text-red-400 flex-shrink-0">-1⭐</span><span>Submitted more than 24h after</span></div>
            </div>
            <p className="text-xs text-blue-500 mt-2">Priority multiplier: LOW×1 · MEDIUM×1.5 · HIGH×2</p>
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
