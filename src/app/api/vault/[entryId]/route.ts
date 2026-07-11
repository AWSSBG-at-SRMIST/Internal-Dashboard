import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, PutCommand, DeleteCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canViewVaultEntry, canManageVaultEntry } from '@/lib/permissions';
import { resolveVaultShares } from '@/lib/vault';
import { encryptVaultValue, decryptVaultValue } from '@/lib/vault-crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import type { VaultEntry } from '@/types';

const MAX_TITLE_LENGTH = 200;
const MAX_VALUE_LENGTH = 20000;
const MAX_NOTES_LENGTH = 1000;

// Reveals the decrypted value of a single entry. This is the only place a
// plaintext secret ever leaves the server — every call is rate-limited per
// member and permanently audit-logged (who viewed what, and when).
export async function GET(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.VAULT, Key: { entryId } }));
    const entry = result.Item as VaultEntry | undefined;

    // Same 404 whether the entry doesn't exist or the caller just can't see
    // it — never confirms that a hidden entry exists.
    if (!entry || !canViewVaultEntry(user, entry)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!(await checkRateLimit(`vault-reveal:${user.memberId}`, 20, 60))) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const value = decryptVaultValue(entry.encryptedValue, entry.iv, entry.authTag);
    await logAction(user, 'VIEW_VAULT_ENTRY', 'VAULT', entryId, `Viewed vault entry: ${entry.title}`);

    return NextResponse.json({
      success: true,
      data: {
        entryId: entry.entryId,
        title: entry.title,
        notes: entry.notes,
        value,
        createdBy: entry.createdBy,
        createdByName: entry.createdByName,
        createdByRole: entry.createdByRole,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        sharedWith: entry.sharedWith,
      },
    });
  } catch (error) {
    console.error('Get vault entry error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault entry' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.VAULT, Key: { entryId } }));
    const entry = result.Item as VaultEntry | undefined;
    if (!entry || !canViewVaultEntry(user, entry)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Only the creator (or Presidium) may edit — a share recipient can view
    // but never modify the entry or its share list.
    if (!canManageVaultEntry(user, entry)) {
      return NextResponse.json({ error: 'Only the creator or Presidium can edit this entry' }, { status: 403 });
    }

    const body = await req.json();
    const { title, value, notes, sharedWith } = body;

    if (title !== undefined && !title.trim()) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    if (title !== undefined && title.length > MAX_TITLE_LENGTH) return NextResponse.json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` }, { status: 400 });
    if (value !== undefined && !value.trim()) return NextResponse.json({ error: 'Value cannot be empty' }, { status: 400 });
    if (value !== undefined && value.length > MAX_VALUE_LENGTH) return NextResponse.json({ error: `Value must be ${MAX_VALUE_LENGTH} characters or less` }, { status: 400 });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH)) {
      return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
    }

    const shares = await resolveVaultShares(user, sharedWith);
    if ('error' in shares) return NextResponse.json({ error: shares.error }, { status: 403 });

    const updated: VaultEntry = { ...entry };
    if (title !== undefined) updated.title = title.trim();
    if (notes !== undefined) updated.notes = notes.trim();
    if (sharedWith !== undefined) updated.sharedWith = shares as VaultEntry['sharedWith'];
    if (value !== undefined) {
      const encrypted = encryptVaultValue(value);
      updated.encryptedValue = encrypted.encryptedValue;
      updated.iv = encrypted.iv;
      updated.authTag = encrypted.authTag;
    }
    updated.updatedAt = new Date().toISOString();

    await db.send(new PutCommand({ TableName: TABLE.VAULT, Item: updated }));
    await logAction(user, 'UPDATE_VAULT_ENTRY', 'VAULT', entryId, `Updated vault entry: ${updated.title}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update vault entry error:', error);
    return NextResponse.json({ error: 'Failed to update vault entry' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.VAULT, Key: { entryId } }));
    const entry = result.Item as VaultEntry | undefined;
    if (!entry || !canViewVaultEntry(user, entry)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!canManageVaultEntry(user, entry)) {
      return NextResponse.json({ error: 'Only the creator or Presidium can delete this entry' }, { status: 403 });
    }

    await db.send(new DeleteCommand({ TableName: TABLE.VAULT, Key: { entryId } }));
    await logAction(user, 'DELETE_VAULT_ENTRY', 'VAULT', entryId, `Deleted vault entry: ${entry.title}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete vault entry error:', error);
    return NextResponse.json({ error: 'Failed to delete vault entry' }, { status: 500 });
  }
}
