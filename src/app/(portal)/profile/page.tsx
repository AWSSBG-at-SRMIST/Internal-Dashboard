import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, QueryCommand } from '@/lib/dynamodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getRoleColor, getDomainColor, getStarColor, formatDate, formatDateTime, formatRole } from '@/lib/utils';
import { getSubmissionTimingLabel } from '@/lib/ratings';
import { isPresidium } from '@/lib/permissions';
import { Mail } from 'lucide-react';

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
  const initials = user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold text-slate-100">My Profile</h1>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-100">{user.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={getRoleColor(user.role)}>{formatRole(user.role, user.domain)}</Badge>
                {user.domain && user.role !== 'DIRECTOR' && <Badge className={getDomainColor(user.domain)}>{user.domain}</Badge>}
                {user.subdomain && <Badge variant="outline">{user.subdomain}</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm text-slate-400">
                <Mail size={14} className="text-slate-500" />
                <span>{user.email}</span>
              </div>
            </div>
            {!presidium && (
              <div className="text-right">
                <div className={`text-3xl font-bold ${getStarColor(member?.totalStars || 0)}`}>
                  {(member?.totalStars || 0) > 0 ? '+' : ''}{member?.totalStars || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1">Stars</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {member && (
        <div className={presidium ? '' : 'grid md:grid-cols-2 gap-6'}>
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {member.clubId && <div className="flex justify-between"><span className="text-slate-400">Club ID</span><span className="font-medium text-slate-200">{member.clubId}</span></div>}
              {member.regNo && <div className="flex justify-between"><span className="text-slate-400">Reg. No.</span><span className="font-medium text-slate-200">{member.regNo}</span></div>}
              {member.department && <div className="flex justify-between"><span className="text-slate-400">Department</span><span className="font-medium text-slate-200">{member.department}</span></div>}
              {member.builderId && <div className="flex justify-between"><span className="text-slate-400">Builder ID</span><span className="font-medium text-slate-200">{member.builderId}</span></div>}
              {member.birthday && <div className="flex justify-between"><span className="text-slate-400">Birthday</span><span className="font-medium text-slate-200">{formatDate(member.birthday)}</span></div>}
              {member.joinedAt && <div className="flex justify-between"><span className="text-slate-400">Joined</span><span className="font-medium text-slate-200">{formatDate(member.joinedAt)}</span></div>}
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
                      <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                        <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-slate-400 mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 text-sm py-4">No submission history yet</p>
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
              <p className="text-center text-slate-500 text-sm py-4">No submissions yet</p>
            ) : (
              <div className="space-y-3">
                {recentSubs.map((sub: any) => (
                  <div key={sub.submissionId} className="flex items-center gap-3 p-3 border border-slate-800 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${sub.reviewStatus === 'APPROVED' ? 'bg-green-400' : sub.reviewStatus === 'REJECTED' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{sub.taskTitle}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(sub.submittedAt)} · {getSubmissionTimingLabel(sub.submittedAt, sub.deadline)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.ratingAwarded != null && (
                        <span className={`text-xs font-bold ${sub.ratingAwarded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sub.ratingAwarded > 0 ? '+' : ''}{sub.ratingAwarded}⭐
                        </span>
                      )}
                      <Badge variant={sub.reviewStatus === 'APPROVED' ? 'success' : sub.reviewStatus === 'REJECTED' ? 'destructive' : 'warning'} className="text-xs">
                        {sub.reviewStatus}
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
