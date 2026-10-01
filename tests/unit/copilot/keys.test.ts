import { describe, it, expect } from 'vitest';
import { generatePartnerKey, hashPartnerKey, bearerToken, normalizeHost, KEY_PREFIX } from '@/lib/copilot/keys';

describe('partner keys', () => {
  it('generates a prefixed key whose hash matches hashPartnerKey', () => {
    const { plaintext, hash } = generatePartnerKey();
    expect(plaintext.startsWith(KEY_PREFIX)).toBe(true);
    expect(plaintext.length).toBeGreaterThan(40);
    expect(hash).toBe(hashPartnerKey(plaintext));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('never generates the same key twice', () => {
    expect(generatePartnerKey().plaintext).not.toBe(generatePartnerKey().plaintext);
  });
});

describe('bearerToken', () => {
  it('extracts a cpk_ bearer token', () => {
    expect(bearerToken('Bearer cpk_abc123')).toBe('cpk_abc123');
    expect(bearerToken('bearer   cpk_abc123 ')).toBe('cpk_abc123');
  });
  it('rejects missing, foreign or malformed tokens', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Bearer sk_live_123')).toBeNull();
    expect(bearerToken('cpk_abc123')).toBeNull();
    expect(bearerToken('Bearer cpk_a b')).toBeNull();
  });
});

describe('normalizeHost', () => {
  it('lowercases and strips port and trailing dot', () => {
    expect(normalizeHost('ABA.Copilot.Example.com:443')).toBe('aba.copilot.example.com');
    expect(normalizeHost('copilot.buses.org.')).toBe('copilot.buses.org');
    expect(normalizeHost('localhost:3001')).toBe('localhost');
  });
  it('rejects junk', () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('evil.com/path')).toBeNull();
    expect(normalizeHost('nodot')).toBeNull();
  });
});
