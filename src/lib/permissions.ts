import type { Role, Domain, Subdomain, SessionUser, Cohort, TaskAssignmentType } from '@/types';
import { ROLE_HIERARCHY } from '@/types';

// SBG_LEADER and SECRETARY together are the Presidium — both get unrestricted
// access everywhere. Always check via this helper, never compare against the
// 'SECRETARY' literal directly, so SBG_LEADER stays in sync.
export function isPresidium(actor: SessionUser): boolean {
  return actor.role === 'SECRETARY' || actor.role === 'SBG_LEADER';
}

export function canManage(actor: SessionUser, targetRole: Role, targetDomain?: Domain | null, targetSubdomain?: Subdomain | null): boolean {
  // SBG_LEADER can manage absolutely anyone, including the Secretary.
  // SECRETARY has the same reach over everyone else, but cannot manage the Leader.
  if (actor.role === 'SBG_LEADER') return true;
  if (actor.role === 'SECRETARY') return targetRole !== 'SBG_LEADER';

  const actorLevel = ROLE_HIERARCHY[actor.role];
  const targetLevel = ROLE_HIERARCHY[targetRole];

  // Can only manage people lower in the hierarchy
  if (actorLevel >= targetLevel) return false;

  // Directors can manage within their domain
  if (actor.role === 'DIRECTOR') {
    return actor.domain === targetDomain;
  }

  // Managers and Associates can manage within their subdomain
  if (actor.role === 'MANAGER' || actor.role === 'ASSOCIATE') {
    return actor.domain === targetDomain && actor.subdomain === targetSubdomain;
  }

  return false;
}

export function canAssignTask(actor: SessionUser, assignmentDomain?: Domain | null, assignmentSubdomain?: Subdomain | null): boolean {
  if (isPresidium(actor)) return true;
  if (actor.role === 'DIRECTOR') {
    return actor.domain === assignmentDomain || assignmentDomain == null;
  }
  if (actor.role === 'MANAGER' || actor.role === 'ASSOCIATE') {
    if (assignmentDomain == null) return false; // General tasks only for higher roles
    return actor.domain === assignmentDomain &&
      (assignmentSubdomain == null || actor.subdomain === assignmentSubdomain);
  }
  return false;
}

export function canReviewSubmission(actor: SessionUser, submission: { memberId: string; domain?: Domain | null; subdomain?: Subdomain | null }): boolean {
  if (isPresidium(actor)) return true;
  if (actor.memberId === submission.memberId) return false; // Can't review own
  if (actor.role === 'DIRECTOR') {
    return actor.domain === submission.domain;
  }
  if (actor.role === 'MANAGER') {
    return actor.domain === submission.domain && actor.subdomain === submission.subdomain;
  }
  return false;
}

export function canViewMember(actor: SessionUser, target: { role: Role; domain?: Domain | null; subdomain?: Subdomain | null }): boolean {
  if (isPresidium(actor)) return true;
  const actorLevel = ROLE_HIERARCHY[actor.role];
  const targetLevel = ROLE_HIERARCHY[target.role];
  if (actorLevel > targetLevel) return false; // Can't view higher-ups

  if (actor.role === 'DIRECTOR') return actor.domain === target.domain || actorLevel < targetLevel;
  if (actor.role === 'MANAGER' || actor.role === 'ASSOCIATE') {
    return actor.domain === target.domain && actor.subdomain === target.subdomain;
  }
  return actor.memberId === (target as any).memberId;
}

export function canCreateTask(actor: SessionUser): boolean {
  return actor.role !== 'BUILDER';
}

export function isHigherOrEqual(actor: SessionUser, targetRole: Role): boolean {
  return ROLE_HIERARCHY[actor.role] <= ROLE_HIERARCHY[targetRole];
}

export function isUserInCohort(user: SessionUser, cohort: Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds'>): boolean {
  if (cohort.type === 'GENERAL') return true;
  if (cohort.type === 'SUBDOMAIN') return user.domain === cohort.domain && user.subdomain === cohort.subdomain;
  if (cohort.type === 'CUSTOM') return (cohort.memberIds || []).includes(user.memberId);
  return false;
}

// DIRECTOR sees every subdomain cohort within their own domain; MANAGER/ASSOCIATE/BUILDER
// only see the cohort matching their own subdomain. Keeps subdomains anonymous from each other.
export function canViewCohort(user: SessionUser, cohort: Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds' | 'createdBy'>): boolean {
  if (isPresidium(user)) return true;
  if (cohort.type === 'GENERAL') return true;
  if (cohort.type === 'CUSTOM') return isUserInCohort(user, cohort) || cohort.createdBy === user.memberId;
  if (cohort.type === 'SUBDOMAIN') {
    if (user.role === 'DIRECTOR') return user.domain === cohort.domain;
    return user.domain === cohort.domain && user.subdomain === cohort.subdomain;
  }
  return false;
}

// Single source of truth for "can this user see this task" — used by both the
// tasks list API and the dashboard, so the two never drift apart.
export function isTaskVisible(
  user: SessionUser,
  task: { assignmentType: TaskAssignmentType; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null; createdBy: string },
  cohortMap: Map<string, Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds'>>
): boolean {
  if (isPresidium(user)) return true;
  if (task.assignmentType === 'GENERAL') return true;
  if (task.assignmentType === 'INDIVIDUAL' && task.assignedToId === user.memberId) return true;
  if (task.assignmentType === 'DOMAIN' && task.domain === user.domain) return true;
  if (task.assignmentType === 'SUBDOMAIN' && task.domain === user.domain && task.subdomain === user.subdomain) return true;
  if (task.assignmentType === 'COHORT') {
    const cohort = task.assignedToId ? cohortMap.get(task.assignedToId) : undefined;
    return cohort ? isUserInCohort(user, cohort) : false;
  }
  if (task.createdBy === user.memberId) return true;
  if (user.role === 'DIRECTOR' && task.domain === user.domain) return true;
  if ((user.role === 'MANAGER' || user.role === 'ASSOCIATE') && task.domain === user.domain && task.subdomain === user.subdomain) return true;
  return false;
}
