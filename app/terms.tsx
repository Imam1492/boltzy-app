import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TermsOfService() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>Last Updated: {new Date().toLocaleDateString()}</Text>
        
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using the Boltzy platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use the app.
        </Text>

        <Text style={styles.sectionTitle}>2. User Conduct</Text>
        <Text style={styles.paragraph}>
          You agree not to post any illegal, fraudulent, or harmful items. Boltzy reserves the right to remove any listings or ban accounts that violate community guidelines.
        </Text>

        <Text style={styles.sectionTitle}>3. Platform Liability</Text>
        <Text style={styles.paragraph}>
          Boltzy is a platform connecting buyers and sellers. We do not guarantee the quality, safety, or legality of the items advertised, nor the truth or accuracy of the listings. Transactions are made directly between users.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 24, paddingBottom: 60, maxWidth: 800, alignSelf: 'center', width: '100%' },
  date: { fontSize: 14, color: '#888', marginBottom: 24, fontStyle: 'italic' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 16, color: '#444', lineHeight: 24 },
});