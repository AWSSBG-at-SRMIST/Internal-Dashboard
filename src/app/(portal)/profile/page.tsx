import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, QueryCommand } from '@/lib/dynamodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRoleColor, getDomainColor, getSubdomainColor, getStarColor, formatDate, formatDateTime, formatRole, toProfileLink, toMeetupLink } from '@/lib/utils';
import { getSubmissionTimingLabel } from '@/lib/ratings';
import { isPresidium } from '@/lib/permissions';
import { getProfileCompleteness } from '@/lib/profile-completeness';
import { Mail, ExternalLink } from 'lucide-react';
import EditContactDialog from './EditContactDialog';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const presidium = isPresidium(user);

  const [memberResult, ratingResult, subsResult] = await Promise.all([
    db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: user.memberId } })),
    presidium ? Promise.resolve({ Item: null }) : db.send(new GetCommand({ TableName: TABLE.RATINGS, Key: { memberId: user.memberId } })),
    presidium ? Promise.resolve({ Items: [] }) : db.send(new QueryCommand({
      TableName: TABLE.SUBMISSIONS,
      IndexName: 'MemberIndex',
      KeyConditionExpression: 'memberId = :mid',
      ExpressionAttributeValues: { ':mid': user.memberId },
      Limit: 10,
      ScanIndexForward: false,
    })),
  ]).catch(() => [{ Item: null }, { Item: null }, { Items: [] }]);

  const member = (memberResult as any).Item;
  const rating = (ratingResult as any).Item;
  const recentSubs = (subsResult as any).Items || [];
  const completeness = member ? getProfileCompleteness(member) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">My Profile</h1>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[#f0f0f0] truncate uppercase tracking-wide">{user.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={getRoleColor(user.role, user.domain)}>{formatRole(user.role, user.domain)}</Badge>
                {user.domain && user.role !== 'DIRECTOR' && <Badge className={getDomainColor(user.domain)}>{user.domain}</Badge>}
                {user.subdomain && <Badge className={getSubdomainColor(user.subdomain)}>{user.subdomain}</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm text-[#888]">
                <Mail size={14} className="text-[#555]" />
                <span className="font-mono">{user.email}</span>
              </div>
              <div className="mt-4">
                <EditContactDialog
                  memberId={user.memberId}
                  initial={{
                    phone: member?.phone || '',
                    personalEmail: member?.personalEmail || '',
                    github: member?.github || '',
                    linkedin: member?.linkedin || '',
                    instagram: member?.instagram || '',
                    meetup: member?.meetup || '',
                    builderId: member?.builderId || '',
                  }}
                />
              </div>
            </div>
            {!presidium && (
              <div className="text-right flex-shrink-0">
                <div className={`text-3xl font-bold font-mono ${getStarColor(member?.totalStars || 0)}`}>
                  {(member?.totalStars || 0) > 0 ? '+' : ''}{member?.totalStars || 0}
                </div>
                <div className="text-xs text-[#555] mt-1 uppercase tracking-wide">Stars</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {completeness && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">Profile Completeness</span>
              <span className={`text-sm font-bold font-mono ${completeness.percent === 100 ? 'text-green-400' : 'text-[#FF9900]'}`}>
                {completeness.percent}%
              </span>
            </div>
            <div className="h-2 w-full bg-[#1a1a1a] border border-[#2d2d2d]">
              <div
                className={`h-full ${completeness.percent === 100 ? 'bg-green-400' : 'bg-[#FF9900]'}`}
                style={{ width: `${completeness.percent}%` }}
              />
            </div>
            {completeness.percent === 100 ? (
              <p className="text-xs text-green-400 mt-2">Your profile is fully complete.</p>
            ) : (
              <p className="text-xs text-[#888] mt-2">
                Missing: <span className="text-[#f0f0f0]">{completeness.missing.join(', ')}</span>. Use &quot;Edit
                Contact&quot; above, or ask a Manager/Director to fill the rest in from Manage Members.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {member && (
        <div className={presidium ? '' : 'grid md:grid-cols-2 gap-6'}>
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {member.clubId && <div className="flex items-baseline justify-between gap-4"><span className="text-[#888] flex-shrink-0">Club ID</span><span className="font-bold text-[#e0e0e0] text-right break-all font-mono">{member.clubId}</span></div>}
              {member.regNo && <div className="flex items-baseline justify-between gap-4"><span className="text-[#888] flex-shrink-0">Reg. No.</span><span className="font-bold text-[#e0e0e0] text-right font-mono">{member.regNo}</span></div>}
              {member.department && <div className="flex items-baseline justify-between gap-4"><span className="text-[#888] flex-shrink-0">Department</span><span className="font-bold text-[#e0e0e0] text-right">{member.department}</span></div>}
              {([
                ['github', 'GitHub'], ['linkedin', 'LinkedIn'], ['instagram', 'Instagram'], ['builderId', 'AWS Builder ID'],
              ] as const).map(([field, label]) => {
                const href = toProfileLink(field, member[field]);
                if (!href) return null;
                return (
                  <div key={field} className="flex items-baseline justify-between gap-4">
                    <span className="text-[#888] flex-shrink-0">{label}</span>
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="font-bold text-[#FF9900] text-right break-all font-mono hover:underline inline-flex items-center gap-1 justify-end">
                      {href.replace(/^https?:\/\//, '')} <ExternalLink size={11} className="flex-shrink-0" />
                    </a>
                  </div>
                );
              })}
              {toMeetupLink(member.meetup) && (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[#888] flex-shrink-0">Meetup</span>
                  <a href={toMeetupLink(member.meetup)!} target="_blank" rel="noopener noreferrer"
                    className="font-bold text-[#FF9900] text-right break-all font-mono hover:underline inline-flex items-center gap-1 justify-end">
                    {toMeetupLink(member.meetup)!.replace(/^https?:\/\//, '')} <ExternalLink size={11} className="flex-shrink-0" />
                  </a>
                </div>
              )}
              {member.joinedAt && <div className="flex items-baseline justify-between gap-4"><span className="text-[#888] flex-shrink-0">Joined</span><span className="font-bold text-[#e0e0e0] text-right font-mono">{formatDate(member.joinedAt)}</span></div>}
            </CardContent>
          </Card>

          {!presidium && (
            <Card>
              <CardHeader><CardTitle className="text-base">Performance Stats</CardTitle></CardHeader>
              <CardContent>
                {rating ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Stars', value: `${(member?.totalStars || 0) > 0 ? '+' : ''}${member?.totalStars || 0}⭐`, color: getStarColor(member?.totalStars || 0) },
                      { label: 'Approved', value: rating.approvedCount || 0, color: 'text-green-400' },
                      { label: 'Rejected', value: rating.rejectedCount || 0, color: 'text-red-400' },
                      { label: 'Pending', value: rating.pendingCount || 0, color: 'text-yellow-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-[#1a1a1a] border-2 border-[#2d2d2d] p-3 text-center">
                        <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-[#666] mt-1 uppercase tracking-wide">{s.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[#555] text-sm py-4">No submission history yet</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!presidium && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Submissions</CardTitle></CardHeader>
          <CardContent>
            {recentSubs.length === 0 ? (
              <p className="text-center text-[#555] text-sm py-4">No submissions yet</p>
            ) : (
              <div className="space-y-2">
                {recentSubs.map((sub: any) => (
                  <div key={sub.submissionId} className="flex items-center gap-3 p-3 border-2 border-[#2d2d2d]">
                    <div className={`w-2 h-2 flex-shrink-0 ${sub.reviewStatus === 'APPROVED' ? 'bg-green-400' : sub.reviewStatus === 'REJECTED' ? 'bg-red-400' : sub.reviewStatus === 'REVISION_REQUESTED' ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#f0f0f0] truncate">{sub.taskTitle}</p>
                      <p className="text-xs text-[#555] font-mono">{formatDateTime(sub.submittedAt)} · {getSubmissionTimingLabel(sub.submittedAt, sub.deadline)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.ratingAwarded != null && (
                        <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                        </span>
                      )}
                      <Badge variant={sub.reviewStatus === 'APPROVED' ? 'success' : sub.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'} className="text-xs">
                        {sub.reviewStatus === 'REVISION_REQUESTED' ? 'Revision' : sub.reviewStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
