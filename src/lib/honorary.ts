import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import type { HonoraryMember } from '@/types';

const TAG_ORDER: Record<string, number> = {
  FACULTY_MENTOR: 0,
  INDUSTRIAL_MENTOR: 1,
  ADVISORY: 2,
  FOUNDING_MEMBER: 3,
};

// Mirrors GET /api/honorary-members — used by the page's Server Component
// for the initial render. Keep in sync if the route's logic changes.
export async function getHonoraryMembers(): Promise<HonoraryMember[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.HONORARY_MEMBERS }));
  const members = (result.Items || []) as HonoraryMember[];
  members.sort((a, b) => {
    const tagDiff = (TAG_ORDER[a.tag] ?? 99) - (TAG_ORDER[b.tag] ?? 99);
    if (tagDiff !== 0) return tagDiff;
    return (a.order ?? 999) - (b.order ?? 999);
  });
  return members;
}
