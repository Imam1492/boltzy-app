import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext'; 
// ✨ NEW IMPORTS
import ConfirmModal from '../components/ConfirmModal';
import Toast from 'react-native-toast-message';

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
  
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✨ MODAL STATE ENGINE
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
    }
    setLoading(false);
  };

  const handleLanguageChange = (newLang: string) => {
    if (newLang === lang) return;
    triggerConfirm(
      t('lang_title') || "Change Language",
      t('confirm_lang_change') || "Are you sure you want to change the app language?",
      false, // Not destructive
      () => setLang(newLang)
    );
  };

const handleDeleteAccount = () => {
    triggerConfirm(
      'Delete Account', 
      'Your account will be deactivated. You can log back in within 30 days to recover your account and data before it is permanently deleted.', 
      true, // Destructive (Red Button!)
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
    if (!displayName.trim() || !realName.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'Username and Real Name are required.', position: 'top' });
      return;
    }
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase.from('profiles').update({ 
      display_name: displayName, 
      real_name: realName,
    }).eq('id', user.id);
    
    setSaving(false);
    
    if (error) {
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.message, position: 'top' });
    } else {
      Toast.show({ type: 'success', text1: 'Success', text2: 'Profile updated successfully!', position: 'top' });
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#000" /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile_title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {getInitials(realName || displayName || 'User')}
            </Text>
          </View>
          {/* Note: The pencil and username row has been completely removed from here! */}
        </View>

        <View style={styles.highlightBox}>
          <Text style={[styles.label, { marginTop: 0 }]}>{t('app_language')}</Text>
          <View style={styles.languageContainer}>
            {LANGUAGE_OPTIONS.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.languageChip, lang === l.id && styles.languageChipActive]}
                onPress={() => handleLanguageChange(l.id)}
              >
                <Text style={[styles.languageText, lang === l.id && styles.languageTextActive]}>
                  {l.nativeLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* REORDERED: Real Name is now on top */}
        <Text style={styles.label}>{t('real_name')}</Text>
        <TextInput style={styles.input} value={realName} onChangeText={setRealName} />

        <Text style={styles.label}>{t('pub_user')}</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('save_btn')}</Text>}
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>{t('danger')}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteButtonText}>{t('delete_acc')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ✨ OUR CUSTOM UNIVERSAL MODAL */}
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
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 24 },
  avatarContainer: { alignSelf: 'center', marginBottom: 20 },
  avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F5A623', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: 'bold', letterSpacing: 2 },
  highlightBox: { backgroundColor: '#f9f9f9', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  languageContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  languageChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  languageChipActive: { backgroundColor: '#000', borderColor: '#000' },
  languageText: { fontSize: 14, color: '#333' },
  languageTextActive: { color: '#fff', fontWeight: 'bold' },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginTop: 10, color: '#333' },
  input: { height: 56, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 15, backgroundColor: '#fff' },
  saveButton: { height: 56, backgroundColor: '#000', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  dangerZone: { marginTop: 40, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#FF3B30', marginBottom: 12, textTransform: 'uppercase' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  // Add these to your StyleSheet:
  usernameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 8 },
  usernameText: { fontSize: 16, color: '#666', fontWeight: '500' },
  editIconBtn: { backgroundColor: '#E8F0FE', padding: 8, borderRadius: 12 }
});