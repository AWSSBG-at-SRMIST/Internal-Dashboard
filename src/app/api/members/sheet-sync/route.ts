import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canEditMembers, validateRoleScope } from '@/lib/permissions';
import { readAllMembersFromSheet, type SheetMemberRow } from '@/lib/sheets';
import type { Member } from '@/types';

const SYNCED_FIELDS = [
  'name', 'role', 'domain', 'subdomain', 'regNo', 'department', 'officialEmail',
  'personalEmail', 'phone', 'faName', 'faPhone', 'faEmail', 'section',
  'github', 'linkedin', 'meetup', 'builderId',
] as const;

function fieldsDiffer(dbMember: Member, sheetRow: SheetMemberRow): Array<{ field: string; from: unknown; to: unknown }> {
  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const field of SYNCED_FIELDS) {
    const sheetValue = sheetRow[field as keyof SheetMemberRow];
    if (sheetValue === undefined) continue; // sheet doesn't track this field for this row — leave DB value alone
    const dbValue = dbMember[field as keyof Member] ?? null;
    const normalizedSheetValue = sheetValue === '' ? null : sheetValue;
    if (normalizedSheetValue !== (dbValue === '' ? null : dbValue)) {
      diffs.push({ field, from: dbValue, to: normalizedSheetValue });
    }
  }
  return diffs;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEditMembers(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const confirm = body?.confirm === true;

    const sheetRows = await readAllMembersFromSheet();
    if (sheetRows === null) {
      return NextResponse.json({ error: 'Google Sheets integration is not configured' }, { status: 503 });
    }

    const scanResult = await db.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
    const dbMembers = (scanResult.Items || []) as Member[];
    const dbByClubId = new Map(dbMembers.filter(m => m.clubId).map(m => [m.clubId, m]));
    const dbEmails = new Set(dbMembers.map(m => (m.officialEmail || '').toLowerCase()));
    const sheetClubIds = new Set(sheetRows.map(r => r.clubId));

    const added: SheetMemberRow[] = [];
    const changed: Array<{ clubId: string; memberId: string; name: string; fields: Array<{ field: string; from: unknown; to: unknown }> }> = [];
    const skipped: Array<{ clubId: string; reason: string }> = [];

    for (const row of sheetRows) {
      const existing = dbByClubId.get(row.clubId);
      if (!existing) {
        if (!row.officialEmail) { skipped.push({ clubId: row.clubId, reason: 'Missing official email in sheet' }); continue; }
        if (dbEmails.has(row.officialEmail.toLowerCase())) { skipped.push({ clubId: row.clubId, reason: 'Email already used by a different member' }); continue; }
        if (row.role) {
          const scopeError = validateRoleScope(row.role, row.domain, row.subdomain);
          if (scopeError) { skipped.push({ clubId: row.clubId, reason: scopeError }); continue; }
        }
        added.push(row);
        continue;
      }
      const fields = fieldsDiffer(existing, row);
      if (fields.length > 0) {
        if (fields.some(f => f.field === 'role' || f.field === 'domain' || f.field === 'subdomain')) {
          const effectiveRole = (fields.find(f => f.field === 'role')?.to ?? existing.role) as string;
          const effectiveDomain = fields.find(f => f.field === 'domain')?.to ?? existing.domain;
          const effectiveSubdomain = fields.find(f => f.field === 'subdomain')?.to ?? existing.subdomain;
          const scopeError = validateRoleScope(effectiveRole, effectiveDomain as string | null, effectiveSubdomain as string | null);
          if (scopeError) { skipped.push({ clubId: row.clubId, reason: scopeError }); continue; }
        }
        changed.push({ clubId: row.clubId, memberId: existing.memberId, name: existing.name, fields });
      }
    }

    // Present but not touched — informational only. Deletion stays an
    // explicit dashboard action, never an implicit side effect of a sync.
    const removedClubIds = dbMembers
      .filter(m => m.clubId && !sheetClubIds.has(m.clubId))
      .map(m => m.clubId);

    if (!confirm) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: { added: added.length, changed: changed.length, removed: removedClubIds.length, skipped: skipped.length },
        diff: { added, changed, removedClubIds, skipped },
      });
    }

    let createdCount = 0;
    for (const row of added) {
      const memberId = randomUUID();
      const member: Member = {
        memberId,
        clubId: row.clubId,
        name: row.name || '',
        regNo: row.regNo || '',
        department: row.department || '',
        section: row.section || '',
        role: row.role || 'BUILDER',
        domain: row.domain ?? null,
        subdomain: row.subdomain ?? null,
        officialEmail: (row.officialEmail || '').toLowerCase(),
        personalEmail: row.personalEmail || '',
        phone: row.phone || '',
        whatsapp: '',
        github: row.github || '',
        linkedin: row.linkedin || '',
        instagram: '',
        meetup: row.meetup || '',
        builderId: row.builderId || '',
        faName: row.faName || '',
        faEmail: row.faEmail || '',
        faPhone: row.faPhone || '',
        joinedAt: new Date().toISOString(),
        isActive: true,
        totalStars: 0,
      };
      await db.send(new PutCommand({ TableName: TABLE.MEMBERS, Item: member }));
      createdCount++;
    }

    let updatedCount = 0;
    for (const change of changed) {
      const setParts: string[] = [];
      const removeParts: string[] = [];
      const exprNames: Record<string, string> = {};
      const exprValues: Record<string, unknown> = {};
      for (const { field, to } of change.fields) {
        if ((field === 'domain' || field === 'subdomain') && !to) {
          removeParts.push(`#${field}`);
          exprNames[`#${field}`] = field;
          continue;
        }
        setParts.push(`#${field} = :${field}`);
        exprNames[`#${field}`] = field;
        exprValues[`:${field}`] = to;
      }
      const expressionParts: string[] = [];
      if (setParts.length > 0) expressionParts.push(`SET ${setParts.join(', ')}`);
      if (removeParts.length > 0) expressionParts.push(`REMOVE ${removeParts.join(', ')}`);
      await db.send(new UpdateCommand({
        TableName: TABLE.MEMBERS,
        Key: { memberId: change.memberId },
        UpdateExpression: expressionParts.join(' '),
        ExpressionAttributeNames: exprNames,
        ...(Object.keys(exprValues).length > 0 ? { ExpressionAttributeValues: exprValues } : {}),
      }));
      updatedCount++;
    }

    await logAction(
      user, 'SHEET_SYNC', 'MEMBER', 'bulk',
      `Pulled from Google Sheet: ${createdCount} created, ${updatedCount} updated, ${skipped.length} skipped, ${removedClubIds.length} present in DynamoDB but missing from sheet (not deleted)`
    );

    return NextResponse.json({
      success: true,
      dryRun: false,
      summary: { added: createdCount, changed: updatedCount, removed: removedClubIds.length, skipped: skipped.length },
    });
  } catch (error) {
    console.error('Sheet sync error:', error);
    return NextResponse.json({ error: 'Failed to sync from sheet' }, { status: 500 });
  }
}
