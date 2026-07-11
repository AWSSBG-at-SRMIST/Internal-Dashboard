'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// Mirrors the exact self-edit field allowlist enforced server-side in
// PUT /api/members/[memberId] (the non-canEditMembers branch) — this is the
// only path a member has to update their own contact info.
export default function EditContactDialog({ memberId, initial }: {
  memberId: string;
  initial: { phone: string; personalEmail: string; github: string; linkedin: string; meetup: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initial);

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
              <Label>GitHub</Label>
              <Input type="url" value={form.github} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} placeholder="https://github.com/username" />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn</Label>
              <Input type="url" value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/username" />
            </div>
            <div className="space-y-2">
              <Label>Meetup</Label>
              <Input type="url" value={form.meetup} onChange={e => setForm(f => ({ ...f, meetup: e.target.value }))} placeholder="https://meetup.com/..." />
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
