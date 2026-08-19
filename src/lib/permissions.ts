import type { Domain, Subdomain, SessionUser, TaskAssignmentScope, Member, Role } from '@/types';
import { DOMAIN_SUBDOMAINS } from '@/types';

export function isPresidium(actor: SessionUser): boolean {
  return actor.role === 'SECRETARY' || actor.role === 'SBG_LEADER';
}

export function canEditMembers(actor: SessionUser): boolean {
  if (isPresidium(actor)) return true;
  return actor.subdomain === 'HR & Admin' && (actor.role === 'MANAGER' || actor.role === 'ASSOCIATE');
}

// Same privilege bar as canEditMembers — anyone who can edit member records
// can also see their unstripped PII.
export const canViewMemberPII = canEditMembers;

const MEMBER_PII_FIELDS = ['phone', 'personalEmail', 'whatsapp', 'instagram', 'regNo'] as const;

export function stripMemberPII<T extends Record<string, unknown>>(member: T): T {
  const stripped = { ...member };
  for (const f of MEMBER_PII_FIELDS) delete stripped[f];
  return stripped;
}

export function canGenerateMoM(actor: SessionUser): boolean {
  if (isPresidium(actor)) return true;
  if (actor.role === 'DIRECTOR' || actor.role === 'MANAGER' || actor.role === 'ASSOCIATE') return true;
  return actor.subdomain === 'HR & Admin';
}

export function validateRoleScope(role: string, domain?: string | null, subdomain?: string | null): string | null {
  if ((role === 'SBG_LEADER' || role === 'SECRETARY') && (domain || subdomain)) {
    return 'Presidium (SBG Leader/Secretary) cannot have a domain or subdomain';
  }
  if (role === 'DIRECTOR' && subdomain) {
    return 'A Director oversees a whole domain and cannot have a subdomain';
  }
  // Catches typos and pre-rename legacy strings (e.g. a subdomain renamed in
  // DOMAIN_SUBDOMAINS but never migrated on existing records) from ever being
  // written again — the website's Team page groups members by this exact
  // string, so a value outside the canonical list silently renders as its
  // own phantom, always-vacant column instead of matching the real one.
  if (subdomain && domain && domain !== 'General') {
    const valid = DOMAIN_SUBDOMAINS[domain as Exclude<Domain, 'General'>] || [];
    if (!valid.includes(subdomain as Subdomain)) {
      return `"${subdomain}" is not a valid subdomain for ${domain}`;
    }
  }
  return null;
}

// Grants review/approve/reject/close/edit power to the hierarchy standing directly
// above whoever created the task — on top of the creator themself (and any
// explicitly delegated reviewers, checked separately by callers). This is in
// addition to, not instead of, isCreator/isDelegatedReviewer/presidium-on-their-
// own-tasks, which callers keep checking alongside this.
//
//   Associate-created (BUILDERS_ONLY)              -> that subdomain's Manager, that domain's Director
//   Manager-created   (SUBDOMAIN_WIDE, INDIVIDUAL)  -> that domain's Director
//   Director-created  (DOMAIN_WIDE, SUBDOMAIN_LEADERSHIP) -> nobody extra (creator only)
//   Org-wide (ORG_WIDE/GENERAL, whoever created it) -> Presidium, always;
//     also every member of the HR & Admin subdomain (any role), since that
//     subdomain owns org-wide administration.
//   Presidium-created (ALL_DIRECTORS, SINGLE_DIRECTOR) -> handled separately by
//     callers' existing "creatorIsPresidium" check, not by this function.
export function hasHierarchicalReviewAccess(
  actor: SessionUser,
  task: { assignmentType: string; domain?: Domain | null; subdomain?: Subdomain | null },
): boolean {
  const scope = task.assignmentType;

  if (scope === 'ORG_WIDE' || scope === 'GENERAL') {
    return isPresidium(actor) || actor.subdomain === 'HR & Admin';
  }
  if (scope === 'SUBDOMAIN_WIDE' || scope === 'SUBDOMAIN' || scope === 'INDIVIDUAL') {
    return actor.role === 'DIRECTOR' && actor.domain === task.domain;
  }
  if (scope === 'BUILDERS_ONLY') {
    if (actor.role === 'DIRECTOR') return actor.domain === task.domain;
    if (actor.role === 'MANAGER') return actor.domain === task.domain && actor.subdomain === task.subdomain;
    return false;
  }
  return false;
}

