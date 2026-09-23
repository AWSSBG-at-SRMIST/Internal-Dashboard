'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy, Loader2, GripVertical, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatRole } from '@/lib/utils';
import type { FormDef, FormField, FormFieldType, FormAccessMode, FormEditor, Role, Domain, Subdomain } from '@/types';

interface MemberOption { memberId: string; name: string; officialEmail: string; role: Role; domain: Domain | null; subdomain: Subdomain | null; }

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  SHORT_TEXT: 'Short Text',
  PARAGRAPH: 'Paragraph',
  MULTIPLE_CHOICE: 'Multiple Choice',
  CHECKBOXES: 'Checkboxes',
  DROPDOWN: 'Dropdown',
  DATE: 'Date',
  FILE_UPLOAD: 'File Upload',
  SECTION_BREAK: 'Section Break',
};

const HAS_OPTIONS: FormFieldType[] = ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'];

function emptyField(): FormField {
  return { fieldId: nanoid(8), type: 'SHORT_TEXT', label: '', helpText: '', required: false };
}

export default function FormBuilder({ initial, formId }: { initial?: FormDef; formId?: string }) {
  const router = useRouter();
  const isEdit = !!formId;

  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [fields, setFields] = useState<FormField[]>(initial?.fields?.length ? initial.fields : [emptyField()]);
  const [accessMode, setAccessMode] = useState<FormAccessMode>(initial?.accessMode || 'PUBLIC');
  const [acceptingResponses, setAcceptingResponses] = useState(initial?.acceptingResponses ?? true);
  const [closesAt, setClosesAt] = useState(initial?.closesAt ? initial.closesAt.slice(0, 16) : '');
  const [editors, setEditors] = useState<FormEditor[]>(initial?.editors || []);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [pickerId, setPickerId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    fetch('/api/members').then(r => r.json()).then(res => {
      if (res.success) setMemberOptions(res.data);
    }).catch(() => {});
  }, [isEdit]);

  function addEditor() {
    if (!pickerId) return;
    const m = memberOptions.find(o => o.memberId === pickerId);
    if (!m || editors.some(e => e.memberId === m.memberId)) return;
    setEditors(prev => [...prev, { memberId: m.memberId, name: m.name, email: m.officialEmail }]);
    setPickerId('');
  }

  function removeEditor(memberId: string) {
    setEditors(prev => prev.filter(e => e.memberId !== memberId));
  }

  function updateField(fieldId: string, patch: Partial<FormField>) {
    setFields(prev => prev.map(f => f.fieldId === fieldId ? { ...f, ...patch } : f));
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeField(fieldId: string) {
    setFields(prev => prev.filter(f => f.fieldId !== fieldId));
  }

  function duplicateField(field: FormField) {
    setFields(prev => {
      const idx = prev.findIndex(f => f.fieldId === field.fieldId);
      const copy = { ...field, fieldId: nanoid(8) };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function addOption(fieldId: string) {
    setFields(prev => prev.map(f => f.fieldId === fieldId
      ? { ...f, options: [...(f.options || []), `Option ${(f.options?.length || 0) + 1}`] }
      : f));
  }

  function updateOption(fieldId: string, index: number, value: string) {
    setFields(prev => prev.map(f => f.fieldId === fieldId
      ? { ...f, options: (f.options || []).map((o, i) => i === index ? value : o) }
      : f));
  }

  function removeOption(fieldId: string, index: number) {
    setFields(prev => prev.map(f => f.fieldId === fieldId
      ? { ...f, options: (f.options || []).filter((_, i) => i !== index) }
      : f));
  }

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    const cleanFields = fields.filter(f => f.type === 'SECTION_BREAK' || f.label.trim());
    if (cleanFields.length === 0) { toast.error('Add at least one field'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        fields: cleanFields,
        accessMode,
        acceptingResponses,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      };
      // Editors only make sense post-creation (the form must exist first);
      // on the edit page, include the current list so changes are saved
      // alongside everything else in one PATCH.
      if (isEdit) payload.editors = editors.map(e => ({ memberId: e.memberId }));
      const res = await fetch(isEdit ? `/api/forms/${formId}` : '/api/forms', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return; }
      toast.success(isEdit ? 'Form updated' : 'Form created');
      router.push(isEdit ? `/forms/${formId}/responses` : '/forms');
      router.refresh();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
      <h1 className="page-title">{isEdit ? 'Edit Form' : 'New Form'}</h1>

      <Card style={{ borderTopColor: '#FF9900', borderTopWidth: 4 }}>
        <CardContent className="p-6 space-y-4">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Form title"
            className="text-lg font-bold h-12"
          />
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Form description (optional)"
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {fields.map((field, index) => (
          <Card key={field.fieldId}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <GripVertical size={16} className="text-[#444] mt-2.5 flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  {field.type === 'SECTION_BREAK' ? (
                    <Input
                      value={field.label}
                      onChange={e => updateField(field.fieldId, { label: e.target.value })}
                      placeholder="Section title"
                      className="font-bold"
                    />
                  ) : (
                    <Input
                      value={field.label}
                      onChange={e => updateField(field.fieldId, { label: e.target.value })}
                      placeholder="Question"
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={field.type} onValueChange={v => updateField(field.fieldId, { type: v as FormFieldType, options: HAS_OPTIONS.includes(v as FormFieldType) ? (field.options || ['Option 1']) : undefined })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_TYPE_LABELS) as FormFieldType[]).map(t => (
                          <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {field.type !== 'SECTION_BREAK' && (
                      <label className="flex items-center gap-2 text-xs font-mono text-[#aaa] uppercase tracking-wide">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={e => updateField(field.fieldId, { required: e.target.checked })}
                        />
                        Required
                      </label>
                    )}
                  </div>

                  {HAS_OPTIONS.includes(field.type) && (
                    <div className="space-y-2 pl-1">
                      {(field.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={e => updateOption(field.fieldId, i, e.target.value)}
                            className="h-8"
                          />
                          <button onClick={() => removeOption(field.fieldId, i)} className="text-[#666] hover:text-red-400 flex-shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(field.fieldId)}>
                        <Plus size={13} /> Add Option
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => moveField(index, -1)} disabled={index === 0} className="text-[#666] hover:text-white disabled:opacity-20">
                    <ArrowUp size={15} />
                  </button>
                  <button onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="text-[#666] hover:text-white disabled:opacity-20">
                    <ArrowDown size={15} />
                  </button>
                  <button onClick={() => duplicateField(field)} className="text-[#666] hover:text-white">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => removeField(field.fieldId)} className="text-[#666] hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={() => setFields(prev => [...prev, emptyField()])}>
          <Plus size={16} /> Add Field
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Who can respond</Label>
            <Select value={accessMode} onValueChange={v => setAccessMode(v as FormAccessMode)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Anyone with the link</SelectItem>
                <SelectItem value="MEMBERS_ONLY">SBG members only (sign-in required)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closesAt">Closes at (optional)</Label>
            <Input
              id="closesAt"
              type="datetime-local"
              value={closesAt}
              onChange={e => setClosesAt(e.target.value)}
              className="w-64"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-mono text-[#ccc]">
            <input
              type="checkbox"
              checked={acceptingResponses}
              onChange={e => setAcceptingResponses(e.target.checked)}
            />
            Accepting responses
          </label>

          {isEdit && (
            <div className="pt-4 border-t border-[#2d2d2d] space-y-3">
              <div>
                <Label>Editors</Label>
                <p className="text-xs text-[#666] mt-0.5">
                  Anyone added here can edit this form and view its responses, same as you. (The hierarchy above you —
                  your Manager/Director/Presidium as applicable — can already view responses automatically, without
                  being added here.)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {editors.length === 0 && <span className="text-xs text-[#555]">No editors added yet.</span>}
                {editors.map(e => (
                  <Badge key={e.memberId} variant="secondary" className="gap-1.5">
                    {e.name}
                    <button onClick={() => removeEditor(e.memberId)} className="hover:text-red-400">
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={pickerId} onValueChange={setPickerId}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Select a member" /></SelectTrigger>
                  <SelectContent>
                    {memberOptions.filter(m => !editors.some(e => e.memberId === m.memberId)).map(m => (
                      <SelectItem key={m.memberId} value={m.memberId}>{m.name} — {formatRole(m.role, m.domain)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addEditor} disabled={!pickerId}>
                  <Plus size={14} /> Add
                </Button>
              </div>
            </div>
          )}

          {isEdit && initial && (
            <div className="pt-2 border-t border-[#2d2d2d]">
              <Label>Form Link</Label>
              <p className="text-sm font-mono text-[#FF9900] mt-1 break-all">
                {typeof window !== 'undefined' ? window.location.origin : 'console.awssbg-srmist.in'}/f/{initial.slug}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Form'}
        </Button>
      </div>
    </div>
  );
}
