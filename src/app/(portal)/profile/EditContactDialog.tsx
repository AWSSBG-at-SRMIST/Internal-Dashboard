'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export interface ContactForm {
  phone: string; personalEmail: string; github: string; linkedin: string; instagram: string; meetup: string; builderId: string;
}

const FIELD_LABELS: Record<keyof ContactForm, string> = {
  phone: 'Phone', personalEmail: 'Personal Email', github: 'GitHub', linkedin: 'LinkedIn',
  instagram: 'Instagram', meetup: 'Meetup', builderId: 'AWS Builder ID',
};

// Mirrors the exact self-edit field allowlist enforced server-side in
// PUT /api/members/[memberId] (the non-canEditMembers branch) — this is the
// only path a member has to update their own contact info.
export default function EditContactDialog({ memberId, initial }: { memberId: string; initial: ContactForm }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initial);

  const missing = (Object.keys(FIELD_LABELS) as Array<keyof ContactForm>).filter(k => !initial[k]?.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to update'); return; }
      toast.success('Contact info updated');
      setOpen(false);
      router.refresh();
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  }

  return (
    <>
      {missing.length > 0 && (
        <div className="flex items-center gap-2 border-2 border-yellow-500/30 bg-yellow-500/10 px-3 py-2 mb-3 text-xs text-yellow-400">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>Your profile is incomplete — missing {missing.map(k => FIELD_LABELS[k]).join(', ')}. Complete it below.</span>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => { setForm(initial); setOpen(true); }}>
        <Pencil size={13} /> Edit Contact Info
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Contact Info</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <Label>Personal Email</Label>
              <Input type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label>GitHub username</Label>
              <Input value={form.github} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} placeholder="your-username" />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn username</Label>
              <Input value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="your-username" />
            </div>
            <div className="space-y-2">
              <Label>Instagram username</Label>
              <Input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="your-username" />
            </div>
            <div className="space-y-2">
              <Label>Meetup</Label>
              <Input type="url" value={form.meetup} onChange={e => setForm(f => ({ ...f, meetup: e.target.value }))} placeholder="https://meetup.com/..." />
            </div>
            <div className="space-y-2">
              <Label>AWS Builder ID</Label>
              <Input value={form.builderId} onChange={e => setForm(f => ({ ...f, builderId: e.target.value }))} placeholder="your-username" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
