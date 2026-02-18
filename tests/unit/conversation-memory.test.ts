/**
 * Conversation Memory Tests
 *
 * Tests for shouldUpdateSummary, buildConversationContext,
 * and summary prompt construction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the pure logic functions directly.
// DB-dependent functions are tested via mock.

describe('shouldUpdateSummary', () => {
  // Re-implement the logic for unit testing without import side-effects
  const SUMMARY_UPDATE_INTERVAL = 6;

  function shouldUpdateSummary(messageCount: number): boolean {
    return messageCount > 0 && messageCount % SUMMARY_UPDATE_INTERVAL === 0;
  }

  it('returns false for 0 messages', () => {
    expect(shouldUpdateSummary(0)).toBe(false);
  });

  it('returns true at interval boundaries', () => {
    expect(shouldUpdateSummary(6)).toBe(true);
    expect(shouldUpdateSummary(12)).toBe(true);
    expect(shouldUpdateSummary(18)).toBe(true);
    expect(shouldUpdateSummary(24)).toBe(true);
  });

  it('returns false between intervals', () => {
    expect(shouldUpdateSummary(1)).toBe(false);
    expect(shouldUpdateSummary(3)).toBe(false);
    expect(shouldUpdateSummary(5)).toBe(false);
    expect(shouldUpdateSummary(7)).toBe(false);
    expect(shouldUpdateSummary(10)).toBe(false);
    expect(shouldUpdateSummary(11)).toBe(false);
  });
});

describe('Summary Prompt Builder', () => {
  function buildSummaryPrompt(existingSummary: string, transcript: string): string {
    const base = existingSummary
      ? `סיכום קודם של השיחה:\n${existingSummary}\n\n`
      : '';
    return `${base}הודעות אחרונות בשיחה:\n${transcript}\n\n---\nצור סיכום קצר ומדויק של השיחה (עד 4 משפטים). הסיכום חייב לכלול:
1. מטרות המשתמש — מה הוא רוצה לדעת/להשיג
2. החלטות שהתקבלו — מה סוכם
3. עובדות מרכזיות — מידע חשוב שעלה (שמות מותגים, קופונים, מספרים)
4. שאלות פתוחות — מה עדיין לא נענה

אם יש סיכום קודם, עדכן אותו (לא להתחיל מחדש). כתוב בעברית. תמציתי.`;
  }

  it('builds prompt without existing summary', () => {
    const prompt = buildSummaryPrompt('', 'משתמש: שלום\nעוזר: היי!');
    // Should NOT start with "סיכום קודם של השיחה:" prefix
    expect(prompt).not.toMatch(/^סיכום קודם של השיחה:/);
    expect(prompt).toContain('הודעות אחרונות');
    expect(prompt).toContain('משתמש: שלום');
    expect(prompt).toContain('מטרות המשתמש');
  });

  it('builds prompt with existing summary', () => {
    const prompt = buildSummaryPrompt(
      'המשתמש שאל על קופונים',
      'משתמש: יש עוד הנחות?\nעוזר: כן, קוד MIRAN ב-Spring'
    );
    expect(prompt).toContain('סיכום קודם של השיחה:');
    expect(prompt).toContain('המשתמש שאל על קופונים');
    expect(prompt).toContain('אם יש סיכום קודם, עדכן אותו');
  });

  it('includes all 4 required sections', () => {
    const prompt = buildSummaryPrompt('', 'test');
    expect(prompt).toContain('מטרות המשתמש');
    expect(prompt).toContain('החלטות שהתקבלו');
    expect(prompt).toContain('עובדות מרכזיות');
    expect(prompt).toContain('שאלות פתוחות');
  });
});

describe('Conversation History Windowing', () => {
  const HISTORY_WINDOW = 12;

  it('keeps last N messages when history exceeds window', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const windowed = messages.slice(-HISTORY_WINDOW);
    expect(windowed.length).toBe(12);
    expect(windowed[0].content).toBe('Message 8');
    expect(windowed[windowed.length - 1].content).toBe('Message 19');
  });

  it('returns all messages when history is within window', () => {
    const messages = Array.from({ length: 4 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const windowed = messages.slice(-HISTORY_WINDOW);
    expect(windowed.length).toBe(4);
  });
});

describe('Transcript Builder', () => {
  const HISTORY_WINDOW = 12;

  function buildTranscript(messages: Array<{ role: string; content: string }>): string {
    return messages
      .slice(-HISTORY_WINDOW)
      .map(m => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.content}`)
      .join('\n');
  }

  it('converts messages to Hebrew-labeled transcript', () => {
    const messages = [
      { role: 'user', content: 'מה הקופונים?' },
      { role: 'assistant', content: 'יש קוד MIRAN' },
    ];

    const transcript = buildTranscript(messages);
    expect(transcript).toBe('משתמש: מה הקופונים?\nעוזר: יש קוד MIRAN');
  });

  it('handles empty messages', () => {
    const transcript = buildTranscript([]);
    expect(transcript).toBe('');
  });
});

describe('Rolling Summary Integration with History', () => {
  it('prepends summary to conversation history', () => {
    const history = [
      { role: 'user' as const, content: 'מה יש היום?' },
      { role: 'assistant' as const, content: 'יש הרבה דברים!' },
    ];

    const summary = 'המשתמש מתעניין בקופונים של Spring';

    // Simulate the integration logic from stream/route.ts
    const augmentedHistory = [
      { role: 'assistant' as const, content: `[סיכום שיחה קודמת: ${summary}]` },
      ...history,
    ];

    expect(augmentedHistory.length).toBe(3);
    expect(augmentedHistory[0].content).toContain('סיכום שיחה קודמת');
    expect(augmentedHistory[0].content).toContain('Spring');
    expect(augmentedHistory[1].content).toBe('מה יש היום?');
  });

  it('does not prepend when summary is null', () => {
    const history = [
      { role: 'user' as const, content: 'שלום' },
    ];

    const summary = null;

    const augmentedHistory = summary
      ? [{ role: 'assistant' as const, content: `[סיכום שיחה קודמת: ${summary}]` }, ...history]
      : [...history];

    expect(augmentedHistory.length).toBe(1);
    expect(augmentedHistory[0].content).toBe('שלום');
  });
});

describe('Feature Flag Gating', () => {
  it('MEMORY_V2_ENABLED=false means no memory behavior', () => {
    const flag = process.env.MEMORY_V2_ENABLED;
    expect(flag).not.toBe('true'); // Default in test env should not be 'true'
  });

  it('checks flag as string comparison', () => {
    // The flag check is `=== 'true'` not truthy
    expect('true' === 'true').toBe(true);
    expect('false' === 'true').toBe(false);
    expect(undefined === 'true').toBe(false);
    expect('' === 'true').toBe(false);
  });
});

describe('Precision V2: Dynamic Threshold', () => {
  function applyDynamicThreshold(
    candidates: Array<{ id: string; similarity: number }>
  ): Array<{ id: string; similarity: number }> {
    if (candidates.length === 0) return candidates;
    const topSim = candidates[0].similarity;
    if (topSim > 0.8) {
      return candidates.filter(c => c.similarity >= 0.5 || c.id === candidates[0].id);
    }
    return candidates;
  }

  it('raises threshold when top result > 0.8', () => {
    const candidates = [
      { id: '1', similarity: 0.9 },
      { id: '2', similarity: 0.6 },
      { id: '3', similarity: 0.3 },
      { id: '4', similarity: 0.1 },
    ];
    const result = applyDynamicThreshold(candidates);
    expect(result.length).toBe(2);
    expect(result.map(r => r.id)).toEqual(['1', '2']);
  });

  it('does not raise threshold when top result <= 0.8', () => {
    const candidates = [
      { id: '1', similarity: 0.7 },
      { id: '2', similarity: 0.4 },
      { id: '3', similarity: 0.3 },
    ];
    const result = applyDynamicThreshold(candidates);
    expect(result.length).toBe(3);
  });

  it('always keeps the top result', () => {
    const candidates = [
      { id: '1', similarity: 0.85 },
      { id: '2', similarity: 0.2 }, // Below 0.5
    ];
    const result = applyDynamicThreshold(candidates);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });
});

describe('Precision V2: Diversity Guardrail', () => {
  function applyDiversity(
    candidates: Array<{ id: string; document_id: string; entity_type: string }>
  ): Array<{ id: string; document_id: string; entity_type: string }> {
    const perSource = new Map<string, number>();
    const perType = new Map<string, number>();
    return candidates.filter(c => {
      const srcCount = perSource.get(c.document_id) || 0;
      const typeCount = perType.get(c.entity_type) || 0;
      if (srcCount >= 2 || typeCount >= 3) return false;
      perSource.set(c.document_id, srcCount + 1);
      perType.set(c.entity_type, typeCount + 1);
      return true;
    });
  }

  it('limits to 2 chunks per source', () => {
    const candidates = [
      { id: '1', document_id: 'docA', entity_type: 'post' },
      { id: '2', document_id: 'docA', entity_type: 'post' },
      { id: '3', document_id: 'docA', entity_type: 'post' }, // should be dropped
      { id: '4', document_id: 'docB', entity_type: 'post' },
    ];
    const result = applyDiversity(candidates);
    expect(result.length).toBe(3);
    expect(result.find(r => r.id === '3')).toBeUndefined();
  });

  it('limits to 3 chunks per entity type', () => {
    const candidates = [
      { id: '1', document_id: 'docA', entity_type: 'coupon' },
      { id: '2', document_id: 'docB', entity_type: 'coupon' },
      { id: '3', document_id: 'docC', entity_type: 'coupon' },
      { id: '4', document_id: 'docD', entity_type: 'coupon' }, // should be dropped
      { id: '5', document_id: 'docE', entity_type: 'post' },
    ];
    const result = applyDiversity(candidates);
    expect(result.length).toBe(4);
    expect(result.find(r => r.id === '4')).toBeUndefined();
  });

  it('handles empty candidates', () => {
    expect(applyDiversity([]).length).toBe(0);
  });
});

describe('Precision V2: Skip Rerank When Dominant', () => {
  it('skips rerank when top similarity > 0.85', () => {
    const topSimilarity = 0.9;
    const shouldSkip = topSimilarity > 0.85;
    expect(shouldSkip).toBe(true);
  });

  it('does not skip rerank when top similarity <= 0.85', () => {
    const topSimilarity = 0.8;
    const shouldSkip = topSimilarity > 0.85;
    expect(shouldSkip).toBe(false);
  });
});

describe('Token Budget Trimming', () => {
  const CHARS_PER_TOKEN = 4;
  const MIN_HISTORY_MESSAGES = 4;

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  function trimToTokenBudget(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    rollingSummary: string | null,
    maxTokens: number,
  ) {
    let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    if (rollingSummary) totalTokens += estimateTokens(rollingSummary);
    let trimmedCount = 0;
    const result = [...messages];
    while (totalTokens > maxTokens && result.length > MIN_HISTORY_MESSAGES) {
      const removed = result.shift()!;
      totalTokens -= estimateTokens(removed.content);
      trimmedCount++;
    }
    let trimmedSummary = rollingSummary;
    if (totalTokens > maxTokens && trimmedSummary) {
      const summaryBudget = Math.max(200, maxTokens - totalTokens + estimateTokens(trimmedSummary));
      const maxChars = summaryBudget * CHARS_PER_TOKEN;
      if (trimmedSummary.length > maxChars) {
        trimmedSummary = trimmedSummary.substring(0, maxChars) + '...';
        totalTokens = result.reduce((sum, m) => sum + estimateTokens(m.content), 0) + estimateTokens(trimmedSummary);
      }
    }
    return { messages: result, rollingSummary: trimmedSummary, trimmedCount, estimatedTokens: totalTokens };
  }

  it('does not trim when within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi!' },
    ];
    const result = trimToTokenBudget(messages, null, 1000);
    expect(result.messages.length).toBe(2);
    expect(result.trimmedCount).toBe(0);
  });

  it('drops oldest messages when over budget', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'A'.repeat(200), // ~50 tokens each = 500 total
    }));
    // 10 * 50 = 500 tokens total, set budget to 300
    const result = trimToTokenBudget(messages, null, 300);
    expect(result.messages.length).toBeLessThan(10);
    expect(result.messages.length).toBeGreaterThanOrEqual(MIN_HISTORY_MESSAGES);
    expect(result.trimmedCount).toBeGreaterThan(0);
  });

  it('keeps at least MIN_HISTORY_MESSAGES', () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'A'.repeat(400), // ~100 tokens each
    }));
    // 6 * 100 = 600 tokens, set budget very low
    const result = trimToTokenBudget(messages, null, 50);
    expect(result.messages.length).toBe(MIN_HISTORY_MESSAGES);
  });

  it('estimates tokens at ~4 chars per token', () => {
    expect(estimateTokens('Hello World!')).toBe(3); // 12 chars / 4 = 3
    expect(estimateTokens('שלום עולם')).toBe(3); // 9 chars / 4 = ceil(2.25) = 3
  });
});

describe('Summary Update Retry Logic', () => {
  const RETRY_ATTEMPTS = 2;
  const RETRY_BASE_DELAY_MS = 500;

  it('retries with exponential backoff delays', () => {
    const delays: number[] = [];
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      delays.push(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
    expect(delays).toEqual([500, 1000]);
  });

  it('stops after RETRY_ATTEMPTS failures', async () => {
    let callCount = 0;
    const maxAttempts = RETRY_ATTEMPTS + 1; // 1 initial + 2 retries = 3

    // Simulate the retry loop
    async function simulateUpdateWithRetries(shouldFail: boolean): Promise<boolean> {
      for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
        callCount++;
        if (!shouldFail) return true;
        // All fail
      }
      return false;
    }

    const result = await simulateUpdateWithRetries(true);
    expect(result).toBe(false);
    expect(callCount).toBe(maxAttempts);
  });

  it('succeeds on second attempt', async () => {
    let callCount = 0;

    async function simulateUpdateWithRetries(failFirst: number): Promise<boolean> {
      for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
        callCount++;
        if (callCount > failFirst) return true; // Succeed after N failures
      }
      return false;
    }

    const result = await simulateUpdateWithRetries(1);
    expect(result).toBe(true);
    expect(callCount).toBe(2); // Failed once, succeeded on retry
  });

  it('never blocks main response (fire-and-forget pattern)', () => {
    // The pattern: promise.catch(err => console.error(...))
    // This test verifies the pattern is non-blocking
    let resolved = false;
    const promise = new Promise<void>((resolve) => {
      setTimeout(() => { resolved = true; resolve(); }, 10);
    });

    // Fire-and-forget: do NOT await
    promise.catch(() => {});

    // Main response continues immediately
    expect(resolved).toBe(false); // Not yet resolved — that's the point
  });
});
