import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import { storeOTP } from '@/lib/auth';
import { sendOTPEmail } from '@/lib/email';
import { generateOTP } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up member by official email
    const result = await db.send(new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'officialEmail = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail },
    }));

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ error: 'Email not registered. Contact your administrator.' }, { status: 404 });
    }

    const member = result.Items[0];
    if (!member.isActive) {
      return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 403 });
    }

    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp);
    await sendOTPEmail(normalizedEmail, otp, member.name);

    return NextResponse.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
