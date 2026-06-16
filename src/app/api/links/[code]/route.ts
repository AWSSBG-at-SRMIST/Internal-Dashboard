import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, DeleteCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await db.send(new GetCommand({ TableName: TABLE.LINKS, Key: { shortCode: code } }));
  if (!result.Item) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: result.Item });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.LINKS, Key: { shortCode: code } }));
    if (!result.Item) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    if (result.Item.createdBy !== user.memberId && !isPresidium(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.send(new DeleteCommand({ TableName: TABLE.LINKS, Key: { shortCode: code } }));
    await logAction(user, 'DELETE_LINK', 'LINK', code, `Deleted short link: ${code}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 });
  }
}
