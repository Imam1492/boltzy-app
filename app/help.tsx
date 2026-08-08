import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Share, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HelpSupport() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/faq' as any)}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#422006' : '#fff8e1' }]}><Ionicons name="help-circle" size={22} color="#F5A623" /></View>
          <Text style={[styles.actionText, { color: colors.text }]}>FAQ</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => setSafetyModalVisible(true)}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#064e3b' : '#e8f5e9' }]}><Ionicons name="shield-checkmark" size={22} color="#4CAF50" /></View>
          <Text style={[styles.actionText, { color: colors.text }]}>{t('safety_tips') === 'safety_tips' ? 'Trust & Safety Tips' : t('safety_tips')}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL('mailto:support@boltzy.in?subject=Boltzy Support Request')}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1e3a8a' : '#e3f2fd' }]}><Ionicons name="mail" size={22} color="#2196F3" /></View>
          <Text style={[styles.actionText, { color: colors.text }]}>{t('email_support') === 'email_support' ? 'Email Support' : t('email_support')}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={async () => { try { await Share.share({ message: 'Hey! Join Boltzy to buy and sell awesome items locally. Download the app now: https://boltzy.in' }); } catch (e) {} }}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#4a044e' : '#f3e5f5' }]}><Ionicons name="person-add" size={22} color="#9C27B0" /></View>
          <Text style={[styles.actionText, { color: colors.text }]}>{t('invite_friends') === 'invite_friends' ? 'Invite Friends' : t('invite_friends')}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {/* Trust & Safety Modal (Copied from home.tsx for availability here) */}
      <Modal visible={safetyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.safetyIcon}><Ionicons name="shield-checkmark" size={40} color="#4CAF50" /></View>
            <Text style={[styles.safetyTitle, { color: colors.text }]}>Trust & Safety</Text>
            <View style={styles.safetyList}>
              <View style={styles.safetyRow}><Ionicons name="close-circle" size={24} color="#FF3B30" /><Text style={[styles.safetyText, { color: colors.text }]}>Never pay in advance.</Text></View>
              <View style={styles.safetyRow}><Ionicons name="people" size={24} color="#007AFF" /><Text style={[styles.safetyText, { color: colors.text }]}>Meet in safe, public places.</Text></View>
              <View style={styles.safetyRow}><Ionicons name="eye" size={24} color="#F5A623" /><Text style={[styles.safetyText, { color: colors.text }]}>Inspect items thoroughly before buying.</Text></View>
            </View>
            <TouchableOpacity style={[styles.gotItBtn, { backgroundColor: colors.tint }]} onPress={() => setSafetyModalVisible(false)}>
              <Text style={{ color: isDark ? '#000' : '#fff', fontSize: 16, fontWeight: 'bold' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(150,150,150,0.1)' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  actionText: { fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, alignItems: 'center' },
  safetyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  safetyTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 24 },
  safetyList: { width: '100%', gap: 16, marginBottom: 30 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  safetyText: { fontSize: 16, flex: 1 },
  gotItBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }
});