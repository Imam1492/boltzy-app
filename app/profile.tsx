import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Image } from 'react-native';
import { supabase } from '../supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export default function EditProfile() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  
  // New avatar states
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setDisplayName(data.display_name || '');
      setRealName(data.real_name || '');
      setAvatarUri(data.avatar_url || null); // Load existing avatar
    }
    setLoading(false);
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Forces a perfect square!
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
      Alert.alert("Error", "Username and Real Name are required.");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let uploadedAvatarUrl = avatarUri; // Keep existing if not changed

    // Upload new image if one was selected
    if (avatarBase64) {
      const fileName = `avatar-${user.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(avatarBase64), { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        uploadedAvatarUrl = publicUrlData.publicUrl;
      } else {
        Alert.alert("Image Error", "Could not upload profile picture.");
      }
    }

    const { error } = await supabase.from('profiles').update({ 
      display_name: displayName, 
      real_name: realName,
      avatar_url: uploadedAvatarUrl 
    }).eq('id', user.id);
    
    setSaving(false);
    if (error) Alert.alert("Error", "Update failed.");
    else Alert.alert("Success", "Profile updated successfully!");
  };

  const handleDeleteAccount = () => {
    Alert.alert("Delete Account?", "Account deactivated for 30 days.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', user?.id);
          await supabase.auth.signOut();
          router.replace('/');
      }}
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#000" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Boltzy Identity</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* AVATAR PICKER */}
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

        <Text style={styles.label}>Public Username</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

        <Text style={styles.label}>Real Name (Private)</Text>
        <TextInput style={styles.input} value={realName} onChangeText={setRealName} />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteButtonText}>Delete Account</Text>
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
  
  // Avatar Styles
  avatarContainer: { alignSelf: 'center', marginBottom: 30, position: 'relative' },
  avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#fff' },
  
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { height: 56, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  saveButton: { height: 56, backgroundColor: '#000', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  dangerZone: { marginTop: 40, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#FF3B30', marginBottom: 12, textTransform: 'uppercase' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
});