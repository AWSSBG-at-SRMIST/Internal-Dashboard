import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canEditMembers, validateRoleScope, canViewMemberPII, stripMemberPII } from '@/lib/permissions';
import { upsertMemberRow } from '@/lib/sheets';
import { createMemberDriveFolder } from '@/lib/drive';
import { randomUUID } from 'crypto';
import type { Member } from '@/types';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');
    const subdomain = searchParams.get('subdomain');
    const role = searchParams.get('role');
    const search = searchParams.get('search')?.toLowerCase();

    const showAll = searchParams.get('all') === 'true' && isPresidium(user);

    // A domain filter can go straight to the DomainIndex GSI instead of
    // scanning the whole table.
    const result = domain
      ? await db.send(new QueryCommand({
          TableName: TABLE.MEMBERS,
          IndexName: 'DomainIndex',
          KeyConditionExpression: '#d = :domain',
          ExpressionAttributeNames: { '#d': 'domain' },
          ExpressionAttributeValues: { ':domain': domain },
        }))
      : await db.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
    let members = result.Items || [];

    // Inactive members are hidden from everyone except the presidium
    // (who can pass ?all=true to see them for reactivation purposes).
    if (!showAll) members = members.filter((m: any) => m.isActive !== false);

    if (subdomain) members = members.filter((m: any) => m.subdomain === subdomain);
    if (role) members = members.filter((m: any) => m.role === role);
    if (search) members = members.filter((m: any) =>
      m.name?.toLowerCase().includes(search) ||
      m.officialEmail?.toLowerCase().includes(search) ||
      m.clubId?.toLowerCase().includes(search)
    );

    // Sort by name
    members.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    // Strip PII from the list response for non-privileged users.
    if (!canViewMemberPII(user)) {
      members = members.map((m: any) => stripMemberPII(m));
    }

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEditMembers(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const email = (body.officialEmail || '').toLowerCase();
    if (!email) return NextResponse.json({ error: 'officialEmail is required' }, { status: 400 });

    const emailCheck = await db.send(new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'officialEmail = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    }));
    if (emailCheck.Items && emailCheck.Items.length > 0) {
      return NextResponse.json({ error: 'A member with that email already exists' }, { status: 409 });
    }

    const VALID_ROLES = ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE', 'BUILDER'];
    // Non-Presidium HR & Admin staff can create new members (per canEditMembers),
    // but must not be able to hand out Presidium/Director/Manager/Associate roles
    // to themselves or anyone else — mirrors the same restriction PUT already
    // applies (non-Presidium canEditMembers can't touch role/domain/subdomain).
    const roleToUse = isPresidium(user) ? (body.role || 'BUILDER') : 'BUILDER';
    if (!VALID_ROLES.includes(roleToUse)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const scopeError = validateRoleScope(roleToUse, body.domain, body.subdomain);
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

    const memberId = randomUUID();
    const member: Member = {
      memberId,
      clubId: body.clubId || '',
      name: body.name || '',
      regNo: body.regNo || '',
      department: body.department || '',
      section: body.section || '',
      role: roleToUse,
      // domain/subdomain sit on sbg-members' DomainIndex GSI, which throws a
      // ValidationException if the key is ever set to null/empty instead of
      // being omitted (see the same constraint handled in the PUT handler).
      domain: body.domain || undefined,
      subdomain: body.subdomain || undefined,
      officialEmail: email,
      personalEmail: body.personalEmail || '',
      phone: body.phone || '',
      whatsapp: body.whatsapp || '',
      github: body.github || '',
      linkedin: body.linkedin || '',
      instagram: body.instagram || '',
      meetup: body.meetup || '',
      builderId: body.builderId || '',
      faName: body.faName || '',
      faEmail: body.faEmail || '',
      faPhone: body.faPhone || '',
      joinedAt: new Date().toISOString(),
      isActive: true,
      totalStars: 0,
    };

    await db.send(new PutCommand({ TableName: TABLE.MEMBERS, Item: member }));
    await logAction(user, 'CREATE_MEMBER', 'MEMBER', memberId, `Created member: ${member.name}`);
    if (member.clubId) upsertMemberRow(member).catch(console.error);

    // Drive folder creation is fire-and-forget — the DynamoDB record is the
    // source of truth; a folder failure never blocks the member creation.
    if (member.clubId) {
      createMemberDriveFolder(member).then(async result => {
        if (!result) return;
        await db.send(new UpdateCommand({
          TableName: TABLE.MEMBERS,
          Key: { memberId },
          UpdateExpression: 'SET driveFolderId = :fid, drivePermissionId = :pid',
          ExpressionAttributeValues: { ':fid': result.folderId, ':pid': result.permissionId ?? '' },
        }));
      }).catch(console.error);
    }

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Create member error:', error);
    return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
  }
}
