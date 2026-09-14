/**
 * /api/influencer/knowledge/ingest had no auth and no callers, and wrote RAG
 * documents, knowledge_base rows and coupons for any accountId in the body.
 * It is removed; the authenticated knowledge routes stay.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

describe('dead unauthenticated knowledge ingest route', () => {
  it('no longer exists', () => {
    expect(existsSync(path.join(root, 'src/app/api/influencer/knowledge/ingest/route.ts'))).toBe(false);
  });

  it('the authenticated knowledge route next to it still exists (guards a wrong root path)', () => {
    expect(existsSync(path.join(root, 'src/app/api/influencer/chatbot/knowledge/route.ts'))).toBe(true);
  });
});
