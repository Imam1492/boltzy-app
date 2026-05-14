import type { User } from '@supabase/supabase-js';

import { supabase } from '../supabase';

let cachedUser: User | null | undefined;
let pendingUserPromise: Promise<User | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUser = session?.user ?? null;
});

export const getCurrentUser = async (
  { force = false }: { force?: boolean } = {}
): Promise<User | null> => {
  if (!force && cachedUser !== undefined) {
    return cachedUser;
  }

  if (pendingUserPromise) {
    return pendingUserPromise;
  }

  pendingUserPromise = (async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        cachedUser = null;
        return null;
      }

      cachedUser = session?.user ?? null;
      return cachedUser;
    } catch (err: any) {
      if (
        err?.message?.includes('lock') ||
        err?.message?.includes('stole') ||
        err?.message?.includes('released')
      ) {
        return cachedUser ?? null;
      }

      throw err;
    } finally {
      pendingUserPromise = null;
    }
  })();

  return pendingUserPromise;
};
