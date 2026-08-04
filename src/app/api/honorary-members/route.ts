import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, PutCommand } from '@/lib/dynamodb';
import { getHonoraryMembers } from '@/lib/honorary';
import { isPresidium } from '@/lib/permissions';
import { logAction } from '@/lib/audit';
import { randomUUID } from 'crypto';
import type { HonoraryTag } from '@/types';

const VALID_TAGS: HonoraryTag[] = ['FACULTY_MENTOR', 'INDUSTRIAL_MENTOR', 'FOUNDING_MEMBER', 'ADVISORY'];
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_URL_LENGTH = 500;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const members = await getHonoraryMembers();
    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('List honorary members error:', error);
    return NextResponse.json({ error: 'Failed to fetch honorary members' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
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

    const member = {
      id: randomUUID(),
      name,
      tag,
      description: description || undefined,
      linkedin: linkedin || undefined,
      photoUrl: photoUrl || null,
      order,
      createdAt: new Date().toISOString(),
    };

    await db.send(new PutCommand({ TableName: TABLE.HONORARY_MEMBERS, Item: member }));
    await logAction(user, 'CREATE_HONORARY_MEMBER', 'HONORARY_MEMBER', member.id, `Added honorary member: ${name} (${tag})`);

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Create honorary member error:', error);
    return NextResponse.json({ error: 'Failed to create honorary member' }, { status: 500 });
  }
}
