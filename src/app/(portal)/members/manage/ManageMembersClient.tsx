'use client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Search, UserX, FolderSync, RefreshCw, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatRole } from '@/lib/utils';
import { isPresidium } from '@/lib/permissions';
import { DOMAIN_SUBDOMAINS } from '@/types';
import type { Member, SessionUser, Role, Domain } from '@/types';

const PAGE_SIZE = 15;
const ROLES: Role[] = ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'];
const DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];
const DEPARTMENTS = ['CSE C.Tech', 'CSE NWC', 'CSE CINTEL', 'CSE DSBS'];
const NONE = '__none__';

const EMPTY_FORM = {
  name: '', officialEmail: '', role: 'BUILDER' as Role, domain: NONE, subdomain: NONE, department: '', section: '',
  clubId: '', regNo: '', phone: '', whatsapp: '', personalEmail: '', github: '', linkedin: '',
  instagram: '', meetup: '', builderId: '', faName: '', faEmail: '', faPhone: '',
};

type FormState = typeof EMPTY_FORM;

function memberToForm(m: Member): FormState {
  return {
    name: m.name || '', officialEmail: m.officialEmail || '', role: m.role || 'BUILDER',
    domain: m.domain || NONE, subdomain: m.subdomain || NONE, department: m.department || '', section: m.section || '',
    clubId: m.clubId || '', regNo: m.regNo || '', phone: m.phone || '', whatsapp: m.whatsapp || '',
    personalEmail: m.personalEmail || '', github: m.github || '', linkedin: m.linkedin || '', instagram: m.instagram || '',
    meetup: m.meetup || '', builderId: m.builderId || '', faName: m.faName || '', faEmail: m.faEmail || '', faPhone: m.faPhone || '',
  };
}

