'use client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, Plus, Pencil, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { HonoraryMember, HonoraryTag } from '@/types';

const TAG_LABELS: Record<HonoraryTag, string> = {
  FACULTY_MENTOR: 'Faculty Mentor',
  INDUSTRIAL_MENTOR: 'Industrial Mentor',
  ADVISORY: 'Advisory Committee',
  FOUNDING_MEMBER: 'Founding Member',
};

const TAG_GROUPS: { tag: HonoraryTag; label: string }[] = [
  { tag: 'FACULTY_MENTOR', label: 'Faculty Mentors' },
  { tag: 'INDUSTRIAL_MENTOR', label: 'Industrial Mentors' },
  { tag: 'ADVISORY', label: 'Advisory Committee' },
  { tag: 'FOUNDING_MEMBER', label: 'Founding Members' },
];

type FormState = { name: string; tag: HonoraryTag; description: string; linkedin: string; photoUrl: string; order: string };

function emptyForm(): FormState {
  return { name: '', tag: 'FACULTY_MENTOR', description: '', linkedin: '', photoUrl: '', order: '' };
}

function toForm(m: HonoraryMember): FormState {
  return {
    name: m.name,
    tag: m.tag,
    description: m.description || '',
    linkedin: m.linkedin || '',
    photoUrl: m.photoUrl || '',
    order: m.order !== undefined && m.order !== null ? String(m.order) : '',
  };
}

function MemberForm({ form, setForm, onSubmit, onCancel, submitting, submitLabel }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={form.tag} onValueChange={v => setForm(f => ({ ...f, tag: v as HonoraryTag }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TAG_GROUPS.map(g => (
              <SelectItem key={g.tag} value={g.tag}>{TAG_LABELS[g.tag]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea placeholder="e.g. Associate Chairperson, School of Computing" className="min-h-[60px]"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>LinkedIn URL</Label>
        <Input placeholder="https://linkedin.com/in/..." value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Photo URL</Label>
        <Input placeholder="https://..." value={form.photoUrl} onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Sort order within category</Label>
        <Input type="number" min={0} placeholder="Lower shows first" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function HonoraryMembersClient({ initialMembers }: { initialMembers: HonoraryMember[] }) {
  const [members, setMembers] = useState<HonoraryMember[]>(initialMembers);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<HonoraryMember | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<HonoraryMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const grouped = useMemo(() => TAG_GROUPS.map(g => ({
    ...g,
    members: members.filter(m => m.tag === g.tag).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
  })), [members]);

  function toPayload(form: FormState) {
    return {
      name: form.name.trim(),
      tag: form.tag,
      description: form.description.trim(),
      linkedin: form.linkedin.trim(),
      photoUrl: form.photoUrl.trim(),
      order: form.order.trim() === '' ? undefined : Number(form.order),
    };
  }

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/honorary-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(createForm)),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to add member'); return; }
      toast.success('Honorary member added');
      setMembers(ms => [...ms, d.data]);
      setShowCreate(false);
      setCreateForm(emptyForm());
    } catch { toast.error('Failed to add member'); }
    finally { setCreating(false); }
  }

  function openEdit(member: HonoraryMember) {
    setEditTarget(member);
    setEditForm(toForm(member));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = toPayload(editForm);
      const res = await fetch(`/api/honorary-members/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to update member'); return; }
      toast.success('Honorary member updated');
      setMembers(ms => ms.map(m => m.id === editTarget.id
        ? { ...m, name: payload.name, tag: payload.tag, description: payload.description, linkedin: payload.linkedin, photoUrl: payload.photoUrl || null, order: payload.order }
        : m));
      setEditTarget(null);
    } catch { toast.error('Failed to update member'); }
    finally { setSaving(false); }
  }

  async function deleteMember() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const removed = members.find(m => m.id === id);
    setMembers(ms => ms.filter(m => m.id !== id));
    setDeleting(true);
    try {
      const res = await fetch(`/api/honorary-members/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) throw new Error();
      toast.success('Honorary member removed');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to remove member');
      if (removed) setMembers(ms => [...ms, removed]);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide flex items-center gap-2">
            <Award size={20} /> Honorary Members
          </h1>
          <p className="text-sm text-[#666] mt-1 font-mono">Faculty/Industry mentors, founding members & advisory committee shown on the public website's Team page</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Member</Button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <Award size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">No honorary members yet</p>
          <Button className="mt-4" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Add the first one
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.filter(g => g.members.length > 0).map(group => (
            <div key={group.tag} className="space-y-3">
              <h2 className="text-xs font-bold text-[#666] uppercase tracking-widest border-l-2 border-[#FF9900] pl-3">
                {group.label} <span className="text-[#444]">({group.members.length})</span>
              </h2>
              <div className="grid gap-3">
                {group.members.map(member => (
                  <Card key={member.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-[#f0f0f0]">{member.name}</p>
                            <Badge variant="outline" className="text-xs font-mono">{TAG_LABELS[member.tag]}</Badge>
                          </div>
                          {member.description && <p className="text-xs text-[#888] mt-1 font-mono">{member.description}</p>}
                          {member.linkedin && (
                            <a href={member.linkedin} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#FF9900] hover:text-orange-300 mt-1 inline-flex items-center gap-1 font-mono">
                              LinkedIn <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button variant="outline" size="icon" onClick={() => openEdit(member)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(member)}>
                            <Trash2 size={14} />
                          </Button>
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

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Honorary Member</DialogTitle></DialogHeader>
          <MemberForm form={createForm} setForm={setCreateForm} onSubmit={createMember} onCancel={() => setShowCreate(false)} submitting={creating} submitLabel="Add" />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editTarget !== null} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Honorary Member</DialogTitle></DialogHeader>
          {editTarget && (
            <MemberForm form={editForm} setForm={setEditForm} onSubmit={saveEdit} onCancel={() => setEditTarget(null)} submitting={saving} submitLabel="Save" />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title={`Remove ${deleteTarget?.name}?`}
        description="This removes them from the public website's Team page too. This cannot be undone."
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={deleteMember}
      />
    </div>
  );
}
