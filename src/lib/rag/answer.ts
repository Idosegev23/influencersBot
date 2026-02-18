/**
 * Answering Wrapper
 *
 * answerQuestion({ accountId, userId, query }) -> { answer, sources, debug }
 *
 * - Calls retrieveContext to get relevant sources
 * - If no sources found: returns "I don't have enough information" + a follow-up question
 * - Otherwise: calls the LLM with strict context and produces a cited answer
 */

import OpenAI from 'openai';
import { retrieveContext, formatSourcesForLLM } from './retrieve';
import { createLogger } from './logger';
import type {
  AnswerInput,
  AnswerResult,
  RetrievedSource,
} from './types';

const log = createLogger('answer');

let openaiClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions based ONLY on the provided sources.

Rules:
1. Answer ONLY using the information in the <sources> block.
2. If the sources don't contain enough information to answer, say so honestly.
3. Cite your sources by including [source_id] after statements derived from a specific source.
4. Keep answers concise (3-5 sentences unless the question requires more detail).
5. Do NOT make up information that isn't in the sources.
6. If the question is in Hebrew, answer in Hebrew. Match the language of the question.
7. For numerical/factual questions, be precise and cite the source.`;

const NO_INFO_PROMPT = `The user asked a question but no relevant sources were found in the knowledge base.

Respond with:
1. A brief, honest statement that you don't have enough information to answer accurately.
2. One specific follow-up question that would help you find the right information.

Keep it friendly and helpful. Match the language of the question.`;

/**
 * Answer a question using the RAG pipeline.
 */
export async function answerQuestion(input: AnswerInput): Promise<AnswerResult> {
  const { accountId, userId, query, conversationSummary } = input;

  log.info('Answering question', { query: query.substring(0, 100), accountId }, accountId);

  // Step 1: Retrieve context
  const { sources, debug } = await retrieveContext({
    accountId,
    userId,
    query,
    conversationSummary,
    topK: 5,
  });

  // Step 2: Handle no sources
  if (sources.length === 0) {
    log.info('No sources found, generating follow-up', { accountId }, accountId);

    const client = getClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: NO_INFO_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const answer = response.choices[0].message.content || 'I don\'t have enough information to answer this question.';

    // Extract the follow-up question (heuristic: last sentence ending with ?)
    const sentences = answer.split(/[.?!]\s+/);
    const followUp = sentences.find(s => s.includes('?'))?.trim();

    return {
      answer,
      sources: [],
      debug,
      noSourcesFound: true,
      followUpQuestion: followUp,
    };
  }

  // Step 3: Generate answer with sources
  const client = getClient();
  const sourcesContext = formatSourcesForLLM(sources);

  const response = await client.chat.completions.create({
    model: 'gpt-4.1-nano',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${sourcesContext}\n\nQuestion: ${query}\n\nAnswer using ONLY the sources above. Cite with [source_id].`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1000,
  });

  const answer = response.choices[0].message.content || 'Unable to generate an answer.';

  log.info('Answer generated', {
    answerLength: answer.length,
    sourcesUsed: sources.length,
    durationMs: debug.durationMs,
  }, accountId);

  return {
    answer,
    sources,
    debug,
    noSourcesFound: false,
  };
}
