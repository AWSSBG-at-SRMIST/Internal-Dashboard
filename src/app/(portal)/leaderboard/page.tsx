import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getFullLeaderboard } from '@/lib/leaderboard';
import LeaderboardClient from './LeaderboardClient';

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const leaderboard = await getFullLeaderboard(user);

  return <LeaderboardClient initialLeaderboard={leaderboard} />;
}
