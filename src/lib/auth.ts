import { cookies } from 'next/headers';
import { db, TABLE, GetCommand, PutCommand, DeleteCommand, QueryCommand } from './dynamodb';
import type { SessionUser } from '@/types';

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const OTP_TTL = 5 * 60; // 5 minutes in seconds
const SESSION_COOKIE = 'sbg_session';

function randomToken(): string {
  const arr = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeOTP(email: string, otp: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + OTP_TTL;
  await db.send(new PutCommand({
    TableName: TABLE.OTPS,
    Item: { email, otp, expiresAt },
  }));
}

export async function verifyOTP(email: string, otp: string): Promise<boolean> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.OTPS,
    Key: { email },
  }));
  if (!result.Item) return false;
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) return false;
  return result.Item.otp === otp;
}

export async function deleteOTP(email: string): Promise<void> {
  await db.send(new DeleteCommand({
    TableName: TABLE.OTPS,
    Key: { email },
  }));
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
  await db.send(new DeleteCommand({
    TableName: TABLE.SESSIONS,
    Key: { sessionToken: token },
  }));
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
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
