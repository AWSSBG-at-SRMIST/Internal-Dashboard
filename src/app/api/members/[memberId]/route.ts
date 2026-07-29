import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, invalidateSessionsForMember } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canEditMembers, validateRoleScope, canViewMemberPII, stripMemberPII } from '@/lib/permissions';
import { upsertMemberRow, deleteMemberRow } from '@/lib/sheets';
import type { Member } from '@/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!result.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const ratingResult = await db.send(new GetCommand({ TableName: TABLE.RATINGS, Key: { memberId } }));

    // Only the member themselves or a privileged viewer gets unstripped PII.
    const member = (user.memberId === memberId || canViewMemberPII(user))
      ? result.Item
      : stripMemberPII(result.Item);

    return NextResponse.json({ success: true, data: { ...member, rating: ratingResult.Item || null } });
  } catch (error) {
    console.error('Get member error:', error);
    return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  // Presidium and HR & Admin's Manager/Associate can edit anyone; everyone
  // else can only edit their own non-sensitive fields.
  if (!canEditMembers(user) && user.memberId !== memberId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Presidium can change any field including role/domain/subdomain.
    // HR & Admin (non-Presidium canEditMembers) can edit operational fields but NOT role/domain/subdomain.
    // Everyone else can only update their own personal contact fields.
    const allowedFields = isPresidium(user)
      ? ['name', 'role', 'domain', 'subdomain', 'department', 'section', 'phone', 'whatsapp', 'github', 'linkedin', 'instagram', 'meetup', 'builderId', 'personalEmail', 'faName', 'faEmail', 'faPhone', 'isActive', 'clubId', 'regNo']
      : canEditMembers(user)
        ? ['name', 'department', 'section', 'phone', 'whatsapp', 'github', 'linkedin', 'instagram', 'meetup', 'builderId', 'personalEmail', 'faName', 'faEmail', 'faPhone', 'isActive', 'clubId', 'regNo']
        : ['phone', 'github', 'linkedin', 'instagram', 'meetup', 'builderId', 'personalEmail'];

    // These render back as <a href> links client-side (via toProfileLink,
    // which prepends the right base URL for a bare handle like "aarohi1805").
    // A bare handle has no scheme and is always safe; anything that DOES
    // include a scheme must be http(s) — rejects javascript:/data: etc.
    // before it's stored.
    const handleOrUrlFields = ['github', 'linkedin', 'instagram', 'builderId'];
    for (const field of handleOrUrlFields) {
      if (body[field] === undefined || body[field] === '') continue;
      const value = String(body[field]).trim();
      if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) continue; // bare handle, no scheme — fine
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        return NextResponse.json({ error: `${field} must be a valid http/https URL or a plain handle` }, { status: 400 });
      }
    }
    // Meetup doesn't have a clean handle format (meetup.com/members/<id>) —
    // always require a proper http(s) URL for it.
    if (body.meetup) {
      try {
        const parsed = new URL(body.meetup);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        return NextResponse.json({ error: 'meetup must be a valid http or https URL' }, { status: 400 });
      }
    }
    if (body.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.personalEmail)) {
      return NextResponse.json({ error: 'personalEmail must be a valid email address' }, { status: 400 });
    }
    if (body.phone && !/^[+\d][\d\s-]{6,19}$/.test(body.phone)) {
      return NextResponse.json({ error: 'phone must be a valid phone number' }, { status: 400 });
    }

    // Always fetch the current record first — needed both to validate the
    // effective role/domain/subdomain (a partial update must be checked
    // against the fields it's leaving untouched) and to capture the club ID
    // as it stood before this update, in case it's being renamed (the Sheets
    // sync below needs the old ID to find the row it must rename in place).
    const current = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!current.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    const oldClubId: string | undefined = current.Item.clubId;

    if (allowedFields.includes('role') || allowedFields.includes('domain') || allowedFields.includes('subdomain')) {
      const effectiveRole = body.role !== undefined ? body.role : current.Item.role;
      const effectiveDomain = body.domain !== undefined ? body.domain : current.Item.domain;
      const effectiveSubdomain = body.subdomain !== undefined ? body.subdomain : current.Item.subdomain;
      const scopeError = validateRoleScope(effectiveRole, effectiveDomain, effectiveSubdomain);
      if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });
    }

    // domain/subdomain sit on sbg-members' DomainIndex GSI, which throws a
    // ValidationException if the key is ever set to null/empty instead of
    // being omitted — so a cleared domain/subdomain must REMOVE, not SET.
    const setParts: string[] = [];
    const removeParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if ((field === 'domain' || field === 'subdomain') && !body[field]) {
        removeParts.push(`#${field}`);
        exprNames[`#${field}`] = field;
        continue;
      }
      setParts.push(`#${field} = :${field}`);
      exprNames[`#${field}`] = field;
      exprValues[`:${field}`] = body[field];
    }

    if (setParts.length === 0 && removeParts.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const expressionParts: string[] = [];
    if (setParts.length > 0) expressionParts.push(`SET ${setParts.join(', ')}`);
    if (removeParts.length > 0) expressionParts.push(`REMOVE ${removeParts.join(', ')}`);

    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: expressionParts.join(' '),
      ExpressionAttributeNames: exprNames,
      ...(Object.keys(exprValues).length > 0 ? { ExpressionAttributeValues: exprValues } : {}),
    }));

    // Invalidate all active sessions if the member's role or active status changed —
    // their session token carries stale role data and must be re-issued on next login.
    if (
      (body.role !== undefined && allowedFields.includes('role')) ||
      (body.isActive !== undefined && body.isActive === false)
    ) {
      await invalidateSessionsForMember(memberId).catch(console.error);
    }

    await logAction(user, 'UPDATE_MEMBER', 'MEMBER', memberId, `Updated fields: ${Object.keys(body).join(', ')}`);

    const updated = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (updated.Item?.clubId) {
      upsertMemberRow(updated.Item as Member, oldClubId).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canEditMembers(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId } = await params;

  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!existing.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    const { name, clubId } = existing.Item;

    // Permanent delete — submissions/tasks/audit logs keep their own
    // denormalized name snapshots so history still displays correctly; only
    // a "view profile" link to this memberId would 404 afterward.
    await Promise.all([
      db.send(new DeleteCommand({ TableName: TABLE.MEMBERS, Key: { memberId } })),
      db.send(new DeleteCommand({ TableName: TABLE.RATINGS, Key: { memberId } })),
    ]);
    await invalidateSessionsForMember(memberId).catch(console.error);
    await logAction(user, 'DELETE_MEMBER', 'MEMBER', memberId, `Permanently deleted member: ${name}`);
    if (clubId) deleteMemberRow(clubId).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error);
    return NextResponse.json({ error: 'Failed to delete member' }, { status: 500 });
  }
}
