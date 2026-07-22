import { describe, it, expect } from 'vitest';
import { modeUsesDmEnrichment } from '@/lib/chatbot/sandwichBot';
import { resolveArchetypeMode } from '@/lib/chatbot/archetypes';

describe("SandwichBot 'whatsapp' mode behavior (dm parity)", () => {
  it("takes the DM RAG-enrichment path for 'whatsapp' exactly as for 'dm'", () => {
    expect(modeUsesDmEnrichment('whatsapp')).toBe(true);
    expect(modeUsesDmEnrichment('dm')).toBe(true);
    // and NOT for the widget/social sales/engagement modes:
    expect(modeUsesDmEnrichment('widget')).toBe(false);
    expect(modeUsesDmEnrichment('social')).toBe(false);
    expect(modeUsesDmEnrichment(undefined)).toBe(false);
  });

  it("collapses 'whatsapp' → 'dm' before archetype prompt assembly (baseArchetype only branches on 'dm')", () => {
    expect(resolveArchetypeMode('whatsapp')).toBe('dm');
    expect(resolveArchetypeMode('dm')).toBe('dm');
    // other modes pass through untouched:
    expect(resolveArchetypeMode('widget')).toBe('widget');
    expect(resolveArchetypeMode('social')).toBe('social');
  });
});
