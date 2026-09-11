import type { Member } from '@/types';

// The exact same required-field policy the Add/Edit Member form enforces
// (see ManageMembersClient's findMissingField) — kept in one shared place so
// "is this profile complete" can never drift from what the form actually
// requires when a member is created or edited.
const REQUIRED_TEXT_FIELDS: Array<[keyof Member, string]> = [
  ['name', 'Name'],
  ['officialEmail', 'Official Email'],
  ['clubId', 'Club ID'],
  ['regNo', 'Registration No.'],
  ['department', 'Department'],
  ['section', 'Section'],
  ['phone', 'Phone'],
  ['whatsapp', 'WhatsApp'],
  ['personalEmail', 'Personal Email'],
  ['github', 'GitHub'],
  ['linkedin', 'LinkedIn'],
  ['instagram', 'Instagram'],
  ['builderId', 'AWS Builder ID'],
  ['meetup', 'Meetup'],
  ['faName', 'Faculty Advisor'],
  ['faPhone', 'FA Phone'],
  ['faEmail', 'FA Email'],
];

export interface ProfileCompleteness {
  total: number;
  filled: number;
  percent: number;
  missing: string[];
}

// Domain is required for everyone except Presidium (SBG Leader/Secretary,
// who sit above any single domain); Subdomain is required only below
// Director level — a Director already spans every subdomain in their domain.
export function getProfileCompleteness(member: Member): ProfileCompleteness {
  const isPresidiumRole = member.role === 'SBG_LEADER' || member.role === 'SECRETARY';
  const isDirectorRole = member.role === 'DIRECTOR';

  const missing: string[] = [];
  let total = 0;

  if (!isPresidiumRole) {
    total++;
    if (!member.domain) missing.push('Domain');
  }
  if (!isPresidiumRole && !isDirectorRole) {
    total++;
    if (!member.subdomain) missing.push('Subdomain');
  }

  for (const [key, label] of REQUIRED_TEXT_FIELDS) {
    total++;
    if (!String(member[key] ?? '').trim()) missing.push(label);
  }

  const filled = total - missing.length;
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);

  return { total, filled, percent, missing };
}
