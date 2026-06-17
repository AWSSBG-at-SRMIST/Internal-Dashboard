'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Code2, Link2, Camera, Award, ExternalLink, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRoleColor, getDomainColor, getSubdomainColor, formatRole } from '@/lib/utils';
import { canEditMembers } from '@/lib/permissions';
import { DOMAIN_SUBDOMAINS } from '@/types';
import Link from 'next/link';
import type { Member, SessionUser, Role, Domain } from '@/types';

const ROLES: Role[] = ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'];
const DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];
const NONE = '__none__';

const EMPTY_FORM = {
  name: '', role: 'BUILDER', domain: NONE, subdomain: NONE, department: '', section: '',
  clubId: '', regNo: '', phone: '', whatsapp: '', personalEmail: '', github: '', linkedin: '',
  instagram: '', meetup: '', builderId: '', faName: '', faEmail: '', faPhone: '', isActive: 'true',
};

export default function MemberProfilePage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { fetchMember(); }, [memberId]);
  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.success) setMe(d.data); }); }, []);

  async function fetchMember() {
    try {
      const memberRes = await fetch(`/api/members/${memberId}`);
      const memberData = await memberRes.json();
      if (memberData.success) {
        setMember(memberData.data);
      } else {
        toast.error('Member not found');
        router.push('/members');
      }
    } catch { toast.error('Failed to load member'); }
    finally { setLoading(false); }
  }

  function openEdit() {
    if (!member) return;
    setForm({
      name: member.name || '',
      role: member.role || 'BUILDER',
      domain: member.domain || NONE,
      subdomain: member.subdomain || NONE,
      department: member.department || '',
      section: member.section || '',
      clubId: member.clubId || '',
      regNo: member.regNo || '',
      phone: member.phone || '',
      whatsapp: member.whatsapp || '',
      personalEmail: member.personalEmail || '',
      github: member.github || '',
      linkedin: member.linkedin || '',
      instagram: member.instagram || '',
      meetup: member.meetup || '',
      builderId: member.builderId || '',
      faName: member.faName || '',
      faEmail: member.faEmail || '',
      faPhone: member.faPhone || '',
      isActive: member.isActive === false ? 'false' : 'true',
    });
    setEditOpen(true);
  }

  function handleDomainChange(domain: string) {
    setForm(f => ({ ...f, domain, subdomain: NONE }));
  }

  // Presidium has no domain/subdomain; a Director has a domain but never a
  // subdomain. Clear them client-side on role change so the form never
  // submits a combination the server is going to reject anyway.
  function handleRoleChange(role: string) {
    setForm(f => {
      if (role === 'SBG_LEADER' || role === 'SECRETARY') return { ...f, role, domain: NONE, subdomain: NONE };
      if (role === 'DIRECTOR') return { ...f, role, subdomain: NONE };
      return { ...f, role };
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        domain: form.domain === NONE ? null : form.domain,
        subdomain: form.subdomain === NONE ? null : form.subdomain,
        isActive: form.isActive === 'true',
      };
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update member'); return; }
      toast.success('Member updated');
      setEditOpen(false);
      fetchMember();
    } catch { toast.error('Failed to update member'); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Card>
        <CardContent className="p-6 flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-20" /></div>
            <Skeleton className="h-3 w-1/2" />
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
    </div>
  );
  if (!member) return null;

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const isSafeUrl = (url?: string | null) => !!url && /^https?:\/\//i.test(url);
  const editSubdomains = form.domain !== NONE ? (DOMAIN_SUBDOMAINS[form.domain as keyof typeof DOMAIN_SUBDOMAINS] || []) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/members"><Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button></Link>
          <h1 className="text-xl font-bold text-slate-100">Member Profile</h1>
        </div>
        {me && canEditMembers(me) && (
          <Button variant="outline" onClick={openEdit}><Pencil size={14} /> Edit</Button>
        )}
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-100">{member.name}</h2>
                {!member.isActive && <Badge variant="destructive">Inactive</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={getRoleColor(member.role)}>{formatRole(member.role, member.domain)}</Badge>
                {member.domain && member.role !== 'DIRECTOR' && <Badge className={getDomainColor(member.domain)}>{member.domain}</Badge>}
                {member.subdomain && <Badge className={getSubdomainColor(member.subdomain)}>{member.subdomain}</Badge>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Mail size={14} className="text-slate-500" />
                  <a href={`mailto:${member.officialEmail}`} className="hover:text-orange-500 truncate">{member.officialEmail}</a>
                </div>
                {member.phone && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone size={14} className="text-slate-500" />
                    <span>{member.phone}</span>
                  </div>
                )}
                {isSafeUrl(member.github) && (
                  <a href={member.github} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Code2 size={14} className="text-slate-500" />
                    <span className="truncate">GitHub</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {isSafeUrl(member.linkedin) && (
                  <a href={member.linkedin} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Link2 size={14} className="text-slate-500" />
                    <span className="truncate">LinkedIn</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {isSafeUrl(member.instagram) && (
                  <a href={member.instagram} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Camera size={14} className="text-slate-500" />
                    <span className="truncate">Instagram</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {isSafeUrl(member.builderId) && (
                  <a href={member.builderId} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Award size={14} className="text-slate-500" />
                    <span className="truncate">AWS Builder ID</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 text-sm">
            {[
              { label: 'Club ID', value: member.clubId },
              { label: 'Registration No.', value: member.regNo },
              { label: 'Department', value: member.department },
              { label: 'Section', value: member.section },
              { label: 'Personal Email', value: member.personalEmail },
              { label: 'WhatsApp', value: member.whatsapp },
              { label: 'Faculty Advisor', value: member.faName },
              { label: 'FA Email', value: member.faEmail },
              { label: 'FA Phone', value: member.faPhone },
              { label: 'Meetup', value: member.meetup },
            ].filter(i => i.value).map(item => (
              <div key={item.label} className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-800 last:border-0">
                <span className="text-slate-400 flex-shrink-0">{item.label}</span>
                <span className="text-slate-100 font-medium text-right break-all">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit {member.name}</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={handleRoleChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Domain</Label>
                <Select value={form.domain} onValueChange={handleDomainChange} disabled={form.role === 'SBG_LEADER' || form.role === 'SECRETARY'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None (Presidium) —</SelectItem>
                    {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subdomain</Label>
                <Select value={form.subdomain} onValueChange={v => setForm(f => ({ ...f, subdomain: v }))} disabled={editSubdomains.length === 0 || form.role === 'DIRECTOR' || form.role === 'SBG_LEADER' || form.role === 'SECRETARY'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {editSubdomains.map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.isActive} onValueChange={v => setForm(f => ({ ...f, isActive: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Club ID</Label>
                <Input value={form.clubId} onChange={e => setForm(f => ({ ...f, clubId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Registration No.</Label>
                <Input value={form.regNo} onChange={e => setForm(f => ({ ...f, regNo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Input value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Personal Email</Label>
                <Input type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>GitHub</Label>
                <Input placeholder="https://github.com/..." value={form.github} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>LinkedIn</Label>
                <Input placeholder="https://linkedin.com/in/..." value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input placeholder="https://instagram.com/..." value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>AWS Builder ID</Label>
                <Input placeholder="https://builder.aws.com/..." value={form.builderId} onChange={e => setForm(f => ({ ...f, builderId: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Meetup</Label>
                <Input placeholder="https://meetup.com/..." value={form.meetup} onChange={e => setForm(f => ({ ...f, meetup: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Faculty Advisor</Label>
                <Input value={form.faName} onChange={e => setForm(f => ({ ...f, faName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>FA Phone</Label>
                <Input value={form.faPhone} onChange={e => setForm(f => ({ ...f, faPhone: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>FA Email</Label>
                <Input type="email" value={form.faEmail} onChange={e => setForm(f => ({ ...f, faEmail: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
