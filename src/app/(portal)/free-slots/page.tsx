import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { db, TABLE, GetCommand } from '@/lib/dynamodb';
import { MembersTabs } from '@/components/ui/members-tabs';
import FreeSlotsClient from './FreeSlotsClient';

export default async function FreeSlotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let mySlots: string[] = [];
  if (!isPresidium(user)) {
    const result = await db.send(new GetCommand({
      TableName: TABLE.FREE_SLOTS,
      Key: { memberId: user.memberId },
    }));
    mySlots = result.Item?.slots ?? [];
  }

  return (
    <div>
      <MembersTabs user={user} />
      <FreeSlotsClient user={user} initialMySlots={mySlots} />
    </div>
  );
}
