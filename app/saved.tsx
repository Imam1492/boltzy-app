import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, Image, Alert } from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext'; // ✨ IMPORT TRANSLATOR

export default function SavedItems() {
  const router = useRouter();
  const { t, translateUGC } = useLanguage(); // ✨ ACTIVATE TRANSLATOR

  const [savedListings, setSavedListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSavedListings();
  }, []);

  const fetchSavedListings = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('wishlist')
      .select(`
        listing_id,
        listings (*)
      `)
      .eq('user_id', user.id);

    if (!error && data) {
      const items = data.map(item => item.listings).filter(Boolean);
      setSavedListings(items);
    }
    setLoading(false);
  };

  const removeFromSaved = async (listingId: string) => {
    const user = await getCurrentUser();
    if (!user) return;

    // Optimistic Update: Remove from UI immediately
    setSavedListings(prev => prev.filter(item => item.id !== listingId));

    const { error } = await supabase
      .from('wishlist')
      .delete()
      .match({ user_id: user.id, listing_id: listingId });

    if (error) {
      Alert.alert(t('common_error') || "Error", "Could not remove item.");
      fetchSavedListings(); // Rollback/Refresh if it failed
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return (
      <TouchableOpacity 
        style={styles.card} 
        onPress={() => router.push(('/listing/' + item.id) as any)}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: '#eee' }]} />
        )}
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.price}>₹{item.price}</Text>
              {/* ✨ TRANSLATE DYNAMIC AD TITLE ✨ */}
              <Text style={styles.title} numberOfLines={1}>{translateUGC(item.title)}</Text>
            </View>
            
            {/* --- TRASH BUTTON --- */}
            <TouchableOpacity 
              onPress={() => removeFromSaved(item.id)}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
            </TouchableOpacity>
          </View>
          
          {/* ✨ TRANSLATE DYNAMIC LOCATION ✨ */}
          <Text style={styles.location}>{translateUGC(item.location)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        {/* ✨ TRANSLATE HEADER ✨ */}
        <Text style={styles.headerTitle}>{t('saved_title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
      ) : savedListings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={80} color="#ccc" />
          {/* ✨ TRANSLATE EMPTY STATE ✨ */}
          <Text style={styles.emptyText}>{t('saved_empty')}</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/home' as any)}>
            <Text style={styles.browseBtnText}>{t('saved_browse')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={savedListings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          onRefresh={fetchSavedListings}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    paddingTop: 60, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee' 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  listContainer: { padding: 16 },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    marginBottom: 16, 
    overflow: 'hidden', 
    elevation: 2, 
    flexDirection: 'row' 
  },
  image: { width: 110, height: 110 },
  cardContent: { padding: 12, flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  price: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  title: { fontSize: 15, color: '#444', marginTop: 2 },
  location: { fontSize: 13, color: '#888', marginTop: 4 },
  deleteBtn: { padding: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16 },
  browseBtn: { marginTop: 20, backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  browseBtnText: { color: '#fff', fontWeight: 'bold' }
});