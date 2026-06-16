'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { AuditLog } from '@/types';

const ACTION_COLORS: Record<string, string> = {
  CREATE_MEMBER: 'bg-green-500/20 text-green-300',
  UPDATE_MEMBER: 'bg-blue-500/20 text-blue-300',
  DEACTIVATE_MEMBER: 'bg-red-500/20 text-red-300',
  CREATE_TASK: 'bg-orange-500/20 text-orange-300',
  UPDATE_TASK: 'bg-yellow-500/20 text-yellow-300',
  DELETE_TASK: 'bg-red-500/20 text-red-300',
  SUBMIT_TASK: 'bg-purple-500/20 text-purple-300',
  APPROVE_SUBMISSION: 'bg-green-500/20 text-green-300',
  REJECT_SUBMISSION: 'bg-red-500/20 text-red-300',
  CREATE_LINK: 'bg-blue-500/20 text-blue-300',
  DELETE_LINK: 'bg-red-500/20 text-red-300',
  CREATE_COHORT: 'bg-teal-500/20 text-teal-300',
  SEED_MEMBERS: 'bg-orange-500/20 text-orange-300',
  SETUP_TABLES: 'bg-slate-700 text-slate-300',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/audit-logs?limit=200')
      .then(r => r.json())
      .then(d => { if (d.success) setLogs(d.data); })
      .catch(() => toast.error('Failed to load logs'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.performedByName.toLowerCase().includes(search.toLowerCase()) ||
    l.details.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Audit Logs</h1>
        <p className="text-sm text-slate-400 mt-1">{logs.length} logged actions</p>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input placeholder="Search by action, user, or details..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No logs found</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800">
              {filtered.map(log => (
                <div key={log.logId} className="px-4 py-3 hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge className={ACTION_COLORS[log.action] || 'bg-slate-700 text-slate-300'} style={{ fontSize: '11px' }}>
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-sm font-medium text-slate-100">{log.performedByName}</span>
                        <span className="text-xs text-slate-500">{timeAgo(log.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-400">{log.details}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatDateTime(log.timestamp)}</p>
                    </div>
                    <div className="text-xs text-slate-500 flex-shrink-0">
                      <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{log.targetType}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
