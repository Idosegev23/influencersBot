import { Client, Receiver } from '@upstash/qstash';
import type { PipelineStep } from './types';

const BASE_URL = process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

let client: Client | null = null;
export function getQStash(): Client {
  if (!client) client = new Client({ token: process.env.QSTASH_TOKEN! });
  return client;
}

export async function publishStep(input: {
  jobId: string; step: PipelineStep; batch?: number; delaySeconds?: number;
}): Promise<void> {
  await getQStash().publishJSON({
    url: `${BASE_URL}/api/pipeline/run`,
    body: { jobId: input.jobId, step: input.step, batch: input.batch ?? 0 },
    retries: 3,
    ...(input.delaySeconds ? { delay: input.delaySeconds } : {}),
  });
}

let receiver: Receiver | null = null;
export async function verifyQStashSignature(req: Request, rawBody: string): Promise<boolean> {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
  }
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}
