import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { escalationReason } from '@/engines/escalation/dispatch';

describe('escalation reason is promoted to a groupable column', () => {
  it('extracts the reason the detector already computed', () => {
    expect(escalationReason({ reason: 'angry_customer' })).toBe('angry_customer');
    expect(escalationReason({ reason: '  legal threat  ' })).toBe('legal threat');
  });

  it('returns null rather than an empty string when there is no reason', () => {
    expect(escalationReason({})).toBeNull();
    expect(escalationReason({ reason: '' })).toBeNull();
    expect(escalationReason({ reason: '   ' })).toBeNull();
    expect(escalationReason(null)).toBeNull();
    expect(escalationReason(undefined)).toBeNull();
  });

  it('every support_requests write on the escalation path sets the column', () => {
    // The reason has always been written into metadata.escalation.reason but was
    // not groupable. All three write sites (chat/widget insert, WhatsApp insert,
    // and the update that flags an existing CS ticket) must set the column too,
    // or metric 7's breakdown silently loses rows.
    const src = readFileSync('src/engines/escalation/dispatch.ts', 'utf8');
    const writes = src.match(/escalation_reason:/g) || [];
    expect(writes.length).toBe(3);
  });
});
