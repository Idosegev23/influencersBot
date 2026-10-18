import OpenAI from 'openai';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';

export const COPILOT_MODEL = 'gpt-6-luna';
export const COPILOT_FALLBACK_MODEL = 'gpt-5.6-terra';
const MAX_OUTPUT_TOKENS = 1200;

export interface ModelClient { responses: { create(params: any): Promise<any> } }

let defaultClient: ModelClient | null = null;
function client(): ModelClient {
  if (!defaultClient) defaultClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ModelClient;
  return defaultClient;
}

function toUsage(model: string, u: any): TokenUsage | null {
  if (!u) return null;
  return { model, inputTokens: u.input_tokens ?? 0, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

export async function streamCopilotModel(
  p: { instructions: string; input: Array<{ role: 'user' | 'assistant'; content: string }>; previousResponseId: string | null; onDelta: (t: string) => void },
  c: ModelClient = client(),
): Promise<{ text: string; responseId: string | null; usage: TokenUsage[] }> {
  const usage: TokenUsage[] = [];
  let text = '';
  let responseId: string | null = null;
  try {
    const stream = await c.responses.create({
      model: COPILOT_MODEL, instructions: p.instructions, input: p.input,
      ...(p.previousResponseId ? { previous_response_id: p.previousResponseId } : {}),
      max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' }, stream: true,
    });
    for await (const ev of stream) {
      if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') { text += ev.delta; p.onDelta(ev.delta); }
      else if (ev?.type === 'response.completed') {
        responseId = ev.response?.id ?? null;
        const u = toUsage(COPILOT_MODEL, ev.response?.usage);
        if (u) usage.push(u);
      }
    }
    if (text) return { text, responseId, usage };
  } catch (e) {
    if (text) throw e;
    console.error('[copilot/model]', 'primary failed, falling back', e instanceof Error ? e.message : e);
  }
  const fb = await c.responses.create({
    model: COPILOT_FALLBACK_MODEL, instructions: p.instructions, input: p.input,
    max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' },
  });
  const fbText: string = fb?.output_text ?? '';
  const u = toUsage(COPILOT_FALLBACK_MODEL, fb?.usage);
  if (u) usage.push(u);
  if (!fbText) throw new Error('empty response from both models');
  p.onDelta(fbText);
  return { text: fbText, responseId: fb?.id ?? null, usage };
}