// Everyone except BUILDER can create tasks.
// The scope they can use is enforced separately by canCreateScope.
export function canCreateTask(actor: SessionUser): boolean {
  return actor.role !== 'BUILDER';
}

export function canUseLinkShortener(actor: SessionUser): boolean {
  return actor.role !== 'BUILDER';
}

// Presidium always; the Corporate Director specifically (Sponsorship &
// Finance sits under Corporate); and every role within Sponsorship &
// Finance itself (Manager, Associate, and Builder alike — Builders included
// on purpose, since they're the ones actually doing the outreach calls,
// even though they never get direct access to the sponsorship inbox/Drive).
export function canAccessSponsorshipMail(actor: SessionUser): boolean {
  if (isPresidium(actor)) return true;
  if (actor.role === 'DIRECTOR' && actor.domain === 'Corporate') return true;
  return actor.subdomain === 'Sponsorship & Finance';
}

// Scopes the sponsorship outreach LOG view only — sending access itself is
// governed solely by canAccessSponsorshipMail above and is unaffected by this.
// Hierarchical within the Sponsorship & Finance subdomain (the only source of
// non-Director/Presidium entries, since canAccessSponsorshipMail gates who can
// create one): Builder sees only their own; Associate sees own + Builders';
// Manager sees own + Associates' + Builders'; Presidium and the Corporate
// Director see everyone's. Entries from before this field existed
// (createdByRole missing) default to visible-to-all rather than disappearing.
export function canViewSponsorshipLogEntry(
  viewer: SessionUser,
  entry: { createdBy: string; createdByRole?: Role | null },
): boolean {
  if (viewer.memberId === entry.createdBy) return true;
  if (isPresidium(viewer)) return true;
  if (viewer.role === 'DIRECTOR' && viewer.domain === 'Corporate') return true;
  if (!entry.createdByRole) return true; // legacy entry, no role recorded
  if (viewer.role === 'MANAGER') return entry.createdByRole === 'ASSOCIATE' || entry.createdByRole === 'BUILDER';
  if (viewer.role === 'ASSOCIATE') return entry.createdByRole === 'BUILDER';
  return false;
}

// Validates whether the actor can create a task with the given scope + domain/subdomain/assignedToId.
// Returns an error string on failure, null on success.
export function canCreateScope(
  actor: SessionUser,
  scope: TaskAssignmentScope,
  domain?: Domain | null,
  subdomain?: Subdomain | null,
  assignedToId?: string | null,
): string | null {
  if (scope === 'ORG_WIDE') {
    if (isPresidium(actor)) return null;
    if ((actor.role === 'MANAGER' || actor.role === 'ASSOCIATE') && actor.subdomain === 'HR & Admin') return null;
    return 'Only Presidium can create this scope';
  }
  if (scope === 'ALL_DIRECTORS') {
    return isPresidium(actor) ? null : 'Only Presidium can create this scope';
  }
  if (scope === 'SINGLE_DIRECTOR') {
    if (!isPresidium(actor)) return 'Only Presidium can assign to a single Director';
    if (!assignedToId) return 'A target Director must be selected';
    return null;
  }
  if (scope === 'DOMAIN_WIDE') {
    if (actor.role !== 'DIRECTOR') return 'Only Directors can create domain-wide tasks';
    if (actor.domain !== domain) return 'You can only assign to your own domain';
    return null;
  }
  if (scope === 'SUBDOMAIN_LEADERSHIP') {
    if (actor.role !== 'DIRECTOR') return 'Only Directors can assign to subdomain leadership';
    if (actor.domain !== domain) return 'You can only assign within your own domain';
    if (!subdomain) return 'A subdomain must be selected';
    return null;
  }
  if (scope === 'SUBDOMAIN_WIDE') {
    if (actor.role !== 'MANAGER') return 'Only Managers can create subdomain-wide tasks';
    if (actor.domain !== domain || actor.subdomain !== subdomain) return 'You can only assign to your own subdomain';
    return null;
  }
  if (scope === 'INDIVIDUAL') {
    if (actor.role !== 'MANAGER') return 'Only Managers can assign to individuals';
    if (!assignedToId) return 'A target member must be selected';
    return null;
  }
  if (scope === 'BUILDERS_ONLY') {
    if (actor.role !== 'MANAGER' && actor.role !== 'ASSOCIATE') return 'Only Managers or Associates can assign to Builders';
    if (actor.domain !== domain || actor.subdomain !== subdomain) return 'You can only assign within your own subdomain';
    return null;
  }
  return 'Invalid assignment scope';
}

