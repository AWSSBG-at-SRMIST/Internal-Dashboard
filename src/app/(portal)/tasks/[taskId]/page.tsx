'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, Link2, Plus, X, Loader2,
  Check, XCircle, Star, ExternalLink, Calendar, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime, timeAgo, isDeadlinePassed } from '@/lib/utils';
import { getSubmissionTimingLabel } from '@/lib/ratings';
import Link from 'next/link';
import type { Task, Submission } from '@/types';

interface TaskDetailData {
  task: Task;
  submissions: Submission[];
  mySubmission: Submission | null;
  canReview: boolean;
}

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

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

  async function handleReview(submissionId: string, action: 'APPROVE' | 'REJECT') {
    setReviewing(submissionId + action);
    try {
      const res = await fetch(`/api/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, action }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to review'); return; }
      toast.success(`Submission ${action.toLowerCase()}d! ${d.ratingAwarded ? `Rating: ${d.ratingAwarded > 0 ? '+' : ''}${d.ratingAwarded}⭐` : ''}`);
      fetchTask();
    } catch { toast.error('Failed to review submission'); }
    finally { setReviewing(null); }
  }

  async function closeTask() {
    if (!confirm('Close this task? No new submissions will be accepted.')) return;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(data?.task), status: 'CLOSED' }),
    });
    if ((await res.json()).success) { toast.success('Task closed'); fetchTask(); }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 size={32} className="animate-spin text-orange-500" />
    </div>
  );
  if (!data) return null;

  const { task, submissions, mySubmission, canReview } = data;
  const overdue = isDeadlinePassed(task.deadline);
  const canSubmit = task.status === 'OPEN' && !mySubmission;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/tasks">
          <Button variant="ghost" size="icon" className="mt-1"><ArrowLeft size={18} /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-2">
            <Badge variant={task.status === 'OPEN' ? (overdue ? 'destructive' : 'default') : 'secondary'}>
              {task.status === 'OPEN' ? (overdue ? 'Overdue' : 'Open') : 'Closed'}
            </Badge>
            <Badge variant="outline">{task.assignmentType}</Badge>
            {task.domain && <Badge variant="secondary">{task.domain}</Badge>}
            {task.subdomain && <Badge variant="outline">{task.subdomain}</Badge>}
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{task.title}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
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
        {canReview && task.status === 'OPEN' && (
          <Button variant="outline" size="sm" onClick={closeTask}>Close Task</Button>
        )}
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
            <div>+3⭐ &gt;24h before deadline</div>
            <div>+2⭐ Last 24h before deadline</div>
            <div>+1⭐ Within 24h after deadline</div>
            <div>-1⭐ More than 24h after deadline</div>
          </div>
        </CardContent>
      </Card>

      {/* My Submission Status */}
      {mySubmission && (
        <Card className={`border-2 ${
          mySubmission.reviewStatus === 'APPROVED' ? 'border-green-500/40 bg-green-500/5' :
          mySubmission.reviewStatus === 'REJECTED' ? 'border-red-500/40 bg-red-500/5' :
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
                <Badge variant={mySubmission.reviewStatus === 'APPROVED' ? 'success' : mySubmission.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'}>
                  {mySubmission.reviewStatus}
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
                sub.reviewStatus === 'APPROVED' ? 'border-green-500/30 bg-green-500/5' :
                sub.reviewStatus === 'REJECTED' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">
                      {sub.memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-100">{sub.memberName}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(sub.submittedAt)} · {getSubmissionTimingLabel(sub.submittedAt, task.deadline)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sub.ratingAwarded != null && (
                      <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                      </span>
                    )}
                    <Badge variant={sub.reviewStatus === 'APPROVED' ? 'success' : sub.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'}>
                      {sub.reviewStatus}
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
                  <div className="flex gap-2 pt-2 border-t border-slate-700">
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
                      variant="destructive"
                      className="flex-1"
                      disabled={!!reviewing}
                      onClick={() => handleReview(sub.submissionId, 'REJECT')}
                    >
                      {reviewing === sub.submissionId + 'REJECT' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Reject
                    </Button>
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
    </div>
  );
}
