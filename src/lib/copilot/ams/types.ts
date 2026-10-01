export interface MemberSnapshot {
  memberRef: string;
  email: string | null;
  name: string | null;
  company: string | null;
  status: 'active' | 'lapsed' | 'non_member' | 'unknown';
  type: string | null;
  renewalDate: string | null;
  registrations: Array<{ eventId: string; title: string; date: string | null }>;
  fetchedAt: string;
}

export interface AmsAdapter {
  readonly provider: string;
  getMember(memberRef: string): Promise<MemberSnapshot | null>;
  findMemberByEmail(email: string): Promise<MemberSnapshot | null>;
}

/** Thrown when the AMS cannot be reached. Callers continue without member data. */
export class AmsUnavailableError extends Error {}
