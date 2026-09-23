'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, Pencil, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import type { FormDef, FormResponseRecord } from '@/types';

export default function ResponsesClient({ form, responses }: { form: FormDef; responses: FormResponseRecord[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{form.title}</h1>
          <p className="page-subtitle">{responses.length} response{responses.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {form.driveSheetId && (
            <a href={`https://docs.google.com/spreadsheets/d/${form.driveSheetId}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileText size={14} /> View in Sheet <ExternalLink size={12} /></Button>
            </a>
          )}
          <Link href={`/forms/${form.formId}/edit`}>
            <Button variant="outline" size="sm"><Pencil size={14} /> Edit Form</Button>
          </Link>
        </div>
      </div>

      {responses.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-[#666] text-sm">No responses yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {responses.map(r => {
            const isOpen = expanded === r.responseId;
            return (
              <Card key={r.responseId}>
                <button
                  className="w-full flex items-center justify-between gap-3 p-4 text-left"
                  onClick={() => setExpanded(isOpen ? null : r.responseId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold text-[#f0f0f0] truncate">
                      {r.respondentName || 'Anonymous'}
                    </span>
                    {r.respondentClubId && <span className="text-xs font-mono text-[#666] flex-shrink-0">{r.respondentClubId}</span>}
                    {r.respondentPosition && <Badge variant="secondary" className="flex-shrink-0">{r.respondentPosition}</Badge>}
                    {!r.respondentMemberId && <Badge variant="secondary">Public</Badge>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-mono text-[#666]">{formatDateTime(r.submittedAt)}</span>
                    {isOpen ? <ChevronUp size={16} className="text-[#666]" /> : <ChevronDown size={16} className="text-[#666]" />}
                  </div>
                </button>
                {isOpen && (
                  <CardContent className="pt-0 pb-4 space-y-3 border-t border-[#1e1e1e] mt-1">
                    {(r.respondentDomain || r.respondentSubdomain || r.respondentEmail) && (
                      <div className="pt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[#888]">
                        {r.respondentDomain && <span>{r.respondentDomain}{r.respondentSubdomain ? ` / ${r.respondentSubdomain}` : ''}</span>}
                        {r.respondentEmail && <span>{r.respondentEmail}</span>}
                      </div>
                    )}
                    {form.fields.filter(f => f.type !== 'SECTION_BREAK').map(field => {
                      const answer = r.answers.find(a => a.fieldId === field.fieldId);
                      return (
                        <div key={field.fieldId} className="pt-3">
                          <p className="text-xs text-[#666] uppercase tracking-wide font-bold">{field.label}</p>
                          {answer?.fileUrl ? (
                            <a href={answer.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#FF9900] hover:underline inline-flex items-center gap-1 mt-1">
                              {String(answer.value)} <ExternalLink size={12} />
                            </a>
                          ) : (
                            <p className="text-sm text-[#e0e0e0] mt-1">
                              {answer ? (Array.isArray(answer.value) ? answer.value.join(', ') : answer.value) : <span className="text-[#555]">—</span>}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
