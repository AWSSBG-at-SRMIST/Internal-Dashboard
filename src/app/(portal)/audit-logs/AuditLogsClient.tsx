'use client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Search, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { AuditLog } from '@/types';

const PAGE_SIZE = 20;

const ACTION_COLORS: Record<string, string> = {
  CREATE_MEMBER:      'bg-green-500/20 text-green-300',
  UPDATE_MEMBER:      'bg-blue-500/20 text-blue-300',
  DEACTIVATE_MEMBER:  'bg-red-500/20 text-red-300',
  CREATE_TASK:        'bg-orange-500/20 text-orange-300',
  UPDATE_TASK:        'bg-yellow-500/20 text-yellow-300',
  DELETE_TASK:        'bg-rose-500/20 text-rose-300',
  SUBMIT_TASK:        'bg-purple-500/20 text-purple-300',
  APPROVE_SUBMISSION: 'bg-emerald-500/20 text-emerald-300',
  REJECT_SUBMISSION:  'bg-pink-500/20 text-pink-300',
  REVISE_SUBMISSION:  'bg-orange-500/20 text-orange-300',
  CREATE_LINK:        'bg-cyan-500/20 text-cyan-300',
  DELETE_LINK:        'bg-amber-500/20 text-amber-300',
  CREATE_COHORT:      'bg-teal-500/20 text-teal-300',
  SEED_MEMBERS:       'bg-indigo-500/20 text-indigo-300',
  SETUP_TABLES:       'bg-[#2a2a2a] text-[#aaa]',
  CLEAR_AUDIT_LOGS:   'bg-red-500/20 text-red-300',
  GENERATE_MOM:       'bg-violet-500/20 text-violet-300',
};

const ALL_ACTIONS = Object.keys(ACTION_COLORS);
const ALL_TARGET_TYPES = ['MEMBER', 'TASK', 'SUBMISSION', 'LINK', 'SYSTEM'];

export default function AuditLogsClient({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [showClear, setShowClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const filtered = useMemo(() => logs.filter(l => {
    const matchSearch = !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.performedByName.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === 'ALL' || l.action === actionFilter;
    const matchTarget = targetFilter === 'ALL' || l.targetType === targetFilter;
    return matchSearch && matchAction && matchTarget;
  }), [logs, search, actionFilter, targetFilter]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered, PAGE_SIZE);

  const hasFilters = search || actionFilter !== 'ALL' || targetFilter !== 'ALL';

  async function clearLogs() {
    setClearing(true);
    try {
      const res = await fetch('/api/audit-logs', { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error();
      setLogs(data.data ? [data.data] : []);
      setSearch('');
      setActionFilter('ALL');
      setTargetFilter('ALL');
      toast.success(`Cleared ${data.deleted} log entries`);
      setShowClear(false);
    } catch {
      toast.error('Failed to clear audit logs');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Audit Logs</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">{logs.length} logged actions</p>
        </div>
        {logs.length > 0 && (
          <Button variant="outline" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0" onClick={() => setShowClear(true)}>
            <Trash2 size={14} /> Clear Logs
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
          <Input placeholder="Search by action, user, or details..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="flex-1 min-w-[140px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              {ALL_ACTIONS.map(a => (
                <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger className="flex-1 min-w-[130px]">
              <SelectValue placeholder="Target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {ALL_TARGET_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setActionFilter('ALL'); setTargetFilter('ALL'); }}>
              <X size={14} /> Clear
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">No logs found</p>
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-[#1e1e1e]">
                {paginatedItems.map((log, idx) => (
                  <div key={log.logId} className="px-4 py-3 hover:bg-[#1a1a1a] transition-colors animate-fadeIn-row" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className={ACTION_COLORS[log.action] || 'bg-[#2a2a2a] text-[#aaa]'}>
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-sm font-bold text-[#f0f0f0]">{log.performedByName}</span>
                          <span className="text-xs text-[#555] font-mono">{timeAgo(log.timestamp)}</span>
                        </div>
                        <p className="text-sm text-[#888]">{log.details}</p>
                        <p className="text-xs text-[#555] mt-1 font-mono">{formatDateTime(log.timestamp)}</p>
                      </div>
                      <div className="text-xs text-[#555] flex-shrink-0">
                        <span className="bg-[#1a1a1a] px-2 py-0.5 border-2 border-[#2d2d2d] font-mono text-xs">{log.targetType}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={showClear}
        onOpenChange={setShowClear}
        title="Clear all audit logs?"
        description={`This permanently deletes all ${logs.length} logged actions. This cannot be undone.`}
        confirmLabel="Clear Logs"
        destructive
        loading={clearing}
        onConfirm={clearLogs}
      />
    </div>
  );
}
