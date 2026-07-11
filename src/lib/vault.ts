import { db, TABLE, ScanCommand } from '@/lib/dynamodb';
import { isPresidium, canViewVaultEntry, canManageVaultEntry, getShareableMembers } from '@/lib/permissions';
import type { SessionUser, VaultEntry, VaultEntrySummary, VaultShareEntry } from '@/types';

// Mirrors GET /api/vault (list) — used by the vault page Server Component for
// the initial render. Keep in sync if the route's logic changes. Strips the
// ciphertext/iv/authTag from every entry — the list view never carries the
// encrypted value, only the single-entry "reveal" endpoint does.
export async function getVisibleVaultEntries(user: SessionUser): Promise<VaultEntrySummary[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE.VAULT }));
  const entries = (result.Items || []) as VaultEntry[];

  const visible = entries.filter(e => canViewVaultEntry(user, e));
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Explicit allowlist rather than destructure-and-discard — a new sensitive
  // field added to VaultEntry later has to be deliberately added here too,
  // instead of silently leaking into the list response by default.
  return visible.map(e => ({
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
}

// Cheap existence check for the sidebar's nav-visibility decision — Presidium
// and Directors always see the Vault link (they can create entries), and
// Builders never can, so only Managers/Associates actually need the table
// touched: they only see it once something's been shared with them.
export async function hasVaultAccess(user: SessionUser): Promise<boolean> {
  if (isPresidium(user) || user.role === 'DIRECTOR') return true;
  if (user.role === 'BUILDER') return false;

  const result = await db.send(new ScanCommand({
    TableName: TABLE.VAULT,
    ProjectionExpression: 'entryId, createdBy, sharedWith',
  }));
  const entries = (result.Items || []) as Pick<VaultEntry, 'entryId' | 'createdBy' | 'sharedWith'>[];
  return entries.some(e => canViewVaultEntry(user, e));
}

// Looks up the active MEMBERS the caller is allowed to share with, and
// resolves a submitted memberId list against that allowlist — rejecting the
// request outright (via the returned `error`) if any id falls outside it,
// rather than silently dropping disallowed entries. Shared by the create and
// update vault routes so the two can't drift apart.
export async function resolveVaultShares(
  user: SessionUser,
  sharedWith: unknown,
): Promise<VaultShareEntry[] | { error: string }> {
  if (sharedWith === undefined) return [];
  if (!Array.isArray(sharedWith)) return { error: 'Invalid sharedWith' };
  if (sharedWith.length === 0) return [];

  const membersResult = await db.send(new ScanCommand({
    TableName: TABLE.MEMBERS,
    ProjectionExpression: 'memberId, #n, #r, #d, isActive',
    ExpressionAttributeNames: { '#n': 'name', '#r': 'role', '#d': 'domain' },
  }));
  const activeMembers = (membersResult.Items || []).filter((m: any) => m.isActive !== false);
  const shareable = getShareableMembers(user, activeMembers as any[]);
  const shareableIds = new Set(shareable.map((m: any) => m.memberId));

  for (const id of sharedWith) {
    if (!shareableIds.has(id)) return { error: 'One or more selected members cannot be shared with' };
  }

  return shareable
    .filter((m: any) => sharedWith.includes(m.memberId))
    .map((m: any) => ({ memberId: m.memberId, memberName: m.name, role: m.role, domain: m.domain }));
}
