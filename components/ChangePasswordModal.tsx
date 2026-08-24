import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { supabase } from '../supabase'; 
import { useTheme } from '../context/ThemeContext';

export default function ChangePasswordModal({ visible, onClose, userEmail, userId }: { visible: boolean, onClose: () => void, userEmail: string, userId: string }) {
  const { colors, isDark } = useTheme();
  const [mode, setMode] = useState<'password' | 'email'>('password');
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const isStrongPassword = (pass: string) => {
    return pass.length >= 8 && /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /[0-9]/.test(pass) && /[!@#$%^&*(),.?":{}|<>]/.test(pass);
  };

  // ✨ Creates the In-App Notification Instantly
  const fireSuccessNotification = async () => {
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Security Alert 🔒',
      message: `Your password was successfully changed at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      icon: 'shield-checkmark',
      color: '#34C759'
    });
  };

  const handleUpdateWithPassword = async () => {
    if (!oldPassword) return Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter your current password.', position: 'top' });
    if (!isStrongPassword(newPassword)) return Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Must be 8+ chars with uppercase, lowercase, number, and symbol.', position: 'top' });

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password: oldPassword });
      if (signInError) throw new Error('Your current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      
      await fireSuccessNotification(); // ✨ Fire the bell!
      
      Toast.show({ type: 'success', text1: 'Password Updated!', text2: 'Your account is secure.', position: 'top' });
      onClose();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: e.message, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
      if (error) throw error;
      
      Toast.show({ type: 'success', text1: 'Email Sent!', text2: 'Check your inbox for the reset link.', position: 'top' });
      onClose();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e.message, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Change Password</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
          </View>

          <View style={[styles.tabRow, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={[styles.tab, mode === 'password' && { backgroundColor: colors.tint }]} onPress={() => setMode('password')}>
              <Text style={[styles.tabText, { color: colors.textSecondary }, mode === 'password' && { color: isDark ? '#000' : '#fff' }]}>Current Password</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, mode === 'email' && { backgroundColor: colors.tint }]} onPress={() => setMode('email')}>
              <Text style={[styles.tabText, { color: colors.textSecondary }, mode === 'email' && { color: isDark ? '#000' : '#fff' }]}>Send Email</Text>
            </TouchableOpacity>
          </View>

          {mode === 'password' ? (
            <View>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Current Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <TextInput style={[styles.input, { color: colors.text }]} secureTextEntry={!showOld} value={oldPassword} onChangeText={setOldPassword} />
                <TouchableOpacity onPress={() => setShowOld(!showOld)} style={styles.eye}><Ionicons name={showOld ? "eye-off" : "eye"} size={20} color={colors.textSecondary} /></TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>New Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <TextInput style={[styles.input, { color: colors.text }]} secureTextEntry={!showNew} value={newPassword} onChangeText={setNewPassword} />
                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eye}><Ionicons name={showNew ? "eye-off" : "eye"} size={20} color={colors.textSecondary} /></TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.tint }]} onPress={handleUpdateWithPassword} disabled={loading}>
                {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.btnText, { color: isDark ? '#000' : '#fff' }]}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20, lineHeight: 20 }}>
                If you forgot your current password or logged in via Google, we will send a secure link to <Text style={{ fontWeight: 'bold', color: colors.text }}>{userEmail}</Text> so you can set a new one.
              </Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.tint }]} onPress={handleSendResetEmail} disabled={loading}>
                {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.btnText, { color: isDark ? '#000' : '#fff' }]}>Send Reset Link</Text>}
              </TouchableOpacity>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { 
    width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40,
    borderWidth: 0, // Removed borders
    ...Platform.select({ web: { boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }, default: { elevation: 15, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10 } })
  },
  inputWrapper: { 
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 16, height: 55,
    borderWidth: 0, // Faux-inset (sunk-in)
  },
  btn: { 
    width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 10,
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6 } })
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabText: { fontSize: 14, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { flex: 1, paddingHorizontal: 16, fontSize: 16 },
  eye: { paddingHorizontal: 16, height: '100%', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: 'bold' }
});