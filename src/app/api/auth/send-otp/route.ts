import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import { storeOTP, checkOTPResendCooldown } from '@/lib/auth';
import { sendOTPEmail } from '@/lib/email';
import { generateOTP } from '@/lib/utils';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

function genericResponse() {
  return NextResponse.json({ success: true, message: 'If this email is registered, an OTP has been sent.' });
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Per-IP throttle to stop an attacker from sweeping the directory for
    // valid/active emails or exhausting the Gmail send quota.
    if (!(await checkRateLimit(`send-otp:${getClientIp(req)}`, 10, 10 * 60))) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await db.send(new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'officialEmail = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail },
    }));

    // Same generic response whether the email is unregistered, inactive, or
    // valid — distinct responses let an attacker enumerate the member directory.
    if (!result.Items || result.Items.length === 0) return genericResponse();

    const member = result.Items[0];
    if (!member.isActive) return genericResponse();

    // Server-side resend cooldown — prevents email spam and DynamoDB cost abuse
    const onCooldown = await checkOTPResendCooldown(normalizedEmail);
    if (onCooldown) return genericResponse();

    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp);
    await sendOTPEmail(normalizedEmail, otp, member.name);

    return genericResponse();
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
