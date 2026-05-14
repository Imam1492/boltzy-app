import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

export default function MyAds() {
  const router = useRouter();
  const { t } = useLanguage();
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

  const toggleSoldStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('listings')
      .update({ is_sold: !currentStatus })
      .eq('id', id);

    if (!error) {
      setMyListings(prev => prev.map(item => 
        item.id === id ? { ...item, is_sold: !currentStatus } : item
      ));
    } else {
      Alert.alert(t('common_error'), t('my_ads_err_update'));
    }
  };

  const deleteAd = (id: string) => {
    Alert.alert(t('my_ads_delete_title'), t('my_ads_delete_msg'), [
      { text: t('Cancel'), style: "cancel" },
      { text: t('my_ads_delete'), style: "destructive", onPress: async () => {
          const { error } = await supabase.from('listings').delete().eq('id', id);
          if (!error) {
            setMyListings(prev => prev.filter(item => item.id !== id));
          } else {
            Alert.alert(t('common_error'), t('my_ads_err_delete'));
          }
      }}
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls?.[0];

    return (
      <View style={styles.card}>
        <TouchableOpacity 
          style={styles.cardMain} 
          onPress={() => router.push(`/listing/${item.id}` as any)}
        >
          {imageUrl ? (
             <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
             <View style={[styles.image, { backgroundColor: '#eee' }]} />
          )}
          
          <View style={styles.details}>
            <Text style={styles.price}>₹{item.price}</Text>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            
            <View style={styles.statsRow}>
               {/* Fixed dynamic badge logic */}
               <View style={[
                 styles.statusBadge, 
                 { backgroundColor: item.is_sold ? '#FFEBEB' : '#E8F5E9' }
               ]}>
                  <Text style={[
                    styles.statusText, 
                    { color: item.is_sold ? '#FF3B30' : '#2E7D32' }
                  ]}>
                    {item.is_sold ? t('my_ads_status_sold') : t('my_ads_status_active')}
                  </Text>
               </View>
               <Text style={styles.viewCount}>
                 <Ionicons name="eye-outline" size={14} color="#888" /> 42
               </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          {/* 1. Mark Sold / Relist */}
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => toggleSoldStatus(item.id, item.is_sold)}
          >
            <Ionicons name={item.is_sold ? "refresh-outline" : "checkmark-done-outline"} size={18} color="#000" />
            <Text style={styles.actionBtnText}>{item.is_sold ? t('my_ads_relist') : t('my_ads_mark_sold')}</Text>
          </TouchableOpacity>

          {/* 2. NEW EDIT BUTTON */}
          <TouchableOpacity 
            style={[styles.actionBtn, styles.borderLeft]} 
            onPress={() => router.push(`/edit-post?id=${item.id}` as any)}
          >
            <Ionicons name="create-outline" size={18} color="#007AFF" />
            <Text style={[styles.actionBtnText, { color: '#007AFF' }]}>{t('my_ads_edit')}</Text>
          </TouchableOpacity>

          {/* 3. Remove Button */}
          <TouchableOpacity 
            style={[styles.actionBtn, styles.borderLeft]} 
            onPress={() => deleteAd(item.id)}
          >
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
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('my_ads_title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
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
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 60, 
    paddingBottom: 20, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  listContainer: { padding: 16 },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 16, 
    overflow: 'hidden', 
    elevation: 3, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 10 
  },
  cardMain: { flexDirection: 'row', padding: 12 },
  image: { width: 90, height: 90, borderRadius: 12 },
  details: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  price: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  title: { fontSize: 16, color: '#444', marginBottom: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  viewCount: { fontSize: 13, color: '#888' },
  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    paddingVertical: 12 
  },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16, textAlign: 'center' },
  postBtn: { 
    marginTop: 20, 
    backgroundColor: '#000', 
    paddingHorizontal: 24, 
    paddingVertical: 12, 
    borderRadius: 8 
  },
  postBtnText: { color: '#fff', fontWeight: 'bold' },
});
