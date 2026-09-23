import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db, TABLE, GetCommand, PutCommand, UpdateCommand } from '@/lib/dynamodb';
import { getCurrentUser } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { uploadToMemberFolder, uploadToFormAttachments } from '@/lib/drive';
import { appendResponseRow, type RespondentIdentity } from '@/lib/sheets';
import { syncResponseFilePermissions } from '@/lib/permission-sync';
import { formatRole } from '@/lib/utils';
import type { FormDef, FormField, FormResponseAnswer, Member } from '@/types';

// File-upload answers arrive as multipart entries named `file:<fieldId>`;
// every other answer arrives as one JSON-encoded `answers` field
// (an array of {fieldId, value}) — simplest correct shape for a single
// one-step submit that can also carry attachments.
export async function POST(req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  try {
    const { formId } = await params;

    if (!(await checkRateLimit(`forms-submit:${getClientIp(req)}`, 20, 10 * 60))) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const formResult = await db.send(new GetCommand({ TableName: TABLE.FORMS, Key: { formId } }));
    const form = formResult.Item as FormDef | undefined;
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    if (!form.acceptingResponses) return NextResponse.json({ error: 'This form is no longer accepting responses' }, { status: 403 });
    if (form.closesAt && new Date(form.closesAt) < new Date()) {
      return NextResponse.json({ error: 'This form has closed' }, { status: 403 });
    }

    const sessionUser = await getCurrentUser();
    if (form.accessMode === 'MEMBERS_ONLY' && !sessionUser) {
      return NextResponse.json({ error: 'You must be signed in to fill this form' }, { status: 401 });
    }

    let member: Member | null = null;
    if (sessionUser) {
      const memberResult = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: sessionUser.memberId } }));
      member = (memberResult.Item as Member) || null;
    }

    const formData = await req.formData();
    const rawAnswers = formData.get('answers');
    const parsedAnswers: Array<{ fieldId: string; value: string | string[] }> =
      typeof rawAnswers === 'string' ? JSON.parse(rawAnswers) : [];
    const answerByField = new Map(parsedAnswers.map(a => [a.fieldId, a.value]));

    const answers: FormResponseAnswer[] = [];
    const missing: string[] = [];

    for (const field of form.fields as FormField[]) {
      if (field.type === 'SECTION_BREAK') continue;

      if (field.type === 'FILE_UPLOAD') {
        const file = formData.get(`file:${field.fieldId}`);
        if (!(file instanceof File) || file.size === 0) {
          if (field.required) missing.push(field.label);
          continue;
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploaded = member?.driveFolderId
          ? await uploadToMemberFolder(member.driveFolderId, file.name, file.type || 'application/octet-stream', buffer)
          : await uploadToFormAttachments(form.title, form.formId, file.name, file.type || 'application/octet-stream', buffer);
        answers.push({ fieldId: field.fieldId, value: file.name, fileUrl: uploaded?.viewUrl, fileId: uploaded?.fileId });
        continue;
      }

      const value = answerByField.get(field.fieldId);
      const isEmpty = value === undefined || value === null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '');
      if (field.required && isEmpty) { missing.push(field.label); continue; }
      if (!isEmpty) answers.push({ fieldId: field.fieldId, value });
    }

    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
    }

    const responseId = nanoid();
    const submittedAt = new Date().toISOString();

    // Auto-filled from the member record — never asked as a form question.
    const identity: RespondentIdentity | null = member ? {
      clubId: member.clubId,
      name: member.name,
      position: formatRole(member.role, member.domain),
      domain: member.domain || '',
      subdomain: member.subdomain || '',
      officialEmail: member.officialEmail,
    } : null;

    await db.send(new PutCommand({
      TableName: TABLE.FORM_RESPONSES,
      Item: {
        formId,
        responseId,
        answers,
        submittedAt,
        respondentMemberId: sessionUser?.memberId || null,
        respondentName: sessionUser?.name || null,
        respondentEmail: sessionUser?.email || null,
        respondentClubId: member?.clubId || null,
        respondentPosition: identity?.position || null,
        respondentDomain: member?.domain || null,
        respondentSubdomain: member?.subdomain || null,
      },
    }));

    await db.send(new UpdateCommand({
      TableName: TABLE.FORMS,
      Key: { formId },
      UpdateExpression: 'SET responseCount = if_not_exists(responseCount, :zero) + :one',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
    }));

    if (form.driveSheetId) {
      appendResponseRow(form.driveSheetId, form, answers, submittedAt, identity)
        .catch(err => console.error('Sheet append failed', err));
    }

    // Files uploaded in this response sit in the respondent's own personal
    // folder — grant the form's viewers real Drive access to them now,
    // rather than waiting for the next cron sync pass.
    if (answers.some(a => a.fileId)) {
      syncResponseFilePermissions(formId, responseId).catch(err => console.error('File permission sync failed', err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Form submit error:', error);
    return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 });
  }
}
