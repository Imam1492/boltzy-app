import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useFocusEffect,useLocalSearchParams  } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';
import ConfirmModal from '../components/ConfirmModal';
import * as ImageManipulator from 'expo-image-manipulator';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { LinearGradient } from 'expo-linear-gradient';



export default function BillingHistory() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      // This assumes you have a 'payments' table storing Razorpay transactions.
      // If the table doesn't exist yet, it gracefully falls back to the empty state.
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setHistory(data);
      }
    } catch (err) {
      console.log('Billing history fetch skipped/failed', err);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isSuccess = item.status === 'success' || item.status === 'paid';
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.planName, { color: colors.text }]}>
            {item.plan_type === 'pro_yearly' ? 'Yearly Pro Subscription' : 'Single Ad Promotion'}
          </Text>
          <Text style={[styles.amount, { color: colors.text }]}>₹{item.amount}</Text>
        </View>
        
        <View style={styles.cardFooter}>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {new Date(item.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
          
          <View style={[styles.statusBadge, { backgroundColor: isSuccess ? (isDark ? '#064e3b' : '#e8f5e9') : (isDark ? '#450a0a' : '#ffebee') }]}>
            <Text style={[styles.statusText, { color: isSuccess ? '#4CAF50' : '#FF3B30' }]}>
              {isSuccess ? 'Paid' : 'Failed'}
            </Text>
          </View>
        </View>

        {isSuccess && (
          <View style={[styles.receiptRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.receiptId, { color: colors.textSecondary }]}>Txn ID: {item.razorpay_payment_id || item.id}</Text>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="download-outline" size={16} color="#007AFF" />
              <Text style={styles.receiptText}>Receipt</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Billing History</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.text} /></View>
      ) : history.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.iconWrap, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="receipt-outline" size={50} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>When you purchase a subscription or promote an ad, your receipts will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  listContent: { padding: 16, paddingBottom: 60 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  planName: { fontSize: 16, fontWeight: 'bold', flex: 1, paddingRight: 10 },
  amount: { fontSize: 18, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date: { fontSize: 14 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12 },
  receiptId: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  receiptText: { fontSize: 13, fontWeight: 'bold', color: '#007AFF', marginLeft: 4 }, // <--- ADDED COMMA HERE
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  iconWrap: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});