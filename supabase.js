// ✅ ADD THIS EXACT LINE FIRST (Do not skip this!)
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native'; 

// Replace these with your actual keys from Supabase Settings > API
const supabaseUrl = 'https://iujijbkuukjoqtixjdmy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1amlqYmt1dWtqb3F0aXhqZG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzcwNTYsImV4cCI6MjA5MDAxMzA1Nn0.YnB34z8lQtwBaRBe9CNvQpSTvUuc7jPeeq-JlwiBd1o';

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
