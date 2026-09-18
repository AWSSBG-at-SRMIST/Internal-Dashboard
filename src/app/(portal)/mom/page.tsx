'use client';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { FileDown, Loader2, X, Plus, ClipboardPaste, NotebookPen, ArrowLeft, Wand2, ListChecks, Upload, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canGenerateMoM } from '@/lib/permissions';
import { formatRole } from '@/lib/utils';
import Link from 'next/link';
import type { Domain, Member, MoMScope, SessionUser, Subdomain } from '@/types';
import { DOMAIN_SUBDOMAINS } from '@/types';

interface Attendee { name: string; role: string; memberId?: string }
interface MoMStructured { agenda: string[]; discussion: { title: string; points: string[] }[] }

const SCOPE_LABELS: Record<MoMScope, string> = {
  CORE_TEAM: 'Core Team',
  DOMAIN: 'Domain',
  SUBDOMAIN: 'Sub-Domain',
};

const DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];

function formatDateForDisplay(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function getTodayStr() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}
const todayStr = getTodayStr();

function maskTimeInput(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTime(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  let h = parseInt(digits.slice(0, 2), 10);
  if (Number.isNaN(h) || h < 1) h = 1;
  if (h > 12) h = 12;
  const mDigits = digits.slice(2, 4);
  let m = mDigits ? parseInt(mDigits.padStart(2, '0'), 10) : 0;
  if (m > 59) m = 59;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(hhmm: string, period: 'AM' | 'PM') {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10) % 12;
  if (period === 'PM') h += 12;
  return h * 60 + (parseInt(mStr, 10) || 0);
}

export default function MoMPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [drafting, setDrafting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [structured, setStructured] = useState<MoMStructured | null>(null);
  const [feedback, setFeedback] = useState('');

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [pickerValue, setPickerValue] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const [form, setForm] = useState({
    meetingType: '',
    date: '',
    platform: 'Online',
    reviewedBy: '',
    scribeRaw: '',
    scope: 'SUBDOMAIN' as MoMScope,
    meetingDomain: '' as Domain | '',
    meetingSubdomain: '' as Subdomain | '',
  });
  const [startTime, setStartTime] = useState('');
  const [startPeriod, setStartPeriod] = useState<'AM' | 'PM'>('PM');
  const [endTime, setEndTime] = useState('');
  const [endPeriod, setEndPeriod] = useState<'AM' | 'PM'>('PM');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setMe(d.data);
        const u = d.data as SessionUser;
        // Pre-fill scope + domain/subdomain from the logged-in user's role
        if (u.domain) setForm(f => ({ ...f, meetingDomain: u.domain as Domain }));
        if (u.subdomain) setForm(f => ({ ...f, meetingSubdomain: u.subdomain as Subdomain }));
      }
    });
    fetch('/api/members').then(r => r.json()).then(d => { if (d.success) setMembers(d.data); });
  }, []);

  const preparedBy = me ? `${me.name} - ${formatRole(me.role, me.domain)}` : '';

  const subdomains: Subdomain[] = form.meetingDomain
    ? (DOMAIN_SUBDOMAINS[form.meetingDomain as Exclude<Domain, 'General'>] ?? [])
    : [];

  const addedNames = useMemo(() => new Set(attendees.map(a => a.name.toLowerCase())), [attendees]);
  const pickableMembers = useMemo(() => members.filter(m => !addedNames.has(m.name.toLowerCase())), [members, addedNames]);

  function addMember(memberId: string) {
    const m = members.find(x => x.memberId === memberId);
    if (!m) return;
    setAttendees(a => [...a, { name: m.name, role: formatRole(m.role, m.domain), memberId: m.memberId }]);
    setPickerValue('');
  }

  function removeAttendee(name: string) {
    setAttendees(a => a.filter(x => x.name !== name));
  }

  function normalizeName(s: string) {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function findMemberByName(raw: string): Member | null {
    const n = normalizeName(raw);
    const exact = members.find(m => normalizeName(m.name) === n);
    if (exact) return exact;
    return members.find(m => {
      const d = normalizeName(m.name);
      return d.startsWith(n) || n.startsWith(d);
    }) ?? null;
  }

  function importPasted() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let added = 0, unmatched = 0;
    setAttendees(prev => {
      const next = [...prev];
      const seen = new Set(next.map(a => normalizeName(a.name)));
      for (const line of lines) {
        const cleaned = line.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
        if (!cleaned || seen.has(normalizeName(cleaned))) continue;
        const match = findMemberByName(cleaned);
        if (!match) { unmatched++; continue; }
        next.push({ name: match.name, role: formatRole(match.role, match.domain), memberId: match.memberId });
        seen.add(normalizeName(match.name));
        added++;
      }
      return next;
    });
    setPasteText('');
    setShowPaste(false);
    if (added === 0 && unmatched === 0) { toast.error('No new names found to import'); return; }
    if (added === 0) { toast.error(`None of the ${unmatched} name${unmatched === 1 ? '' : 's'} matched club members`); return; }
    toast.success(`Imported ${added} attendee${added === 1 ? '' : 's'}${unmatched ? ` — ${unmatched} skipped (not in members list)` : ''}`);
  }

  function buildTimeRange(): string | null {
    const start = startTime ? normalizeTime(startTime) : '';
    const end = endTime ? normalizeTime(endTime) : '';
    if (start && end) {
      if (timeToMinutes(end, endPeriod) <= timeToMinutes(start, startPeriod)) {
        toast.error('End time is before (or same as) start time — check the AM/PM on each');
        return null;
      }
      return `${start} ${startPeriod} - ${end} ${endPeriod}`;
    }
    return start ? `${start} ${startPeriod}` : '';
  }

  function buildPayload(time: string) {
    return {
      ...form,
      time,
      date: form.date,
      preparedBy,
      preparedByMemberId: me?.memberId,
      attendees,
      agenda: structured!.agenda,
      discussion: structured!.discussion,
      meetingDomain: form.scope !== 'CORE_TEAM' ? form.meetingDomain || null : null,
      meetingSubdomain: form.scope === 'SUBDOMAIN' ? form.meetingSubdomain || null : null,
    };
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scribeRaw.trim()) { toast.error('Paste the meeting notes/scribe first'); return; }
    if (attendees.length === 0) { toast.error('Add at least one attendee'); return; }
    if (form.date && form.date > todayStr) { toast.error("Meeting date can't be in the future — minutes are written for a meeting that already happened"); return; }
    if (form.scope !== 'CORE_TEAM' && !form.meetingDomain) { toast.error('Select a domain for this meeting'); return; }
    if (form.scope === 'SUBDOMAIN' && !form.meetingSubdomain) { toast.error('Select a sub-domain for this meeting'); return; }
    const time = buildTimeRange();
    if (time === null) return;
    setStartTime(prev => prev ? normalizeTime(prev) : prev);
    setEndTime(prev => prev ? normalizeTime(prev) : prev);

    setDrafting(true);
    try {
      const res = await fetch('/api/mom/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scribeRaw: form.scribeRaw }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to draft minutes'); return; }
      setStructured(data.data);
      setStep('preview');
    } catch {
      toast.error('Failed to draft minutes');
    } finally {
      setDrafting(false);
    }
  }

  async function handleApplyChanges() {
    if (!feedback.trim() || !structured) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/mom/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scribeRaw: form.scribeRaw, previous: structured, feedback }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to apply changes'); return; }
      setStructured(data.data);
      setFeedback('');
      toast.success('Updated!');
    } catch {
      toast.error('Failed to apply changes');
    } finally {
      setDrafting(false);
    }
  }

  async function handleDownload() {
    if (!structured) return;
    const time = buildTimeRange();
    if (time === null) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/mom/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          time,
          date: formatDateForDisplay(form.date),
          preparedBy,
          attendees,
          agenda: structured.agenda,
          discussion: structured.discussion,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to generate MoM');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoM-${form.date || 'meeting'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Minutes generated!');
    } catch {
      toast.error('Failed to generate MoM');
    } finally {
      setDownloading(false);
    }
  }

  async function handleUploadAndSave() {
    if (!structured) return;
    const time = buildTimeRange();
    if (time === null) return;
    setUploading(true);
    try {
      const res = await fetch('/api/moms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(time)),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to upload MoM'); return; }
      toast.success(
        <span>
          MoM saved to Drive!{' '}
          <a href={data.data.driveViewUrl} target="_blank" rel="noopener noreferrer" className="underline">Open ↗</a>
        </span>
      );
    } catch {
      toast.error('Failed to upload MoM');
    } finally {
      setUploading(false);
    }
  }

  if (!me) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-[#FF9900]" />
      </div>
    );
  }

  if (!canGenerateMoM(me)) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-[#666]">
        <p className="font-mono uppercase tracking-wide">You are not authorized to generate Minutes of Meeting.</p>
        <Link href="/dashboard" className="text-sm text-[#FF9900] hover:text-orange-300 mt-2 inline-block">Back to dashboard →</Link>
      </div>
    );
  }

  if (step === 'preview' && structured) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => setStep('form')}><ArrowLeft size={18} /></Button>
          <div>
            <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Preview</h1>
            <p className="text-sm text-[#666] font-mono">Check the draft, request changes, then save or download</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks size={16} className="text-[#FF9900]" /> Agenda</CardTitle></CardHeader>
          <CardContent>
            {structured.agenda.length === 0 ? <p className="text-sm text-[#555] font-mono">No agenda items drafted.</p> : (
              <ul className="space-y-1.5 text-sm text-[#e0e0e0] list-disc list-inside font-mono">
                {structured.agenda.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Discussion Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {structured.discussion.length === 0 ? <p className="text-sm text-[#555] font-mono">No discussion sections drafted.</p> : (
              structured.discussion.map((section, i) => (
                <div key={i}>
                  <p className="text-sm font-bold text-[#f0f0f0] mb-1 uppercase tracking-wide">{i + 1}. {section.title}</p>
                  <ul className="space-y-1 text-sm text-[#d0d0d0] list-disc list-inside ml-1 font-mono">
                    {section.points.map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#FF9900]/5 border-[#FF9900]/20">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wand2 size={16} className="text-[#FF9900]" /> Want changes?</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              rows={3}
              placeholder="e.g. Merge the last two sections, and add a point about the budget approval"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" onClick={handleApplyChanges} disabled={drafting || !feedback.trim()}>
              {drafting ? <><Loader2 size={14} className="animate-spin" /> Applying...</> : 'Apply changes'}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button type="button" variant="outline" onClick={() => setStep('form')}>Back to Edit</Button>
          <Button type="button" variant="outline" onClick={handleDownload} disabled={downloading || drafting}>
            {downloading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><FileDown size={16} /> Download PDF</>}
          </Button>
          <Button type="button" onClick={handleUploadAndSave} disabled={uploading || drafting}>
            {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : <><Upload size={16} /> Save to Drive</>}
          </Button>
        </div>
        <p className="text-xs text-[#555] font-mono text-center">"Save to Drive" uploads the PDF to the centralized MoMs folder and records it in the dashboard — visible to all attendees.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <NotebookPen size={22} className="text-[#FF9900]" />
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Generate MoM</h1>
          <p className="text-sm text-[#666] font-mono">Paste your notes, preview the draft, then save or download</p>
        </div>
      </div>

      <form onSubmit={handlePreview} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Meeting Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting Type</Label>
              <Input placeholder="e.g. Domain Orientation" value={form.meetingType} onChange={e => setForm(f => ({ ...f, meetingType: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" max={todayStr} className="[color-scheme:dark]" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="HH:MM" value={startTime} onChange={e => setStartTime(maskTimeInput(e.target.value))} onBlur={() => setStartTime(prev => prev ? normalizeTime(prev) : prev)} className="flex-1" />
                <Select value={startPeriod} onValueChange={v => setStartPeriod(v as 'AM' | 'PM')}>
                  <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="HH:MM" value={endTime} onChange={e => setEndTime(maskTimeInput(e.target.value))} onBlur={() => setEndTime(prev => prev ? normalizeTime(prev) : prev)} className="flex-1" />
                <Select value={endPeriod} onValueChange={v => setEndPeriod(v as 'AM' | 'PM')}>
                  <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prepared By</Label>
              <p className="flex h-9 items-center border-2 border-[#2d2d2d] bg-[#1a1a1a] px-3 text-sm text-[#666] font-mono">{preparedBy}</p>
            </div>
            <div className="space-y-2">
              <Label>Reviewed By</Label>
              <Select value={form.reviewedBy} onValueChange={v => setForm(f => ({ ...f, reviewedBy: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a member (optional)" /></SelectTrigger>
                <SelectContent>
                  {members.filter(m => m.isActive).map(m => (
                    <SelectItem key={m.memberId} value={`${m.name} - ${formatRole(m.role, m.domain)}`}>
                      {m.name} ({formatRole(m.role, m.domain)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Scope */}
            <div className="space-y-2">
              <Label>Meeting Scope</Label>
              <Select value={form.scope} onValueChange={v => setForm(f => ({ ...f, scope: v as MoMScope, meetingSubdomain: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORE_TEAM">Core Team</SelectItem>
                  <SelectItem value="DOMAIN">Domain</SelectItem>
                  <SelectItem value="SUBDOMAIN">Sub-Domain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope !== 'CORE_TEAM' && (
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={form.meetingDomain} onValueChange={v => setForm(f => ({ ...f, meetingDomain: v as Domain, meetingSubdomain: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.scope === 'SUBDOMAIN' && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Sub-Domain</Label>
                <Select value={form.meetingSubdomain} onValueChange={v => setForm(f => ({ ...f, meetingSubdomain: v as Subdomain }))} disabled={!form.meetingDomain}>
                  <SelectTrigger><SelectValue placeholder={form.meetingDomain ? 'Select sub-domain' : 'Select a domain first'} /></SelectTrigger>
                  <SelectContent>
                    {subdomains.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Attendees <span className="text-[#555] font-normal font-mono">({attendees.length})</span>
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPaste(s => !s)}>
              <ClipboardPaste size={14} /> Paste list
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={pickerValue} onValueChange={addMember}>
                <SelectTrigger><SelectValue placeholder="Add a club member..." /></SelectTrigger>
                <SelectContent>
                  {pickableMembers.map(m => (
                    <SelectItem key={m.memberId} value={m.memberId}>{m.name} ({formatRole(m.role, m.domain)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showPaste && (
              <div className="space-y-2 border-2 border-[#2d2d2d] p-3 bg-[#111]">
                <Label className="text-xs text-[#666]">Paste names (one per line) — from the meeting extension's participant list</Label>
                <Textarea rows={4} value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'Aakarsh Kumar\nPraveen Saravanan\n...'} />
                <Button type="button" size="sm" onClick={importPasted}><Plus size={14} /> Import</Button>
              </div>
            )}

            {attendees.length > 0 && (
              <div className="space-y-1.5">
                {attendees.map(a => (
                  <div key={a.name} className="flex items-center justify-between gap-2 bg-[#1a1a1a] border-2 border-[#2d2d2d] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-[#f0f0f0] font-bold">{a.name}</span>
                      {a.role && <span className="text-[#555] ml-2 font-mono text-xs">{a.role}</span>}
                    </div>
                    <button type="button" onClick={() => removeAttendee(a.name)} className="text-[#555] hover:text-red-400 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Meeting Notes / Scribe</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              rows={10}
              placeholder="Paste the raw scribe/transcript/notes from the meeting here. We'll turn this into a structured Agenda + Discussion Summary."
              value={form.scribeRaw}
              onChange={e => setForm(f => ({ ...f, scribeRaw: e.target.value }))}
              required
            />
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={drafting}>
          {drafting ? <><Loader2 size={16} className="animate-spin" /> Drafting preview...</> : 'Preview Minutes'}
        </Button>
      </form>
    </div>
  );
}
