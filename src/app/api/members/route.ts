import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, validateRoleScope } from '@/lib/permissions';
import { randomUUID } from 'crypto';

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

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
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

    const scopeError = validateRoleScope(body.role || 'BUILDER', body.domain, body.subdomain);
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

    const memberId = randomUUID();
    const member = {
      memberId,
      clubId: body.clubId || '',
      name: body.name || '',
      regNo: body.regNo || '',
      department: body.department || '',
      section: body.section || '',
      role: body.role || 'BUILDER',
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

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Create member error:', error);
    return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
  }
}
