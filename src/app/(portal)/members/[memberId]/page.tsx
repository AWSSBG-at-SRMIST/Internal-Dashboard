'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Code2, Link2, Camera, Award, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getRoleColor, getDomainColor, formatDate, formatRole } from '@/lib/utils';
import Link from 'next/link';
import type { Member } from '@/types';

export default function MemberProfilePage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMember(); }, [memberId]);

  async function fetchMember() {
    try {
      const memberRes = await fetch(`/api/members/${memberId}`);
      const memberData = await memberRes.json();
      if (memberData.success) {
        setMember(memberData.data);
      } else {
        toast.error('Member not found');
        router.push('/members');
      }
    } catch { toast.error('Failed to load member'); }
    finally { setLoading(false); }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-orange-500" /></div>;
  if (!member) return null;

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4">
        <Link href="/members"><Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button></Link>
        <h1 className="text-xl font-bold text-slate-100">Member Profile</h1>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-100">{member.name}</h2>
                {!member.isActive && <Badge variant="destructive">Inactive</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={getRoleColor(member.role)}>{formatRole(member.role, member.domain)}</Badge>
                {member.domain && member.role !== 'DIRECTOR' && <Badge className={getDomainColor(member.domain)}>{member.domain}</Badge>}
                {member.subdomain && <Badge variant="outline">{member.subdomain}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Mail size={14} className="text-slate-500" />
                  <a href={`mailto:${member.officialEmail}`} className="hover:text-orange-500 truncate">{member.officialEmail}</a>
                </div>
                {member.phone && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone size={14} className="text-slate-500" />
                    <span>{member.phone}</span>
                  </div>
                )}
                {member.github && (
                  <a href={member.github} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Code2 size={14} className="text-slate-500" />
                    <span className="truncate">GitHub</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {member.linkedin && (
                  <a href={member.linkedin} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Link2 size={14} className="text-slate-500" />
                    <span className="truncate">LinkedIn</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {member.instagram && (
                  <a href={member.instagram} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Camera size={14} className="text-slate-500" />
                    <span className="truncate">Instagram</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                {member.builderId && (
                  <a href={member.builderId} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-400 hover:text-orange-500">
                    <Award size={14} className="text-slate-500" />
                    <span className="truncate">AWS Builder ID</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 text-sm">
            {[
              { label: 'Club ID', value: member.clubId },
              { label: 'Registration No.', value: member.regNo },
              { label: 'Department', value: member.department },
              { label: 'Section', value: member.section },
              { label: 'Personal Email', value: member.personalEmail },
              { label: 'WhatsApp', value: member.whatsapp },
              { label: 'Birthday', value: member.birthday ? formatDate(member.birthday) : null },
              { label: 'Faculty Advisor', value: member.faName },
              { label: 'FA Email', value: member.faEmail },
              { label: 'FA Phone', value: member.faPhone },
              { label: 'Meetup', value: member.meetup },
            ].filter(i => i.value).map(item => (
              <div key={item.label} className="flex justify-between py-2 border-b border-slate-800 last:border-0">
                <span className="text-slate-400">{item.label}</span>
                <span className="text-slate-100 font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
