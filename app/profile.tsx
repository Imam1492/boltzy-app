import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import ConfirmModal from '../components/ConfirmModal';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { Skeleton } from '../components/ShimmerSkeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChangePasswordModal from '../components/ChangePasswordModal';

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
  const { colors, isDark, themeMode, setThemeMode } = useTheme();

  const insets = useSafeAreaInsets();
  
  // ✨ State for the Password Modal
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [lastUsernameChange, setLastUsernameChange] = useState<string | null>(null);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  
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

    // ✨ Grab the email & id to pass into our Modal!
    if (user.email) setEmail(user.email);
    if (user.id) setUserId(user.id);

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      // ✨ Grab the username from either column, just like the Home modal does
      const fetchedUsername = data.username || data.display_name || '';
      
      setDisplayName(data.display_name || '');
      setRealName(data.real_name || '');
      setUsername(fetchedUsername);
      setInitialUsername(fetchedUsername);
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
    if (!realName.trim() || !username.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'All fields are required.', position: 'top' });
      return;
    }
    
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) return;

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    
    // ✨ ADDED MIN LENGTH CHECK HERE
    if (cleanUsername.length < 3) {
      setSaving(false);
      Toast.show({ type: 'error', text1: 'Invalid Username', text2: 'Username must be at least 3 characters long without spaces.', position: 'top' });
      return;
    }

    let updates: any = { display_name: realName, real_name: realName };

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

  const handleLogout = () => {
    triggerConfirm('Logout', 'Are you sure you want to logout of Boltzy?', true, async () => { 
      await supabase.auth.signOut(); 
      router.replace('/'); 
    });
  };

  const handleLogoutAllDevices = () => {
    triggerConfirm('Logout All Devices', 'Are you sure you want to log out from every device you are currently logged into?', true, async () => { 
      await supabase.auth.signOut({ scope: 'global' }); 
      router.replace('/'); 
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile_title')}</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarContainer}>
            <Skeleton width={100} height={100} borderRadius={50} />
          </View>
          <View style={[styles.highlightBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Skeleton width={100} height={16} style={{ marginBottom: 16 }} />
            <View style={styles.languageContainer}>
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} width={70} height={36} borderRadius={20} />)}
            </View>
          </View>
          <Skeleton width={80} height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 15 }} />
          <Skeleton width={80} height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 15 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.push('/home?openProfile=true' as any)}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile_title') || 'Edit Profile'}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatarCircle, { borderColor: colors.card }]}>
            <Text style={styles.avatarText}>{getInitials(realName || 'User')}</Text>
          </View>
        </View>

        <View style={[styles.highlightBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>{t('app_language') || 'App Language'}</Text>
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

          {/* ✨ THEME SWITCHER (System / Light / Dark) ✨ */}
          <Text style={[styles.label, { color: colors.text, marginTop: 24 }]}>App Theme</Text>
          <View style={styles.languageContainer}>
            <TouchableOpacity
              style={[
                styles.languageChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                themeMode === 'system' && { backgroundColor: colors.tint, borderColor: colors.tint }
              ]}
              onPress={() => setThemeMode('system')}
            >
              <Text style={[
                styles.languageText,
                { color: colors.text },
                themeMode === 'system' && { color: isDark ? '#000' : '#fff', fontWeight: 'bold' }
              ]}>
                System
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.languageChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                themeMode === 'light' && { backgroundColor: colors.tint, borderColor: colors.tint }
              ]}
              onPress={() => setThemeMode('light')}
            >
              <Text style={[
                styles.languageText,
                { color: colors.text },
                themeMode === 'light' && { color: isDark ? '#000' : '#fff', fontWeight: 'bold' }
              ]}>
                Light
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.languageChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                themeMode === 'dark' && { backgroundColor: colors.tint, borderColor: colors.tint }
              ]}
              onPress={() => setThemeMode('dark')}
            >
              <Text style={[
                styles.languageText,
                { color: colors.text },
                themeMode === 'dark' && { color: isDark ? '#000' : '#fff', fontWeight: 'bold' }
              ]}>
                Dark
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>{t('real_name') || 'Name'}</Text>
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
          onChangeText={(text) => {
            // ✨ Instantly strip spaces, uppercase, and invalid characters while they type!
            const formatted = text.toLowerCase().replace(/[^a-z0-9_.]/g, '');
            setUsername(formatted);
          }} 
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.tint }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.saveButtonText, { color: isDark ? '#000' : '#fff' }]}>{t('save_btn') || 'Save Changes'}</Text>}
        </TouchableOpacity>

        {/* ✨ Wrapped in a bordered section for a cleaner UI ✨ */}
        <View style={{ marginTop: 32, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(150,150,150,0.2)' }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }} onPress={() => setIsPasswordModalVisible(true)}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.text} style={{ marginRight: 12 }} />
            <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

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
          <Text style={styles.dangerTitle}>{t('danger') || 'Danger Zone'}</Text>
          
          <TouchableOpacity onPress={handleLogout} style={styles.dangerBtn}>
            <Ionicons color="#FF3B30" name="log-out-outline" size={20}/>
            <Text style={styles.dangerBtnText}>{t('logout') || 'Logout'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogoutAllDevices} style={styles.dangerBtn}>
            <Ionicons color="#FF3B30" name="desktop-outline" size={20}/>
            <Text style={styles.dangerBtnText}>{t('logout_all') || 'Logout from All Devices'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDeleteAccount} style={[styles.dangerBtn, { borderBottomWidth: 0 }]}>
            <Ionicons color="#FF3B30" name="trash-outline" size={20}/>
            <Text style={styles.dangerBtnText}>{t('delete_acc') || 'Delete Account'}</Text>
          </TouchableOpacity>

          <ChangePasswordModal 
            visible={isPasswordModalVisible} 
            onClose={() => setIsPasswordModalVisible(false)} 
            userEmail={email} 
            userId={userId} 
          />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 24 },
  avatarContainer: { alignSelf: 'center', marginBottom: 20 },
  avatarCircle: { 
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#F5A623', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', 
    borderWidth: 0, 
    ...Platform.select({ default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 } }) 
  },
  highlightBox: { 
    padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 0, 
    ...Platform.select({ default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 } }) 
  },
  languageChip: { 
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 0, 
    ...Platform.select({ default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5 } }) 
  },
  input: { height: 56, borderWidth: 0, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 15 },
  saveButton: { 
    height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, 
    ...Platform.select({ default: { elevation: 5, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 } }) 
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: 'bold', letterSpacing: 2 },
  languageContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  languageText: { fontSize: 14 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  hintText: { fontSize: 11, marginBottom: 8, fontStyle: 'italic' },
  saveButtonText: { fontSize: 18, fontWeight: 'bold' },
  adminZone: { marginTop: 30, paddingTop: 20, borderTopWidth: 1 },
  adminTitle: { fontSize: 14, fontWeight: '700', color: '#007AFF', marginBottom: 12, textTransform: 'uppercase' },
  adminBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 10 },
  adminBtnText: { fontSize: 16, fontWeight: '600', flex: 1 },
  dangerZone: { marginTop: 40, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#FF3B30', marginBottom: 16, textTransform: 'uppercase' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(150,150,150,0.2)' },
  dangerBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' }
});