import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create Supabase client for server-side operations
 * This is a wrapper around the main supabase client
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Supabase SSR client — cookie-bound, for Supabase Auth (agent role).
 * Uses the ANON key + the request's auth cookies so `auth.getUser()` resolves
 * the logged-in agent and `signInWithPassword` persists the session cookie.
 * For privileged DB reads keep using the service-role client from `@/lib/supabase`.
 *
 * Must be called from a Route Handler / Server Component (uses next/headers).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can be called from a Server Component where cookies are
            // read-only — safe to ignore; route handlers do the writes.
          }
        },
      },
    }
  );
}
