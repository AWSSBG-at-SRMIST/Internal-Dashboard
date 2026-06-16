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
  birthday: string;
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

export type TaskAssignmentType = 'INDIVIDUAL' | 'DOMAIN' | 'SUBDOMAIN' | 'COHORT' | 'GENERAL';

export interface Task {
  taskId: string;
  title: string;
  description: string;
  deadline: string;
  assignmentType: TaskAssignmentType;
  assignedToId: string | null;
  assignedToName: string;
  domain: Domain | null;
  subdomain: Subdomain | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: 'OPEN' | 'CLOSED';
  totalSubmissions: number;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
  ratingAwarded: number | null;
  deadline: string;
}

export interface Rating {
  memberId: string;
  memberName: string;
  domain: Domain | null;
  subdomain: Subdomain | null;
  role: Role;
  totalStars: number;
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

export interface Cohort {
  cohortId: string;
  name: string;
  type: 'SUBDOMAIN' | 'CUSTOM' | 'GENERAL';
  domain: Domain | null;
  subdomain: Subdomain | null;
  memberIds?: string[];  // only stored for CUSTOM cohorts
  memberCount?: number;  // computed on GET for display
  createdBy: string;
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
