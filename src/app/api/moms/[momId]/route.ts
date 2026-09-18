import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isPresidium } from '@/lib/permissions';
import { trashDriveFile } from '@/lib/drive';
import { logAction } from '@/lib/audit';
import { db, TABLE, GetCommand, DeleteCommand } from '@/lib/dynamodb';
import type { MoM } from '@/types';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ momId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPresidium(user)) return NextResponse.json({ error: 'Only Presidium can delete MoMs' }, { status: 403 });

  const { momId } = await params;

  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE.MOMS, Key: { momId } }));
    if (!existing.Item) return NextResponse.json({ error: 'MoM not found' }, { status: 404 });

    const mom = existing.Item as MoM;

    await db.send(new DeleteCommand({ TableName: TABLE.MOMS, Key: { momId } }));

    if (mom.driveFileId) {
      trashDriveFile(mom.driveFileId).catch(console.error);
    }

    await logAction(user, 'DELETE_MOM', 'MOM', momId, `Deleted MoM "${mom.meetingType}" on ${mom.date}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/moms/[momId]:', err);
    return NextResponse.json({ error: 'Failed to delete MoM' }, { status: 500 });
  }
}
