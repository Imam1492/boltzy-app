import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Linking,
  Platform, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../../supabase';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2; // 2-column grid with padding

// ─── Star display ─────────────────────────────────────────────────────────────
const StarRow = ({ rating, size = 14, color = '#F5A623' }: { rating: number; size?: number; color?: string }) => (
  <View style={{ flexDirection: 'row', gap: 2 }}>
    {[1, 2, 3, 4, 5].map((s) => (
      <Ionicons
        key={s}
        name={rating >= s ? 'star' : rating >= s - 0.5 ? 'star-half' : 'star-outline'}
        size={size}
        color={color}
      />
    ))}
  </View>
);

// ─── Review Card ──────────────────────────────────────────────────────────────
const ReviewCard = ({ review }: { review: any }) => {
  const timeAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff < 7)  return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return `${Math.floor(diff / 30)}mo ago`;
  };
  return (
    <View style={s.reviewCard}>
      <View style={s.reviewHeader}>
        <View style={s.reviewAvatar}>
          {review.reviewer?.avatar_url
            ? <Image source={{ uri: review.reviewer.avatar_url }} style={s.reviewAvatarImg} />
            : <Text style={s.reviewAvatarLetter}>{review.reviewer?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.reviewerName}>{review.reviewer?.display_name || 'Anonymous'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <StarRow rating={review.rating} size={12} />
            <Text style={s.reviewTime}>{timeAgo(review.created_at)}</Text>
          </View>
        </View>
        <View style={[s.ratingBadge, review.rating >= 4 ? s.ratingBadgeGreen : review.rating >= 3 ? s.ratingBadgeAmber : s.ratingBadgeRed]}>
          <Text style={s.ratingBadgeText}>{review.rating}.0</Text>
        </View>
      </View>
      {review.review_text ? (
        <Text style={s.reviewText}>"{review.review_text}"</Text>
      ) : null}
      {review.listing?.title ? (
        <View style={s.reviewListingTag}>
          <Ionicons name="pricetag-outline" size={11} color="#888" />
          <Text style={s.reviewListingTitle} numberOfLines={1}>re: {review.listing.title}</Text>
        </View>
      ) : null}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function PublicProfile() {
  const { id: userId } = useLocalSearchParams();
  const router = useRouter();

  const [profile, setProfile]       = useState<any>(null);
  const [stats, setStats]           = useState<{ avg_rating: number; review_count: number } | null>(null);
  const [listings, setListings]     = useState<any[]>([]);
  const [reviews, setReviews]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'listings' | 'reviews'>('listings');
  const [totalSold, setTotalSold]   = useState(0);

  useEffect(() => { fetchAll(); }, [userId]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    // Profile
    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    if (profileData) setProfile(profileData);

    // Seller stats (view)
    const { data: statsData } = await supabase
      .from('seller_stats').select('*').eq('seller_id', userId).single();
    if (statsData) setStats(statsData);

    // Active listings
    const { data: listingsData } = await supabase
      .from('listings').select('*')
      .eq('seller_id', userId).eq('is_sold', false)
      .order('created_at', { ascending: false });
    if (listingsData) setListings(listingsData);

    // Total sold count
    const { count: soldCount } = await supabase
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('seller_id', userId).eq('is_sold', true);
    setTotalSold(soldCount || 0);

    // Reviews with reviewer profile + listing title
    const { data: reviewsData } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:profiles!reviews_reviewer_id_fkey(display_name, avatar_url),
        listing:listings(title)
      `)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (reviewsData) setReviews(reviewsData);

    setLoading(false);
  };

  const handleMessage = async () => {
    if (!currentUserId) return router.push('/' as any);
    if (currentUserId === userId) return;
    // Navigate to their most recent listing's chat — or open a generic DM
    router.push(`/user/${userId}/message` as any);
  };

  const handleShare = async () => {
    if (!profile) return;
    try {
      await Share.share({
        message: `Check out ${profile.display_name}'s profile on Boltzy!\nhttps://boltzy.in/user/${userId}`,
        title: profile.display_name,
      });
    } catch {}
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '—';

  const renderListingCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.listingCard}
      onPress={() => router.push(`/listing/${item.id}` as any)}
      activeOpacity={0.85}
    >
      {item.image_urls?.[0]
        ? <Image source={{ uri: item.image_urls[0] }} style={s.listingImg} resizeMode="cover" />
        : <View style={s.listingImgFallback}><Ionicons name="image-outline" size={32} color="#ccc" /></View>
      }
      <View style={s.listingCardBody}>
        <Text style={s.listingCardPrice}>₹{Number(item.price).toLocaleString('en-IN')}</Text>
        <Text style={s.listingCardTitle} numberOfLines={1}>{item.title}</Text>
        {item.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
            <Ionicons name="location-outline" size={10} color="#aaa" />
            <Text style={s.listingCardLoc} numberOfLines={1}>{item.location}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color="#000" /></View>
  );
  if (!profile) return (
    <View style={s.center}>
      <Ionicons name="person-circle-outline" size={64} color="#ddd" />
      <Text style={{ color: '#aaa', marginTop: 12, fontSize: 16 }}>User not found.</Text>
    </View>
  );

  const isOwnProfile = currentUserId === userId;
  const avgRating = stats?.avg_rating ?? 0;
  const reviewCount = stats?.review_count ?? 0;

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

        {/* ═══ HERO SECTION ══════════════════════════════ */}
        <View style={s.hero}>
          {/* Back + Share */}
          <View style={s.heroNav}>
            <TouchableOpacity style={s.navBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={s.navBtn} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={22} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={s.avatarWrap}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
              : <View style={s.avatarFallback}>
                  <Text style={s.avatarLetter}>{profile.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
            }
            {/* Verified badge */}
            <View style={s.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
            </View>
          </View>

          {/* Name */}
          <Text style={s.profileName}>{profile.display_name || 'Boltzy User'}</Text>
          <Text style={s.profileUsername}>@{profile.username || 'user'}</Text>

          {/* Rating summary */}
          {reviewCount > 0 ? (
            <View style={s.ratingPill}>
              <Ionicons name="star" size={15} color="#F5A623" />
              <Text style={s.ratingPillText}>
                {avgRating} · {reviewCount} review{reviewCount !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : (
            <View style={s.newSellerPill}>
              <Ionicons name="sparkles-outline" size={14} color="#888" />
              <Text style={s.newSellerText}>New seller</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{listings.length}</Text>
              <Text style={s.statLabel}>Active</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statNum}>{totalSold}</Text>
              <Text style={s.statLabel}>Sold</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statNum}>{reviewCount}</Text>
              <Text style={s.statLabel}>Reviews</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statNum}>{memberSince.split(' ')[1]}</Text>
              <Text style={s.statLabel}>Since {memberSince.split(' ')[0]}</Text>
            </View>
          </View>

          {/* CTA buttons */}
          {!isOwnProfile && (
            <View style={s.ctaRow}>
              <TouchableOpacity style={s.ctaChat} onPress={handleMessage}>
                <Ionicons name="chatbubbles" size={18} color="#000" />
                <Text style={s.ctaChatText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ctaCall}
                onPress={() => profile.phone ? Linking.openURL(`tel:${profile.phone}`) : null}
              >
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={s.ctaCallText}>Call</Text>
              </TouchableOpacity>
            </View>
          )}
          {isOwnProfile && (
            <TouchableOpacity style={s.editProfileBtn} onPress={() => router.push('/profile' as any)}>
              <Ionicons name="create-outline" size={16} color="#000" />
              <Text style={s.editProfileText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ TAB BAR (sticky) ══════════════════════════ */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'listings' && s.tabActive]}
            onPress={() => setActiveTab('listings')}
          >
            <Ionicons name="grid-outline" size={16} color={activeTab === 'listings' ? '#000' : '#aaa'} />
            <Text style={[s.tabText, activeTab === 'listings' && s.tabTextActive]}>
              Listings ({listings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'reviews' && s.tabActive]}
            onPress={() => setActiveTab('reviews')}
          >
            <Ionicons name="star-outline" size={16} color={activeTab === 'reviews' ? '#000' : '#aaa'} />
            <Text style={[s.tabText, activeTab === 'reviews' && s.tabTextActive]}>
              Reviews ({reviewCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══ LISTINGS TAB ══════════════════════════════ */}
        {activeTab === 'listings' && (
          <View style={s.tabContent}>
            {listings.length === 0 ? (
              <View style={s.emptyTab}>
                <Ionicons name="cube-outline" size={52} color="#e0e0e0" />
                <Text style={s.emptyTabTitle}>No active listings</Text>
                <Text style={s.emptyTabSub}>This seller has no active ads right now.</Text>
              </View>
            ) : (
              <View style={s.gridWrap}>
                {listings.map((item) => (
                  <View key={item.id} style={s.gridItem}>
                    {renderListingCard({ item })}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ═══ REVIEWS TAB ═══════════════════════════════ */}
        {activeTab === 'reviews' && (
          <View style={s.tabContent}>
            {/* Rating summary bar */}
            {reviewCount > 0 && (
              <View style={s.ratingOverview}>
                <View style={s.ratingBigNum}>
                  <Text style={s.ratingBigText}>{avgRating}</Text>
                  <StarRow rating={avgRating} size={18} />
                  <Text style={s.ratingTotalText}>{reviewCount} review{reviewCount !== 1 ? 's' : ''}</Text>
                </View>
                <View style={s.ratingBars}>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviews.filter((r) => r.rating === star).length;
                    const pct   = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                    return (
                      <View key={star} style={s.barRow}>
                        <Text style={s.barLabel}>{star}</Text>
                        <Ionicons name="star" size={10} color="#F5A623" />
                        <View style={s.barTrack}>
                          <View style={[s.barFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={s.barCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {reviews.length === 0 ? (
              <View style={s.emptyTab}>
                <Ionicons name="star-outline" size={52} color="#e0e0e0" />
                <Text style={s.emptyTabTitle}>No reviews yet</Text>
                <Text style={s.emptyTabSub}>Be the first to leave a review after a purchase.</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f7f8fa' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  // Hero
  hero: {
    backgroundColor: '#fff', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 24,
    paddingTop: Platform.OS === 'ios' ? 58 : 24,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignSelf: 'stretch', marginBottom: 20,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center',
  },

  avatarWrap:       { position: 'relative', marginBottom: 14 },
  avatarImg:        { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#f0f0f0' },
  avatarFallback:   { width: 100, height: 100, borderRadius: 50, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#f0f0f0' },
  avatarLetter:     { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  profileName:      { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  profileUsername:  { fontSize: 15, color: '#aaa', marginBottom: 12 },

  ratingPill:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff8e1', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20, borderWidth: 1, borderColor: '#ffe082' },
  ratingPillText:   { fontSize: 14, fontWeight: '700', color: '#F9A825' },
  newSellerPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20 },
  newSellerText:    { fontSize: 14, color: '#888', fontWeight: '500' },

  statsRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderRadius: 16, padding: 16, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#ebebeb' },
  statBox:          { flex: 1, alignItems: 'center' },
  statNum:          { fontSize: 20, fontWeight: 'bold', color: '#000' },
  statLabel:        { fontSize: 11, color: '#aaa', marginTop: 2, fontWeight: '500' },
  statDivider:      { width: 1, height: 32, backgroundColor: '#e0e0e0' },

  ctaRow:           { flexDirection: 'row', gap: 12, width: '100%' },
  ctaChat: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#f0f0f0', paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  ctaChatText:      { fontSize: 15, fontWeight: '700', color: '#000' },
  ctaCall: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#000', paddingVertical: 14, borderRadius: 14,
  },
  ctaCallText:      { fontSize: 15, fontWeight: '700', color: '#fff' },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%',
    justifyContent: 'center', paddingVertical: 13, borderRadius: 14,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  editProfileText:  { fontSize: 15, fontWeight: '700', color: '#000' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }, default: { elevation: 3 } }),
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabActive:        { borderBottomColor: '#000' },
  tabText:          { fontSize: 14, fontWeight: '600', color: '#aaa' },
  tabTextActive:    { color: '#000' },

  // Tab content
  tabContent:       { paddingTop: 16 },

  // Grid
  gridWrap:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 16 },
  gridItem:         { width: CARD_W },
  listingCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }, default: { elevation: 2 } }),
  },
  listingImg:       { width: '100%', height: CARD_W * 0.72 },
  listingImgFallback: { width: '100%', height: CARD_W * 0.72, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  listingCardBody:  { padding: 10 },
  listingCardPrice: { fontSize: 16, fontWeight: 'bold', color: '#000', marginBottom: 3 },
  listingCardTitle: { fontSize: 13, color: '#444', fontWeight: '500' },
  listingCardLoc:   { fontSize: 11, color: '#aaa' },

  // Empty
  emptyTab:         { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyTabTitle:    { fontSize: 18, fontWeight: 'bold', color: '#ccc', marginTop: 14 },
  emptyTabSub:      { fontSize: 14, color: '#ddd', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },

  // Rating overview
  ratingOverview: {
    flexDirection: 'row', gap: 20, backgroundColor: '#fff',
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
    padding: 18, borderWidth: 1, borderColor: '#ebebeb',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  ratingBigNum:     { alignItems: 'center', justifyContent: 'center', gap: 6 },
  ratingBigText:    { fontSize: 44, fontWeight: 'bold', color: '#000', lineHeight: 48 },
  ratingTotalText:  { fontSize: 12, color: '#aaa', fontWeight: '500' },
  ratingBars:       { flex: 1, gap: 6, justifyContent: 'center' },
  barRow:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel:         { fontSize: 12, color: '#777', width: 10, textAlign: 'right' },
  barTrack:         { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  barFill:          { height: '100%', backgroundColor: '#F5A623', borderRadius: 3 },
  barCount:         { fontSize: 11, color: '#bbb', width: 20 },

  // Review card
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#f0f0f0',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  reviewHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  reviewAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  reviewAvatarImg:  { width: 40, height: 40, borderRadius: 20 },
  reviewAvatarLetter: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  reviewerName:     { fontSize: 14, fontWeight: '700', color: '#000' },
  reviewTime:       { fontSize: 11, color: '#bbb' },
  ratingBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  ratingBadgeGreen: { backgroundColor: '#e8f5e9' },
  ratingBadgeAmber: { backgroundColor: '#fff8e1' },
  ratingBadgeRed:   { backgroundColor: '#ffebee' },
  ratingBadgeText:  { fontSize: 13, fontWeight: 'bold', color: '#333' },
  reviewText:       { fontSize: 14, color: '#444', lineHeight: 21, fontStyle: 'italic', marginBottom: 10 },
  reviewListingTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reviewListingTitle: { fontSize: 11, color: '#aaa', flex: 1 },
});