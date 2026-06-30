'use client';
import { useMemo, useState } from 'react';
import { Plus, Search, CheckSquare, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime, isDeadlinePassed, getAssignmentTypeColor, getAssignmentScopeLabel, getDomainColor, getPriorityColor } from '@/lib/utils';
import Link from 'next/link';
import type { Task } from '@/types';

const PAGE_SIZE = 10;

function TaskCard({ task, index = 0 }: { task: Task; index?: number }) {
  const overdue = isDeadlinePassed(task.deadline);
  const dueLabel = overdue ? 'Overdue' : 'Due';
  const statusColor = task.status === 'OPEN'
    ? (overdue ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900 border-slate-700')
    : 'bg-slate-800 border-slate-700';

  return (
    <Link href={`/tasks/${task.taskId}`}>
      <div
        className={`border rounded-xl p-4 hover:border-slate-600 transition-all cursor-pointer animate-fadeIn ${statusColor}`}
        style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={task.status === 'OPEN' ? (overdue ? 'destructive' : 'default') : 'secondary'} className="text-xs">
                {task.status === 'OPEN' ? (overdue ? 'Overdue' : 'Open') : 'Closed'}
              </Badge>
              <Badge className={`${getAssignmentTypeColor(task.assignmentType)} text-xs`}>{getAssignmentScopeLabel(task.assignmentType)}</Badge>
              {task.domain && <Badge className={`${getDomainColor(task.domain)} text-xs`}>{task.domain}</Badge>}
              {task.priority && <Badge className={`${getPriorityColor(task.priority)} text-xs`}>{task.priority}</Badge>}
            </div>
            <h3 className="font-semibold text-slate-100 truncate">{task.title}</h3>
            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{task.description}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-500">{task.totalSubmissions} submissions</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mt-3 pt-3 border-t border-slate-800">
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

function TaskSection({ title, tasks, dimmed }: { title: string; tasks: Task[]; dimmed?: boolean }) {
  const { page, setPage, totalPages, paginatedItems } = usePagination(tasks, PAGE_SIZE);
  if (tasks.length === 0) return null;
  return (
    <div>
      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${dimmed ? 'text-slate-500' : 'text-slate-400'}`}>
        {title} ({tasks.length})
      </h2>
      <div className={`grid gap-3 ${dimmed ? 'opacity-75' : ''}`}>
        {paginatedItems.map((task, i) => <TaskCard key={task.taskId} task={task} index={i} />)}
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

export default function TasksClient({ initialTasks }: { initialTasks: Task[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const filtered = useMemo(() => initialTasks.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchDomain = domainFilter === 'ALL' || t.domain === domainFilter;
    const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchDomain && matchPriority;
  }), [initialTasks, search, statusFilter, domainFilter, priorityFilter]);

  const openTasks = useMemo(() => filtered.filter(t => t.status === 'OPEN'), [filtered]);
  const closedTasks = useMemo(() => filtered.filter(t => t.status === 'CLOSED'), [filtered]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Tasks</h1>
          <p className="text-sm text-slate-400 mt-1">{initialTasks.length} total tasks</p>
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
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'ALL' || domainFilter !== 'ALL' || priorityFilter !== 'ALL') && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('ALL'); setDomainFilter('ALL'); setPriorityFilter('ALL'); }}>
            <X size={14} /> Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
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
          <TaskSection title="Open" tasks={openTasks} />
          <TaskSection title="Closed" tasks={closedTasks} dimmed />
        </div>
      )}
    </div>
  );
}
