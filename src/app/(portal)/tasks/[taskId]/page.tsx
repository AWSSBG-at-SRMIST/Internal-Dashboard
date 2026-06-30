'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, Link2, Plus, X, Loader2,
  Check, XCircle, Star, ExternalLink, Calendar, User, Trash2, Lock, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
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
    // Optimistic: flip the submission's status immediately; reconciled with
    // authoritative data (ratingAwarded, reviewedByName) once the request settles.
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

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
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

  const { task, submissions, mySubmission, canReview, canSubmit, canDelete, canClose, collectiveLockedBy } = data;
  const overdue = isDeadlinePassed(task.deadline);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/tasks">
          <Button variant="ghost" size="icon" className="mt-1 flex-shrink-0"><ArrowLeft size={18} /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
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
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{task.title}</h1>
              <div className="flex flex-wrap gap-3 sm:gap-4 mt-2 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <User size={14} /> Created by {task.createdByName}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {timeAgo(task.createdAt)}
                </span>
                <span className={`flex items-center gap-1 ${overdue ? 'text-red-400 font-medium' : ''}`}>
                  <Clock size={14} /> Due: {formatDateTime(task.deadline)}
                </span>
              </div>
            </div>
            {(canClose && task.status === 'OPEN' || canDelete) && (
              <div className="flex gap-2 flex-shrink-0">
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
          <p className="text-slate-300 whitespace-pre-wrap">{task.description}</p>
        </CardContent>
      </Card>

      {/* Rating Info */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2"><Star size={14} /> Rating Guide</h3>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-blue-400">
            <div><span className="font-bold text-green-400">+2⭐</span> &gt;24h before deadline</div>
            <div><span className="font-bold text-blue-400">+1⭐</span> Last 24h before deadline</div>
            <div><span className="font-bold text-slate-400">+0⭐</span> Within 24h after deadline</div>
            <div><span className="font-bold text-red-400">-1⭐</span> More than 24h after deadline</div>
          </div>
          <p className="text-xs text-blue-500 mt-2">Priority multiplier: LOW×1 · MEDIUM×1.5 · HIGH×2</p>
        </CardContent>
      </Card>

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
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{mySubmission.content}</p>
            {mySubmission.links.length > 0 && (
              <div className="space-y-1">
                {mySubmission.links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400">
                    <Link2 size={12} />{link}<ExternalLink size={11} />
                  </a>
                ))}
              </div>
            )}
            {mySubmission.reviewFeedback && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-300">
                <p className="text-xs font-medium text-slate-400 mb-1">Reviewer feedback</p>
                <p className="whitespace-pre-wrap">{mySubmission.reviewFeedback}</p>
              </div>
            )}
            <div className="text-xs text-slate-500 space-y-1">
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
                  <label className="text-sm font-medium text-slate-300">Your work / response *</label>
                  <Textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Describe what you've done, include key details, findings, or deliverables..."
                    className="min-h-[120px]"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Links (optional)</label>
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
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : 'Submit Work'}
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      )}

      {/* COLLECTIVE locked — someone has submitted, waiting for review */}
      {collectiveLockedBy && task.status === 'OPEN' && !mySubmission && (
        <Card className="bg-purple-500/10 border-purple-500/40">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-purple-300">Submission locked</p>
              <p className="text-sm text-purple-400 mt-0.5">
                <span className="font-medium text-purple-200">{collectiveLockedBy.memberName}</span> has already submitted for this task.
                Once reviewed, the task will either close (approved) or reopen for others (rejected).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {task.status === 'CLOSED' && !mySubmission && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center text-slate-400 text-sm">
            This task is closed. No new submissions are being accepted.
          </CardContent>
        </Card>
      )}

      {/* Submissions List (for reviewers) */}
      {canReview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Submissions ({submissions.length})</span>
              <div className="flex gap-2 text-xs">
                <span className="text-green-400">{submissions.filter(s => s.reviewStatus === 'APPROVED').length} approved</span>
                <span className="text-yellow-400">{submissions.filter(s => s.reviewStatus === 'PENDING').length} pending</span>
                <span className="text-red-400">{submissions.filter(s => s.reviewStatus === 'REJECTED').length} rejected</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {submissions.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">No submissions yet</p>
            ) : submissions.map(sub => (
              <div key={sub.submissionId} className={`border rounded-xl p-4 space-y-3 ${
                sub.reviewStatus === 'APPROVED'           ? 'border-green-500/30 bg-green-500/5' :
                sub.reviewStatus === 'REJECTED'           ? 'border-red-500/30 bg-red-500/5' :
                sub.reviewStatus === 'REVISION_REQUESTED' ? 'border-orange-500/30 bg-orange-500/5' :
                'border-slate-700'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{sub.memberName}</p>
                      <p className="text-xs text-slate-500 truncate">
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
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{sub.content}</p>
                {sub.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sub.links.map((link: string, i: number) => (
                      <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 border border-orange-500/30 rounded px-2 py-1">
                        <Link2 size={11} />{new URL(link).hostname}<ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                )}
                {sub.reviewStatus === 'PENDING' && (
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <Textarea
                      value={feedbackDrafts[sub.submissionId] || ''}
                      onChange={e => setFeedbackDrafts(f => ({ ...f, [sub.submissionId]: e.target.value }))}
                      placeholder="Feedback for the submitter (optional)..."
                      className="min-h-[60px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'APPROVE')}
                      >
                        {reviewing === sub.submissionId + 'APPROVE' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'REVISE')}
                      >
                        {reviewing === sub.submissionId + 'REVISE' ? <Loader2 size={14} className="animate-spin" /> : null}
                        Request Revision
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        disabled={!!reviewing}
                        onClick={() => handleReview(sub.submissionId, 'REJECT')}
                      >
                        {reviewing === sub.submissionId + 'REJECT' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
                {sub.reviewStatus !== 'PENDING' && sub.reviewFeedback && (
                  <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-300">
                    <p className="text-xs font-medium text-slate-400 mb-1">Reviewer feedback</p>
                    <p className="whitespace-pre-wrap">{sub.reviewFeedback}</p>
                  </div>
                )}
                {sub.reviewStatus !== 'PENDING' && sub.reviewedByName && (
                  <p className="text-xs text-slate-500 border-t border-slate-800 pt-2">
                    Reviewed by {sub.reviewedByName} · {formatDateTime(sub.reviewedAt!)}
                  </p>
                )}
              </div>
            ))}
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
    </div>
  );
}
