'use client';
import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, Link2, Plus, X, Loader2,
  Check, XCircle, Star, ExternalLink, Calendar, User, Trash2, Lock, Users, Pencil, UserPlus, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime, timeAgo, isDeadlinePassed, getAssignmentTypeColor, getAssignmentScopeLabel, getDomainColor, getSubdomainColor, getPriorityColor } from '@/lib/utils';
import { getSubmissionTimingLabel } from '@/lib/ratings';
import Link from 'next/link';
import type { Task, Submission } from '@/types';

interface TaskDetailData {
  task: Task;
  submissions: Submission[];
  mySubmission: Submission | null;
  canReview: boolean;
  canSubmit: boolean;
  canDelete: boolean;
  canClose: boolean;
  canEdit: boolean;
  canDelegate: boolean;
  collectiveLockedBy: { memberId: string; memberName: string } | null;
}

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', deadline: '', priority: 'MEDIUM' });
  const [saving, setSaving] = useState(false);
  const [subFilter, setSubFilter] = useState('ALL');
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [delegateMembers, setDelegateMembers] = useState<Array<{ memberId: string; memberName: string; role: string; domain: string | null }>>([]);
  const [delegateSearch, setDelegateSearch] = useState('');
  const [selectedDelegate, setSelectedDelegate] = useState<{ memberId: string; memberName: string; role: string; domain: string | null } | null>(null);
  const [loadingDelegates, setLoadingDelegates] = useState(false);
  const [savingDelegate, setSavingDelegate] = useState(false);

  const filteredSubs = useMemo(() =>
    !data ? [] : data.submissions.filter(s => subFilter === 'ALL' || s.reviewStatus === subFilter),
    [data, subFilter]
  );
  const { page: subPage, setPage: setSubPage, totalPages: subTotalPages, paginatedItems: paginatedSubs } = usePagination(filteredSubs, 7);

  useEffect(() => { fetchTask(); }, [taskId]);

  async function fetchTask() {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const d = await res.json();
      if (d.success) setData(d.data);
      else { toast.error('Task not found'); router.push('/tasks'); }
    } catch { toast.error('Failed to load task'); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) { toast.error('Content is required'); return; }
    setSubmitting(true);
    try {
      const validLinks = links.filter(l => l.trim());
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), links: validLinks }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to submit'); return; }
      toast.success('Submitted successfully!');
      setShowSubmitForm(false);
      setContent('');
      setLinks(['']);
      fetchTask();
    } catch { toast.error('Failed to submit'); }
    finally { setSubmitting(false); }
  }

  async function handleReview(submissionId: string, action: 'APPROVE' | 'REJECT' | 'REVISE') {
    if (!data) return;
    const prevData = data;
    const optimisticStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVISION_REQUESTED';
    setReviewing(submissionId + action);
    setData(d => d ? {
      ...d,
      submissions: d.submissions.map(s => s.submissionId === submissionId ? { ...s, reviewStatus: optimisticStatus } : s),
    } : d);
    try {
      const res = await fetch(`/api/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, action, feedback: feedbackDrafts[submissionId] || '' }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to review'); setData(prevData); return; }
      const msg = action === 'REVISE'
        ? 'Revision requested'
        : `Submission ${action.toLowerCase()}d!${d.ratingAwarded != null ? ` Rating: ${d.ratingAwarded > 0 ? '+' : ''}${d.ratingAwarded}⭐` : ''}`;
      toast.success(msg);
      setFeedbackDrafts(f => { const next = { ...f }; delete next[submissionId]; return next; });
      fetchTask();
    } catch { toast.error('Failed to review submission'); setData(prevData); }
    finally { setReviewing(null); }
  }

  async function closeTask() {
    setClosing(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(data?.task), status: 'CLOSED' }),
      });
      if ((await res.json()).success) { toast.success('Task closed'); setConfirmClose(false); fetchTask(); }
    } finally { setClosing(false); }
  }

  async function deleteTask() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || 'Failed to delete task'); return; }
      toast.success('Task deleted');
      router.push('/tasks');
    } catch { toast.error('Failed to delete task'); }
    finally { setDeleting(false); }
  }

  function openEdit() {
    if (!data) return;
    setEditForm({
      title: data.task.title,
      description: data.task.description,
      deadline: data.task.deadline ? data.task.deadline.slice(0, 16) : '',
      priority: data.task.priority || 'MEDIUM',
    });
    setShowEdit(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.title.trim() || !editForm.description.trim() || !editForm.deadline) {
      toast.error('Title, description and deadline are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to update task'); return; }
      toast.success('Task updated');
      setShowEdit(false);
      fetchTask();
    } catch { toast.error('Failed to update task'); }
    finally { setSaving(false); }
  }

  async function openDelegateModal() {
    setShowDelegateModal(true);
    setDelegateSearch('');
    setSelectedDelegate(null);
    setLoadingDelegates(true);
    try {
      const res = await fetch('/api/members');
      const d = await res.json();
      if (d.success) {
        setDelegateMembers(
          (d.data as any[])
            .filter(m => m.isActive && m.role !== 'BUILDER')
            .map(m => ({ memberId: m.memberId, memberName: m.name, role: m.role, domain: m.domain }))
        );
      }
    } catch { toast.error('Failed to load members'); }
    finally { setLoadingDelegates(false); }
  }

  async function updateDelegates(newList: Array<{ memberId: string; memberName: string }>) {
    if (!data) return;
    setSavingDelegate(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegatedReviewers: newList }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to update'); return; }
      fetchTask();
    } catch { toast.error('Failed to update delegates'); }
    finally { setSavingDelegate(false); }
  }

  async function addDelegate() {
    if (!data || !selectedDelegate) return;
    const current = data.task.delegatedReviewers || [];
    if (current.length >= 2) return;
    await updateDelegates([...current, { memberId: selectedDelegate.memberId, memberName: selectedDelegate.memberName }]);
    setShowDelegateModal(false);
    setSelectedDelegate(null);
  }

  async function removeDelegate(memberId: string) {
    if (!data) return;
    const current = data.task.delegatedReviewers || [];
    await updateDelegates(current.filter(d => d.memberId !== memberId));
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Card><CardContent className="p-6 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
      <Card><CardContent className="p-6 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></CardContent></Card>
    </div>
  );
  if (!data) return null;

  const { task, submissions, mySubmission, canReview, canSubmit, canDelete, canClose, canEdit, canDelegate, collectiveLockedBy } = data;
  const overdue = isDeadlinePassed(task.deadline);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/tasks">
          <Button variant="ghost" size="icon" className="mt-1 flex-shrink-0"><ArrowLeft size={18} /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant={task.status === 'OPEN' ? (overdue ? 'destructive' : 'default') : 'secondary'}>
                  {task.status === 'OPEN' ? (overdue ? 'Overdue' : 'Open') : 'Closed'}
                </Badge>
                <Badge className={getAssignmentTypeColor(task.assignmentType)}>{getAssignmentScopeLabel(task.assignmentType)}</Badge>
                {task.submissionMode === 'COLLECTIVE' && (
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1">
                    <Users size={11} /> Collective
                  </Badge>
                )}
                {task.domain && <Badge className={getDomainColor(task.domain)}>{task.domain}</Badge>}
                {task.subdomain && <Badge className={getSubdomainColor(task.subdomain)}>{task.subdomain}</Badge>}
                {task.priority && <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">{task.title}</h1>
              <div className="flex flex-wrap gap-3 sm:gap-4 mt-2 text-sm text-[#888] font-mono">
                <span className="flex items-center gap-1">
                  <User size={14} /> {task.createdByName}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {timeAgo(task.createdAt)}
                </span>
                <span className={`flex items-center gap-1 ${overdue ? 'text-red-400 font-bold' : ''}`}>
                  <Clock size={14} /> {formatDateTime(task.deadline)}
                </span>
              </div>
            </div>
            {(canEdit || canClose && task.status === 'OPEN' || canDelete) && (
              <div className="flex gap-2 flex-shrink-0">
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <Pencil size={14} />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                )}
                {canClose && task.status === 'OPEN' && (
                  <Button variant="outline" size="sm" onClick={() => setConfirmClose(true)}>
                    <span className="hidden sm:inline">Close Task</span>
                    <span className="sm:hidden">Close</span>
                  </Button>
                )}
                {canDelete && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <Card>
        <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
        <CardContent>
          <p className="text-[#d0d0d0] whitespace-pre-wrap font-mono text-sm leading-relaxed">{task.description}</p>
        </CardContent>
      </Card>

      {/* Rating Info */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2 uppercase tracking-wide"><Star size={14} /> Rating Guide</h3>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-blue-400 font-mono">
            <div><span className="font-bold text-green-400">+2⭐</span> &gt;24h before deadline</div>
            <div><span className="font-bold text-blue-400">+1⭐</span> Last 24h before deadline</div>
            <div><span className="font-bold text-[#888]">+0⭐</span> Within 24h after deadline</div>
            <div><span className="font-bold text-red-400">-1⭐</span> More than 24h after deadline</div>
            <div className="col-span-2 border-t border-blue-500/20 pt-1.5 mt-0.5">
              <span className="font-bold text-red-500">-2⭐</span> <span className="text-blue-500">No submission 24h+ past deadline (auto-close)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delegated Reviewers */}
      {canDelegate && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus size={15} /> Delegated Reviewers
              </CardTitle>
              {(task.delegatedReviewers?.length ?? 0) < 2 && (
                <Button size="sm" variant="outline" onClick={openDelegateModal} disabled={savingDelegate}>
                  <Plus size={13} /> Add
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!task.delegatedReviewers?.length ? (
              <p className="text-sm text-[#555] font-mono">No delegates — task reviewed by default reviewers only</p>
            ) : (
              <div className="space-y-2">
                {task.delegatedReviewers.map(d => (
                  <div key={d.memberId} className="flex items-center justify-between p-2.5 border-2 border-[#2d2d2d] bg-[#111]">
                    <span className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">{d.memberName}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeDelegate(d.memberId)} disabled={savingDelegate}>
                      {savingDelegate ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* My Submission Status */}
      {mySubmission && (
        <Card className={`border-2 ${
          mySubmission.reviewStatus === 'APPROVED'           ? 'border-green-500/40 bg-green-500/5' :
          mySubmission.reviewStatus === 'REJECTED'           ? 'border-red-500/40 bg-red-500/5' :
          mySubmission.reviewStatus === 'REVISION_REQUESTED' ? 'border-orange-500/40 bg-orange-500/5' :
          'border-yellow-500/40 bg-yellow-500/5'
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Your Submission</span>
              <div className="flex items-center gap-2">
                {mySubmission.ratingAwarded != null && (
                  <span className={`text-sm font-bold ${mySubmission.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {mySubmission.ratingAwarded > 0 ? '+' : ''}{mySubmission.ratingAwarded}⭐
                  </span>
                )}
                <Badge variant={
                  mySubmission.reviewStatus === 'APPROVED'           ? 'success' :
                  mySubmission.reviewStatus === 'REJECTED'           ? 'destructive' :
                  mySubmission.reviewStatus === 'REVISION_REQUESTED' ? 'warning' : 'warning'
                }>
                  {mySubmission.reviewStatus === 'REVISION_REQUESTED' ? 'Revision Requested' : mySubmission.reviewStatus}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[#d0d0d0] whitespace-pre-wrap font-mono leading-relaxed">{mySubmission.content}</p>
            {mySubmission.links.length > 0 && (
              <div className="space-y-1">
                {mySubmission.links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-[#FF9900] hover:text-orange-300">
                    <Link2 size={12} />{link}<ExternalLink size={11} />
                  </a>
                ))}
              </div>
            )}
            {mySubmission.reviewFeedback && (
              <div className="border-2 border-[#2d2d2d] bg-[#1a1a1a] p-3 text-sm text-[#d0d0d0]">
                <p className="text-xs font-bold text-[#888] uppercase tracking-wide mb-1">Reviewer Feedback</p>
                <p className="whitespace-pre-wrap font-mono">{mySubmission.reviewFeedback}</p>
              </div>
            )}
            <div className="text-xs text-[#555] font-mono space-y-1">
              <p>Submitted: {formatDateTime(mySubmission.submittedAt)} · {getSubmissionTimingLabel(mySubmission.submittedAt, task.deadline)}</p>
              {mySubmission.reviewedBy && <p>Reviewed by {mySubmission.reviewedByName} · {formatDateTime(mySubmission.reviewedAt!)}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Form */}
      {canSubmit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Submit Your Work</CardTitle>
              {!showSubmitForm && (
                <Button size="sm" onClick={() => setShowSubmitForm(true)}><Plus size={14} /> Submit</Button>
              )}
            </div>
          </CardHeader>
          {showSubmitForm && (
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#aaa] uppercase tracking-wide">Your work / response *</label>
                    <span className={`text-xs font-mono font-bold ${content.length > 100 ? 'text-red-400' : content.length > 80 ? 'text-yellow-400' : 'text-[#555]'}`}>
                      {content.length}/100
                    </span>
                  </div>
                  <Textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Describe what you've done..."
                    className="min-h-[80px]"
                    maxLength={100}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#aaa] uppercase tracking-wide">Links (optional)</label>
                  {links.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={link}
                        onChange={e => setLinks(ls => ls.map((l, j) => j === i ? e.target.value : l))}
                        placeholder="https://..."
                        type="url"
                      />
                      {links.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}>
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  ))}
                  {links.length < 5 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLinks(ls => [...ls, ''])}>
                      <Plus size={14} /> Add link
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setShowSubmitForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting || content.length > 100}>
                    {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : 'Submit Work'}
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      )}

      {/* COLLECTIVE locked */}
      {collectiveLockedBy && task.status === 'OPEN' && !mySubmission && (
        <Card className="bg-purple-500/10 border-purple-500/40">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-purple-300 uppercase tracking-wide">Submission Locked</p>
              <p className="text-sm text-purple-400 mt-0.5">
                <span className="font-bold text-purple-200">{collectiveLockedBy.memberName}</span> has already submitted for this task.
                Once reviewed, the task will either close (approved) or reopen for others (rejected).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {task.status === 'CLOSED' && !mySubmission && (
        <Card className="bg-[#1a1a1a] border-[#2d2d2d]">
          <CardContent className="p-4 text-center text-[#666] text-sm font-mono uppercase tracking-wide">
            This task is closed. No new submissions are being accepted.
          </CardContent>
        </Card>
      )}

      {/* Submissions List (for reviewers) */}
      {canReview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span>Submissions ({submissions.length})</span>
                <div className="flex gap-3 text-xs font-mono font-normal">
                  <span className="text-green-400">{submissions.filter(s => s.reviewStatus === 'APPROVED').length} approved</span>
                  <span className="text-yellow-400">{submissions.filter(s => s.reviewStatus === 'PENDING').length} pending</span>
                  <span className="text-red-400">{submissions.filter(s => s.reviewStatus === 'REJECTED').length} rejected</span>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter */}
            <Select value={subFilter} onValueChange={v => { setSubFilter(v); setSubPage(1); }}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ({submissions.length})</SelectItem>
                <SelectItem value="PENDING">Pending ({submissions.filter(s => s.reviewStatus === 'PENDING').length})</SelectItem>
                <SelectItem value="APPROVED">Approved ({submissions.filter(s => s.reviewStatus === 'APPROVED').length})</SelectItem>
                <SelectItem value="REJECTED">Rejected ({submissions.filter(s => s.reviewStatus === 'REJECTED').length})</SelectItem>
                <SelectItem value="REVISION_REQUESTED">Revision Requested ({submissions.filter(s => s.reviewStatus === 'REVISION_REQUESTED').length})</SelectItem>
              </SelectContent>
            </Select>

            {filteredSubs.length === 0 ? (
              <p className="text-center text-[#555] py-8 text-sm font-mono uppercase tracking-wide">No submissions match filter</p>
            ) : paginatedSubs.map(sub => (
              <div key={sub.submissionId} className={`border-2 p-4 space-y-3 ${
                sub.reviewStatus === 'APPROVED'           ? 'border-green-500/30 bg-green-500/5' :
                sub.reviewStatus === 'REJECTED'           ? 'border-red-500/30 bg-red-500/5' :
                sub.reviewStatus === 'REVISION_REQUESTED' ? 'border-orange-500/30 bg-orange-500/5' :
                'border-[#2d2d2d]'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#f0f0f0] truncate uppercase tracking-wide">{sub.memberName}</p>
                      <p className="text-xs text-[#555] truncate font-mono">
                        {formatDateTime(sub.submittedAt)} · {getSubmissionTimingLabel(sub.submittedAt, task.deadline)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {sub.ratingAwarded != null && (
                      <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                      </span>
                    )}
                    <Badge variant={
                      sub.reviewStatus === 'APPROVED'           ? 'success' :
                      sub.reviewStatus === 'REJECTED'           ? 'destructive' :
                      sub.reviewStatus === 'REVISION_REQUESTED' ? 'warning' : 'warning'
                    }>
                      {sub.reviewStatus === 'REVISION_REQUESTED' ? 'Revision Requested' : sub.reviewStatus}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-[#d0d0d0] whitespace-pre-wrap font-mono leading-relaxed">{sub.content}</p>
                {sub.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sub.links.map((link: string, i: number) => (
                      <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#FF9900] hover:text-orange-300 border border-[#FF9900]/30 px-2 py-1">
                        <Link2 size={11} />{new URL(link).hostname}<ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                )}
                {sub.reviewStatus === 'PENDING' && (
                  <div className="space-y-2 pt-2 border-t border-[#2d2d2d]">
                    <Textarea
                      value={feedbackDrafts[sub.submissionId] || ''}
                      onChange={e => setFeedbackDrafts(f => ({ ...f, [sub.submissionId]: e.target.value }))}
                      placeholder="Feedback for the submitter (optional)..."
                      className="min-h-[60px] text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'APPROVE')}
                      >
                        {reviewing === sub.submissionId + 'APPROVE' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        <span className="truncate">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'REVISE')}
                      >
                        {reviewing === sub.submissionId + 'REVISE' ? <Loader2 size={14} className="animate-spin" /> : null}
                        <span className="truncate">Revise</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'REJECT')}
                      >
                        {reviewing === sub.submissionId + 'REJECT' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        <span className="truncate">Reject</span>
                      </Button>
                    </div>
                  </div>
                )}
                {sub.reviewStatus !== 'PENDING' && sub.reviewFeedback && (
                  <div className="border-2 border-[#2d2d2d] bg-[#1a1a1a] p-3 text-sm text-[#d0d0d0]">
                    <p className="text-xs font-bold text-[#888] uppercase tracking-wide mb-1">Reviewer Feedback</p>
                    <p className="whitespace-pre-wrap font-mono">{sub.reviewFeedback}</p>
                  </div>
                )}
                {sub.reviewStatus !== 'PENDING' && sub.reviewedByName && (
                  <p className="text-xs text-[#555] border-t border-[#1e1e1e] pt-2 font-mono">
                    Reviewed by {sub.reviewedByName} · {formatDateTime(sub.reviewedAt!)}
                  </p>
                )}
              </div>
            ))}
            <Pagination page={subPage} totalPages={subTotalPages} onPageChange={setSubPage} />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close this task?"
        description="No new submissions will be accepted once it's closed."
        confirmLabel="Close Task"
        loading={closing}
        onConfirm={closeTask}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task permanently?"
        description="All submissions for it will remain orphaned. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={deleteTask}
      />

      {/* Delegate Reviewer Modal */}
      <Dialog open={showDelegateModal} onOpenChange={v => { setShowDelegateModal(v); if (!v) setSelectedDelegate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Delegate Reviewer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#888] font-mono">This person will be able to review all submissions for this task on your behalf. They will receive an email notification.</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
              <Input
                placeholder="Search by name..."
                value={delegateSearch}
                onChange={e => setDelegateSearch(e.target.value)}
                className="pl-8"
                autoFocus
              />
            </div>
            {loadingDelegates ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-[#555]" /></div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {delegateMembers
                  .filter(m =>
                    (!delegateSearch || m.memberName.toLowerCase().includes(delegateSearch.toLowerCase())) &&
                    !(task.delegatedReviewers || []).some(d => d.memberId === m.memberId) &&
                    m.memberId !== task.createdBy
                  )
                  .map(m => {
                    const isSelected = selectedDelegate?.memberId === m.memberId;
                    return (
                      <button
                        key={m.memberId}
                        onClick={() => setSelectedDelegate(isSelected ? null : m)}
                        className={`w-full text-left px-3 py-2.5 border-2 transition-all ${
                          isSelected
                            ? 'border-[#FF9900] bg-[#FF9900]/10'
                            : 'border-[#2d2d2d] hover:border-[#FF9900]/50 hover:bg-[#1a1a1a]'
                        }`}
                      >
                        <p className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">{m.memberName}</p>
                        <p className="text-xs text-[#555] font-mono">{m.role}{m.domain ? ` · ${m.domain}` : ''}</p>
                      </button>
                    );
                  })
                }
                {delegateMembers.filter(m =>
                  (!delegateSearch || m.memberName.toLowerCase().includes(delegateSearch.toLowerCase())) &&
                  !(task.delegatedReviewers || []).some(d => d.memberId === m.memberId) &&
                  m.memberId !== task.createdBy
                ).length === 0 && (
                  <p className="text-center text-[#555] py-6 text-sm font-mono">No eligible members found</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDelegateModal(false); setSelectedDelegate(null); }}>Cancel</Button>
            <Button onClick={addDelegate} disabled={!selectedDelegate || savingDelegate}>
              {savingDelegate ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[120px]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deadline *</Label>
              <Input
                type="datetime-local"
                value={editForm.deadline}
                onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                className="[color-scheme:dark]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={editForm.priority} onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
