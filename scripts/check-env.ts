#!/usr/bin/env tsx
/**
 * Environment Variables Validation Script
 * 
 * בודק שכל ה-environment variables הנדרשים קיימים ותקינים
 * 
 * Usage:
 *   npx tsx scripts/check-env.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

interface EnvCheck {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
}

const envChecks: EnvCheck[] = [
  // Supabase (Required)
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    description: 'Supabase Project URL',
    validator: (val) => val.startsWith('https://') && val.includes('.supabase.co'),
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase Anon Key',
    validator: (val) => val.startsWith('eyJ') && val.length > 100,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    description: 'Supabase Service Role Key (for server-side)',
    validator: (val) => val.startsWith('eyJ') && val.length > 100,
  },

  // AI APIs
  {
    name: 'NEXT_PUBLIC_GOOGLE_AI_API_KEY',
    required: true,
    description: 'Google Gemini Vision API Key (Primary AI)',
    validator: (val) => val.startsWith('AIza') && val.length > 30,
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: false,
    description: 'Anthropic Claude API Key (Fallback AI)',
    validator: (val) => val.startsWith('sk-ant-'),
  },
  {
    name: 'OPENAI_API_KEY',
    required: false,
    description: 'OpenAI GPT-4o API Key (Last Resort AI)',
    validator: (val) => val.startsWith('sk-'),
  },

  // Redis (Optional but recommended)
  {
    name: 'UPSTASH_REDIS_REST_URL',
    required: false,
    description: 'Upstash Redis URL (for caching & rate limiting)',
    validator: (val) => val.startsWith('https://') && val.includes('upstash.io'),
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    required: false,
    description: 'Upstash Redis Token',
  },

  // Optional Integrations
  {
    name: 'GOOGLE_CALENDAR_CLIENT_ID',
    required: false,
    description: 'Google Calendar OAuth Client ID',
  },
  {
    name: 'GOOGLE_CALENDAR_CLIENT_SECRET',
    required: false,
    description: 'Google Calendar OAuth Client Secret',
  },
  {
    name: 'SENDGRID_API_KEY',
    required: false,
    description: 'SendGrid API Key (for email notifications)',
    validator: (val) => val.startsWith('SG.'),
  },
];

function checkEnv() {
  console.log('\n🔍 Checking Environment Variables...\n');

  let hasErrors = false;
  let hasWarnings = false;

  const results = envChecks.map((check) => {
    const value = process.env[check.name];
    
    if (!value) {
      if (check.required) {
        hasErrors = true;
        return {
          ...check,
          status: '❌ MISSING (REQUIRED)',
          valid: false,
        };
      } else {
        hasWarnings = true;
        return {
          ...check,
          status: '⚠️  Missing (Optional)',
          valid: true, // Not blocking
        };
      }
    }

    // Validate if validator exists
    if (check.validator && !check.validator(value)) {
      if (check.required) {
        hasErrors = true;
        return {
          ...check,
          status: '❌ INVALID FORMAT',
          valid: false,
        };
      } else {
        hasWarnings = true;
        return {
          ...check,
          status: '⚠️  Invalid format',
          valid: true, // Not blocking
        };
      }
    }

    return {
      ...check,
      status: '✅ Valid',
      valid: true,
    };
  });

  // Print results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  results.forEach((result) => {
    console.log(`${result.status}`);
    console.log(`  Variable: ${result.name}`);
    console.log(`  Description: ${result.description}`);
    console.log(`  Required: ${result.required ? 'Yes' : 'No'}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summary
  const validCount = results.filter((r) => r.valid).length;
  const totalRequired = envChecks.filter((c) => c.required).length;
  const validRequired = results.filter((r) => r.required && r.valid).length;

  console.log('📊 Summary:\n');
  console.log(`  Total Variables: ${envChecks.length}`);
  console.log(`  Required: ${totalRequired}`);
  console.log(`  Valid Required: ${validRequired}/${totalRequired}`);
  console.log(`  Total Valid: ${validCount}/${envChecks.length}\n`);

  if (hasErrors) {
    console.log('❌ ERRORS FOUND!');
    console.log('\nPlease fix the missing/invalid required variables:');
    console.log('1. Copy .env.example to .env.local');
    console.log('2. Fill in all required values');
    console.log('3. Run this script again\n');
    console.log('See SETUP_INSTRUCTIONS.md for detailed setup guide.\n');
    process.exit(1);
  }

  if (hasWarnings) {
    console.log('⚠️  WARNINGS:');
    console.log('Some optional variables are missing.');
    console.log('The system will work, but some features may be limited.\n');
  }

  if (!hasErrors && !hasWarnings) {
    console.log('✅ ALL ENVIRONMENT VARIABLES ARE VALID!\n');
    console.log('The system is ready to run! 🚀\n');
  } else if (!hasErrors) {
    console.log('✅ ALL REQUIRED VARIABLES ARE VALID!\n');
    console.log('The system is ready to run (with warnings). 🚀\n');
  }
}

// Run check
try {
  checkEnv();
} catch (error) {
  console.error('\n❌ Error checking environment variables:', error);
  process.exit(1);
}
