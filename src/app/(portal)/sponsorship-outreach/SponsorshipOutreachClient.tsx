'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, Plus, X, Loader2, Check, XCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MAX_ROWS = 5;

type Row = { companyName: string; companyEmail: string };
type Result = { companyName: string; companyEmail: string; success: boolean; attachmentIncluded?: boolean; error?: string };
type LogEntry = { logId: string; companyName: string; companyEmail: string; createdBy: string; createdByName: string; createdAt: string };

function emptyRow(): Row {
  return { companyName: '', companyEmail: '' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SponsorshipOutreachClient({ initialLog }: { initialLog: LogEntry[] }) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [log, setLog] = useState<LogEntry[]>(initialLog);

  async function refreshLog() {
    try {
      const res = await fetch('/api/sponsorship-outreach/log');
      const d = await res.json();
      if (res.ok && d.success) setLog(d.data);
    } catch {
      // Non-fatal — the table just keeps showing the last known state.
    }
  }

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    setRows(rs => [...rs, emptyRow()]);
  }

  function removeRow(i: number) {
    setRows(rs => rs.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const companies = rows
      .map(r => ({ companyName: r.companyName.trim(), companyEmail: r.companyEmail.trim() }))
      .filter(r => r.companyName || r.companyEmail);

    if (companies.length === 0) { toast.error('Add at least one company'); return; }
    for (const c of companies) {
      if (!c.companyName || !c.companyEmail) { toast.error('Every row needs both a company name and email'); return; }
    }

    setSubmitting(true);
    setResults(null);
    try {
      const res = await fetch('/api/sponsorship-outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to create drafts'); return; }

      setResults(d.data);
      const successCount = d.data.filter((r: Result) => r.success).length;
      if (successCount === d.data.length) {
        toast.success(`${successCount} draft${successCount === 1 ? '' : 's'} created`);
        setRows([emptyRow()]);
      } else {
        toast.error(`${successCount}/${d.data.length} drafts created — see details below`);
      }
      if (successCount > 0) await refreshLog();
    } catch {
      toast.error('Failed to create drafts');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-[#FF9900]/10 border-2 border-[#FF9900]/30 flex items-center justify-center flex-shrink-0">
          <Mail size={22} className="text-[#FF9900]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Sponsorship Outreach</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">Drafts get saved directly to the sponsorship inbox — nothing is sent automatically</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Companies (up to {MAX_ROWS} at a time)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className={i === 0 ? '' : 'sr-only'}>Company Name</Label>
                    <Input
                      placeholder="e.g. EaseMyTrip"
                      value={row.companyName}
                      onChange={e => updateRow(i, 'companyName', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label className={i === 0 ? '' : 'sr-only'}>Company Email</Label>
                    <Input
                      type="email"
                      placeholder="contact@company.com"
                      value={row.companyEmail}
                      onChange={e => updateRow(i, 'companyEmail', e.target.value)}
                    />
                  </div>
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {rows.length < MAX_ROWS && (
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus size={13} /> Add Another Company
              </Button>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Creating drafts...</> : 'Create Drafts'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Results</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 border-2 ${r.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                {r.success ? <Check size={16} className="text-green-400 flex-shrink-0" /> : <XCircle size={16} className="text-red-400 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#f0f0f0] truncate">{r.companyName} <span className="text-[#666] font-mono">· {r.companyEmail}</span></p>
                  {!r.success && r.error && <p className="text-xs text-red-300 font-mono mt-0.5">{r.error}</p>}
                  {r.success && r.attachmentIncluded === false && (
                    <p className="text-xs text-yellow-300 font-mono mt-0.5">Draft created, but the PDF couldn&apos;t be auto-attached — attach it manually before sending.</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History size={16} className="text-[#FF9900]" /> Outreach History
          </CardTitle>
          <p className="text-xs text-[#666] font-mono">Shared across everyone with access to this page</p>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-[#666] font-mono">No outreach drafts have been created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#333] text-left text-xs text-[#666] uppercase tracking-wide font-mono">
                    <th className="py-2 pr-3 font-medium">Company</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Sent By</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map(entry => (
                    <tr key={entry.logId} className="border-b border-[#222] last:border-0">
                      <td className="py-2 pr-3 text-[#f0f0f0] font-medium">{entry.companyName}</td>
                      <td className="py-2 pr-3 text-[#999] font-mono">{entry.companyEmail}</td>
                      <td className="py-2 pr-3 text-[#999]">{entry.createdByName}</td>
                      <td className="py-2 pr-3 text-[#666] font-mono whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
