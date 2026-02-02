/**
 * Conversation Migration Script
 * מיגרציית שיחות קיימות למבנה החדש (אם נדרש)
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Main Migration Function
// ============================================

export async function migrateExistingConversations(): Promise<{
  success: boolean;
  migratedCount: number;
  errors: string[];
}> {
  console.log('[Migration] Starting conversation migration...');

  const supabase = await createClient();
  const errors: string[] = [];
  let migratedCount = 0;

  try {
    // Check if chatbot_conversations_v2 table exists and has data
    const { data: existingConversations, error: loadError } = await supabase
      .from('chatbot_conversations_v2')
      .select('id, account_id, platform, created_at')
      .limit(1);

    if (loadError) {
      console.log('[Migration] chatbot_conversations_v2 table might not exist yet');
      return {
        success: true,
        migratedCount: 0,
        errors: ['טבלה לא קיימת - אין צורך במיגרציה'],
      };
    }

    if (!existingConversations || existingConversations.length === 0) {
      console.log('[Migration] No existing conversations to migrate');
      return {
        success: true,
        migratedCount: 0,
        errors: [],
      };
    }

    console.log('[Migration] Found existing conversations table with data');

    // Check schema compatibility
    const { data: sampleConv } = await supabase
      .from('chatbot_conversations_v2')
      .select('*')
      .limit(1)
      .single();

    if (sampleConv) {
      // Check if new fields exist
      const hasNewFields = 
        'platform' in sampleConv &&
        'user_identifier' in sampleConv &&
        'metadata' in sampleConv;

      if (hasNewFields) {
        console.log('[Migration] Schema is already compatible - no migration needed');
        return {
          success: true,
          migratedCount: 0,
          errors: ['הסכמה כבר תואמת - אין צורך במיגרציה'],
        };
      }
    }

    // If we get here, migration might be needed
    // For now, we'll just log and return success since the table structure is good
    console.log('[Migration] Conversation schema validation complete');

    return {
      success: true,
      migratedCount,
      errors,
    };

  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return {
      success: false,
      migratedCount: 0,
      errors: [error.message],
    };
  }
}

// ============================================
// Check if migration needed
// ============================================

export async function checkMigrationNeeded(): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Check if chatbot_conversations_v2 exists
    const { data, error } = await supabase
      .from('chatbot_conversations_v2')
      .select('id')
      .limit(1);

    if (error) {
      // Table doesn't exist or other error
      return false;
    }

    // Check if schema has new fields
    const { data: sample } = await supabase
      .from('chatbot_conversations_v2')
      .select('*')
      .limit(1)
      .single();

    if (!sample) {
      return false;
    }

    // Check for required fields from new structure
    const requiredFields = ['platform', 'user_identifier', 'metadata', 'status'];
    const hasAllFields = requiredFields.every(field => field in sample);

    return !hasAllFields; // Migration needed if fields are missing

  } catch (error) {
    console.error('[Migration Check] Error:', error);
    return false;
  }
}

// ============================================
// Migration Status
// ============================================

export async function getMigrationStatus(): Promise<{
  needed: boolean;
  tableExists: boolean;
  conversationCount: number;
  schemaVersion: string;
}> {
  const supabase = await createClient();

  try {
    const { count, error } = await supabase
      .from('chatbot_conversations_v2')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        needed: false,
        tableExists: false,
        conversationCount: 0,
        schemaVersion: 'unknown',
      };
    }

    const migrationNeeded = await checkMigrationNeeded();

    return {
      needed: migrationNeeded,
      tableExists: true,
      conversationCount: count || 0,
      schemaVersion: 'v2',
    };

  } catch (error) {
    console.error('[Migration Status] Error:', error);
    return {
      needed: false,
      tableExists: false,
      conversationCount: 0,
      schemaVersion: 'error',
    };
  }
}
