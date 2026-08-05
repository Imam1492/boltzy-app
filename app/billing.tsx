import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { Skeleton } from '../components/ShimmerSkeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export default function BillingScreen() {
  const router = useRouter();
  const { t } = useLanguage();
 const { colors, isDark, toggleTheme } = useTheme(); // ✨ Ensure toggleTheme is here
 const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false); 
  const [pageLoading, setPageLoading] = useState(true); 
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false); 
  const [goldTokenExpiryDays, setGoldTokenExpiryDays] = useState(0); 
  const [adsPosted, setAdsPosted] = useState(0); 

  useEffect(() => {
    const loadBillingData = async () => {
      setPageLoading(true); 
      const user = await getCurrentUser();
      if (!user) {
        setPageLoading(false);
        return;
      }
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) {
        const isPro = profile.subscription_tier === 'pro_yearly' && profile.subscription_expiry && new Date(profile.subscription_expiry) > new Date();
        setIsSubscribed(isPro);
        
        if (profile.gold_tokens > 0 && profile.gold_token_expiry) {
          const daysLeft = Math.ceil((new Date(profile.gold_token_expiry).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
          setGoldTokenExpiryDays(daysLeft > 0 ? daysLeft : 0);
        }
      }

      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { count } = await supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', user.id).gte('created_at', startOfYear);
      setAdsPosted(count || 0);
      
      setPageLoading(false); 
    };
    loadBillingData();
  }, []);

  const handlePromoteSingleAd = () => {
    router.push('/my-ads' as any);
  };

  const handleSubscribeYearly = async () => {
    setLoading(true);
    if (!agreedToTerms) {
        Toast.show({ 
          type: 'error', 
          text1: 'Terms Required', 
          text2: 'Please accept the Terms of Service to proceed with payment.', 
          position: 'top' 
        });
        setLoading(false);
        return; 
      }
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please log in to subscribe.");

      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-razorpay-order', {
        body: { 
          plan_type: 'pro_yearly',
          user_id: user.id 
        }
      });

      if (orderError) throw orderError;
      if (!orderData || !orderData.order_id) throw new Error("Could not generate secure order from server.");

      let paymentData: any = {
        razorpay_order_id: orderData.order_id,
        razorpay_payment_id: `pay_sim_${Math.floor(Math.random() * 10000)}`,
        razorpay_signature: 'simulated_signature'
      };

      if (Platform.OS !== 'web') {
        const RazorpayCheckout = require('react-native-razorpay').default;
        const options = {
          description: 'Yearly Pro Plan (50 Ads + 1 Gold Token)',
          image: 'https://boltzy.in/icon.png', 
          currency: 'INR',
          key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '', 
          amount: orderData.amount,         
          order_id: orderData.order_id,     
          name: 'Boltzy Yearly Pro',
          prefill: { email: user.email || '', contact: user.phone || '' }, 
          theme: { color: '#000000' } 
        };
        paymentData = await RazorpayCheckout.open(options);
      }

      const { error: funcError } = await supabase.functions.invoke('verify-razorpay-payment', {
        body: {
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_signature: paymentData.razorpay_signature,
          plan_type: 'pro_yearly',
          user_id: user.id
        }
      });

      if (funcError) throw funcError;

      setIsSubscribed(true);
      setGoldTokenExpiryDays(90);
      Toast.show({ type: 'success', text1: 'Subscription Active!', text2: `You are now a Pro member.`, position: 'top' });

    } catch (error: any) {
      const errorMsg = error.description || error.message || 'Payment cancelled or failed.';
      Toast.show({ type: 'error', text1: 'Subscription Failed', text2: errorMsg, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('billing_sub') || 'Billing & Pro'}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Skeleton width="100%" height={90} borderRadius={16} style={{ marginBottom: 24 }} />
          <Skeleton width={150} height={20} style={{ marginBottom: 16 }} />
          <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <Skeleton width={120} height={24} />
              <Skeleton width={80} height={28} />
            </View>
            <Skeleton width="90%" height={16} style={{ marginBottom: 12 }} />
            <Skeleton width="80%" height={16} style={{ marginBottom: 12 }} />
            <Skeleton width="70%" height={16} style={{ marginBottom: 24 }} />
            <Skeleton width="100%" height={56} borderRadius={12} />
          </View>
          <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Skeleton width={140} height={20} />
              <Skeleton width={80} height={24} />
            </View>
            <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="85%" height={14} style={{ marginBottom: 20 }} />
            <Skeleton width="100%" height={56} borderRadius={12} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('billing_sub') || 'Billing & Pro'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {!isSubscribed ? (
          <View style={[styles.usageBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={[styles.usageTitle, { color: colors.text }]}>Free Ads Used</Text>
              <Text style={[styles.usageTitle, { color: colors.text }]}>{adsPosted} / 3</Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: colors.backgroundSecondary }]}>
              <View style={[styles.progressBarFill, { backgroundColor: colors.tint, width: `${Math.min((adsPosted / 3) * 100, 100)}%` }]} />
            </View>
            <Text style={[styles.usageSub, { color: colors.textSecondary }]}>You get 3 free ads per year. Upgrade to post more!</Text>
          </View>
        ) : (
          <View style={[styles.activeSubBanner, { backgroundColor: isDark ? '#142e19' : '#e8f5e9', borderColor: isDark ? '#1f4726' : '#c8e6c9' }]}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[styles.activeSubTitle, { color: isDark ? '#4ade80' : '#2E7D32' }]}>Yearly Pro Active</Text>
              <Text style={[styles.activeSubText, { color: isDark ? '#22c55e' : '#388E3C' }]}>You can post up to 50 ads this year.</Text>
            </View>
          </View>
        )}

        {isSubscribed && goldTokenExpiryDays > 0 && (
          <View style={[styles.urgencyBanner, { backgroundColor: isDark ? '#422006' : '#FFFBEB', borderColor: isDark ? '#713f12' : '#FDE68A' }]}>
            <Ionicons name="time" size={24} color="#D97706" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[styles.urgencyTitle, { color: isDark ? '#fde047' : '#D97706' }]}>Unused Gold Ad Token!</Text>
              <Text style={[styles.urgencyText, { color: isDark ? '#fef08a' : '#B45309' }]}>Your free 1-week promotion expires in <Text style={{ fontWeight: 'bold' }}>{goldTokenExpiryDays} days</Text>. Use it on any of your ads before it's gone!</Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose your plan</Text>

        <View style={[styles.planCard, styles.planCardActive, { backgroundColor: colors.card, borderColor: colors.text }]}>
          <View style={[styles.popularBadge, { backgroundColor: colors.text }]}>
            <Text style={[styles.popularText, { color: colors.background }]}>BEST VALUE</Text>
          </View>
          <View style={styles.planHeader}>
            <Text style={[styles.planName, { color: colors.text }]}>Yearly Pro</Text>
            <Text style={[styles.planPrice, { color: colors.text }]}>₹299<Text style={[styles.planDuration, { color: colors.textSecondary }]}> / year</Text></Text>
          </View>
          
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={[styles.featureText, { color: colors.text }]}>Post up to 50 Ads per year</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="star" size={20} color="#F5A623" />
            <Text style={[styles.featureText, { color: colors.text }]}>1 Free 'Gold' Ad Token (Promote any ad for 1 week)</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="alert-circle" size={20} color={colors.textSecondary} />
            <Text style={[styles.featureSubText, { color: colors.textSecondary }]}>Note: Gold token expires 3 months after plan purchase if unused.</Text>
          </View>

        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 20, paddingHorizontal: 4 }} 
          onPress={() => setAgreedToTerms(!agreedToTerms)}
        >
          <Ionicons 
            name={agreedToTerms ? "checkbox" : "square-outline"} 
            size={24} 
            color={agreedToTerms ? colors.text : colors.textSecondary} 
          />
          <Text style={{ marginLeft: 10, fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 }}>
            I agree to the Terms of Service and acknowledge that this digital subscription is strictly non-refundable.
          </Text>
        </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.subscribeBtn, { backgroundColor: colors.tint }, isSubscribed && { backgroundColor: colors.backgroundSecondary }]} 
            onPress={handleSubscribeYearly}
            disabled={loading || isSubscribed}
          >
            {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.subscribeBtnText, { color: isDark ? '#000' : '#fff' }, isSubscribed && { color: colors.textSecondary }]}>{isSubscribed ? 'Current Plan' : 'Upgrade to Yearly Pro'}</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.planHeader}>
            <Text style={[styles.planName, { color: colors.text }]}>Promote Single Ad</Text>
            <Text style={[styles.planPrice, { color: colors.text }]}>₹249<Text style={[styles.planDuration, { color: colors.textSecondary }]}> / month</Text></Text>
          </View>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
            Push a single existing ad to the top of the search results for an entire month with a premium Gold badge.
          </Text>
          
          <TouchableOpacity 
            style={styles.secondaryBtn} 
            onPress={handlePromoteSingleAd}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.secondaryBtnText}>Select Ad in My Ads (₹249)</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  usageBanner: { padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1 },
  usageTitle: { fontSize: 16, fontWeight: 'bold' },
  progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  progressBarFill: { height: '100%' },
  usageSub: { fontSize: 13 },
  activeSubBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1 },
  activeSubTitle: { fontSize: 16, fontWeight: 'bold' },
  activeSubText: { fontSize: 13, marginTop: 2 },
  urgencyBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1 },
  urgencyTitle: { fontSize: 16, fontWeight: 'bold' },
  urgencyText: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  planCard: { borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }) },
  planCardActive: { borderWidth: 2 },
  popularBadge: { position: 'absolute', top: -12, right: 20, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  popularText: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  planName: { fontSize: 20, fontWeight: 'bold' },
  planPrice: { fontSize: 24, fontWeight: 'bold' },
  planDuration: { fontSize: 14, fontWeight: 'normal' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  featureText: { fontSize: 15, flex: 1, marginTop: 1 },
  featureSubText: { fontSize: 12, flex: 1, marginTop: 2, fontStyle: 'italic' },
  subscribeBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  subscribeBtnText: { fontSize: 16, fontWeight: 'bold' },
  secondaryBtn: { backgroundColor: '#FFD700', padding: 16, borderRadius: 12, alignItems: 'center', ...Platform.select({ default: { elevation: 2 } }) },
  secondaryBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});