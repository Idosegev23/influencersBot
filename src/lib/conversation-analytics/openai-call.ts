/**
 * Responses-API adapter for the classifier.
 *
 * GPT-5.6 rules encoded here so no call site can forget them: no custom
 * `temperature`, `max_output_tokens` (never `max_tokens`), and an explicit
 * `reasoning` block — omitting it is what silently broke the CS lane.
 */

import OpenAI from 'openai';
import { CLASSIFY_SCHEMA } from './classify';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function callClassifyModel(args: {
  model: string;
  instructions: string;
  input: string;
}): Promise<{
  json: any;
  usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number };
}> {
  const response = await getClient().responses.create({
    model: args.model,
    instructions: args.instructions,
    input: args.input,
    max_output_tokens: 600,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'conversation_classification',
        strict: true,
        schema: CLASSIFY_SCHEMA as any,
      },
    },
  } as any);

  const usage = (response as any).usage || {};
  return {
    json: JSON.parse((response as any).output_text),
    usage: {
      input_tokens: usage.input_tokens || 0,
      cached_input_tokens: usage.input_tokens_details?.cached_tokens || 0,
      output_tokens: usage.output_tokens || 0,
    },
  };
}
