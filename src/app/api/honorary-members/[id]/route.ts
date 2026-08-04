import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';
import { logAction } from '@/lib/audit';
import type { HonoraryTag } from '@/types';

const VALID_TAGS: HonoraryTag[] = ['FACULTY_MENTOR', 'INDUSTRIAL_MENTOR', 'FOUNDING_MEMBER', 'ADVISORY'];
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_URL_LENGTH = 500;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE.HONORARY_MEMBERS, Key: { id } }));
    if (!existing.Item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const name = (body.name || '').trim();
    const tag = body.tag;
    const description = (body.description || '').trim();
    const linkedin = (body.linkedin || '').trim();
    const photoUrl = (body.photoUrl || '').trim();
    const order = body.order === undefined || body.order === null || body.order === '' ? undefined : Number(body.order);

    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: 'Name is required and must be under 200 characters' }, { status: 400 });
    }
    if (!VALID_TAGS.includes(tag)) {
      return NextResponse.json({ error: 'Invalid tag' }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: 'Description must be under 300 characters' }, { status: 400 });
    }
    if (linkedin.length > MAX_URL_LENGTH || photoUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json({ error: 'URL fields must be under 500 characters' }, { status: 400 });
    }
    if (order !== undefined && (!Number.isFinite(order) || order < 0)) {
      return NextResponse.json({ error: 'Order must be a non-negative number' }, { status: 400 });
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.HONORARY_MEMBERS,
      Key: { id },
      UpdateExpression: 'SET #n = :name, tag = :tag, description = :description, linkedin = :linkedin, photoUrl = :photoUrl, #o = :order, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#n': 'name', '#o': 'order' },
      ExpressionAttributeValues: {
        ':name': name,
        ':tag': tag,
        ':description': description || null,
        ':linkedin': linkedin || null,
        ':photoUrl': photoUrl || null,
        ':order': order ?? null,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    await logAction(user, 'UPDATE_HONORARY_MEMBER', 'HONORARY_MEMBER', id, `Updated honorary member: ${name} (${tag})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update honorary member error:', error);
    return NextResponse.json({ error: 'Failed to update honorary member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE.HONORARY_MEMBERS, Key: { id } }));
    if (!existing.Item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.send(new DeleteCommand({ TableName: TABLE.HONORARY_MEMBERS, Key: { id } }));
    await logAction(user, 'DELETE_HONORARY_MEMBER', 'HONORARY_MEMBER', id, `Removed honorary member: ${existing.Item.name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete honorary member error:', error);
    return NextResponse.json({ error: 'Failed to delete honorary member' }, { status: 500 });
  }
}
