import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Animated,
  Dimensions, Image,
  Platform, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View
} from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';
import { getCurrentUser } from '../../utils/auth';
import { Skeleton } from '../../components/ShimmerSkeleton';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2;


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

const ReviewCard = ({ review, t, translateUGC, lang, colors, isDark }: { review: any; t: any; translateUGC: any; lang: string; colors: any; isDark: boolean }) => {
  const timeAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return t('Today') || 'Today';
    if (diff < 7)  return `${diff} ${t('days ago') || 'd ago'}`;
    if (diff < 30) return `${Math.floor(diff / 7)} ${t('weeks ago') || 'w ago'}`;
    return `${Math.floor(diff / 30)} ${t('months ago') || 'mo ago'}`;
  };

  const displayListingTitle = review.listing?.translations?.[lang]?.title || translateUGC(review.listing?.title);

  return (
    <View style={[s.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.reviewHeader}>
        <View style={s.reviewAvatar}>
          {review.reviewer?.avatar_url
            ? <Image source={{ uri: review.reviewer.avatar_url }} style={s.reviewAvatarImg} />
            : <Text style={s.reviewAvatarLetter}>{review.reviewer?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.reviewerName, { color: colors.text }]}>{translateUGC(review.reviewer?.display_name) || t('unknown_seller')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <StarRow rating={review.rating} size={12} />
            <Text style={[s.reviewTime, { color: colors.textSecondary }]}>{timeAgo(review.created_at)}</Text>
          </View>
        </View>
        <View style={[s.ratingBadge, review.rating >= 4 ? [s.ratingBadgeGreen, { backgroundColor: isDark ? '#142e19' : '#e8f5e9' }] : review.rating >= 3 ? [s.ratingBadgeAmber, { backgroundColor: isDark ? '#422006' : '#fff8e1' }] : [s.ratingBadgeRed, { backgroundColor: isDark ? '#450a0a' : '#ffebee' }]]}>
          <Text style={[s.ratingBadgeText, { color: colors.text }]}>{review.rating}.0</Text>
        </View>
      </View>
      {review.review_text ? (
        <Text style={[s.reviewText, { color: colors.textSecondary }]}>{`"${translateUGC(review.review_text)}"`}</Text>
      ) : null}
      {displayListingTitle ? (
        <View style={s.reviewListingTag}>
          <Ionicons name="pricetag-outline" size={11} color={colors.textSecondary} />
          <Text style={[s.reviewListingTitle, { color: colors.textSecondary }]} numberOfLines={1}>re: {displayListingTitle}</Text>
        </View>
      ) : null}
    </View>
  );
};

export default function PublicProfile() {
  const { id: rawUserId } = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  const router = useRouter();
  
  const insets = useSafeAreaInsets();

  const { lang, t, translateUGC } = useLanguage();
 const { colors, isDark, toggleTheme } = useTheme(); // ✨ Ensure toggleTheme is here

  const [profile, setProfile]       = useState<any>(null);
  const [stats, setStats]           = useState<{ avg_rating: number; review_count: number } | null>(null);
  const [listings, setListings]     = useState<any[]>([]);
  const [reviews, setReviews]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'listings' | 'reviews'>('listings');
  const [totalSold, setTotalSold]   = useState(0);

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const user = await getCurrentUser();
    if (user) setCurrentUserId(user.id);

    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    if (profileData) setProfile(profileData);

    const { data: statsData } = await supabase
      .from('seller_stats').select('*').eq('seller_id', userId).single();
    if (statsData) setStats(statsData);

    const { data: listingsData } = await supabase
      .from('listings').select('*')
      .eq('seller_id', userId).eq('is_sold', false)
      .or('approval_status.eq.approved,approval_status.is.null') 
      .order('created_at', { ascending: false });
      
    if (listingsData) setListings(listingsData);

    const { count: soldCount } = await supabase
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('seller_id', userId).eq('is_sold', true);
    setTotalSold(soldCount || 0);

    const { data: reviewsData } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:profiles!reviews_reviewer_id_fkey(display_name, avatar_url),
        listing:listings(title, translations)
      `)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (reviewsData) setReviews(reviewsData);

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleMessage = async () => {
    if (!currentUserId) return router.push('/' as any);
    if (currentUserId === userId) return;
    const latestListing = listings[0];

    if (!latestListing) {
      Alert.alert(t('common_error') || 'Error', t('no_ads_yet_sub') || 'No active listings to chat about.');
      return;
    }

    const { data: existingChat } = await supabase
      .from('chats')
      .select('id')
      .eq('listing_id', latestListing.id)
      .eq('buyer_id', currentUserId)
      .eq('seller_id', latestListing.seller_id)
      .maybeSingle();

    if (existingChat?.id) {
      router.push(`/chat/${existingChat.id}` as any);
      return;
    }

    router.push(
      `/chat/new?listing_id=${latestListing.id}&seller_id=${latestListing.seller_id}&listing_title=${encodeURIComponent(latestListing.title)}&listing_price=${latestListing.price}` as any
    );
  };

  const handleOffer = async () => {
    if (!currentUserId) return router.push('/' as any);
    if (currentUserId === userId) return;
    const latestListing = listings[0];

    if (!latestListing) {
      Alert.alert(t('common_error') || 'Error', t('no_ads_yet_sub') || 'No active listings to make an offer on.');
      return;
    }

    const { data: existingChat } = await supabase
      .from('chats')
      .select('id')
      .eq('listing_id', latestListing.id)
      .eq('buyer_id', currentUserId)
      .eq('seller_id', latestListing.seller_id)
      .maybeSingle();

    if (existingChat?.id) {
      router.push(`/chat/${existingChat.id}?action=offer` as any);
      return;
    }

    router.push(
      `/chat/new?listing_id=${latestListing.id}&seller_id=${latestListing.seller_id}&listing_title=${encodeURIComponent(latestListing.title)}&listing_price=${latestListing.price}&action=offer` as any
    );
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

  const memberSinceYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear().toString()
    : '—';

  const renderListingCard = ({ item }: { item: any }) => {
    const displayTitle = item.translations?.[lang]?.title || translateUGC(item.title);
    const displayLocation = item.translations?.[lang]?.location || translateUGC(item.location);

    return (
      <TouchableOpacity
        style={[s.listingCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#aaa' }]}
        onPress={() => router.push(`/listing/${item.id}` as any)}
        activeOpacity={0.85}
      >
        {item.image_urls?.[0]
          ? <Image source={{ uri: item.image_urls[0] }} style={s.listingImg} resizeMode="cover" />
          : <View style={[s.listingImgFallback, { backgroundColor: colors.backgroundSecondary }]}><Ionicons name="image-outline" size={32} color={colors.textSecondary} /></View>
        }
        <View style={s.listingCardBody}>
          <Text style={[s.listingCardPrice, { color: colors.text }]}>₹{Number(item.price).toLocaleString('en-IN')}</Text>
          <Text style={[s.listingCardTitle, { color: colors.textSecondary }]} numberOfLines={1}>{displayTitle}</Text>
          {item.location && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
              <Ionicons name="location-outline" size={10} color={colors.textSecondary} />
              <Text style={[s.listingCardLoc, { color: colors.textSecondary }]} numberOfLines={1}>{displayLocation}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
          <View style={[s.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={s.heroNav}>
              <Skeleton width={40} height={40} borderRadius={20} />
              <Skeleton width={40} height={40} borderRadius={20} />
            </View>
            <View style={s.avatarWrap}>
              <Skeleton width={100} height={100} borderRadius={50} />
            </View>
            <Skeleton width={180} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={16} style={{ marginBottom: 16 }} />
            <Skeleton width={130} height={32} borderRadius={16} style={{ marginBottom: 20 }} />
            <Skeleton width="100%" height={85} borderRadius={16} style={{ marginBottom: 20 }} />
            <View style={[s.ctaRow, { maxWidth: 400, alignSelf: 'center' }]}>
              <Skeleton width="48%" height={48} borderRadius={14} />
              <Skeleton width="48%" height={48} borderRadius={14} />
            </View>
          </View>
          <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={[s.tab, { borderBottomWidth: 2.5, borderBottomColor: colors.text }]}>
              <Skeleton width={100} height={18} />
            </View>
            <View style={s.tab}>
              <Skeleton width={100} height={18} />
            </View>
          </View>
          <View style={s.tabContent}>
            <View style={s.gridWrap}>
              {[1, 2, 3, 4].map(key => (
                <View key={key} style={s.gridItem}>
                  <View style={[s.listingCard, { backgroundColor: colors.card }]}>
                    <Skeleton width="100%" height={CARD_W * 0.72} borderRadius={0} />
                    <View style={s.listingCardBody}>
                      <Skeleton width="60%" height={18} style={{ marginBottom: 6 }} />
                      <Skeleton width="90%" height={14} style={{ marginBottom: 6 }} />
                      <Skeleton width="50%" height={12} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!profile) return (
    <View style={[s.center, { backgroundColor: colors.background }]}>
      <Ionicons name="person-circle-outline" size={64} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}>User not found.</Text>
    </View>
  );

  const isOwnProfile = currentUserId === userId;
  const avgRating = stats?.avg_rating ?? 0;
  const reviewCount = stats?.review_count ?? 0;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

        {/* ═══ HERO SECTION ══════════════════════════════ */}
        <View style={[s.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={s.heroNav}>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={s.avatarWrap}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={[s.avatarImg, { borderColor: colors.backgroundSecondary }]} />
              : <View style={[s.avatarFallback, { borderColor: colors.backgroundSecondary }]}>
                  <Text style={s.avatarLetter}>{profile.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
            }
            <View style={s.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
            </View>
          </View>

          <Text style={[s.profileName, { color: colors.text }]}>{translateUGC(profile.display_name) || t('unknown_seller')}</Text>
          <Text style={[s.profileUsername, { color: colors.textSecondary }]}>@{profile.username || 'user'}</Text>

          {reviewCount > 0 ? (
            <View style={[s.ratingPill, { backgroundColor: isDark ? '#422006' : '#fff8e1', borderColor: isDark ? '#713f12' : '#ffe082' }]}>
              <Ionicons name="star" size={15} color="#F5A623" />
              <Text style={s.ratingPillText}>
                {avgRating} · {reviewCount} {t('results') || 'reviews'}
              </Text>
            </View>
          ) : (
            <View style={[s.newSellerPill, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} />
              <Text style={[s.newSellerText, { color: colors.textSecondary }]}>{t('new_seller_no_reviews') || 'New seller'}</Text>
            </View>
          )}

          <View style={[s.statsRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: colors.text }]}>{listings.length}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>{t('active') || 'Active'}</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: colors.text }]}>{totalSold}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>{t('sold') || 'Sold'}</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: colors.text }]}>{reviewCount}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>{t('results') || 'Reviews'}</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.border }]} />
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: colors.text }]}>{memberSinceYear}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>{t('member_since')}</Text>
            </View>
          </View>

          {!isOwnProfile && (
            <View style={[s.ctaRow, { maxWidth: 400, alignSelf: 'center' }]}>
              <TouchableOpacity style={[s.ctaChat, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={handleMessage}>
                <Ionicons name="chatbubbles" size={18} color={colors.text} />
                <Text style={[s.ctaChatText, { color: colors.text }]}>{t('message') || 'Message'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[s.ctaCall, { backgroundColor: colors.tint }]} onPress={handleOffer}>
                <Ionicons name="pricetag" size={18} color={isDark ? '#000' : '#fff'} />
                <Text style={[s.ctaCallText, { color: isDark ? '#000' : '#fff' }]}>{t('make_offer') || 'Make Offer'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {isOwnProfile && (
            <TouchableOpacity style={[s.editProfileBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={() => router.push('/profile' as any)}>
              <Ionicons name="create-outline" size={16} color={colors.text} />
              <Text style={[s.editProfileText, { color: colors.text }]}>{t('my_ads_edit') || 'Edit Profile'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ TAB BAR (sticky) ══════════════════════════ */}
        <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'listings' && [s.tabActive, { borderBottomColor: colors.text }]]}
            onPress={() => setActiveTab('listings')}
          >
            <Ionicons name="grid-outline" size={16} color={activeTab === 'listings' ? colors.text : colors.textSecondary} />
            <Text style={[s.tabText, { color: colors.textSecondary }, activeTab === 'listings' && [s.tabTextActive, { color: colors.text }]]}>
              {t('active_ads')} ({listings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'reviews' && [s.tabActive, { borderBottomColor: colors.text }]]}
            onPress={() => setActiveTab('reviews')}
          >
            <Ionicons name="star-outline" size={16} color={activeTab === 'reviews' ? colors.text : colors.textSecondary} />
            <Text style={[s.tabText, { color: colors.textSecondary }, activeTab === 'reviews' && [s.tabTextActive, { color: colors.text }]]}>
              {t('user_reviews')} ({reviewCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══ LISTINGS TAB ══════════════════════════════ */}
        {activeTab === 'listings' && (
          <View style={s.tabContent}>
            {listings.length === 0 ? (
              <View style={s.emptyTab}>
                <Ionicons name="cube-outline" size={52} color={colors.textSecondary} />
                <Text style={[s.emptyTabTitle, { color: colors.textSecondary }]}>{t('no_ads_yet')}</Text>
                <Text style={[s.emptyTabSub, { color: colors.textSecondary }]}>{t('no_ads_yet_sub')}</Text>
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
            {reviewCount > 0 && (
              <View style={[s.ratingOverview, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.ratingBigNum}>
                  <Text style={[s.ratingBigText, { color: colors.text }]}>{avgRating}</Text>
                  <StarRow rating={avgRating} size={18} />
                  <Text style={[s.ratingTotalText, { color: colors.textSecondary }]}>{reviewCount} {t('results') || 'reviews'}</Text>
                </View>
                <View style={s.ratingBars}>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviews.filter((r) => r.rating === star).length;
                    const pct   = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                    return (
                      <View key={star} style={s.barRow}>
                        <Text style={[s.barLabel, { color: colors.textSecondary }]}>{star}</Text>
                        <Ionicons name="star" size={10} color="#F5A623" />
                        <View style={[s.barTrack, { backgroundColor: colors.backgroundSecondary }]}>
                          <View style={[s.barFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={[s.barCount, { color: colors.textSecondary }]}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {reviews.length === 0 ? (
              <View style={s.emptyTab}>
                <Ionicons name="star-outline" size={52} color={colors.textSecondary} />
                <Text style={[s.emptyTabTitle, { color: colors.textSecondary }]}>{t('no_reviews_yet')}</Text>
                <Text style={[s.emptyTabSub, { color: colors.textSecondary }]}>{t('no_reviews_yet_sub')}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} t={t} translateUGC={translateUGC} lang={lang} colors={colors} isDark={isDark} />
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

const s = StyleSheet.create({
  container:  { flex: 1 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: {
    alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 24,
    paddingTop: Platform.OS === 'ios' ? 58 : 24,
    borderBottomWidth: 1,
  },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignSelf: 'stretch', marginBottom: 20,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    borderWidth: 0, // Removed border
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.1, shadowRadius: 5 } })
  },

  avatarWrap:       { position: 'relative', marginBottom: 14 },
  avatarImg: { 
    width: 100, height: 100, borderRadius: 50, 
    borderWidth: 0, // Removed harsh border
    ...Platform.select({ default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 } })
  },
  avatarFallback: { 
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', 
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 } })
  },
  avatarLetter:     { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 0, // Removed border
    ...Platform.select({ default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 1, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3 } })
  },

  profileName:      { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  profileUsername:  { fontSize: 15, marginBottom: 12 },

  ratingPill: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20, 
    borderWidth: 0, // Neumorphic Outer Shadow
    ...Platform.select({ default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5 } })
  },
  
  ratingPillText:   { fontSize: 14, fontWeight: '700', color: '#F9A825' },
  newSellerPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20 },
  newSellerText:    { fontSize: 14, fontWeight: '500' },

  statsRow: { 
    flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, width: '100%', marginBottom: 20, 
    borderWidth: 0 // Faux-inset
  },
  statBox:          { flex: 1, alignItems: 'center' },
  statNum:          { fontSize: 20, fontWeight: 'bold' },
  statLabel:        { fontSize: 11, marginTop: 2, fontWeight: '500' },
  statDivider:      { width: 1, height: 32 },

  ctaRow:           { flexDirection: 'row', gap: 12, width: '100%' },
  ctaChat: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, 
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6 } })
  },
  ctaChatText:      { fontSize: 15, fontWeight: '700' },
  ctaCall: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, 
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6 } })
  },
  ctaCallText:      { fontSize: 15, fontWeight: '700' },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center', paddingVertical: 13, borderRadius: 14, 
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6 } })
  },
  editProfileText:  { fontSize: 15, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }, default: { elevation: 3 } }),
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabActive:        {},
  tabText:          { fontSize: 14, fontWeight: '600' },
  tabTextActive:    {},

  tabContent:       { paddingTop: 16 },

  gridWrap:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 16 },
  gridItem:         { width: CARD_W },
  listingCard: {
    borderRadius: 14, overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }, default: { elevation: 2 } }),
  },
  listingImg:       { width: '100%', height: CARD_W * 0.72 },
  listingImgFallback: { width: '100%', height: CARD_W * 0.72, justifyContent: 'center', alignItems: 'center' },
  listingCardBody:  { padding: 10 },
  listingCardPrice: { fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  listingCardTitle: { fontSize: 13, fontWeight: '500' },
  listingCardLoc:   { fontSize: 11 },

  emptyTab:         { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyTabTitle:    { fontSize: 18, fontWeight: 'bold', marginTop: 14 },
  emptyTabSub:      { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },

  ratingOverview: {
    flexDirection: 'row', gap: 20,
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
    padding: 18, borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  ratingBigNum:     { alignItems: 'center', justifyContent: 'center', gap: 6 },
  ratingBigText:    { fontSize: 44, fontWeight: 'bold', lineHeight: 48 },
  ratingTotalText:  { fontSize: 12, fontWeight: '500' },
  ratingBars:       { flex: 1, gap: 6, justifyContent: 'center' },
  barRow:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel:         { fontSize: 12, width: 10, textAlign: 'right' },
  barTrack:         { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill:          { height: '100%', backgroundColor: '#F5A623', borderRadius: 3 },
  barCount:         { fontSize: 11, width: 20 },

  reviewCard: {
    borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  reviewHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  reviewAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  reviewAvatarImg:  { width: 40, height: 40, borderRadius: 20 },
  reviewAvatarLetter: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  reviewerName:     { fontSize: 14, fontWeight: '700' },
  reviewTime:       { fontSize: 11 },
  ratingBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  ratingBadgeGreen: {},
  ratingBadgeAmber: {},
  ratingBadgeRed:   {},
  ratingBadgeText:  { fontSize: 13, fontWeight: 'bold' },
  reviewText:       { fontSize: 14, lineHeight: 21, fontStyle: 'italic', marginBottom: 10 },
  reviewListingTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reviewListingTitle: { fontSize: 11, flex: 1 },
});