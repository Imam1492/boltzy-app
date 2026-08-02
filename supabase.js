// ✅ ADD THIS EXACT LINE FIRST
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './utils/LargeSecureStore'; // ✨ IMPORT OUR NEW VAULT
import { Platform } from 'react-native'; 

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const noopLock = (name, acquireTimeout, fn) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✨ GOLD STANDARD: AES Encrypted AsyncStorage
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, 
    lock: noopLock,
  },
});