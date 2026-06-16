import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { nanoid } from 'nanoid';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.LINKS }));
    const links = (result.Items || []).sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { originalUrl, description, customCode } = await req.json();
    if (!originalUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    try { new URL(originalUrl); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const shortCode = customCode?.trim() || nanoid(7);
    const link = {
      shortCode,
      originalUrl,
      description: description || '',
      createdBy: user.memberId,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      clicks: 0,
    };

    await db.send(new PutCommand({
      TableName: TABLE.LINKS,
      Item: link,
      ConditionExpression: 'attribute_not_exists(shortCode)',
    }));

    await logAction(user, 'CREATE_LINK', 'LINK', shortCode, `Created short link: ${shortCode} → ${originalUrl}`);
    return NextResponse.json({ success: true, data: link });
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Short code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
