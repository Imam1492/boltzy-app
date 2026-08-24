import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,Platform } from 'react-native';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { Skeleton } from '../components/ShimmerSkeleton';

export default function SavedItems() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t, translateUGC } = useLanguage();
 const { colors, isDark, toggleTheme } = useTheme(); // ✨ Ensure toggleTheme is here

  const [savedListings, setSavedListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => { fetchSavedListings(); }, []);

  const fetchSavedListings = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('wishlist')
      .select(`listing_id, listings (*)`)
      .eq('user_id', user.id);

    if (!error && data) {
      const items = data.map(item => item.listings).filter(Boolean);
      setSavedListings(items);
    }
    setLoading(false);
  };

  const toggleSaved = async (listingId: string) => {
    const user = await getCurrentUser();
    if (!user) return;

    setSavedListings(prev => prev.filter(item => item.id !== listingId));

    const { error } = await supabase
      .from('wishlist')
      .delete()
      .match({ user_id: user.id, listing_id: listingId });

    if (error) {
      Alert.alert(t('common_error') || "Error", "Could not update saved items.");
      fetchSavedListings(); 
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;
    const isGrid = viewMode === 'grid';

    return (
      <TouchableOpacity 
        style={[
          styles.card, 
          { backgroundColor: colors.card, borderColor: colors.border },
          isGrid && styles.cardGrid
        ]} 
        onPress={() => router.push(('/listing/' + item.id) as any)}
        activeOpacity={0.8}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={[styles.image, isGrid && styles.imageGrid]} />
        ) : (
          <View style={[styles.image, isGrid && styles.imageGrid, { backgroundColor: colors.backgroundSecondary }]} />
        )}
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.price, { color: colors.text }]}>₹{item.price}</Text>
              <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>{translateUGC(item.title)}</Text>
            </View>
            <TouchableOpacity onPress={() => toggleSaved(item.id)} style={styles.heartBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="heart" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>{translateUGC(item.location)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('saved_title') || 'Saved Ads'}</Text>
        <TouchableOpacity onPress={() => setViewMode(prev => prev === 'list' ? 'grid' : 'list')} style={{ padding: 4 }}>
          <Ionicons name={viewMode === 'list' ? 'grid' : 'list'} size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <FlatList
          key={viewMode}
          numColumns={viewMode === 'grid' ? 2 : 1}
          data={['1', '2', '3', '4', '5', '6']}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={viewMode === 'grid' ? { gap: 12 } : undefined}
          renderItem={() => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, viewMode === 'grid' && styles.cardGrid]}>
              <Skeleton width={viewMode === 'grid' ? '100%' : 110} height={110} borderRadius={0} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width={80} height={20} />
                    <Skeleton width={viewMode === 'grid' ? 100 : 140} height={16} />
                  </View>
                  <Skeleton width={24} height={24} borderRadius={12} />
                </View>
              </View>
            </View>
          )}
        />
      ) : savedListings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={80} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('saved_empty') || 'No saved items yet'}</Text>
        </View>
      ) : (
        <FlatList
          key={viewMode}
          numColumns={viewMode === 'grid' ? 2 : 1}
          data={savedListings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={viewMode === 'grid' ? { gap: 12 } : undefined}
          onRefresh={fetchSavedListings}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
 header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, 
    borderBottomWidth: 0, 
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 } }) 
  },
  card: { 
    borderRadius: 12, marginBottom: 16, overflow: 'hidden', borderWidth: 0, flexDirection: 'row', 
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6 } }) 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  listContainer: { padding: 16 },
  cardGrid: { flexDirection: 'column', flex: 1, maxWidth: '48%', marginBottom: 12 },
  image: { width: 120, height: 120 },
  imageGrid: { width: '100%', height: 140 },
  cardContent: { padding: 12, flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  price: { fontSize: 18, fontWeight: 'bold' },
  title: { fontSize: 14, marginTop: 2 },
  location: { fontSize: 12, marginTop: 8 },
  heartBtn: { paddingLeft: 8 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, marginTop: 16 },
});