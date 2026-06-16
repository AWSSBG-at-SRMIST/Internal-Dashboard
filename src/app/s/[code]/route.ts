import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.LINKS, Key: { shortCode: code } }));
    if (!result.Item) {
      return new NextResponse(`<html><body><h1>Link not found</h1><p>The short link <strong>${code}</strong> does not exist.</p></body></html>`, {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Increment click count (fire and forget)
    db.send(new UpdateCommand({
      TableName: TABLE.LINKS,
      Key: { shortCode: code },
      UpdateExpression: 'SET clicks = clicks + :one',
      ExpressionAttributeValues: { ':one': 1 },
    })).catch(console.error);

    return NextResponse.redirect(result.Item.originalUrl, { status: 301 });
  } catch (error) {
    return NextResponse.redirect(new URL('/', req.url));
  }
}
