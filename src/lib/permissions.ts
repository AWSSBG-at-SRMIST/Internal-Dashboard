import type { Domain, Subdomain, SessionUser, TaskAssignmentScope, Member } from '@/types';

export function isPresidium(actor: SessionUser): boolean {
  return actor.role === 'SECRETARY' || actor.role === 'SBG_LEADER';
}

export function canEditMembers(actor: SessionUser): boolean {
  if (isPresidium(actor)) return true;
  return actor.subdomain === 'HR & Admin' && (actor.role === 'MANAGER' || actor.role === 'ASSOCIATE');
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
  return null;
}

export function canReviewSubmission(
  actor: SessionUser,
  submission: { memberId: string; domain?: Domain | null; subdomain?: Subdomain | null },
): boolean {
  if (isPresidium(actor)) return true;
  if (actor.memberId === submission.memberId) return false;
  if (actor.role === 'DIRECTOR') return actor.domain === submission.domain;
  if (actor.role === 'MANAGER') return actor.domain === submission.domain && actor.subdomain === submission.subdomain;
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

// Validates whether the actor can create a task with the given scope + domain/subdomain/assignedToId.
// Returns an error string on failure, null on success.
export function canCreateScope(
  actor: SessionUser,
  scope: TaskAssignmentScope,
  domain?: Domain | null,
  subdomain?: Subdomain | null,
  assignedToId?: string | null,
): string | null {
  if (scope === 'ORG_WIDE' || scope === 'ALL_DIRECTORS') {
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
    if (actor.role !== 'ASSOCIATE') return 'Only Associates can assign to Builders';
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
  },
): 'HIDDEN' | 'VISIBLE_ONLY' | 'CAN_SUBMIT' {
  if (isPresidium(user)) return 'CAN_SUBMIT';

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
