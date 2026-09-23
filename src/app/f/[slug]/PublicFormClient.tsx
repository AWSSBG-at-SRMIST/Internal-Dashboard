'use client';
import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { FormDef } from '@/types';

type AnswerValue = string | string[];

export default function PublicFormClient({ form, signedInAs }: { form: FormDef; signedInAs: string | null }) {
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const closed = !form.acceptingResponses || (form.closesAt ? new Date(form.closesAt) < new Date() : false);

  function setValue(fieldId: string, value: AnswerValue) {
    setValues(prev => ({ ...prev, [fieldId]: value }));
  }

  function toggleCheckbox(fieldId: string, option: string, checked: boolean) {
    setValues(prev => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
      const next = checked ? [...current, option] : current.filter(o => o !== option);
      return { ...prev, [fieldId]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const answers = form.fields
        .filter(f => f.type !== 'SECTION_BREAK' && f.type !== 'FILE_UPLOAD')
        .map(f => ({ fieldId: f.fieldId, value: values[f.fieldId] ?? (f.type === 'CHECKBOXES' ? [] : '') }));

      const fd = new FormData();
      fd.set('answers', JSON.stringify(answers));
      for (const field of form.fields) {
        if (field.type === 'FILE_UPLOAD' && files[field.fieldId]) {
          fd.set(`file:${field.fieldId}`, files[field.fieldId] as File);
        }
      }

      const res = await fetch(`/api/forms/${form.formId}/submit`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to submit'); return; }
      setSubmitted(true);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#050505] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 overflow-hidden flex-shrink-0 bg-[#1a1a1a] border-2 border-[#2d2d2d]">
            <Image src="/logo.png" alt="AWSSBG" width={36} height={36} className="object-contain" />
          </div>
          <p className="text-[#FF9900] text-xs font-mono uppercase tracking-widest">AWS Student Builder Group at SRMIST</p>
        </div>

        <Card style={{ borderTopColor: '#FF9900', borderTopWidth: 4 }}>
          <CardContent className="p-6">
            <h1 className="text-xl font-bold text-[#f0f0f0] uppercase tracking-wide">{form.title}</h1>
            {form.description && <p className="text-sm text-[#888] mt-2 whitespace-pre-wrap">{form.description}</p>}
            {signedInAs && <p className="text-xs text-[#555] font-mono mt-3">Signed in as {signedInAs}</p>}
          </CardContent>
        </Card>

        {submitted ? (
          <Card>
            <CardContent className="p-10 text-center space-y-3">
              <CheckCircle2 className="mx-auto text-green-400" size={40} />
              <p className="text-[#f0f0f0] font-bold uppercase tracking-wide">Response Recorded</p>
              <p className="text-sm text-[#888]">Thanks — your submission has been received.</p>
            </CardContent>
          </Card>
        ) : closed ? (
          <Card>
            <CardContent className="p-10 text-center text-[#888] text-sm">
              This form is no longer accepting responses.
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.map(field => {
              if (field.type === 'SECTION_BREAK') {
                return (
                  <div key={field.fieldId} className="pt-4 pb-1">
                    <h2 className="text-base font-bold text-[#FF9900] uppercase tracking-wide">{field.label}</h2>
                    {field.helpText && <p className="text-xs text-[#666] mt-1">{field.helpText}</p>}
                  </div>
                );
              }
              return (
                <Card key={field.fieldId}>
                  <CardContent className="p-5 space-y-2">
                    <label className="block text-sm font-bold text-[#f0f0f0]">
                      {field.label}{field.required && <span className="text-[#FF9900]"> *</span>}
                    </label>
                    {field.helpText && <p className="text-xs text-[#666]">{field.helpText}</p>}

                    {field.type === 'SHORT_TEXT' && (
                      <Input required={field.required} value={(values[field.fieldId] as string) || ''} onChange={e => setValue(field.fieldId, e.target.value)} />
                    )}
                    {field.type === 'PARAGRAPH' && (
                      <Textarea required={field.required} value={(values[field.fieldId] as string) || ''} onChange={e => setValue(field.fieldId, e.target.value)} />
                    )}
                    {field.type === 'DATE' && (
                      <Input type="date" required={field.required} value={(values[field.fieldId] as string) || ''} onChange={e => setValue(field.fieldId, e.target.value)} className="w-48" />
                    )}
                    {field.type === 'FILE_UPLOAD' && (
                      <input
                        type="file"
                        required={field.required}
                        onChange={e => setFiles(prev => ({ ...prev, [field.fieldId]: e.target.files?.[0] || null }))}
                        className="block w-full text-sm text-[#aaa] file:mr-3 file:py-2 file:px-4 file:border-2 file:border-[#2d2d2d] file:bg-[#1a1a1a] file:text-[#f0f0f0] file:text-xs file:font-bold file:uppercase"
                      />
                    )}
                    {field.type === 'DROPDOWN' && (
                      <Select value={(values[field.fieldId] as string) || undefined} onValueChange={v => setValue(field.fieldId, v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {(field.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {field.type === 'MULTIPLE_CHOICE' && (
                      <div className="space-y-2">
                        {(field.options || []).map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-sm text-[#e0e0e0]">
                            <input
                              type="radio"
                              name={field.fieldId}
                              required={field.required}
                              checked={values[field.fieldId] === opt}
                              onChange={() => setValue(field.fieldId, opt)}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {field.type === 'CHECKBOXES' && (
                      <div className="space-y-2">
                        {(field.options || []).map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-sm text-[#e0e0e0]">
                            <input
                              type="checkbox"
                              checked={Array.isArray(values[field.fieldId]) && (values[field.fieldId] as string[]).includes(opt)}
                              onChange={e => toggleCheckbox(field.fieldId, opt, e.target.checked)}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Submit
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
