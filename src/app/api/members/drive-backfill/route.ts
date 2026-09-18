import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canEditMembers } from '@/lib/permissions';
import { db, TABLE, ScanCommand, UpdateCommand } from '@/lib/dynamodb';
import { createMemberDriveFolder, driveConfigured } from '@/lib/drive';
import type { Member } from '@/types';

// Finds every active member that has a subdomain but no driveFolderId and
// creates their Drive folder + share. Each member is processed sequentially so
// we don't flood the Drive API. Safe to call multiple times — already-foldered
// members are skipped.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEditMembers(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!driveConfigured()) {
    return NextResponse.json(
      { error: 'Drive not configured — set DRIVE_DOMAINS_FOLDER_ID in environment variables' },
      { status: 503 },
    );
  }

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
    const all = (result.Items || []) as Member[];
    const pending = all.filter(m => m.isActive !== false && m.clubId && !m.driveFolderId);

    let created = 0;
    let failed = 0;

    for (const member of pending) {
      const driveResult = await createMemberDriveFolder(member);
      if (driveResult) {
        await db.send(new UpdateCommand({
          TableName: TABLE.MEMBERS,
          Key: { memberId: member.memberId },
          UpdateExpression: 'SET driveFolderId = :fid, drivePermissionId = :pid',
          ExpressionAttributeValues: {
            ':fid': driveResult.folderId,
            ':pid': driveResult.permissionId ?? '',
          },
        }));
        created++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({ success: true, data: { created, failed, total: pending.length } });
  } catch (error) {
    console.error('Drive backfill error:', error);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
