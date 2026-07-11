import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccessSponsorshipMail } from '@/lib/permissions';
import { createSponsorshipDrafts, MAX_COMPANIES_PER_BATCH, type SponsorshipDraftInput } from '@/lib/sponsorship-outreach';
import { checkRateLimit } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canAccessSponsorshipMail(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Burst protection only — catches a runaway loop/double-submit bug, not a
  // legitimate high-volume day. Plenty of headroom for normal use.
  if (!(await checkRateLimit(`sponsorship-draft:${user.memberId}`, 20, 30))) {
    return NextResponse.json({ error: 'Too many requests in a short time — please slow down and try again.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const companies = body.companies;

    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: 'At least one company is required' }, { status: 400 });
    }
    if (companies.length > MAX_COMPANIES_PER_BATCH) {
      return NextResponse.json({ error: `No more than ${MAX_COMPANIES_PER_BATCH} companies per batch` }, { status: 400 });
    }

    const inputs: SponsorshipDraftInput[] = [];
    for (const c of companies) {
      const companyName = typeof c.companyName === 'string' ? c.companyName.trim() : '';
      const companyEmail = typeof c.companyEmail === 'string' ? c.companyEmail.trim() : '';

      if (!companyName || companyName.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: 'Each company name is required and must be under 200 characters' }, { status: 400 });
      }
      if (!EMAIL_RE.test(companyEmail)) {
        return NextResponse.json({ error: `"${companyEmail || companyName}" is not a valid email address` }, { status: 400 });
      }
      inputs.push({ companyName, companyEmail });
    }

    const results = await createSponsorshipDrafts(user, inputs);
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Sponsorship draft error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create drafts' }, { status: 500 });
  }
}
