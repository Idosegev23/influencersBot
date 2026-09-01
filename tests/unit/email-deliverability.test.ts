import { describe, it, expect } from 'vitest';
import { normalizeEmail, domainOf, suggestDomain } from '@/lib/support/email-deliverability';

describe('normalizeEmail (L0)', () => {
  it('strips the invisible bidi mark that Hebrew keyboards append', () => {
    // Three real production addresses carried U+202C. The regex passed; DNS did not.
    expect(normalizeEmail('alice2692@gmail.com\u202C')).toBe('alice2692@gmail.com');
  });

  it('strips a leading RTL embedding mark too', () => {
    expect(normalizeEmail('\u202Balice2692@gmail.com')).toBe('alice2692@gmail.com');
  });

  it('leaves an already-clean address byte-identical', () => {
    // Companion to the assertions above: proves the stripper is not simply mangling everything.
    expect(normalizeEmail('alice2692@gmail.com')).toBe('alice2692@gmail.com');
  });

  it('lowercases and trims', () => {
    expect(normalizeEmail('  Lili.Levy42@GMAIL.com  ')).toBe('lili.levy42@gmail.com');
  });

  it('drops a trailing dot', () => {
    expect(normalizeEmail('a@gmail.com.')).toBe('a@gmail.com');
  });

  it('returns null for a non-address', () => {
    expect(normalizeEmail('לא רוצה')).toBeNull();
    expect(normalizeEmail('0545989978')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('domainOf', () => {
  it('returns the part after the last @', () => {
    expect(domainOf('lililevy42@gmail.com.il')).toBe('gmail.com.il');
  });
});

describe('suggestDomain (L1) — map hits', () => {
  it('repairs the address from the incident', () => {
    expect(suggestDomain('gmail.com.il')).toBe('gmail.com');
  });

  it('repairs live typosquats that HAVE valid MX', () => {
    // Measured: gamil.com -> mail.gamil.com, gnail.com -> mx2.oweb.cn (CN).
    // MX can never catch these; only the map can.
    expect(suggestDomain('gamil.com')).toBe('gmail.com');
    expect(suggestDomain('gnail.com')).toBe('gmail.com');
    expect(suggestDomain('gmail.co.il')).toBe('gmail.com');
    expect(suggestDomain('gmail.co')).toBe('gmail.com');
  });

  it('repairs the dead-domain typos', () => {
    expect(suggestDomain('gmail.con')).toBe('gmail.com');
    expect(suggestDomain('gmai.com')).toBe('gmail.com');
    expect(suggestDomain('gmail.cim')).toBe('gmail.com');
    expect(suggestDomain('gmali.com')).toBe('gmail.com');
  });
});

describe('suggestDomain (L1) — the false-positive guard', () => {
  // This block is the whole reason suggestDomain takes an opts argument. Spec review
  // measured these at Levenshtein 1 from gmail.com, and all three are real providers.
  // Asserted under BOTH modes on purpose. Without `mxKnownDead: true` these pass even with
  // the provider guard deleted — the early `if (!opts?.mxKnownDead) return null` catches
  // them, so the assertion proves nothing about the guard it names. The second mode is the
  // one that matters: it is the exact path verifyEmail takes when MX reports no_mx, where
  // the provider list is the only thing standing between a mail.com customer and being told
  // she mistyped her own address.
  it.each(['email.com', 'mail.com', 'ymail.com'])(
    'never suggests for the real provider %s, whether or not MX has ruled',
    (domain) => {
      expect(suggestDomain(domain)).toBeNull();
      expect(suggestDomain(domain, { mxKnownDead: true })).toBeNull();
    },
  );

  it('never suggests for a domain that is itself a known provider', () => {
    expect(suggestDomain('gmail.com')).toBeNull();
    expect(suggestDomain('walla.co.il')).toBeNull();
  });

  it('never suggests for the lookalikes that are genuinely Microsoft', () => {
    // outlook.co.il -> eur.olc.protection.outlook.com; windowslive.com is Microsoft legacy.
    expect(suggestDomain('outlook.co.il')).toBeNull();
    expect(suggestDomain('windowslive.com')).toBeNull();
  });

  it.each([
    'jerusalem.muni.il', 'sviva.gov.il', 'akko.muni.il', 'egged.co.il', 'clalit.org.il',
    'zutacore.com', 'bmc.com', 'orian.com', 'haviv-adv.co.il', 'hfs.school',
    'elishevaph.org', 'mvav.org', 'vatel.co.il', 'ern.co.il', 'kerencohen.co.il',
    'shir-ben.co.il', 'ay-adir.co.il', 'dalitkatzir.com', 'tzlev.com',
    'ldrsgroup.com', 'triroars.co.il',
  ])('never suggests for the real corporate domain %s', (domain) => {
    // Every one of these is a genuine correspondent in support_requests (spec §2.3 Trap A).
    // An allowlist or a naive distance check rejects all 21.
    expect(suggestDomain(domain)).toBeNull();
  });
});

describe('suggestDomain (L1) — distance repair, only once MX has ruled', () => {
  it('proposes the nearest provider for a domain MX proved dead', () => {
    expect(suggestDomain('gmial.com', { mxKnownDead: true })).toBe('gmail.com');
    expect(suggestDomain('wallla.co.il', { mxKnownDead: true })).toBe('walla.co.il');
  });

  it('still refuses when nothing is within distance 2', () => {
    expect(suggestDomain('zev-ev.com', { mxKnownDead: true })).toBeNull();
  });

  it('does NOT propose for a live provider even when told MX is dead', () => {
    // Defence in depth: the provider guard runs before the distance check.
    expect(suggestDomain('mail.com', { mxKnownDead: true })).toBeNull();
  });
});
