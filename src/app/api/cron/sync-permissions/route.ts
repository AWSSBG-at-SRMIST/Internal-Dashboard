import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { syncSheetPermissions, syncResponseFilePermissions, loadResponsesWithFiles } from '@/lib/permission-sync';
import type { FormDef } from '@/types';

export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  return (!!bearer && safeEqual(bearer, `Bearer ${secret}`)) || (!!headerSecret && safeEqual(headerSecret, secret));
}

// Re-derives every form's Drive viewer permissions against current
// sbg-members state. This is what actually catches a member leaving the
// club, or a role/domain/subdomain change, well after the original grant —
// the in-request syncs (on form create/editor-change/response-submit) only
// react to events happening inside this app in the moment. Not wired to any
// schedule yet — same pattern as this app's other cron routes until one is
// added to the GitHub Actions workflow.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formsResult = await db.send(new ScanCommand({ TableName: TABLE.FORMS }));
  const forms = (formsResult.Items || []) as FormDef[];

  let sheetsSynced = 0;
  let filesSynced = 0;

  for (const form of forms) {
    await syncSheetPermissions(form);
    sheetsSynced++;

    const responsesWithFiles = await loadResponsesWithFiles(form.formId);
    for (const response of responsesWithFiles) {
      await syncResponseFilePermissions(form.formId, response.responseId);
      filesSynced++;
    }
  }

  return NextResponse.json({ success: true, formsChecked: forms.length, sheetsSynced, filesSynced });
}