// Returns the full member list for the INDIVIDUAL scope so the API can verify
// the target member is within the Manager's subdomain.
export function canAssignToMember(
  actor: SessionUser,
  target: Pick<Member, 'memberId' | 'role' | 'domain' | 'subdomain'>,
): boolean {
  if (actor.memberId === target.memberId) return false; // no self-assignment
  if (actor.role !== 'MANAGER') return false;
  return actor.domain === target.domain && actor.subdomain === target.subdomain;
}

// Vault: only Presidium/Directors can create entries. Default visibility is
// creator + Presidium (always); `sharedWith` extends that to specific
// Managers/Associates (or Directors, if Presidium shared it). Builders never
// participate — not as creators, not as share recipients.
export function canCreateVaultEntry(actor: SessionUser): boolean {
  return isPresidium(actor) || actor.role === 'DIRECTOR';
}

export function canViewVaultEntry(
  actor: SessionUser,
  entry: { createdBy: string; sharedWith: Array<{ memberId: string }> },
): boolean {
  if (isPresidium(actor)) return true;
  if (entry.createdBy === actor.memberId) return true;
  return entry.sharedWith.some(s => s.memberId === actor.memberId);
}

// Only the creator (or Presidium) may edit/delete/reshare an entry — a share
// recipient can view it but never modify the share list themselves, so
// access can't silently sprawl beyond who the owner intended.
export function canManageVaultEntry(
  actor: SessionUser,
  entry: { createdBy: string },
): boolean {
  return isPresidium(actor) || entry.createdBy === actor.memberId;
}

// Who a given creator is allowed to add to an entry's share list. Presidium
// can share to any Director/Manager/Associate; a Director can only share to
// Managers/Associates within their own domain. Everyone else returns
// nothing, since only Presidium/Directors ever create (and therefore share)
// vault entries in the first place.
export function getShareableMembers<T extends Pick<Member, 'memberId' | 'role' | 'domain'>>(
  sharer: SessionUser,
  members: T[],
): T[] {
  if (isPresidium(sharer)) {
    return members.filter(m => m.role === 'DIRECTOR' || m.role === 'MANAGER' || m.role === 'ASSOCIATE');
  }
  if (sharer.role === 'DIRECTOR') {
    return members.filter(m => (m.role === 'MANAGER' || m.role === 'ASSOCIATE') && m.domain === sharer.domain);
  }
  return [];
}

