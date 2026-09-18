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
  driveFolderId?: string;
  drivePermissionId?: string;
}

// Assignment scope — who a task is assigned to.
// Scopes are strictly role-gated (see permissions.ts canCreateScope).
export type TaskAssignmentScope =
  | 'ORG_WIDE'             // Presidium, or HR & Admin Manager/Associate → entire club
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
  createdByRole?: string;
  createdAt: string;
  status: 'OPEN' | 'CLOSED';
  submissionMode: SubmissionMode;
  totalSubmissions: number;
  reminderSentAt?: string | null;
  delegatedReviewers?: Array<{ memberId: string; memberName: string }>;
  noSubmissionPenaltyAt?: string | null;
  // memberIds actually penalised by the no-submission auto-close pass — kept so a
  // later reversal (deadline extended, or task deleted) can undo the exact -2s
  // applied, regardless of any roster changes since.
  noSubmissionPenalisedMemberIds?: string[] | null;
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
  // Whether the submission was late against task.deadline as it stood at
  // review time — recorded so a later reversal (task deletion) doesn't have
  // to recompute against a deadline that may have since been extended.
  wasLate: boolean | null;
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

// Vault entries are created only by Presidium or Directors. Default
// visibility is the creator + Presidium (always); `sharedWith` extends that
// to specific Managers/Associates (or Directors, if a Presidium member
// shared it) the creator has explicitly granted access to. Builders never
// participate in the vault, neither as creators nor as share recipients.
export interface VaultShareEntry {
  memberId: string;
  memberName: string;
  role: Role;
  domain: Domain | null;
}

export interface VaultEntry {
  entryId: string;
  title: string;
  notes: string;
  // AES-256-GCM ciphertext + the IV/auth tag needed to decrypt it, all
  // base64-encoded. Never sent to the client except from the single-entry
  // "reveal" endpoint, and never decrypted server-side except there.
  encryptedValue: string;
  iv: string;
  authTag: string;
  createdBy: string;
  createdByName: string;
  createdByRole: Role;
  createdAt: string;
  updatedAt: string;
  sharedWith: VaultShareEntry[];
}

// What the list endpoint returns — everything except the encrypted value
// itself (so a plain "browse the vault" request can never leak ciphertext),
// plus a viewer-relative `canManage` so the UI knows whether to show
// edit/delete/share controls without a second round-trip.
export type VaultEntrySummary = Omit<VaultEntry, 'encryptedValue' | 'iv' | 'authTag'> & {
  canManage: boolean;
};

// Faculty/Industry mentors, founding members, and advisory committee — people
// who never log in to the dashboard, shown on the public website's Team page
// (sbg-honorary-members table, read directly by Official-Website) but managed
// here since Presidium is the only party with edit rights on either side.
export type HonoraryTag = 'FACULTY_MENTOR' | 'FACULTY_CONVENER' | 'INDUSTRIAL_MENTOR' | 'FOUNDING_MEMBER' | 'ADVISORY';

export interface HonoraryMember {
  id: string;
  name: string;
  tag: HonoraryTag;
  description?: string;
  linkedin?: string;
  photoUrl?: string | null;
  order?: number;
  createdAt: string;
  updatedAt?: string;
}

// Scope of a Minutes of Meeting — determines which Drive subfolder it's filed under
// and which members it's visible to (attendee-based; Presidium sees all).
export type MoMScope = 'CORE_TEAM' | 'DOMAIN' | 'SUBDOMAIN';

export interface MoM {
  momId: string;
  meetingType: string;
  date: string;           // ISO "YYYY-MM-DD"
  time: string;
  platform: string;
  scope: MoMScope;
  domain: Domain | null;
  subdomain: Subdomain | null;
  driveFileId: string;
  driveViewUrl: string;
  preparedById: string;
  preparedByName: string;
  reviewedBy: string;
  attendeeMemberIds: string[];
  attendees: Array<{ name: string; role: string }>;
  createdAt: string;
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
