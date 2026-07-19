// ✅ ADD THIS EXACT LINE FIRST (Do not skip this!)
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native'; 

// ✨ Pulling securely from the .env file!
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// A no-op lock function that bypasses the Web Locks API entirely.
// This prevents "Lock broken by another request with the 'steal' option" errors
// that occur when multiple tabs/requests compete for the same auth lock.
const noopLock = (name, acquireTimeout, fn) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: noopLock,
  },
});
