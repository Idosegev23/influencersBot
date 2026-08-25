import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

/**
 * `public/widget.js` must parse as ES5.
 *
 * It is served raw to browsers with no build step, from the `<head>` of every
 * customer's site. A parse error is **total and silent**: the engine rejects
 * the whole file, no code runs, nothing reports, and the widget simply does not
 * exist for that visitor. There is no partial degradation and no error we would
 * ever see.
 *
 * For a long time the file did not parse as ES5 at all. Four optional-chaining
 * sites (`?.`, ES2020) and one trailing comma in a call argument list (ES2017)
 * meant the widget was dead on any engine older than Chrome 80 / Safari 13.1 —
 * on every customer site, invisibly. The constraint was written down in three
 * plans and enforced by nothing, so it drifted four times without anyone
 * noticing.
 *
 * The gate that was in use, `acorn --ecma2020`, structurally cannot catch this:
 * it accepts exactly the syntax that breaks the target. Only a parse at the
 * version we actually ship to can.
 */
describe('public/widget.js is ES5', () => {
  const src = readFileSync('public/widget.js', 'utf8');

  it('parses at ecmaVersion 5', () => {
    // The assertion IS the parse: acorn throws on the first construct a 2019
    // browser would also choke on, with its line and column.
    expect(() => acorn.parse(src, { ecmaVersion: 5 })).not.toThrow();
  });

  it('the gate is real — a modern construct makes it fail', () => {
    // Without this, "it parses" could pass for the wrong reason (an empty file,
    // a lenient option, an import that quietly resolved to nothing).
    expect(() => acorn.parse(src + '\nvar x = a?.b;', { ecmaVersion: 5 })).toThrow();
    expect(() => acorn.parse(src + '\nconst y = () => 1;', { ecmaVersion: 5 })).toThrow();
  });

  it('is the real file, not an empty read', () => {
    expect(src.length).toBeGreaterThan(100_000);
    expect(src).toContain('bestieAI Website Widget');
  });
});
