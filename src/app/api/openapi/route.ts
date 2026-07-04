import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import openapiSpec from '@/data/openapi.json';

// Served from an authenticated route rather than public/ — the spec
// documents every endpoint's auth rules, role enum, and PII field names,
// which is reconnaissance material an unauthenticated caller shouldn't get.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(openapiSpec);
}
