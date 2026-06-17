import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canEditMembers, validateRoleScope } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!result.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const ratingResult = await db.send(new GetCommand({ TableName: TABLE.RATINGS, Key: { memberId } }));

    return NextResponse.json({ success: true, data: { ...result.Item, rating: ratingResult.Item || null } });
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
    const allowedFields = canEditMembers(user)
      ? ['name', 'role', 'domain', 'subdomain', 'department', 'section', 'phone', 'whatsapp', 'github', 'linkedin', 'instagram', 'meetup', 'builderId', 'personalEmail', 'faName', 'faEmail', 'faPhone', 'isActive', 'clubId', 'regNo']
      : ['phone', 'github', 'linkedin', 'meetup', 'personalEmail'];

    // URL fields are rendered back as <a href> client-side, so a non-http(s)
    // scheme (e.g. javascript:) would execute in the viewer's session — reject
    // anything that doesn't parse as a plain http/https URL before it's stored.
    const urlFields = ['github', 'linkedin', 'instagram', 'meetup', 'builderId'];
    for (const field of urlFields) {
      if (body[field] === undefined || body[field] === '') continue;
      try {
        const parsed = new URL(body[field]);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        return NextResponse.json({ error: `${field} must be a valid http or https URL` }, { status: 400 });
      }
    }
    if (body.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.personalEmail)) {
      return NextResponse.json({ error: 'personalEmail must be a valid email address' }, { status: 400 });
    }
    if (body.phone && !/^[+\d][\d\s-]{6,19}$/.test(body.phone)) {
      return NextResponse.json({ error: 'phone must be a valid phone number' }, { status: 400 });
    }

    // Validate the role/domain/subdomain combination against what it'll
    // actually be after this update — not just what's in the request body,
    // since a partial update (e.g. only changing role) must be checked
    // against the fields it's leaving untouched.
    if (allowedFields.includes('role') || allowedFields.includes('domain') || allowedFields.includes('subdomain')) {
      const current = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
      if (!current.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
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

    await logAction(user, 'UPDATE_MEMBER', 'MEMBER', memberId, `Updated fields: ${Object.keys(body).join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId } = await params;

  try {
    // Soft delete: set isActive to false
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET isActive = :false',
      ExpressionAttributeValues: { ':false': false },
    }));
    await logAction(user, 'DEACTIVATE_MEMBER', 'MEMBER', memberId, 'Member deactivated');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Deactivate member error:', error);
    return NextResponse.json({ error: 'Failed to deactivate member' }, { status: 500 });
  }
}
