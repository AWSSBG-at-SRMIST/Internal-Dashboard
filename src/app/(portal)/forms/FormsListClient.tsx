'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, Pencil, BarChart3, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/utils';
import type { FormDef } from '@/types';

export default function FormsListClient({ forms, canCreate }: { forms: FormDef[]; canCreate: boolean }) {
  const [items, setItems] = useState(forms);
  const [deleteTarget, setDeleteTarget] = useState<FormDef | null>(null);
  const [busy, setBusy] = useState(false);

  function publicUrl(slug: string) {
    if (typeof window === 'undefined') return `/f/${slug}`;
    return `${window.location.origin}/f/${slug}`;
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(publicUrl(slug));
    toast.success('Link copied');
  }

  async function toggleAccepting(form: FormDef) {
    const next = !form.acceptingResponses;
    setItems(prev => prev.map(f => f.formId === form.formId ? { ...f, acceptingResponses: next } : f));
    const res = await fetch(`/api/forms/${form.formId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptingResponses: next }),
    });
    if (!res.ok) {
      setItems(prev => prev.map(f => f.formId === form.formId ? { ...f, acceptingResponses: !next } : f));
      toast.error('Failed to update');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await fetch(`/api/forms/${deleteTarget.formId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) { toast.error('Failed to delete form'); return; }
    setItems(prev => prev.filter(f => f.formId !== deleteTarget.formId));
    toast.success('Form deleted');
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Forms</h1>
          <p className="page-subtitle">Internal forms for AWS SBG at SRMIST</p>
        </div>
        {canCreate && (
          <Link href="/forms/new">
            <Button><Plus size={16} /> New Form</Button>
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-[#666] text-sm">
            No forms yet. {canCreate && 'Create your first one to get started.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(form => (
            <Card key={form.formId} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate">{form.title}</CardTitle>
                  <Badge variant={form.acceptingResponses ? 'success' : 'secondary'}>
                    {form.acceptingResponses ? 'Open' : 'Closed'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <p className="text-sm text-[#888] line-clamp-2 flex-1">
                  {form.description || 'No description'}
                </p>
                <div className="flex items-center justify-between text-xs text-[#666] font-mono">
                  <span>{form.responseCount} responses</span>
                  <span>{formatDate(form.createdAt)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(form.slug)}>
                    <Copy size={13} /> Copy Link
                  </Button>
                  <Link href={`/forms/${form.formId}/responses`}>
                    <Button size="sm" variant="outline"><BarChart3 size={13} /> Responses</Button>
                  </Link>
                  <Link href={`/forms/${form.formId}/edit`}>
                    <Button size="sm" variant="outline"><Pencil size={13} /> Edit</Button>
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => toggleAccepting(form)}>
                    {form.acceptingResponses ? 'Close' : 'Reopen'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(form)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Delete this form?"
        description={`"${deleteTarget?.title}" and all ${deleteTarget?.responseCount ?? 0} of its responses will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
