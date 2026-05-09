#!/usr/bin/env npx tsx --tsconfig tsconfig.json
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.local', override: true });

import { generateTabConfig } from '../src/lib/chat-ui/generate-tab-config';

(async () => {
  const result = await generateTabConfig('a610c713-0a17-47aa-a926-0e96d3d49b5a');
  console.log('Tabs:', result.tabs.map(t => t.label).join(' | '));
  console.log('Subtitle:', result.chat_subtitle);
  console.log('Greeting:', result.greeting_message);
  console.log('Header:', result.header_label);
})().catch(e => { console.error(e); process.exit(1); });
