import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canCreateVaultEntry, canViewVaultEntry, canManageVaultEntry } from '@/lib/permissions';
import { resolveVaultShares } from '@/lib/vault';
import { encryptVaultValue } from '@/lib/vault-crypto';
import { randomUUID } from 'crypto';
import type { VaultEntry } from '@/types';

const MAX_TITLE_LENGTH = 200;
const MAX_VALUE_LENGTH = 20000;
const MAX_NOTES_LENGTH = 1000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.VAULT }));
    const entries = (result.Items || []) as VaultEntry[];

    const visible = entries.filter(e => canViewVaultEntry(user, e));
    visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Metadata only — the encrypted value never appears in the list response.
    const summaries = visible.map(e => ({
      entryId: e.entryId,
      title: e.title,
      notes: e.notes,
      createdBy: e.createdBy,
      createdByName: e.createdByName,
      createdByRole: e.createdByRole,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      sharedWith: e.sharedWith,
      canManage: canManageVaultEntry(user, e),
    }));

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    console.error('List vault entries error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault entries' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateVaultEntry(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  try {
    const body = await req.json();
    const { title, value, notes, sharedWith } = body;

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (title.length > MAX_TITLE_LENGTH) return NextResponse.json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` }, { status: 400 });
    if (!value?.trim()) return NextResponse.json({ error: 'Value is required' }, { status: 400 });
    if (value.length > MAX_VALUE_LENGTH) return NextResponse.json({ error: `Value must be ${MAX_VALUE_LENGTH} characters or less` }, { status: 400 });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH)) {
      return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
    }

    const shares = await resolveVaultShares(user, sharedWith);
    if ('error' in shares) return NextResponse.json({ error: shares.error }, { status: 403 });

    const { encryptedValue, iv, authTag } = encryptVaultValue(value);
    const ts = new Date().toISOString();
    const entry: VaultEntry = {
      entryId: randomUUID(),
      title: title.trim(),
      notes: (notes || '').trim(),
      encryptedValue,
      iv,
      authTag,
      createdBy: user.memberId,
      createdByName: user.name,
      createdByRole: user.role,
      createdAt: ts,
      updatedAt: ts,
      sharedWith: shares,
    };

    await db.send(new PutCommand({ TableName: TABLE.VAULT, Item: entry }));
    await logAction(user, 'CREATE_VAULT_ENTRY', 'VAULT', entry.entryId, `Created vault entry: ${entry.title}`);

    return NextResponse.json({
      success: true,
      data: {
        entryId: entry.entryId,
        title: entry.title,
        notes: entry.notes,
        createdBy: entry.createdBy,
        createdByName: entry.createdByName,
        createdByRole: entry.createdByRole,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        sharedWith: entry.sharedWith,
        canManage: true, // the creator can always manage their own entry
      },
    });
  } catch (error) {
    console.error('Create vault entry error:', error);
    return NextResponse.json({ error: 'Failed to create vault entry' }, { status: 500 });
  }
}
