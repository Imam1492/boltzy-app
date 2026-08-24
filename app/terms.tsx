import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function TermsOfService() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>Last Updated: {new Date().toLocaleDateString()}</Text>
        
        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Acceptance of Terms</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          By accessing or using the Boltzy platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use the app.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. User Conduct</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          You agree not to post any illegal, fraudulent, or harmful items. Boltzy reserves the right to remove any listings or ban accounts that violate community guidelines.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Platform Liability</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          Boltzy is a platform connecting buyers and sellers. We do not guarantee the quality, safety, or legality of the items advertised, nor the truth or accuracy of the listings. Transactions are made directly between users.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, 
    borderBottomWidth: 0, 
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 } }) 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { flexGrow: 1, padding: 24, paddingBottom: 60, maxWidth: 800, alignSelf: 'center', width: '100%' },
  date: { fontSize: 14, marginBottom: 24, fontStyle: 'italic' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 16, lineHeight: 24 },
});