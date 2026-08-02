import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Animated } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext'; 
import { useTheme } from '../context/ThemeContext';
import ConfirmModal from '../components/ConfirmModal';
import Toast from 'react-native-toast-message';

const Skeleton = ({ width, height, style, borderRadius = 8, isDark = false }: { width?: any, height: any, style?: any, borderRadius?: number, isDark?: boolean }) => {
  const fadeAnim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [fadeAnim]);
  return <Animated.View style={[{ width, height, backgroundColor: isDark ? '#333' : '#e0e0e0', borderRadius, opacity: fadeAnim }, style]} />;
};

const LANGUAGE_OPTIONS = [
  { id: 'en', nativeLabel: 'English' },
  { id: 'hi', nativeLabel: 'हिन्दी' },
  { id: 'ur', nativeLabel: 'اردو' },
  { id: 'bn', nativeLabel: 'বাংলা' },
  { id: 'mr', nativeLabel: 'मराठी' },
  { id: 'te', nativeLabel: 'తెలుగు' },
] as const;

const getInitials = (name?: string) => {
  if (!name || typeof name !== 'string') return '?';
  const cleanName = name.trim();
  if (!cleanName) return '?';
  const words = cleanName.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else {
    const word = words[0];
    if (word.length === 1) return word[0].toUpperCase();
    return (word[0] + word[word.length - 1]).toUpperCase();
  }
};

