import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>Last Updated: {new Date().toLocaleDateString()}</Text>
        
        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          We collect information you provide directly to us, such as your name, email address, and any local listings you post. If you grant permission, we also collect your general location to show you nearby items.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          We use the information we collect to operate, maintain, and improve the Boltzy app, as well as to facilitate communication between buyers and sellers.
        </Text>

        <Text style={styles.sectionTitle}>3. Account Deletion</Text>
        <Text style={styles.paragraph}>
          You may request to delete your account at any time through the app settings. Account deletions are held for 30 days to allow for recovery before being permanently erased from our active servers.
        </Text>
        
        {/* You can add more legal text here later before you launch */}
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