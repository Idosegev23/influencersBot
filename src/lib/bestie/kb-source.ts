/**
 * Bestie's knowledge files: markdown with a small frontmatter block.
 *
 * Two kinds. `commercial` answers "what is Bestie, who is it for, what does it
 * cost". `screen` documents one dashboard screen and MUST declare the route it
 * describes — that route is what lets a later check assert the link Bestie hands
 * a customer still resolves to a page that exists.
 *
 * Parsing is strict and fails loudly with the file name. A knowledge file that
 * silently half-loads becomes a bot that half-knows something, which is worse
 * than one that admits it does not know.
 */

export type KbKind = 'commercial' | 'screen';

export interface KbEntry {
  id: string;
  kind: KbKind;
  title: string;
  route?: string;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function parseKbFile(fileName: string, raw: string): KbEntry {
  const matched = FRONTMATTER.exec(raw);
  if (!matched) {
    throw new Error(`${fileName}: missing frontmatter block (expected --- ... --- at the top)`);
  }

  const meta = parseFrontmatter(matched[1]);
  const body = matched[2].trim();

  const kind = meta.kind as KbKind;
  if (kind !== 'commercial' && kind !== 'screen') {
    throw new Error(`${fileName}: kind must be "commercial" or "screen", got "${meta.kind ?? ''}"`);
  }
  if (!meta.title) throw new Error(`${fileName}: title is required`);
  if (kind === 'screen' && !meta.route) {
    throw new Error(`${fileName}: route is required on a screen entry`);
  }
  if (!body) throw new Error(`${fileName}: body is empty`);

  return {
    id: fileName.replace(/\.md$/, ''),
    kind,
    title: meta.title,
    route: meta.route || undefined,
    body,
  };
}