export default function ManageMembersClient({ me, initialMembers }: { me: SessionUser; initialMembers: Member[] }) {
  const canPickRole = isPresidium(me);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [backfilling, setBackfilling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const filtered = useMemo(() => members.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name?.toLowerCase().includes(q) || m.officialEmail?.toLowerCase().includes(q) || m.clubId?.toLowerCase().includes(q);
  }), [members, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered, PAGE_SIZE);

  function handleDomainChange(setForm: (fn: (f: FormState) => FormState) => void, domain: string) {
    setForm(f => ({ ...f, domain, subdomain: NONE }));
  }

  function handleRoleChange(setForm: (fn: (f: FormState) => FormState) => void, role: string) {
    setForm(f => {
      const r = role as Role;
      if (r === 'SBG_LEADER' || r === 'SECRETARY') return { ...f, role: r, domain: NONE, subdomain: NONE };
      if (r === 'DIRECTOR') return { ...f, role: r, subdomain: NONE };
      return { ...f, role: r };
    });
  }

  function toPayload(form: FormState) {
    return {
      ...form,
      domain: form.domain === NONE ? null : form.domain,
      subdomain: form.subdomain === NONE ? null : form.subdomain,
    };
  }

  // Every field is required when adding a new member — native `required` on
  // the plain Input fields covers most of it, but the Radix-based Selects
  // (department/domain/subdomain) don't participate in HTML form validation,
  // so those need an explicit check here.
  function findMissingField(form: FormState): string | null {
    const isPresidiumRole = form.role === 'SBG_LEADER' || form.role === 'SECRETARY';
    const isDirectorRole = form.role === 'DIRECTOR';
    if (!form.department) return 'Department';
    if (!isPresidiumRole && form.domain === NONE) return 'Domain';
    if (!isPresidiumRole && !isDirectorRole && form.subdomain === NONE) return 'Subdomain';
    const textFields: Array<[keyof FormState, string]> = [
      ['name', 'Name'], ['officialEmail', 'Official Email'], ['clubId', 'Club ID'],
      ['regNo', 'Registration No.'], ['section', 'Section'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'],
      ['personalEmail', 'Personal Email'], ['github', 'GitHub'], ['linkedin', 'LinkedIn'], ['instagram', 'Instagram'],
      ['builderId', 'AWS Builder ID'], ['meetup', 'Meetup'], ['faName', 'Faculty Advisor'], ['faPhone', 'FA Phone'], ['faEmail', 'FA Email'],
    ];
    for (const [key, label] of textFields) {
      if (!String(form[key]).trim()) return label;
    }
    return null;
  }

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    const missing = findMissingField(addForm);
    if (missing) { toast.error(`${missing} is required`); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(addForm)),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create member'); return; }
      toast.success('Member created');
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      setMembers(ms => [data.data, ...ms]);
    } catch { toast.error('Failed to create member'); }
    finally { setCreating(false); }
  }

  function openEdit(member: Member) {
    setEditTarget(member);
    setEditForm(memberToForm(member));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${editTarget.memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update member'); return; }
      toast.success('Member updated');
      const updated = { ...editTarget, ...toPayload(editForm) } as Member;
      setMembers(ms => ms.map(m => m.memberId === editTarget.memberId ? updated : m));
      setEditTarget(null);
    } catch { toast.error('Failed to update member'); }
    finally { setSaving(false); }
  }

  async function backfillDriveFolders() {
    setBackfilling(true);
    try {
      const res = await fetch('/api/members/drive-backfill', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Backfill failed'); return; }
      const { created, failed, total } = data.data;
      if (total === 0) toast.success('All members already have Drive folders');
      else if (failed === 0) toast.success(`Created ${created} Drive folder${created !== 1 ? 's' : ''}`);
      else toast.warning(`Created ${created}, failed ${failed} of ${total}`);
      // Reload to reflect new driveFolderIds
      const membersRes = await fetch('/api/members');
      const membersData = await membersRes.json();
      if (membersData.success) setMembers(membersData.data);
    } catch { toast.error('Backfill failed'); }
    finally { setBackfilling(false); }
  }

  async function syncToSheet() {
    setSyncing(true);
    try {
      const res = await fetch('/api/members/sheet-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Sync failed'); return; }
      const { synced, failed } = data.data;
      if (failed === 0) toast.success(`Synced ${synced} member${synced !== 1 ? 's' : ''} to sheet`);
      else toast.warning(`Synced ${synced}, failed ${failed}`);
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/members/${deleteTarget.memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete member'); return; }
      toast.success('Member permanently deleted');
      setMembers(ms => ms.filter(m => m.memberId !== deleteTarget.memberId));
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch { toast.error('Failed to delete member'); }
    finally { setDeleting(false); }
  }

  const editSubdomains = (form: FormState) => form.domain !== NONE ? (DOMAIN_SUBDOMAINS[form.domain as keyof typeof DOMAIN_SUBDOMAINS] || []) : [];

  function renderFields(form: FormState, setForm: React.Dispatch<React.SetStateAction<FormState>>, isAdd: boolean) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <Label>Official Email {isAdd ? '*' : ''}</Label>
          <Input type="email" value={form.officialEmail} disabled={!isAdd} required={isAdd}
            onChange={e => setForm(f => ({ ...f, officialEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Club ID *</Label>
          <Input value={form.clubId} onChange={e => setForm(f => ({ ...f, clubId: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={form.role} onValueChange={v => handleRoleChange(fn => setForm(fn), v)} disabled={!canPickRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Domain {isAdd ? '*' : ''}</Label>
          <Select value={form.domain} onValueChange={v => handleDomainChange(fn => setForm(fn), v)}
            disabled={!canPickRole || form.role === 'SBG_LEADER' || form.role === 'SECRETARY'}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— None (Presidium) —</SelectItem>
              {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Subdomain {isAdd ? '*' : ''}</Label>
          <Select value={form.subdomain} onValueChange={v => setForm(f => ({ ...f, subdomain: v }))}
            disabled={!canPickRole || editSubdomains(form).length === 0 || form.role === 'DIRECTOR' || form.role === 'SBG_LEADER' || form.role === 'SECRETARY'}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— None —</SelectItem>
              {editSubdomains(form).map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Registration No. {isAdd ? '*' : ''}</Label>
          <Input value={form.regNo} required={isAdd} onChange={e => setForm(f => ({ ...f, regNo: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Department {isAdd ? '*' : ''}</Label>
          <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Section {isAdd ? '*' : ''}</Label>
          <Input value={form.section} required={isAdd} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone {isAdd ? '*' : ''}</Label>
          <Input value={form.phone} required={isAdd} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp {isAdd ? '*' : ''}</Label>
          <Input value={form.whatsapp} required={isAdd} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Personal Email {isAdd ? '*' : ''}</Label>
          <Input type="email" value={form.personalEmail} required={isAdd} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>GitHub username {isAdd ? '*' : ''}</Label>
          <Input placeholder="your-username" value={form.github} required={isAdd} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>LinkedIn username {isAdd ? '*' : ''}</Label>
          <Input placeholder="your-username" value={form.linkedin} required={isAdd} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Instagram username {isAdd ? '*' : ''}</Label>
          <Input placeholder="your-username" value={form.instagram} required={isAdd} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>AWS Builder ID {isAdd ? '*' : ''}</Label>
          <Input placeholder="your-username" value={form.builderId} required={isAdd} onChange={e => setForm(f => ({ ...f, builderId: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Meetup {isAdd ? '*' : ''}</Label>
          <Input type="url" placeholder="https://meetup.com/..." value={form.meetup} required={isAdd} onChange={e => setForm(f => ({ ...f, meetup: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Faculty Advisor {isAdd ? '*' : ''}</Label>
          <Input value={form.faName} required={isAdd} onChange={e => setForm(f => ({ ...f, faName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>FA Phone {isAdd ? '*' : ''}</Label>
          <Input value={form.faPhone} required={isAdd} onChange={e => setForm(f => ({ ...f, faPhone: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>FA Email {isAdd ? '*' : ''}</Label>
          <Input type="email" value={form.faEmail} required={isAdd} onChange={e => setForm(f => ({ ...f, faEmail: e.target.value }))} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Manage Members</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">{members.length} members total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncToSheet} disabled={syncing}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync to Sheet
          </Button>
          <Button variant="outline" size="sm" onClick={backfillDriveFolders} disabled={backfilling}>
            {backfilling ? <Loader2 size={14} className="animate-spin" /> : <FolderSync size={14} />}
            Backfill Drive Folders
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add Member</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
        <Input placeholder="Search by name, email, Club ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {paginatedItems.map((member, idx) => (
          <div key={member.memberId} className="border-2 border-[#2d2d2d] bg-[#111] p-4 animate-fadeIn" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#f0f0f0] truncate uppercase tracking-wide">{member.name}</p>
                <p className="text-xs text-[#888] truncate font-mono">{member.officialEmail}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-[#f0f0f0] font-mono uppercase">{formatRole(member.role, member.domain)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="outline" size="icon" onClick={() => openEdit(member)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDeleteTarget(member)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="table-container hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-[#1e1e1e]">
                <th className="table-header text-left">Member</th>
                <th className="table-header text-left">Role</th>
                <th className="table-header text-left">Club ID</th>
                <th className="table-header text-center">Drive</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((member, idx) => (
                <tr key={member.memberId} className="table-row animate-fadeIn-row" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[#f0f0f0] truncate">{member.name}</p>
                    <p className="text-xs text-[#888] truncate font-mono">{member.officialEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-[#f0f0f0] font-mono uppercase">{formatRole(member.role, member.domain)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#f0f0f0] font-mono">{member.clubId}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      {member.subdomain ? (
                        member.driveFolderId ? (
                          <a
                            href={`https://drive.google.com/drive/folders/${member.driveFolderId}`}
                            target="_blank" rel="noopener noreferrer"
                            title="Open Drive folder"
                            className="text-green-400 hover:text-green-300 transition-colors"
                          >
                            <FolderOpen size={15} />
                          </a>
                        ) : (
                          <span title="No Drive folder yet" className="text-[#555]"><FolderSync size={15} /></span>
                        )
                      ) : (
                        <span title="No subdomain — Drive folder not applicable" className="text-[#333]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(member)}><Pencil size={13} /> Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDeleteTarget(member)}>
                        <Trash2 size={13} /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-[#555]">
          <UserX size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">No members found</p>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <form onSubmit={createMember} className="space-y-4">
            {renderFields(addForm, setAddForm, true)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)} disabled={creating}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit {editTarget?.name}</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            {renderFields(editForm, setEditForm, false)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — requires typing the member's name (irreversible) */}
      <Dialog open={deleteTarget !== null} onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Permanently delete {deleteTarget?.name}?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#888]">
              This cannot be undone. Their account, ratings, and sessions will be removed. Past submissions/tasks keep this
              person&apos;s name but any link to their profile will stop working.
              {deleteTarget?.driveFolderId && (
                <> Their Drive folder will be moved to trash and their access revoked.</>
              )}
            </p>
            <div className="space-y-1.5">
              <Label>Type <span className="font-bold text-[#f0f0f0]">{deleteTarget?.name}</span> to confirm</Label>
              <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} disabled={deleting} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }} disabled={deleting}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || deleteConfirmText.trim() !== (deleteTarget?.name || '').trim() || !deleteTarget}
              onClick={confirmDelete}
            >
              {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
