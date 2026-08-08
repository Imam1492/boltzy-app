import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { Skeleton } from '../components/ShimmerSkeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyAds() {
  const router = useRouter();
  const { lang, t, translateUGC } = useLanguage();
  const { colors, isDark, toggleTheme } = useTheme(); 
  const insets = useSafeAreaInsets();

  const [myListings, setMyListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✨ Tab state updated to Active, Pending, Inactive
  const [activeTab, setActiveTab] = useState<'Active' | 'Pending' | 'Inactive'>('Active');

  useEffect(() => {
    fetchMyListings();
  }, []);

  const fetchMyListings = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('listings')
      .select('*, chats(count)')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) setMyListings(data || []);
    setLoading(false);
  };

  const now = new Date().getTime();

  // ✨ STRICT FILTERING LOGIC
  const activeAds = myListings.filter(i => {
    const isExpired = i.expires_at ? new Date(i.expires_at).getTime() < now : false;
    return (i.approval_status === 'approved' || !i.approval_status) && !i.is_sold && !isExpired;
  });

  const pendingAds = myListings.filter(i => {
    return ['pending', 'action_required'].includes(i.approval_status) && !i.is_sold;
  });

  const inactiveAds = myListings.filter(i => {
    const isExpired = i.expires_at ? new Date(i.expires_at).getTime() < now : false;
    return i.is_sold || i.approval_status === 'draft' || isExpired;
  });

  const getVisibleAds = () => {
    if (activeTab === 'Active') return activeAds;
    if (activeTab === 'Pending') return pendingAds;
    return inactiveAds;
  };

  const handlePromoteAd = (item: any) => {
    if (Platform.OS === 'web') {
      if (window.confirm("TERMS OF SERVICE: By proceeding, you acknowledge that this digital ad promotion is strictly non-refundable. Do you agree?")) {
        executePromoteAd(item);
      }
    } else {
      Alert.alert(
        "Terms of Service",
        "By proceeding, you acknowledge that this digital ad promotion is strictly non-refundable. Do you agree?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "I Agree & Pay", onPress: () => executePromoteAd(item) }
        ]
      );
    }
  };

  const executePromoteAd = async (item: any) => {
    setLoading(true); 
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("You must be logged in to promote an ad.");

      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-razorpay-order', {
        body: { plan_type: 'single_ad', user_id: user.id, listing_id: item.id }
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
          description: `Promote "${item.title}" for 1 Month`,
          image: 'https://boltzy.in/icon.png', 
          currency: 'INR',
          key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '', 
          amount: orderData.amount,         
          order_id: orderData.order_id,     
          name: 'Boltzy Single Ad Pro',
          theme: { color: '#000000' } 
        };
        paymentData = await RazorpayCheckout.open(options);
      }

      const { error: funcError } = await supabase.functions.invoke('verify-razorpay-payment', {
        body: {
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_signature: paymentData.razorpay_signature,
          plan_type: 'single_ad',
          listing_id: item.id,
          user_id: user.id 
        }
      });

      if (funcError) throw funcError;

      Toast.show({ type: 'success', text1: 'Ad Promoted!', text2: 'Your ad is now Gold for 1 month.', position: 'top' });
      fetchMyListings(); 

    } catch (error: any) {
      const errorMsg = error.description || error.message || 'Payment cancelled or failed.';
      Toast.show({ type: 'error', text1: 'Promotion Failed', text2: errorMsg, position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  const toggleSoldStatus = (id: string, currentStatus: boolean) => {
    const title = currentStatus ? t('my_ads_relist') || 'Relist Ad' : t('my_ads_mark_sold') || 'Mark as Sold';
    const msg = currentStatus 
      ? t('my_ads_relist_confirm') || "Are you sure you want to relist this item and make it visible again?" 
      : t('my_ads_sold_confirm') || "Are you sure you want to mark this item as sold? It will be hidden from the main feed.";

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) {
        executeToggleSold(id, currentStatus);
      }
    } else {
      Alert.alert(title, msg, [
        { text: t('Cancel') || "Cancel", style: "cancel" },
        { text: t('yes') || "Yes", onPress: () => executeToggleSold(id, currentStatus) }
      ]);
    }
  };

  const executeToggleSold = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('listings').update({ is_sold: !currentStatus }).eq('id', id);

    if (!error) {
      setMyListings(prev => prev.map(item => item.id === id ? { ...item, is_sold: !currentStatus } : item));
    } else {
      Alert.alert(t('common_error') || 'Error', t('my_ads_err_update') || 'Could not update ad.');
    }
  };

  const deleteAd = (id: string) => {
    const confirmMsg = t('my_ads_delete_msg') || "Are you sure you want to permanently delete this ad?";
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) executeDeepDelete(id);
    } else {
      Alert.alert(t('my_ads_delete_title') || "Delete Ad", confirmMsg, [
        { text: t('Cancel') || "Cancel", style: "cancel" },
        { text: t('my_ads_delete') || "Delete", style: "destructive", onPress: () => executeDeepDelete(id) }
      ]);
    }
  };

  const executeDeepDelete = async (id: string) => {
    setLoading(true);
    try {
      const { data: chats } = await supabase.from('chats').select('id').eq('listing_id', id);
      if (chats && chats.length > 0) {
        const chatIds = chats.map(c => c.id);
        await supabase.from('messages').delete().in('chat_id', chatIds); 
        await supabase.from('reviews').delete().in('chat_id', chatIds);  
        await supabase.from('chats').delete().in('id', chatIds);         
      }
      await supabase.from('wishlist').delete().eq('listing_id', id); 
      await supabase.from('reviews').delete().eq('listing_id', id);  
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;

      setMyListings(prev => prev.filter(item => item.id !== id));
      if (Platform.OS === 'web') window.alert("Ad deleted successfully.");
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
      else Alert.alert(t('common_error') || "Delete Error", "Could not delete ad. " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls?.[0];
    const displayTitle = item.translations?.[lang]?.title || translateUGC(item.title);
    const chatCount = item.chats?.[0]?.count || 0; 

    const isPending = item.approval_status === 'pending';
    const isRejected = item.approval_status === 'rejected' || item.approval_status === 'action_required';
    const isApproved = item.approval_status === 'approved' || !item.approval_status; 
    const isDraft = item.approval_status === 'draft';
    const isExpired = item.expires_at ? new Date(item.expires_at).getTime() < new Date().getTime() : false;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, item.is_premium && { borderColor: '#F5A623', borderWidth: 2 }, isRejected && { borderColor: '#FF3B30', borderWidth: 1 }]}>
        <TouchableOpacity style={styles.cardMain} onPress={() => isApproved && !isExpired ? router.push(`/listing/${item.id}` as any) : null} activeOpacity={isApproved && !isExpired ? 0.7 : 1}>
          {imageUrl ? ( <Image source={{ uri: imageUrl }} style={[styles.image, (isPending || isRejected || isDraft || isExpired || item.is_sold) && { opacity: 0.5 }]} /> ) : ( <View style={[styles.image, { backgroundColor: colors.backgroundSecondary }]} /> )}
          
          <View style={styles.details}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{displayTitle}</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{item.price}</Text>
              </View>
              
              <View style={[styles.statusBadge, isPending && {backgroundColor: isDark ? '#422006' : '#FFFBEB'}, isRejected && {backgroundColor: isDark ? '#450a0a' : '#FEF2F2'}, (isDraft || isExpired || item.is_sold) && {backgroundColor: colors.backgroundSecondary}]}>
                <Text style={[styles.statusText, isPending && {color: isDark ? '#fde047' : '#D97706'}, isRejected && {color: '#FF3B30'}, (isDraft || isExpired || item.is_sold) && {color: colors.textSecondary}]}>
                  {item.is_sold ? 'Sold' : isExpired ? 'Expired' : isDraft ? 'Draft' : isPending ? 'Pending' : isRejected ? 'Action Required' : 'Active'}
                </Text>
              </View>
            </View>
            
            <View style={styles.statsRow}>
               <View style={styles.statItem}>
                 <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
                 <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.views || 0}</Text>
               </View>
               <View style={styles.statItem}>
                 <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
                 <Text style={[styles.statText, { color: colors.textSecondary }]}>{chatCount}</Text>
               </View>
            </View>
          </View>
        </TouchableOpacity>

        {isRejected && item.moderation_note && (
          <View style={{ backgroundColor: isDark ? '#450a0a' : '#FEF2F2', padding: 12, borderTopWidth: 1, borderTopColor: isDark ? '#7f1d1d' : '#FEE2E2' }}>
            <Text style={{ color: isDark ? '#fca5a5' : '#B91C1C', fontSize: 13, fontWeight: '600' }}><Ionicons name="warning" size={14} /> Moderation Note:</Text>
            <Text style={{ color: isDark ? '#fecaca' : '#991B1B', fontSize: 13, marginTop: 4 }}>{item.moderation_note}</Text>
          </View>
        )}

        {isApproved && !item.is_premium && !item.is_sold && !isExpired && (
          <TouchableOpacity style={[styles.promoteBanner, { backgroundColor: isDark ? '#3d2e00' : '#FFFDF5', borderTopColor: colors.border }]} onPress={() => handlePromoteAd(item)}>
            <Ionicons name="star" size={16} color="#F5A623" />
            <Text style={styles.promoteBannerText}>Promote Ad to Top (₹249)</Text>
          </TouchableOpacity>
        )}
        {isApproved && item.is_premium && !item.is_sold && !isExpired && (
          <View style={styles.promotedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.promotedBadgeText}>Promoted (Gold Status)</Text>
          </View>
        )}

        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          {(!item.is_sold && isApproved && !isExpired) && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => toggleSoldStatus(item.id, item.is_sold)}>
              <Text style={[styles.actionBtnText, { color: colors.text }]}>Mark Sold</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, (!item.is_sold && isApproved && !isExpired) && [styles.borderLeft, { borderLeftColor: colors.border }]]} onPress={() => router.push(`/edit-post?id=${item.id}` as any)}>
            <Text style={[styles.actionBtnText, { color: '#007AFF' }]}>{isRejected ? 'Fix Ad' : 'Edit'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.borderLeft, { borderLeftColor: colors.border }]} onPress={() => deleteAd(item.id)}>
            <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('my_ads_title') || 'My Ads'}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* ✨ REWRITTEN TABS: Active | Pending | Inactive */}
      <View style={[styles.tabContainer, { backgroundColor: colors.backgroundSecondary }]}>
        <TouchableOpacity style={[styles.tab, activeTab === 'Active' && [styles.tabActive, { backgroundColor: colors.card }]]} onPress={() => setActiveTab('Active')}>
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'Active' && [styles.tabTextActive, { color: colors.text }]]}>Active ({activeAds.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'Pending' && [styles.tabActive, { backgroundColor: colors.card }]]} onPress={() => setActiveTab('Pending')}>
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'Pending' && [styles.tabTextActive, { color: colors.text }]]}>Pending ({pendingAds.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'Inactive' && [styles.tabActive, { backgroundColor: colors.card }]]} onPress={() => setActiveTab('Inactive')}>
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'Inactive' && [styles.tabTextActive, { color: colors.text }]]}>Inactive ({inactiveAds.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <FlatList
          data={['1', '2', '3', '4']}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContainer}
          renderItem={() => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardMain}>
                <Skeleton width={90} height={90} borderRadius={12} />
                <View style={styles.details}>
                  <Skeleton width={80} height={22} style={{ marginBottom: 6 }} />
                  <Skeleton width={160} height={16} style={{ marginBottom: 12 }} />
                  <View style={styles.statsRow}>
                    <Skeleton width={60} height={22} borderRadius={6} />
                    <Skeleton width={40} height={16} />
                  </View>
                </View>
              </View>
              <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
                <Skeleton height={46} borderRadius={0} style={{ flex: 1 }} />
                <Skeleton height={46} borderRadius={0} style={[{ flex: 1 }, styles.borderLeft, { borderLeftColor: colors.border }]} />
                <Skeleton height={46} borderRadius={0} style={[{ flex: 1 }, styles.borderLeft, { borderLeftColor: colors.border }]} />
              </View>
            </View>
          )}
        />
      ) : getVisibleAds().length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="megaphone-outline" size={80} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No {activeTab.toLowerCase()} ads found.</Text>
          {activeTab === 'Active' && (
            <TouchableOpacity style={[styles.postBtn, { backgroundColor: colors.tint }]} onPress={() => router.push('/post' as any)}>
              <Text style={[styles.postBtnText, { color: isDark ? '#000' : '#fff' }]}>{t('my_ads_post_first') || 'Post your first ad'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={getVisibleAds()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  
  tabContainer: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabTextActive: {},

  listContainer: { padding: 16 },
  card: { borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, elevation: 1 },
  cardMain: { flexDirection: 'row', padding: 16 },
  image: { width: 90, height: 90, borderRadius: 12 },
  details: { flex: 1, marginLeft: 16, justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  price: { fontSize: 18, fontWeight: 'bold' },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, fontWeight: '500' },

  promoteBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, borderTopWidth: 1 },
  promoteBannerText: { color: '#F5A623', fontSize: 14, fontWeight: 'bold' },
  promotedBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F5A623', paddingVertical: 8 },
  promotedBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  actionRow: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  borderLeft: { borderLeftWidth: 1 },
  actionBtnText: { fontSize: 14, fontWeight: '600' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, marginTop: 16, textAlign: 'center' },
  postBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  postBtnText: { fontWeight: 'bold' },
});