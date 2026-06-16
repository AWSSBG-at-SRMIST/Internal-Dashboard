import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!result.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const ratingResult = await db.send(new GetCommand({ TableName: TABLE.RATINGS, Key: { memberId } }));

    return NextResponse.json({ success: true, data: { ...result.Item, rating: ratingResult.Item || null } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  // Only super admins can edit others; members can edit their own non-sensitive fields
  if (!isPresidium(user) && user.memberId !== memberId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const allowedFields = isPresidium(user)
      ? ['name', 'role', 'domain', 'subdomain', 'department', 'phone', 'birthday', 'github', 'linkedin', 'meetup', 'builderId', 'personalEmail', 'isActive', 'clubId', 'regNo']
      : ['phone', 'birthday', 'github', 'linkedin', 'meetup', 'personalEmail'];

    const updateParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateParts.push(`#${field} = :${field}`);
        exprNames[`#${field}`] = field;
        exprValues[`:${field}`] = body[field];
      }
    }

    if (updateParts.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    }));

    await logAction(user, 'UPDATE_MEMBER', 'MEMBER', memberId, `Updated fields: ${Object.keys(body).join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId } = await params;

  try {
    // Soft delete: set isActive to false
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET isActive = :false',
      ExpressionAttributeValues: { ':false': false },
    }));
    await logAction(user, 'DEACTIVATE_MEMBER', 'MEMBER', memberId, 'Member deactivated');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to deactivate member' }, { status: 500 });
  }
}
