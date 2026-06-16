import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, DeleteCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium } from '@/lib/permissions';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Only the presidium can delete cohorts' }, { status: 403 });
  }

  const { cohortId } = await params;

  try {
    await db.send(new DeleteCommand({ TableName: TABLE.COHORTS, Key: { cohortId } }));
    await logAction(user, 'DELETE_COHORT', 'COHORT', cohortId, 'Deleted cohort');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete cohort' }, { status: 500 });
  }
}
