/**
 * Decide what may become a chunk.
 *
 * Split from the script so the decision is unit-testable without touching the
 * database or the embedding API. The script does I/O; this decides.
 */
import { parseKbFile, type KbEntry } from './kb-source';
import { findRedactionViolations, type RedactionViolation } from './redaction';

export interface KbIngestPlan {
  entries: KbEntry[];
  blocked: Array<{ id: string; violations: RedactionViolation[] }>;
}

export function planKbIngest(
  files: Array<{ name: string; raw: string }>,
  forbiddenNames: string[]
): KbIngestPlan {
  const plan: KbIngestPlan = { entries: [], blocked: [] };

  for (const file of files) {
    const entry = parseKbFile(file.name, file.raw);
    // Title as well as body: a heading is retrieved and shown like any other text.
    const violations = findRedactionViolations(
      `${entry.title}\n${entry.body}`,
      forbiddenNames
    );
    if (violations.length) plan.blocked.push({ id: entry.id, violations });
    else plan.entries.push(entry);
  }

  return plan;
}
