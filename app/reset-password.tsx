import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Password must be at least 8 characters long.', position: 'top' });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.message, position: 'top' });
    } else {
      Toast.show({ type: 'success', text1: 'Success', text2: 'Password updated successfully!', position: 'top' });
      router.replace('/home');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>
        <Text style={[styles.logo, { color: colors.text }]}>Boltzy</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Create a new password</Text>

        <View style={styles.form}>
          <View style={[styles.passwordContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text }]}
              placeholder="New Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoFocus
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 24, paddingHorizontal: 4 }}>
            Password must contain 8+ characters, including an uppercase letter, lowercase letter, number, and special character.
          </Text>

          <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={handleUpdatePassword} disabled={loading}>
            {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Update Password</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 500, alignSelf: 'center', width: '100%' },
  logo: { fontSize: 48, fontWeight: 'bold', marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 16, marginBottom: 32 },
  form: { width: '100%' },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderWidth: 1.5,
    borderRadius: 16,
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 20,
    fontSize: 18,
  },
  eyeIcon: {
    paddingHorizontal: 15,
    height: '100%',
    justifyContent: 'center',
  },
  button: { 
    height: 60, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.1)' },
      default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }
    })
  },
  buttonText: { fontSize: 18, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 15, fontWeight: '500' },
});