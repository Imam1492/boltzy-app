import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';
// ✨ NEW: Import Razorpay and Toast
import Toast from 'react-native-toast-message';

export default function MyAds() {
  const router = useRouter();
  const { lang, t, translateUGC } = useLanguage();
  const [myListings, setMyListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyListings();
  }, []);

  const fetchMyListings = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) setMyListings(data || []);
    setLoading(false);
  };

  // ✨ THE RAZORPAY PROMOTION ENGINE
// ✨ THE RAZORPAY PROMOTION ENGINE
  const handlePromoteAd = async (item: any) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please log in to make a payment.");

      // 💻 ✨ WEB BYPASS: Simulate the payment so we can test the UI on laptops!
      if (Platform.OS === 'web') {
        const { error } = await supabase.from('listings').update({ is_premium: true }).eq('id', item.id);
        if (error) throw error;
        setMyListings(prev => prev.map(ad => ad.id === item.id ? { ...ad, is_premium: true } : ad));
        Toast.show({ type: 'success', text1: 'Simulated Web Payment', text2: 'Your ad is now Gold!', position: 'top' });
        return;
      }

      // 📱 ✨ MOBILE ONLY: Dynamically load Razorpay to prevent Web crashes
      const RazorpayCheckout = require('react-native-razorpay').default;

      // 1. Prepare the payment settings specifically for THIS ad
      const options = {
        description: `Promote Ad: ${item.title}`,
        image: 'https://boltzy.in/icon.png', 
        currency: 'INR',
        key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '', 
        amount: 9900, 
        name: 'Boltzy Premium',
        prefill: { email: user.email || '', contact: user.phone || '', name: 'Boltzy User' },
        theme: { color: '#000000' } 
      };

      // 2. Open the Razorpay Bottom Sheet
      const data = await RazorpayCheckout.open(options);

      // 3. If Successful, instantly update Supabase!
      const { error } = await supabase.from('listings').update({ is_premium: true }).eq('id', item.id);
      if (error) throw error;

      // 4. Update the local UI so it instantly turns gold
      setMyListings(prev => prev.map(ad => ad.id === item.id ? { ...ad, is_premium: true } : ad));

      Toast.show({ type: 'success', text1: 'Ad Promoted!', text2: 'Your ad is now at the top of the Home Feed!', position: 'top' });

    } catch (error: any) {
      const errorMsg = error.description || error.message || 'Payment cancelled or failed.';
      Toast.show({ type: 'error', text1: 'Payment Failed', text2: errorMsg, position: 'top' });
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

    return (
      <View style={[styles.card, item.is_premium && { borderColor: '#F5A623', borderWidth: 2 }]}>
        <TouchableOpacity style={styles.cardMain} onPress={() => router.push(`/listing/${item.id}` as any)}>
          {imageUrl ? ( <Image source={{ uri: imageUrl }} style={styles.image} /> ) : ( <View style={[styles.image, { backgroundColor: '#eee' }]} /> )}
          
          <View style={styles.details}>
            <Text style={styles.price}>₹{item.price}</Text>
            <Text style={styles.title} numberOfLines={1}>{displayTitle}</Text>
            
            <View style={styles.statsRow}>
               <View style={[styles.statusBadge, { backgroundColor: item.is_sold ? '#FFEBEB' : '#E8F5E9' }]}>
                  <Text style={[styles.statusText, { color: item.is_sold ? '#FF3B30' : '#2E7D32' }]}>
                    {item.is_sold ? t('my_ads_status_sold') : t('my_ads_status_active')}
                  </Text>
               </View>
               <Text style={styles.viewCount}><Ionicons name="eye-outline" size={14} color="#888" /> 42</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ✨ NEW: PREMIUM UPSELL OR SUCCESS BADGE */}
        {!item.is_premium ? (
          <TouchableOpacity 
            style={styles.promoteBanner} 
            onPress={() => handlePromoteAd(item)}
          >
            <Ionicons name="star" size={16} color="#F5A623" />
            <Text style={styles.promoteBannerText}>Promote Ad to Top (₹99)</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.promotedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.promotedBadgeText}>Promoted (Gold Status)</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => toggleSoldStatus(item.id, item.is_sold)}>
            <Ionicons name={item.is_sold ? "refresh-outline" : "checkmark-done-outline"} size={18} color="#000" />
            <Text style={styles.actionBtnText}>{item.is_sold ? t('my_ads_relist') : t('my_ads_mark_sold')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.borderLeft]} onPress={() => router.push(`/edit-post?id=${item.id}` as any)}>
            <Ionicons name="create-outline" size={18} color="#007AFF" />
            <Text style={[styles.actionBtnText, { color: '#007AFF' }]}>{t('my_ads_edit')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.borderLeft]} onPress={() => deleteAd(item.id)}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>{t('my_ads_delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#000" /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('my_ads_title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>
      ) : myListings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="megaphone-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>{t('my_ads_empty')}</Text>
          <TouchableOpacity style={styles.postBtn} onPress={() => router.push('/post')}>
            <Text style={styles.postBtnText}>{t('my_ads_post_first')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={myListings}
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  listContainer: { padding: 16 },
  
  card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  cardMain: { flexDirection: 'row', padding: 12 },
  image: { width: 90, height: 90, borderRadius: 12 },
  details: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  price: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  title: { fontSize: 16, color: '#444', marginBottom: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  viewCount: { fontSize: 13, color: '#888' },
  
  // ✨ NEW STYLES FOR THE PROMOTE BANNERS
  promoteBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#FFFDF5', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  promoteBannerText: { color: '#F5A623', fontSize: 14, fontWeight: 'bold' },
  promotedBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F5A623', paddingVertical: 8 },
  promotedBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16, textAlign: 'center' },
  postBtn: { marginTop: 20, backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  postBtnText: { color: '#fff', fontWeight: 'bold' },
});