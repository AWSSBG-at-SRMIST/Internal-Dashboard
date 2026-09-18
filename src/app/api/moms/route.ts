import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateMoM, isPresidium } from '@/lib/permissions';
import { renderMoMPdf } from '@/lib/mom-pdf';
import { uploadMoMToDrive } from '@/lib/drive';
import { logAction } from '@/lib/audit';
import { db, TABLE, PutCommand, ScanCommand } from '@/lib/dynamodb';
import { randomUUID } from 'crypto';
import type { MoM } from '@/types';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.MOMS }));
    const all = (result.Items || []) as MoM[];

    const visible = isPresidium(user)
      ? all
      : all.filter(m => m.attendeeMemberIds?.includes(user.memberId));

    visible.sort((a, b) => (b.date > a.date ? 1 : -1));

    return NextResponse.json({ success: true, data: visible });
  } catch (err) {
    console.error('GET /api/moms:', err);
    return NextResponse.json({ error: 'Failed to fetch MoMs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canGenerateMoM(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();

    const { meetingType, date, time, platform, preparedBy, reviewedBy, agenda, discussion, scope, meetingDomain, meetingSubdomain } = body;

    if (!Array.isArray(agenda) || !Array.isArray(discussion)) {
      return NextResponse.json({ error: 'Missing structured minutes — generate a preview first' }, { status: 400 });
    }
    if (!scope) return NextResponse.json({ error: 'Meeting scope is required' }, { status: 400 });

    const attendees: Array<{ name: string; role: string }> = Array.isArray(body.attendees)
      ? body.attendees.filter((a: any) => a?.name?.trim()).map((a: any) => ({
          name: String(a.name).trim(),
          role: String(a.role || '').trim(),
        }))
      : [];

    const attendeeMemberIds: string[] = Array.isArray(body.attendees)
      ? body.attendees.filter((a: any) => a?.memberId).map((a: any) => String(a.memberId))
      : [];

    // Generate the PDF
    const displayDate = date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const pdfBuffer = await renderMoMPdf({
      meetingType: meetingType || '',
      date: displayDate,
      time: time || '',
      platform: platform || '',
      preparedBy: preparedBy || user.name,
      reviewedBy: reviewedBy || '',
      attendees,
      agenda,
      discussion,
    });

    const filename = `MoM-${date || 'meeting'}-${(meetingType || 'Meeting').replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;

    // Upload to Drive
    const driveResult = await uploadMoMToDrive(pdfBuffer, filename, scope, meetingDomain || null, meetingSubdomain || null);
    if (!driveResult) {
      return NextResponse.json({ error: 'Failed to upload to Drive — check DRIVE_MOM_FOLDER_ID is configured' }, { status: 500 });
    }

    const mom: MoM = {
      momId: randomUUID(),
      meetingType: meetingType || '',
      date: date || '',
      time: time || '',
      platform: platform || '',
      scope,
      domain: meetingDomain || null,
      subdomain: meetingSubdomain || null,
      driveFileId: driveResult.fileId,
      driveViewUrl: driveResult.viewUrl,
      preparedById: user.memberId,
      preparedByName: user.name,
      reviewedBy: reviewedBy || '',
      attendeeMemberIds,
      attendees,
      createdAt: new Date().toISOString(),
    };

    await db.send(new PutCommand({ TableName: TABLE.MOMS, Item: mom }));

    await logAction(user, 'SAVE_MOM', 'MOM', mom.momId, `Saved MoM "${meetingType || 'Meeting'}" on ${date} (${scope})`);

    return NextResponse.json({ success: true, data: mom }, { status: 201 });
  } catch (err) {
    console.error('POST /api/moms:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save MoM' }, { status: 500 });
  }
}
