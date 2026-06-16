import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import { verifyOTP, deleteOTP, createSession, setSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth';
import type { SessionUser } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const isValid = await verifyOTP(normalizedEmail, otp.trim());
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 });
    }

    // Get member details
    const result = await db.send(new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'officialEmail = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail },
    }));

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = result.Items[0];

    if (!member.isActive) {
      return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 403 });
    }

    await deleteOTP(normalizedEmail);

    const sessionUser: SessionUser = {
      memberId: member.memberId,
      name: member.name,
      email: member.officialEmail,
      role: member.role,
      domain: member.domain || null,
      subdomain: member.subdomain || null,
    };

    const token = await createSession(sessionUser);
    const cookieOpts = setSessionCookie(token);

    const response = NextResponse.json({ success: true, user: sessionUser });
    response.cookies.set(cookieOpts);
    return response;
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 });
  }
}
