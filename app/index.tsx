import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../supabase'; 
import { useRouter } from 'expo-router';

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
  }, []);

  // --- STEP 1: REQUEST OTP ---
  const requestOtp = async () => {
    if (phone.length < 10) {
      Alert.alert("Invalid Number", "Please enter a valid phone number with country code.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: phone });
    setLoading(false);
    
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setStep(2);
    }
  };

  // --- STEP 2: VERIFY OTP & ACCOUNT RECOVERY ---
  const verifyOtp = async () => {
    if (otp.length < 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit code.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ 
      phone: phone, 
      token: otp, 
      type: 'sms' 
    });
    
    if (error) {
      setLoading(false);
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
          setLoading(false);
          await supabase.auth.signOut(); // Kick them out instantly
          Alert.alert(
            "Account Suspended", 
            `Your account has been suspended due to multiple community reports. Suspension ends: ${banDate.toLocaleDateString()}`,
            [{ text: "OK" }]
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

      await supabase.from('profiles').upsert({ id: data.user.id, phone: phone }, { onConflict: 'id' });
    }

    setLoading(false);
    router.replace('/home'); 
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
              placeholder="e.g. 919999999999"
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