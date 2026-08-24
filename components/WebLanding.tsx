import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function WebLanding({ onBypass }: { onBypass: () => void }) {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── HEADER ── */}
      <View style={styles.nav}>
        <Text style={styles.logo}>Boltzy</Text>
        <TouchableOpacity onPress={onBypass}>
          <Text style={styles.loginText}>Web Login</Text>
        </TouchableOpacity>
      </View>

      {/* ── HERO SECTION ── */}
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🚀 The Ultimate Local Marketplace</Text>
        </View>
        
        <Text style={styles.headline}>Buy, sell, and discover locally.</Text>
        <Text style={styles.subheadline}>
          Join thousands of users on Boltzy. Turn your old items into cash, 
          find amazing deals in your neighborhood, and chat securely with sellers.
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.storeBtn} onPress={() => alert('Coming soon to the App Store!')}>
            <Ionicons name="logo-apple" size={28} color="#fff" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.storeSub}>Download on the</Text>
              <Text style={styles.storeTitle}>App Store</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.storeBtn} onPress={() => alert('Coming soon to Google Play!')}>
            <Ionicons name="logo-google-playstore" size={28} color="#fff" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.storeSub}>GET IT ON</Text>
              <Text style={styles.storeTitle}>Google Play</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── FOOTER (App Store Requirement) ── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© {new Date().getFullYear()} Boltzy. All rights reserved.</Text>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => router.push('/privacy' as any)}>
            <Text style={styles.footerLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/terms' as any)}>
            <Text style={styles.footerLinkText}>Terms of Service</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fcfcfc' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 28, fontWeight: '900', letterSpacing: -1, color: '#000' },
  loginText: { fontSize: 16, fontWeight: '600', color: '#666' },
  
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingTop: 60, maxWidth: 800, width: '100%', alignSelf: 'center' },
 badge: { 
    backgroundColor: '#f0f0f0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24,
    borderWidth: 0,
    ...Platform.select({ web: { boxShadow: '4px 4px 10px rgba(0,0,0,0.05)' }, default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 } })
  },
  

  badgeText: { fontSize: 14, fontWeight: '600', color: '#333' },
  
  headline: { fontSize: Platform.OS === 'web' ? 64 : 42, fontWeight: '900', textAlign: 'center', color: '#000', letterSpacing: -2, lineHeight: Platform.OS === 'web' ? 70 : 48, marginBottom: 24 },
  subheadline: { fontSize: 18, color: '#666', textAlign: 'center', lineHeight: 28, marginBottom: 40, maxWidth: 600 },
  
  buttonRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  storeBtn: { 
    backgroundColor: '#000', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', minWidth: 200,
    borderWidth: 0,
    ...Platform.select({ web: { boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }, default: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 } })
  },
  storeSub: { color: '#aaa', fontSize: 10, textTransform: 'uppercase', fontWeight: '600' },
  storeTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  footer: { padding: 40, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', marginTop: 40 },
  footerText: { color: '#999', fontSize: 14, marginBottom: 12 },
  footerLinks: { flexDirection: 'row', gap: 20 },
  footerLinkText: { color: '#007AFF', fontSize: 14, fontWeight: '500' }
});