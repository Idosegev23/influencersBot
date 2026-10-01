import type { AmsAdapter, MemberSnapshot } from './types';

type StubMember = Omit<MemberSnapshot, 'fetchedAt'>;

/** In-memory AMS for development and tests, configured via config.copilot.ams.stub_members. */
export class StubAmsAdapter implements AmsAdapter {
  readonly provider = 'stub';
  constructor(private readonly members: StubMember[]) {}

  private snap(m: StubMember | undefined): MemberSnapshot | null {
    return m ? { ...m, fetchedAt: new Date().toISOString() } : null;
  }
  async getMember(memberRef: string) {
    return this.snap(this.members.find((m) => m.memberRef === memberRef));
  }
  async findMemberByEmail(email: string) {
    const e = email.toLowerCase();
    return this.snap(this.members.find((m) => m.email?.toLowerCase() === e));
  }
}
