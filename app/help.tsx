import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Share, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  // ✨ State for your Trust & Safety modal
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);

  const MenuRow = ({ icon, title, iconColor, iconBg, onPress, isLast = false }: any) => (
    <TouchableOpacity 
      style={[styles.menuRow, { borderBottomColor: isLast ? 'transparent' : colors.border }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.menuText, { color: colors.text }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* SECTION 1: AI Support */}
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: '#F5A623', borderWidth: 1 }]}>
          <MenuRow 
            icon="hardware-chip-outline" 
            title="Boltzy AI Support" 
            iconColor="#F5A623" 
            iconBg="rgba(245, 166, 35, 0.15)" 
            onPress={() => router.push('/support-bot' as any)}
            isLast={true}
          />
        </View>

        {/* SECTION 2: General Support */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CONTACT & GUIDES</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <MenuRow 
            icon="help-circle-outline" title="FAQ" iconColor="#E67E22" iconBg="rgba(230, 126, 34, 0.15)" 
            onPress={() => router.push('/faq' as any)} 
          />
          <MenuRow 
            icon="shield-checkmark-outline" title="Trust & Safety Tips" iconColor="#2ECC71" iconBg="rgba(46, 204, 113, 0.15)" 
            onPress={() => setSafetyModalVisible(true)} 
          />
          <MenuRow 
            icon="mail-outline" title="Email Support" iconColor="#3498DB" iconBg="rgba(52, 152, 219, 0.15)" 
            onPress={() => Linking.openURL('mailto:support@boltzy.in?subject=Boltzy Support Request')} 
          />
          <MenuRow 
            icon="person-add-outline" title="Invite Friends" iconColor="#9B59B6" iconBg="rgba(155, 89, 182, 0.15)" 
            onPress={async () => { 
              try { 
                await Share.share({ message: 'Hey! Join Boltzy to buy and sell awesome items locally. Download the app now: https://boltzy.in' }); 
              } catch (e) {} 
            }} 
            isLast={true}
          />
        </View>

        {/* SECTION 3: Legal & Policies */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LEGAL</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <MenuRow 
            icon="lock-closed-outline" title="Privacy Policy" iconColor="#95A5A6" iconBg="rgba(149, 165, 166, 0.15)" 
            onPress={() => Linking.openURL('https://nasal-washer-d09.notion.site/Privacy-Policy-3bd8a4633ec180c09bb3c79fd004f8aa?source=copy_link')} 
          />
          <MenuRow 
            icon="document-text-outline" title="Terms & Conditions" iconColor="#95A5A6" iconBg="rgba(149, 165, 166, 0.15)" 
            onPress={() => Linking.openURL('https://nasal-washer-d09.notion.site/Terms-of-Service-Refunds-3bd8a4633ec18094859dfd6d6c2dfced?source=copy_link')} 
          />
          <MenuRow 
            icon="ban-outline" title="Prohibited Items Policy" iconColor="#E74C3C" iconBg="rgba(231, 76, 60, 0.15)" 
            onPress={() => Linking.openURL('https://nasal-washer-d09.notion.site/Prohibited-Items-Policy-3bd8a4633ec1808fabcac89fb6948d6b?source=copy_link')} 
          />
          <MenuRow 
            icon="globe-outline" title="Legal & Privacy Hub" iconColor="#5C6BC0" iconBg="rgba(92, 107, 192, 0.15)" 
            onPress={() => Linking.openURL('https://nasal-washer-d09.notion.site/Boltzy-Legal-Privacy-Hub-3bd8a4633ec180e9ab67eea39793c6c6?source=copy_link')} 
            isLast={true}
          />
        </View>
      </ScrollView>

      {/* ✨ Restored Trust & Safety Modal */}
      <Modal visible={safetyModalVisible} transparent animationType="slide" onRequestClose={() => setSafetyModalVisible(false)}>
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
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  sectionTitle: { 
    fontSize: 13, 
    fontWeight: '700', 
    marginLeft: 12, 
    marginBottom: 8, 
    marginTop: 20, 
    letterSpacing: 0.8 
  },
  
  groupCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, alignItems: 'center' },
  safetyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  safetyTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 24 },
  safetyList: { width: '100%', gap: 16, marginBottom: 30 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  safetyText: { fontSize: 16, flex: 1 },
  gotItBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }
});