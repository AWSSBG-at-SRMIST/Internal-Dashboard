import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canAccessSponsorshipMail } from '@/lib/permissions';
import { getSponsorshipOutreachLog } from '@/lib/sponsorship-outreach';
import SponsorshipOutreachClient from './SponsorshipOutreachClient';

export default async function SponsorshipOutreachPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessSponsorshipMail(user)) redirect('/dashboard');

  const initialLog = await getSponsorshipOutreachLog(user);

  return <SponsorshipOutreachClient initialLog={initialLog} />;
}
