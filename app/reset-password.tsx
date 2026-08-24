import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isStrongPassword = (pass: string) => {
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return pass.length >= 8 && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const handleUpdatePassword = async () => {
    if (!isStrongPassword(password)) {
      Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Must be 8+ characters with uppercase, lowercase, number, and symbol.', position: 'top' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      Toast.show({ type: 'success', text1: 'Success!', text2: 'Your password has been updated.', position: 'top' });
      router.replace('/');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e.message, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          contentContainerStyle={[styles.inner, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 24, paddingHorizontal: 4, lineHeight: 18 }}>
              Password must contain 8+ characters, including an uppercase letter, lowercase letter, number, and special character.
            </Text>

            <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={handleUpdatePassword} disabled={loading}>
              {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Update Password</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 500, alignSelf: 'center', width: '100%' },
  logo: { fontSize: 40, fontWeight: 'bold', marginBottom: 8, letterSpacing: -1, marginTop: 10 },
  subtitle: { fontSize: 16, marginBottom: 32, lineHeight: 24 },
  form: { width: '100%' },
  
  passwordContainer: { 
    flexDirection: 'row', alignItems: 'center', height: 60, borderWidth: 0, borderRadius: 16, marginBottom: 12 
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
  
  backButton: { marginTop: 24, alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 15, fontWeight: '500' },
});