import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function PrivacyPolicy() {
  const router = useRouter();
 const { colors, isDark, toggleTheme } = useTheme(); // ✨ Ensure toggleTheme is here

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>Last Updated: {new Date().toLocaleDateString()}</Text>
        
        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Information We Collect</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          We collect information you provide directly to us, such as your name, email address, and any local listings you post. If you grant permission, we also collect your general location to show you nearby items.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. How We Use Your Information</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          We use the information we collect to operate, maintain, and improve the Boltzy app, as well as to facilitate communication between buyers and sellers.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Account Deletion</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          You may request to delete your account at any time through the app settings. Account deletions are held for 30 days to allow for recovery before being permanently erased from our active servers.
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