// Single source of truth for a user's relationship to a task.
// Returns CAN_SUBMIT, VISIBLE_ONLY (oversight without submission rights), or HIDDEN.
// Handles both new scopes and legacy assignment types from old DynamoDB records.
export function getTaskRelationship(
  user: SessionUser,
  task: {
    assignmentType: string;
    assignedToId?: string | null;
    domain?: Domain | null;
    subdomain?: Subdomain | null;
    createdBy: string;
    createdByRole?: string | null;
  },
): 'HIDDEN' | 'VISIBLE_ONLY' | 'CAN_SUBMIT' {
  // Task creators can never submit to their own task
  if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';

  // Presidium never submits — they are always on the review/oversight side.
  if (isPresidium(user)) return 'VISIBLE_ONLY';

  const scope = task.assignmentType;

  // ── New scopes ──────────────────────────────────────────────────────────
  if (scope === 'ORG_WIDE' || scope === 'GENERAL') return 'CAN_SUBMIT';

  if (scope === 'ALL_DIRECTORS') {
    return user.role === 'DIRECTOR' ? 'CAN_SUBMIT' : 'HIDDEN';
  }

  if (scope === 'SINGLE_DIRECTOR') {
    if (task.assignedToId === user.memberId) return 'CAN_SUBMIT';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  if (scope === 'DOMAIN_WIDE' || scope === 'DOMAIN') {
    if (task.domain === user.domain) return 'CAN_SUBMIT';
    return 'HIDDEN';
  }

  if (scope === 'SUBDOMAIN_LEADERSHIP') {
    if (task.domain === user.domain && task.subdomain === user.subdomain &&
        (user.role === 'MANAGER' || user.role === 'ASSOCIATE')) return 'CAN_SUBMIT';
    if (user.role === 'DIRECTOR' && task.domain === user.domain) return 'VISIBLE_ONLY';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  if (scope === 'SUBDOMAIN_WIDE' || scope === 'SUBDOMAIN') {
    if (task.domain === user.domain && task.subdomain === user.subdomain) return 'CAN_SUBMIT';
    if (user.role === 'DIRECTOR' && task.domain === user.domain) return 'VISIBLE_ONLY';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  if (scope === 'INDIVIDUAL') {
    if (task.assignedToId === user.memberId) return 'CAN_SUBMIT';
    if (user.role === 'DIRECTOR' && task.domain === user.domain) return 'VISIBLE_ONLY';
    if (user.role === 'MANAGER' && task.domain === user.domain && task.subdomain === user.subdomain) return 'VISIBLE_ONLY';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  if (scope === 'BUILDERS_ONLY') {
    if (task.domain === user.domain && task.subdomain === user.subdomain && user.role === 'BUILDER') return 'CAN_SUBMIT';
    if (user.role === 'DIRECTOR' && task.domain === user.domain) return 'VISIBLE_ONLY';
    if ((user.role === 'MANAGER' || user.role === 'ASSOCIATE') && task.domain === user.domain && task.subdomain === user.subdomain) return 'VISIBLE_ONLY';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  // ── Legacy fallback (PERSONAL, BROADCAST, old INDIVIDUAL, old GENERAL) ──
  if (scope === 'PERSONAL' || (scope === 'BROADCAST' && task.assignedToId)) {
    if (task.assignedToId === user.memberId) return 'CAN_SUBMIT';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }
  if (scope === 'BROADCAST') {
    if (!task.domain) return 'CAN_SUBMIT';
    if (task.domain === user.domain) {
      if (!task.subdomain || task.subdomain === user.subdomain) return 'CAN_SUBMIT';
    }
    if (user.role === 'DIRECTOR' && task.domain === user.domain) return 'VISIBLE_ONLY';
    if ((user.role === 'MANAGER' || user.role === 'ASSOCIATE') && task.domain === user.domain && task.subdomain === user.subdomain) return 'VISIBLE_ONLY';
    if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
    return 'HIDDEN';
  }

  // Creator fallback for any unrecognised scope
  if (task.createdBy === user.memberId) return 'VISIBLE_ONLY';
  return 'HIDDEN';
}

export function isTaskVisible(
  user: SessionUser,
  task: { assignmentType: string; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null; createdBy: string },
): boolean {
  return getTaskRelationship(user, task) !== 'HIDDEN';
}

export function canSubmitTask(
  user: SessionUser,
  task: { assignmentType: string; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null; createdBy: string },
): boolean {
  return getTaskRelationship(user, task) === 'CAN_SUBMIT';
}
