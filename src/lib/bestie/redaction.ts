/**
 * The boundary, enforced at ingest.
 *
 * Bestie knows the product's SURFACE — screens, buttons, flows, what a feature
 * does and what it costs. She does not know its ENGINE — code, database,
 * architecture, security work, or other customers.
 *
 * This runs before text becomes a chunk, because a chunk that exists will
 * eventually be retrieved: a stranger who arrived from a Facebook ad asks an
 * innocent question and gets an answer assembled out of whatever was in the
 * index. Keeping it out of the index is the only reliable control.
 *
 * Pure by design. Customer names are passed in rather than read here, so the
 * rules stay testable and the caller decides how fresh that list needs to be.
 */

export interface RedactionViolation {
  rule: string;
  match: string;
}

/** Infrastructure and implementation detail — the engine, not the surface. */
const INFRA_PATTERNS: Array<[string, RegExp]> = [
  ['env-var',     /\b(?:process\.env\b|[A-Z][A-Z0-9]*_(?:KEY|SECRET|TOKEN|URL|ID)\b)/g],
  ['source-path', /\b(?:src|scripts|supabase)\/[\w./[\]-]+\.(?:ts|tsx|sql|mjs)\b/g],
  ['db-object',   /\b(?:document_chunks|chatbot_persona|whatsapp_\w+|accounts|service_briefs|instagram_\w+)\s+table\b/gi],
  ['db-object',   /\b(?:document_chunks|whatsapp_cs_sessions|meta_lead_captures|crm_agent_embeddings)\b/g],
  ['platform',    /\b(?:Supabase|Postgres|PostgreSQL|pgvector|Redis|Upstash|QStash|Vercel|Apify)\b/g],
  ['code-shape',  /\b(?:webhook|API endpoint|migration|SQL query|embedding dimension)\b/gi],
];

/** Language that only appears when discussing security work. */
const SECURITY_PATTERNS: Array<[string, RegExp]> = [
  ['security', /\b(?:vulnerability|vulnerabilities|IDOR|CSRF|XSS|SQL injection|RLS|service.role|exploit|CVE)\b/gi],
  ['security', /(?:פרצ(?:ה|ת)\s*אבטחה|חור\s*אבטחה|דליפ(?:ה|ת)\s*(?:מידע|טוקן))/g],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-ish boundaries that also work for Hebrew, where \b is unreliable because
 * Hebrew letters are not \w in some engines. We require the match to be flanked
 * by something that is not a letter or digit in any script.
 */
function nameRegExp(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
}

export function findRedactionViolations(
  text: string,
  forbiddenNames: string[] = []
): RedactionViolation[] {
  if (!text || !text.trim()) return [];

  const violations: RedactionViolation[] = [];
  const seen = new Set<string>();

  const record = (rule: string, match: string) => {
    const key = `${rule}::${match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ rule, match });
  };

  for (const [rule, pattern] of [...INFRA_PATTERNS, ...SECURITY_PATTERNS]) {
    for (const found of text.matchAll(pattern)) record(rule, found[0]);
  }

  for (const name of forbiddenNames) {
    if (!name || name.trim().length < 3) continue; // too short to be a safe signal
    for (const found of text.matchAll(nameRegExp(name.trim()))) {
      record('forbidden-name', found[0]);
    }
  }

  return violations;
}
