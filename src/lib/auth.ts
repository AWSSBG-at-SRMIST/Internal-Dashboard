import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { db, TABLE, GetCommand, PutCommand, DeleteCommand, UpdateCommand, ScanCommand } from './dynamodb';
import type { SessionUser } from '@/types';

const SESSION_TTL = 7 * 24 * 60 * 60;
const OTP_TTL = 5 * 60;
const OTP_RESEND_COOLDOWN = 60; // seconds between resends
const OTP_MAX_ATTEMPTS = 5;
const SESSION_COOKIE = 'sbg_session';

function hashOTP(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

function randomToken(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Cryptographically secure random is unavailable');
  }
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeOTP(email: string, otp: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.send(new PutCommand({
    TableName: TABLE.OTPS,
    Item: { email, otp: hashOTP(otp), expiresAt: now + OTP_TTL, sentAt: now, attempts: 0 },
  }));
}

export async function checkOTPResendCooldown(email: string): Promise<boolean> {
  const result = await db.send(new GetCommand({ TableName: TABLE.OTPS, Key: { email } }));
  if (!result.Item) return false;
  const now = Math.floor(Date.now() / 1000);
  return (now - (result.Item.sentAt || 0)) < OTP_RESEND_COOLDOWN;
}

export async function verifyOTP(email: string, otp: string): Promise<'valid' | 'invalid' | 'expired' | 'locked'> {
  const result = await db.send(new GetCommand({ TableName: TABLE.OTPS, Key: { email } }));
  if (!result.Item) return 'invalid';
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) return 'expired';
  if ((result.Item.attempts || 0) >= OTP_MAX_ATTEMPTS) return 'locked';

  // Check-and-increment the attempt counter atomically so concurrent guesses
  // can't all read the same pre-increment count and bypass the lockout.
  try {
    await db.send(new UpdateCommand({
      TableName: TABLE.OTPS,
      Key: { email },
      UpdateExpression: 'SET attempts = if_not_exists(attempts, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(attempts) OR attempts < :max',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':max': OTP_MAX_ATTEMPTS },
    }));
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') return 'locked';
    throw err;
  }

  if (result.Item.otp !== hashOTP(otp)) return 'invalid';
  return 'valid';
}

export async function deleteOTP(email: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLE.OTPS, Key: { email } }));
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  await db.send(new PutCommand({
    TableName: TABLE.SESSIONS,
    Item: { sessionToken: token, ...user, expiresAt },
  }));
  return token;
}

export async function getSession(token: string): Promise<SessionUser | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.SESSIONS,
    Key: { sessionToken: token },
  }));
  if (!result.Item) return null;
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) return null;
  const { sessionToken, expiresAt, ...user } = result.Item;
  return user as SessionUser;
}

export async function deleteSession(token: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLE.SESSIONS, Key: { sessionToken: token } }));
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSession(token);
}

export function setSessionCookie(token: string): { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite: 'lax'; maxAge: number; path: string } {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'strict' drops the cookie across some same-site redirect/navigation paths
    // (seen on Vercel) — 'lax' still blocks cross-site POST/PUT/DELETE (CSRF)
    // while allowing normal top-level GET navigation within the same site.
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  };
}

export async function invalidateSessionsForMember(memberId: string): Promise<void> {
  const tokens: string[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.SESSIONS,
      FilterExpression: 'memberId = :mid',
      ExpressionAttributeValues: { ':mid': memberId },
      ProjectionExpression: 'sessionToken',
    }));
    tokens.push(...(result.Items || []).map((s: any) => s.sessionToken));
    lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);
  await Promise.all(tokens.map(token =>
    db.send(new DeleteCommand({ TableName: TABLE.SESSIONS, Key: { sessionToken: token } }))
  ));
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
