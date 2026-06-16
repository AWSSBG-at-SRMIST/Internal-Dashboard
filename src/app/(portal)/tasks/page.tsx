'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Search, CheckSquare, Clock, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime, isDeadlinePassed } from '@/lib/utils';
import Link from 'next/link';
import type { Task } from '@/types';

function TaskCard({ task }: { task: Task }) {
  const overdue = isDeadlinePassed(task.deadline);
  const dueLabel = overdue ? 'Overdue' : 'Due';
  const statusColor = task.status === 'OPEN'
    ? (overdue ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900 border-slate-700')
    : 'bg-slate-800 border-slate-700';

  return (
    <Link href={`/tasks/${task.taskId}`}>
      <div className={`border rounded-xl p-4 hover:border-slate-600 transition-all cursor-pointer ${statusColor}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={task.status === 'OPEN' ? (overdue ? 'destructive' : 'default') : 'secondary'} className="text-xs">
                {task.status === 'OPEN' ? (overdue ? 'Overdue' : 'Open') : 'Closed'}
              </Badge>
              <Badge variant="outline" className="text-xs">{task.assignmentType}</Badge>
              {task.domain && <Badge variant="secondary" className="text-xs">{task.domain}</Badge>}
            </div>
            <h3 className="font-semibold text-slate-100 truncate">{task.title}</h3>
            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{task.description}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-500">{task.totalSubmissions} submissions</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-400">
            Assigned to: <span className="font-medium text-slate-300">{task.assignedToName}</span>
          </p>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={12} className={overdue ? 'text-red-400' : 'text-slate-500'} />
            <span className={overdue ? 'text-red-400 font-medium' : ''}>
              {dueLabel}: {formatDateTime(task.deadline)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) setTasks(data.data);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }

  const filtered = tasks.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchDomain = domainFilter === 'ALL' || t.domain === domainFilter;
    return matchSearch && matchStatus && matchDomain;
  });

  const openTasks = filtered.filter(t => t.status === 'OPEN');
  const closedTasks = filtered.filter(t => t.status === 'CLOSED');

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Tasks</h1>
          <p className="text-sm text-slate-400 mt-1">{tasks.length} total tasks</p>
        </div>
        <Link href="/tasks/new">
          <Button><Plus size={16} /> New Task</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Domains</SelectItem>
            <SelectItem value="Technical">Technical</SelectItem>
            <SelectItem value="Corporate">Corporate</SelectItem>
            <SelectItem value="Creatives">Creatives</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'ALL' || domainFilter !== 'ALL') && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('ALL'); setDomainFilter('ALL'); }}>
            <X size={14} /> Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tasks found</p>
          <p className="text-sm mt-1">Try adjusting your filters or create a new task</p>
          <Link href="/tasks/new">
            <Button className="mt-4" variant="outline"><Plus size={14} /> Create Task</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {openTasks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Open ({openTasks.length})</h2>
              <div className="grid gap-3">
                {openTasks.map(task => <TaskCard key={task.taskId} task={task} />)}
              </div>
            </div>
          )}
          {closedTasks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Closed ({closedTasks.length})</h2>
              <div className="grid gap-3 opacity-75">
                {closedTasks.map(task => <TaskCard key={task.taskId} task={task} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
