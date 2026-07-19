import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '../context/LanguageContext';
import { getCurrentUser } from '../utils/auth';
// ✨ NEW: Import Razorpay

import Toast from 'react-native-toast-message';

export default function BillingScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  // ✨ THE RAZORPAY ENGINE
// ✨ THE RAZORPAY ENGINE
  const handlePromoteAd = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please log in to make a payment.");

      // 💻 ✨ WEB BYPASS
      if (Platform.OS === 'web') {
        Toast.show({ type: 'success', text1: 'Simulated Web Payment', text2: `Payment ID: pay_sim_${Math.floor(Math.random() * 10000)}`, position: 'top' });
        return;
      }

      // 📱 ✨ MOBILE ONLY
      const RazorpayCheckout = require('react-native-razorpay').default;

      const options = {
        description: 'Promote Ad to Gold Status',
        image: 'https://boltzy.in/icon.png', 
        currency: 'INR',
        key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '', 
        amount: 9900, 
        name: 'Boltzy Premium',
        prefill: { email: user.email || '', contact: user.phone || '', name: 'Boltzy User' },
        theme: { color: '#000000' } 
      };

      const data = await RazorpayCheckout.open(options);

      Toast.show({ type: 'success', text1: 'Payment Successful!', text2: `Payment ID: ${data.razorpay_payment_id}`, position: 'top' });

    } catch (error: any) {
      const errorMsg = error.description || error.message || 'Payment cancelled or failed.';
      Toast.show({ type: 'error', text1: 'Payment Failed', text2: errorMsg, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('billing_sub') || 'Billing & Pro'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Ionicons name="rocket" size={32} color="#F5A623" />
          <Text style={styles.bannerTitle}>Boltzy Pro</Text>
          <Text style={styles.bannerSub}>Get more views and sell faster.</Text>
        </View>

        <Text style={styles.sectionTitle}>Choose your plan</Text>

        {/* Annual Subscription Card */}
        <View style={[styles.planCard, styles.planCardActive]}>
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>BEST VALUE</Text>
          </View>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Annual Pro</Text>
            <Text style={styles.planPrice}>₹1,999<Text style={styles.planDuration}> / year</Text></Text>
          </View>
          
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>Unlimited free ad posting</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>5 Premium 'Gold' Promoted Ads / month</Text>
          </View>

          <TouchableOpacity style={styles.subscribeBtn}>
            <Text style={styles.subscribeBtnText}>Upgrade to Annual Pro</Text>
          </TouchableOpacity>
        </View>

        {/* ✨ PAY-PER-POST CARD (Now Wired to Razorpay) */}
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Promote Single Ad</Text>
            <Text style={styles.planPrice}>₹99<Text style={styles.planDuration}> / ad</Text></Text>
          </View>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            Push your existing ad to the top of the search results for 7 days with a premium gold badge.
          </Text>
          
          <TouchableOpacity 
            style={styles.secondaryBtn} 
            onPress={handlePromoteAd}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.secondaryBtnText}>Pay ₹99 & Promote</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 20 : 40, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20 },
  
  banner: { backgroundColor: '#fffdf5', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#F5A623' },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#000', marginTop: 12 },
  bannerSub: { fontSize: 15, color: '#666', marginTop: 4 },
  
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 16 },
  
  planCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#eee', ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }) },
  planCardActive: { borderColor: '#000', borderWidth: 2 },
  popularBadge: { position: 'absolute', top: -12, right: 20, backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  popularText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  planName: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  planPrice: { fontSize: 24, fontWeight: 'bold', color: '#000' },
  planDuration: { fontSize: 14, color: '#666', fontWeight: 'normal' },
  
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  featureText: { fontSize: 15, color: '#333' },
  
  subscribeBtn: { backgroundColor: '#000', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryBtn: { backgroundColor: '#FFD700', padding: 16, borderRadius: 12, alignItems: 'center', ...Platform.select({ default: { elevation: 2 } }) },
  secondaryBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});