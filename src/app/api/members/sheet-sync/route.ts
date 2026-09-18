import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canEditMembers } from '@/lib/permissions';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { upsertMemberRow } from '@/lib/sheets';
import type { Member } from '@/types';

// Bulk re-syncs all active members from DynamoDB → the "Builders' Information"
// spreadsheet. Useful after a data-import, a batch edit, or when the sheet
// drifts out of sync with the dashboard. Each member is upserted sequentially
// (Sheets API has per-project quotas — parallel bursts hit 429s quickly).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEditMembers(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
    const members = (result.Items || []).filter((m: any) => m.isActive !== false) as Member[];

    let synced = 0;
    let failed = 0;

    for (const member of members) {
      if (!member.clubId) continue;
      try {
        await upsertMemberRow(member);
        synced++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ success: true, data: { synced, failed, total: members.length } });
  } catch (error) {
    console.error('Sheet sync error:', error);
    return NextResponse.json({ error: 'Sheet sync failed' }, { status: 500 });
  }
}