export default function EditProfile() {
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { colors, isDark } = useTheme();
  
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [lastUsernameChange, setLastUsernameChange] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', isDestructive: false });
  const [pendingAction, setPendingAction] = useState<{ action: () => void } | null>(null);

  const triggerConfirm = (title: string, message: string, isDestructive: boolean, action: () => void) => {
    setModalConfig({ title, message, isDestructive });
    setPendingAction({ action });
    setModalVisible(true);
  };

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setDisplayName(data.display_name || '');
      setRealName(data.real_name || '');
      setUsername(data.username || '');
      setInitialUsername(data.username || '');
      setLastUsernameChange(data.last_username_change || null);
      setIsAdmin(data.is_admin === true);
    }
    setLoading(false);
  };

  const handleLanguageChange = (newLang: string) => {
    if (newLang === lang) return;
    triggerConfirm(
      t('lang_title') || "Change Language",
      t('confirm_lang_change') || "Are you sure you want to change the app language?",
      false, 
      () => setLang(newLang)
    );
  };

  const handleDeleteAccount = () => {
    triggerConfirm(
      'Delete Account', 
      'Your account will be deactivated. You can log back in within 30 days to recover your account and data before it is permanently deleted.', 
      true, 
      () => executeDelete()
    );
  };

  const executeDelete = async () => {
    const user = await getCurrentUser();
    await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', user?.id);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const handleSave = async () => {
    if (!displayName.trim() || !realName.trim() || !username.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'All fields are required.', position: 'top' });
      return;
    }
    
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) return;

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    let updates: any = { display_name: displayName, real_name: realName };

    if (cleanUsername !== initialUsername) {
      if (lastUsernameChange) {
        const now = new Date().getTime();
        const lastChange = new Date(lastUsernameChange).getTime();
        const hoursSinceChange = (now - lastChange) / (1000 * 60 * 60);

        if (hoursSinceChange > 1 && hoursSinceChange < 720) {
          const daysLeft = Math.ceil(30 - (hoursSinceChange / 24));
          setSaving(false);
          Toast.show({ type: 'error', text1: 'Username Locked', text2: `You can change your username again in ${daysLeft} days.`, position: 'top' });
          setUsername(initialUsername); 
          return;
        }
      }

      const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', cleanUsername).neq('id', user.id).maybeSingle();

      if (existingUser) {
        setSaving(false);
        Toast.show({ type: 'error', text1: 'Username Taken', text2: 'That username is already in use. Please try another.', position: 'top' });
        return;
      }

      updates.username = cleanUsername;
      updates.last_username_change = new Date().toISOString();
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    
    setSaving(false);
    
    if (error) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.message, position: 'top' });
    } else {
      setInitialUsername(cleanUsername); 
      setUsername(cleanUsername); 
      Toast.show({ type: 'success', text1: 'Success', text2: 'Profile updated successfully!', position: 'top' });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile_title')}</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarContainer}>
            <Skeleton width={100} height={100} borderRadius={50} isDark={isDark} />
          </View>
          <View style={[styles.highlightBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Skeleton width={100} height={16} style={{ marginBottom: 16 }} isDark={isDark} />
            <View style={styles.languageContainer}>
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} width={70} height={36} borderRadius={20} isDark={isDark} />)}
            </View>
          </View>
          <Skeleton width={80} height={16} style={{ marginBottom: 8 }} isDark={isDark} />
          <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 15 }} isDark={isDark} />
          <Skeleton width={80} height={16} style={{ marginBottom: 8 }} isDark={isDark} />
          <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 15 }} isDark={isDark} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile_title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatarCircle, { borderColor: colors.card }]}>
            <Text style={styles.avatarText}>{getInitials(realName || displayName || 'User')}</Text>
          </View>
        </View>

        <View style={[styles.highlightBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>{t('app_language')}</Text>
          <View style={styles.languageContainer}>
            {LANGUAGE_OPTIONS.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[
                  styles.languageChip, 
                  { backgroundColor: colors.card, borderColor: colors.border },
                  lang === l.id && { backgroundColor: colors.tint, borderColor: colors.tint }
                ]}
                onPress={() => handleLanguageChange(l.id)}
              >
                <Text style={[
                  styles.languageText, 
                  { color: colors.text },
                  lang === l.id && { color: isDark ? '#000' : '#fff', fontWeight: 'bold' }
                ]}>
                  {l.nativeLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>{t('real_name')}</Text>
        <TextInput 
          style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
          value={realName} 
          onChangeText={setRealName} 
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Text style={[styles.label, { color: colors.text }]}>@username</Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>Can only be changed every 30 days</Text>
        </View>
        <TextInput 
          style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
          value={username} 
          onChangeText={setUsername} 
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: colors.text }]}>{t('pub_user')}</Text>
        <TextInput 
          style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
          value={displayName} 
          onChangeText={setDisplayName} 
        />

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.tint }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.saveButtonText, { color: isDark ? '#000' : '#fff' }]}>{t('save_btn')}</Text>}
        </TouchableOpacity>

        {isAdmin && (
          <View style={[styles.adminZone, { borderTopColor: colors.border }]}>
            <Text style={styles.adminTitle}>Admin Tools</Text>
            
            <TouchableOpacity 
              style={[styles.adminBtn, { backgroundColor: isDark ? '#1e3a8a' : '#e3f2fd' }]}
              onPress={() => router.push('/admin/moderate' as any)}
            >
              <Ionicons name="shield-checkmark" size={20} color={isDark ? '#60a5fa' : '#007AFF'} style={{ marginRight: 10 }} />
              <Text style={[styles.adminBtnText, { color: isDark ? '#60a5fa' : '#007AFF' }]}>Moderate Ads</Text>
              <Ionicons name="chevron-forward" size={20} color={isDark ? '#60a5fa' : '#007AFF'} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.adminBtn, { backgroundColor: isDark ? '#1e3a8a' : '#e3f2fd' }]}
              onPress={() => router.push('/admin/reports' as any)}
            >
              <Ionicons name="flag" size={20} color={isDark ? '#60a5fa' : '#007AFF'} style={{ marginRight: 10 }} />
              <Text style={[styles.adminBtnText, { color: isDark ? '#60a5fa' : '#007AFF' }]}>Review Reports</Text>
              <Ionicons name="chevron-forward" size={20} color={isDark ? '#60a5fa' : '#007AFF'} />
            </TouchableOpacity>
          </View>
        )}
      
        <View style={[styles.dangerZone, { borderTopColor: colors.border }]}>
          <Text style={styles.dangerTitle}>{t('danger')}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteButtonText}>{t('delete_acc')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        isDestructive={modalConfig.isDestructive}
        onConfirm={() => {
          if (pendingAction) pendingAction.action();
          setModalVisible(false);
        }}
        onCancel={() => setModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 24 },
  avatarContainer: { alignSelf: 'center', marginBottom: 20 },
  avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F5A623', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: 'bold', letterSpacing: 2 },
  highlightBox: { padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1 },
  languageContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  languageChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  languageText: { fontSize: 14 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  hintText: { fontSize: 11, marginBottom: 8, fontStyle: 'italic' },
  input: { height: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 15 },
  saveButton: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveButtonText: { fontSize: 18, fontWeight: 'bold' },
  adminZone: { marginTop: 30, paddingTop: 20, borderTopWidth: 1 },
  adminTitle: { fontSize: 14, fontWeight: '700', color: '#007AFF', marginBottom: 12, textTransform: 'uppercase' },
  adminBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 10 },
  adminBtnText: { fontSize: 16, fontWeight: '600', flex: 1 },
  dangerZone: { marginTop: 40, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#FF3B30', marginBottom: 12, textTransform: 'uppercase' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' }
});