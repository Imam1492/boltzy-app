import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../supabase';
import { useRouter } from 'expo-router';

/** Supabase phone OTP expects E.164 (+country, no leading 0). */
function normalizePhoneE164(raw: string): { e164: string | null; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { e164: null, reason: 'empty' };

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return { e164: null, reason: 'bad_length' };
    if (!/^[1-9]\d+$/.test(digits)) return { e164: null, reason: 'invalid' };
    return { e164: `+${digits}`, reason: 'ok' };
  }

  const d = trimmed.replace(/\D/g, '');
  if (!d) return { e164: null, reason: 'empty' };

  if (d.length === 11 && d.startsWith('0') && /^[6-9]\d{9}$/.test(d.slice(1))) {
    return { e164: `+91${d.slice(1)}`, reason: 'ok_in91' };
  }

  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) {
    return { e164: `+91${d}`, reason: 'ok_in91' };
  }

  if (d.length >= 11 && d.length <= 15 && /^[1-9]/.test(d)) {
    return { e164: `+${d}`, reason: 'ok_intl' };
  }

  return { e164: null, reason: 'need_country_or_valid_mobile' };
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('919999999999'); // Default for testing
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // --- AUTO-LOGIN CHECK ---
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/home'); 
      }
    };
    checkUser();
  }, [router]);

  // --- STEP 1: REQUEST OTP ---
  const requestOtp = async () => {
    const { e164 } = normalizePhoneE164(phone);

    if (!e164) {
      Alert.alert(
        'Invalid Number',
        'Use a 10-digit Indian mobile, or full international format with country code (e.g. +919876543210).',
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms' },
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        setStep(2);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      Alert.alert("Error", err.message || "Could not send OTP. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- STEP 2: VERIFY OTP & ACCOUNT RECOVERY ---
  const verifyOtp = async () => {
    if (otp.length < 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit code.");
      return;
    }

    const { e164 } = normalizePhoneE164(phone);
    if (!e164) {
      Alert.alert('Invalid Number', 'Go back and enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: 'sms',
      });

      if (error) {
        Alert.alert("Verification Failed", error.message);
        return;
      }

      if (data?.user) {
        // 1. Check Profile for Deletion OR Ban Status
        const { data: profile } = await supabase
          .from('profiles')
          .select('deleted_at, is_banned, banned_until')
          .eq('id', data.user.id)
          .single();

        // 2. CHECK FOR BAN
        if (profile?.is_banned) {
          const banDate = new Date(profile.banned_until);
          if (banDate > new Date()) {
            await supabase.auth.signOut(); // Kick them out instantly
            Alert.alert(
              "Account Suspended",
              `Your account has been suspended due to multiple community reports. Suspension ends: ${banDate.toLocaleDateString()}`,
              [{ text: "OK" }],
            );
            return; // Stop the login process
          } else {
            // If the 30 days are over, unban them automatically
            await supabase.from('profiles').update({ is_banned: false, report_count: 0 }).eq('id', data.user.id);
          }
        }

        // 3. Handle Deletion Recovery (Your existing code)
        if (profile?.deleted_at) {
          await supabase.from('profiles').update({ deleted_at: null }).eq('id', data.user.id);
          await new Promise((resolve) => {
            Alert.alert("Welcome Back!", "Your account deletion request has been cancelled.", [{ text: "OK", onPress: resolve }]);
          });
        }

        await supabase.from('profiles').upsert({ id: data.user.id, phone: e164 }, { onConflict: 'id' });
      }

      router.replace('/home');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      Alert.alert('Error', err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Boltzy</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? 'Enter your number to get started' : 'Enter the 6-digit code sent to your phone'}
        </Text>

        {step === 1 ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210 or +919876543210"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={requestOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send OTP</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={verifyOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Login</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
              <Text style={styles.backText}>Change Phone Number</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 48, fontWeight: 'bold', color: '#000', marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32, lineHeight: 22 },
  form: { width: '100%' },
  input: { 
    height: 60, 
    borderWidth: 1.5, 
    borderColor: '#eee', 
    borderRadius: 16, 
    paddingHorizontal: 20, 
    fontSize: 18, 
    marginBottom: 20, 
    backgroundColor: '#fafafa',
    color: '#000'
  },
  button: { 
    height: 60, 
    backgroundColor: '#000', 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#888', fontSize: 14, fontWeight: '500' },
});
