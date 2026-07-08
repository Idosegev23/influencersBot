import { describe, it, expect } from 'vitest';
import { reactionForOutcome, channelOf } from '@/lib/crm/wa-outcome';

describe('reactionForOutcome', () => {
  it('done → ✅', () => expect(reactionForOutcome('done')).toBe('✅'));
  it('error → ⚠️ (never ✅ on failure)', () => expect(reactionForOutcome('error')).toBe('⚠️'));
  it('need_more → no terminal reaction', () => expect(reactionForOutcome('need_more')).toBeNull());
});

describe('channelOf', () => {
  it('voice', () => expect(channelOf({ type: 'audio', audio: { id: 'x' } })).toBe('voice'));
  it('attachment (document/image)', () => {
    expect(channelOf({ type: 'document', document: { id: 'x' } })).toBe('attachment');
    expect(channelOf({ type: 'image', image: { id: 'x' } })).toBe('attachment');
  });
  it('text', () => expect(channelOf({ type: 'text', text: { body: 'hi' } })).toBe('text'));
  it('unknown', () => expect(channelOf({ type: 'sticker' })).toBe('unknown'));
});
