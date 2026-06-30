export type Role = 'SBG_LEADER' | 'SECRETARY' | 'DIRECTOR' | 'MANAGER' | 'ASSOCIATE' | 'BUILDER';

export type Domain = 'Technical' | 'Corporate' | 'Creatives' | 'General';

export type TechSubdomain = 'Software Development' | 'AI & Machine Learning' | 'Cloud & DevOps';
export type CorporateSubdomain = 'Events & Operations' | 'Sponsorship & Finance' | 'HR & Admin' | 'PR & Marketing';
export type CreativesSubdomain = 'Digital Design' | 'Media Production';
export type Subdomain = TechSubdomain | CorporateSubdomain | CreativesSubdomain;

// SBG_LEADER and SECRETARY together form the Presidium — both get full admin
// powers via isPresidium(), but SBG_LEADER outranks SECRETARY for management
// purposes (Leader can manage the Secretary, not the other way round).
export const ROLE_HIERARCHY: Record<Role, number> = {
  SBG_LEADER: 0,
  SECRETARY: 0,
  DIRECTOR: 1,
  MANAGER: 2,
  ASSOCIATE: 3,
  BUILDER: 4,
};

export const DOMAIN_SUBDOMAINS: Record<Exclude<Domain, 'General'>, Subdomain[]> = {
  Technical: ['Software Development', 'AI & Machine Learning', 'Cloud & DevOps'],
  Corporate: ['Events & Operations', 'Sponsorship & Finance', 'HR & Admin', 'PR & Marketing'],
  Creatives: ['Digital Design', 'Media Production'],
};

export interface Member {
  memberId: string;
  clubId: string;
  name: string;
  regNo: string;
  department: string;
  section: string;
  role: Role;
  domain: Domain | null;
  subdomain: Subdomain | null;
  officialEmail: string;
  personalEmail: string;
  phone: string;
  whatsapp: string;
  github: string;
  linkedin: string;
  instagram: string;
  meetup: string;
  builderId: string;
  faName: string;
  faEmail: string;
  faPhone: string;
  joinedAt: string;
  isActive: boolean;
  totalStars: number;
  teamId?: string;
}

// Assignment scope — who a task is assigned to.
// Scopes are strictly role-gated (see permissions.ts canCreateScope).
export type TaskAssignmentScope =
  | 'ORG_WIDE'             // Presidium → entire club
  | 'ALL_DIRECTORS'        // Presidium → every Director across all domains
  | 'SINGLE_DIRECTOR'      // Presidium → one specific Director (assignedToId required)
  | 'DOMAIN_WIDE'          // Director  → all roles in their domain
  | 'SUBDOMAIN_LEADERSHIP' // Director  → Manager + Associates of one subdomain (no Builders)
  | 'SUBDOMAIN_WIDE'       // Manager   → all roles in their subdomain
  | 'INDIVIDUAL'           // Manager   → one specific person in their subdomain (assignedToId required)
  | 'BUILDERS_ONLY';       // Associate → all Builders in their subdomain

// How submissions are counted for group-scoped tasks.
// INDIVIDUAL: every eligible member submits their own work independently.
// COLLECTIVE: first submitted + approved entry closes the task; once someone
//   submits (PENDING), the task is locked — no one else can submit until that
//   submission is rejected (which unlocks it for the next attempt).
export type SubmissionMode = 'INDIVIDUAL' | 'COLLECTIVE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  taskId: string;
  title: string;
  description: string;
  deadline: string;
  priority: TaskPriority;
  assignmentType: TaskAssignmentScope;
  assignedToId: string | null;
  assignedToName: string;
  domain: Domain | null;
  subdomain: Subdomain | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: 'OPEN' | 'CLOSED';
  submissionMode: SubmissionMode;
  totalSubmissions: number;
  reminderSentAt?: string | null;
}

export type ReviewStatus = 'PENDING' | 'REVISION_REQUESTED' | 'APPROVED' | 'REJECTED';

export interface Submission {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  memberId: string;
  memberName: string;
  content: string;
  links: string[];
  submittedAt: string;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewFeedback: string | null;
  ratingAwarded: number | null;
  deadline: string;
}

export interface Rating {
  memberId: string;
  memberName: string;
  domain: Domain | null;
  subdomain: Subdomain | null;
  role: Role;
  approvedCount: number;
  lateApprovedCount: number;
  rejectedCount: number;
  pendingCount: number;
}

export interface ShortLink {
  shortCode: string;
  originalUrl: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  clicks: number;
}

export interface AuditLog {
  logId: string;
  action: string;
  performedBy: string;
  performedByName: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface SessionUser {
  memberId: string;
  name: string;
  email: string;
  role: Role;
  domain: Domain | null;
  subdomain: Subdomain | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
