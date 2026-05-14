import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Image } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useLanguage } from '../context/LanguageContext'; 

const LANGUAGE_OPTIONS = [
  { id: 'en', nativeLabel: 'English' },
  { id: 'hi', nativeLabel: 'हिन्दी' },
  { id: 'ur', nativeLabel: 'اردو' },
] as const;

export default function EditProfile() {
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setDisplayName(data.display_name || '');
      setRealName(data.real_name || '');
      setAvatarUri(data.avatar_url || null);
    }
    setLoading(false);
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarBase64(result.assets[0].base64 || null);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim() || !realName.trim()) {
      if (Platform.OS === 'web') window.alert("Username and Real Name are required.");
      else Alert.alert("Error", "Username and Real Name are required.");
      return;
    }
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) return;

    let uploadedAvatarUrl = avatarUri;

    if (avatarBase64) {
      const fileName = `avatar-${user.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(avatarBase64), { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        uploadedAvatarUrl = publicUrlData.publicUrl;
      } else {
        console.error(uploadError);
      }
    }

    const { error } = await supabase.from('profiles').update({ 
      display_name: displayName, 
      real_name: realName,
      avatar_url: uploadedAvatarUrl 
    }).eq('id', user.id);
    
    setSaving(false);
    
    // WEB SAFE ALERTS
    if (error) {
      console.error(error);
      if (Platform.OS === 'web') window.alert("Update failed! Check console.");
      else Alert.alert("Error", "Update failed.");
    } else {
      if (Platform.OS === 'web') window.alert("Profile updated successfully!");
      else Alert.alert("Success", "Profile updated successfully!");
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm("Account will be deactivated for 30 days. Proceed?")) {
        executeDelete();
      }
    } else {
      Alert.alert("Delete Account?", "Account deactivated for 30 days.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: executeDelete }
      ]);
    }
  };

  const executeDelete = async () => {
    const user = await getCurrentUser();
    await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', user?.id);
    await supabase.auth.signOut();
    router.replace('/');
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
        
        <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{displayName ? displayName[0].toUpperCase() : '?'}</Text>
            )}
          </View>
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.highlightBox}>
          <Text style={[styles.label, { marginTop: 0 }]}>{t('app_language')}</Text>
          <View style={styles.languageContainer}>
            {LANGUAGE_OPTIONS.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.languageChip, lang === l.id && styles.languageChipActive]}
                onPress={() => setLang(l.id)}
              >
                <Text style={[styles.languageText, lang === l.id && styles.languageTextActive]}>
                  {l.nativeLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.label}>{t('pub_user')}</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

        <Text style={styles.label}>{t('real_name')}</Text>
        <TextInput style={styles.input} value={realName} onChangeText={setRealName} />

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 24 },
  avatarContainer: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#fff' },
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
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' }
});
