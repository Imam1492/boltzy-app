import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Linking,
  Platform, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { supabase } from '../../supabase';

const { width: SCREEN_W } = Dimensions.get('window');

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

export default function ListingDetails() {
  const { id } = useLocalSearchParams();
  const router  = useRouter();

  const [listing, setListing]             = useState<any>(null);
  const [seller, setSeller]               = useState<any>(null);
  const [sellerStats, setSellerStats]     = useState<{ avg_rating: number; review_count: number } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSaved, setIsSaved]             = useState(false);
  const [activeImg, setActiveImg]         = useState(0);
  const [menuOpen, setMenuOpen]           = useState(false);

  const flatRef = useRef<FlatList>(null);

  useEffect(() => { fetchData(); }, [id]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data: listingData } = await supabase
      .from('listings').select('*').eq('id', id).single();

    if (listingData) {
      setListing(listingData);

      const { data: sellerData } = await supabase
        .from('profiles').select('*').eq('id', listingData.seller_id).single();
      if (sellerData) setSeller(sellerData);

      const { data: stats } = await supabase
        .from('seller_stats').select('*').eq('seller_id', listingData.seller_id).single();
      if (stats) setSellerStats(stats);

      if (user) {
        const { data: wish } = await supabase
          .from('wishlist').select('id')
          .eq('user_id', user.id).eq('listing_id', listingData.id).single();
        setIsSaved(!!wish);
      }
    }
    setLoading(false);
  };

  const timeAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return `${diff} days ago`;
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
    return `${Math.floor(diff / 30)} months ago`;
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCall = () => {
    if (seller?.phone) Linking.openURL(`tel:${seller.phone}`);
    else Alert.alert('Unavailable', 'Phone number not provided by this seller.');
  };

  const handleShare = async () => {
    if (!listing) return;
    try {
      await Share.share({
        message: `Check out "${listing.title}" for ₹${listing.price} on Boltzy!\nhttps://boltzy.in/listing/${listing.id}`,
        title: listing.title,
      });
    } catch {}
  };

  const handleReport = () => {
    setMenuOpen(false);
    Alert.alert('Report Listing', 'Why are you reporting this?', [
      { text: 'Spam / Misleading',  onPress: () => submitReport('spam') },
      { text: 'Prohibited Item',    onPress: () => submitReport('prohibited') },
      { text: 'Fraud / Scam',       onPress: () => submitReport('fraud') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitReport = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Alert.alert('Login Required', 'Please log in to report.');
    await supabase.from('reports').insert({ listing_id: listing.id, reporter_id: user.id, reason });
    Alert.alert('Reported ✓', 'Thank you. Our team will review this listing.');
  };

  // ── Report USER from listing page ──────────────────────────────────────────
  const handleReportUser = () => {
    Alert.alert('Report User', 'Why are you reporting this seller?', [
      { text: 'Spam / Fake Profile',   onPress: () => submitUserReport('spam_profile') },
      { text: 'Fraud / Scam Seller',   onPress: () => submitUserReport('fraud') },
      { text: 'Abusive Behaviour',     onPress: () => submitUserReport('abusive') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitUserReport = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Alert.alert('Login Required', 'Please log in to report.');
    const { error } = await supabase.rpc('report_user_engine', {
      p_reported_user_id: listing.seller_id,
      p_reason: reason,
    });
    if (!error) Alert.alert('Reported ✓', 'Thank you. Our team will investigate this seller.');
    else Alert.alert('Already Reported', 'You have already reported this user.');
  };

  const toggleWishlist = async () => {
    if (!currentUserId) return Alert.alert('Login Required', 'Please log in to save items.');
    if (isSaved) {
      setIsSaved(false);
      await supabase.from('wishlist').delete().match({ user_id: currentUserId, listing_id: listing.id });
    } else {
      setIsSaved(true);
      await supabase.from('wishlist').insert({ user_id: currentUserId, listing_id: listing.id });
    }
  };

  // ── Lazy chat creation ─────────────────────────────────────────────────────
  const startChat = async () => {
    if (!currentUserId) return Alert.alert('Login Required', 'Please log in to chat with sellers.');
    if (currentUserId === listing.seller_id) return Alert.alert('Oops!', "You can't start a chat with yourself.");

    const { data: existingChat } = await supabase
      .from('chats').select('id')
      .eq('listing_id', listing.id)
      .eq('buyer_id', currentUserId)
      .eq('seller_id', listing.seller_id)
      .single();

    if (existingChat) {
      router.push(`/chat/${existingChat.id}` as any);
    } else {
      router.push(
        `/chat/new?listing_id=${listing.id}&seller_id=${listing.seller_id}&listing_title=${encodeURIComponent(listing.title)}&listing_price=${listing.price}` as any
      );
    }
  };

  const onImgScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveImg(idx);
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#000" /></View>;
  if (!listing) return (
    <View style={s.center}>
      <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
      <Text style={{ color: '#999', marginTop: 12, fontSize: 16 }}>Item not found.</Text>
    </View>
  );

  const images: string[] = listing.image_urls?.length > 0 ? listing.image_urls : [];
  const isOwner          = currentUserId === listing.seller_id;
  const highlights: string[] = listing.highlights || [];

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces>

        {/* ═══ IMAGE CAROUSEL ══════════════════════════════ */}
        <View style={s.carouselWrap}>

          {/* Overlay header */}
          <View style={s.overlayHeader}>
            <TouchableOpacity style={s.overlayBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#000" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.overlayBtn} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={22} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={s.overlayBtn} onPress={toggleWishlist}>
                <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF3B30' : '#000'} />
              </TouchableOpacity>
              <TouchableOpacity style={s.overlayBtn} onPress={() => setMenuOpen(v => !v)}>
                <Ionicons name="ellipsis-vertical" size={22} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 3-dot dropdown */}
          {menuOpen && (
            <View style={s.dropdown}>
              {isOwner && (
                <TouchableOpacity style={s.dropItem} onPress={() => { setMenuOpen(false); router.push(`/edit-post?id=${listing.id}` as any); }}>
                  <Ionicons name="create-outline" size={18} color="#333" />
                  <Text style={s.dropItemText}>Edit Listing</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.dropItem} onPress={handleReport}>
                <Ionicons name="flag-outline" size={18} color="#FF3B30" />
                <Text style={[s.dropItemText, { color: '#FF3B30' }]}>Report Listing</Text>
              </TouchableOpacity>
              {!isOwner && (
                <TouchableOpacity style={s.dropItem} onPress={() => { setMenuOpen(false); handleReportUser(); }}>
                  <Ionicons name="person-remove-outline" size={18} color="#FF3B30" />
                  <Text style={[s.dropItemText, { color: '#FF3B30' }]}>Report Seller</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Images */}
          {images.length > 0 ? (
            <>
              <FlatList
                ref={flatRef}
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                onScroll={onImgScroll}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={s.carouselImg} resizeMode="cover" />
                )}
              />
              {images.length > 1 && (
                <View style={s.dotRow}>
                  {images.map((_, i) => (
                    <View key={i} style={[s.dot, i === activeImg && s.dotActive]} />
                  ))}
                </View>
              )}
              <View style={s.imgCountBadge}>
                <Ionicons name="images-outline" size={12} color="#fff" />
                <Text style={s.imgCountText}>{activeImg + 1}/{images.length}</Text>
              </View>
            </>
          ) : (
            <View style={s.noImageBox}>
              <Ionicons name="image-outline" size={60} color="#ccc" />
              <Text style={{ color: '#ccc', marginTop: 8, fontSize: 14 }}>No photos added</Text>
            </View>
          )}
        </View>

        {/* ═══ DETAILS ═════════════════════════════════════ */}
        <View style={s.details}>

          {/* Price */}
          <View style={s.priceRow}>
            <Text style={s.price}>₹{Number(listing.price).toLocaleString('en-IN')}</Text>
            {listing.is_sold && (
              <View style={s.soldBadge}><Text style={s.soldBadgeText}>SOLD</Text></View>
            )}
          </View>

          {/* Title */}
          <Text style={s.title}>{listing.title}</Text>

          {/* Tags */}
          <View style={s.tagRow}>
            {listing.category && (
              <View style={s.tagBlue}>
                <Ionicons name="pricetag-outline" size={11} color="#007AFF" />
                <Text style={s.tagBlueText}>{listing.category}</Text>
              </View>
            )}
            {listing.condition && (
              <View style={s.tagAmber}>
                <Ionicons name="shield-checkmark-outline" size={11} color="#F9A825" />
                <Text style={s.tagAmberText}>{listing.condition}</Text>
              </View>
            )}
            <View style={s.tagGray}>
              <Ionicons name="time-outline" size={11} color="#888" />
              <Text style={s.tagGrayText}>{timeAgo(listing.created_at)}</Text>
            </View>
          </View>

          {/* Location */}
          <View style={s.locRow}>
            <Ionicons name="location" size={16} color="#007AFF" />
            <Text style={s.locText}>{listing.location || 'Location not specified'}</Text>
          </View>

          <View style={s.divider} />

          {/* ═══ KEY HIGHLIGHTS ══════════════════════════════
              Shown only if the seller added highlights.
              Displayed as scannable chips — buyers get the key
              details without reading the full description.        */}
          {highlights.length > 0 && (
            <>
              <View style={s.highlightsHeader}>
                <Ionicons name="flash" size={16} color="#F5A623" />
                <Text style={s.secTitle}>Key Highlights</Text>
              </View>
              <View style={s.highlightsGrid}>
                {highlights.map((h, i) => (
                  <View key={i} style={s.highlightChip}>
                    <Ionicons name="checkmark-circle" size={13} color="#007AFF" />
                    <Text style={s.highlightChipText}>{h}</Text>
                  </View>
                ))}
              </View>
              <View style={s.divider} />
            </>
          )}

          {/* Description */}
          <Text style={s.secTitle}>About this listing</Text>
          <Text style={s.desc}>{listing.description || 'No description provided.'}</Text>

          <View style={s.divider} />

          {/* ═══ SELLER CARD ═════════════════════════════════ */}
          <Text style={s.secTitle}>Seller Information</Text>

          <TouchableOpacity
            style={s.sellerCard}
            activeOpacity={0.85}
            onPress={() => router.push(`/user/${listing.seller_id}` as any)}
          >
            {/* Avatar */}
            <View style={s.sellerAvatarWrap}>
              {seller?.avatar_url
                ? <Image source={{ uri: seller.avatar_url }} style={s.sellerAvatarImg} />
                : <View style={s.sellerAvatarFallback}>
                    <Text style={s.sellerAvatarLetter}>{seller?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
              }
              <View style={s.onlineDot} />
            </View>

            {/* Info */}
            <View style={{ flex: 1 }}>
              <Text style={s.sellerName}>{seller?.display_name || 'Unknown Seller'}</Text>
              <View style={s.ratingRow}>
                {sellerStats && sellerStats.review_count > 0 ? (
                  <>
                    <StarRow rating={sellerStats.avg_rating} size={13} />
                    <Text style={s.ratingText}>
                      {sellerStats.avg_rating} ({sellerStats.review_count} review{sellerStats.review_count !== 1 ? 's' : ''})
                    </Text>
                  </>
                ) : (
                  <Text style={s.noRatingText}>New seller · No reviews yet</Text>
                )}
              </View>
              <Text style={s.memberSince}>
                Member since {seller?.created_at
                  ? new Date(seller.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                  : '—'}
              </Text>
            </View>

            {/* View profile arrow */}
            <View style={s.viewProfileBtn}>
              <Text style={s.viewProfileText}>View Profile</Text>
              <Ionicons name="chevron-forward" size={14} color="#007AFF" />
            </View>
          </TouchableOpacity>

          {/* Report seller quick link (only if not the owner) */}
          {!isOwner && currentUserId && (
            <TouchableOpacity style={s.reportSellerLink} onPress={handleReportUser}>
              <Ionicons name="flag-outline" size={13} color="#FF3B30" />
              <Text style={s.reportSellerText}>Report this seller</Text>
            </TouchableOpacity>
          )}

          {/* Safety card */}
          <View style={s.safetyCard}>
            <Ionicons name="shield-checkmark" size={20} color="#2E7D32" />
            <View style={{ flex: 1 }}>
              <Text style={s.safetyTitle}>Stay Safe on Boltzy</Text>
              <Text style={s.safetyText}>Meet in public · Inspect before buying · Never pay in advance</Text>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      {/* ═══ BOTTOM BAR ══════════════════════════════════ */}
      {!listing.is_sold && !isOwner && (
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.wishBtn} onPress={toggleWishlist}>
            <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF3B30' : '#000'} />
          </TouchableOpacity>
          <TouchableOpacity style={s.chatBtn} onPress={startChat}>
            <Ionicons name="chatbubbles" size={20} color="#000" />
            <Text style={s.chatBtnText}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.callBtn} onPress={handleCall}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={s.callBtnText}>Call Seller</Text>
          </TouchableOpacity>
        </View>
      )}
      {listing.is_sold && (
        <View style={s.soldBar}>
          <Ionicons name="checkmark-circle" size={18} color="#888" />
          <Text style={s.soldBarText}>This item has been sold</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#fff' },
  center:               { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  // Carousel
  carouselWrap:         { width: '100%', height: 320, backgroundColor: '#f0f0f0', position: 'relative' },
  carouselImg:          { width: SCREEN_W, height: 320 },
  noImageBox:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlayHeader: {
    position: 'absolute', zIndex: 20,
    top: Platform.OS === 'ios' ? 54 : 22, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  overlayBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.93)',
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }, default: { elevation: 4 } }),
  },
  dropdown: {
    position: 'absolute', zIndex: 30,
    top: Platform.OS === 'ios' ? 100 : 68, right: 16,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 6, minWidth: 190,
    ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(0,0,0,0.13)' }, default: { elevation: 8 } }),
  },
  dropItem:             { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dropItemText:         { fontSize: 15, color: '#333', fontWeight: '500' },
  dotRow:               { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot:                  { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive:            { backgroundColor: '#fff', width: 18 },
  imgCountBadge: {
    position: 'absolute', bottom: 12, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  imgCountText:         { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Details
  details:              { padding: 20 },
  priceRow:             { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  price:                { fontSize: 34, fontWeight: 'bold', color: '#000' },
  soldBadge:            { backgroundColor: '#FF3B30', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  soldBadgeText:        { color: '#fff', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  title:                { fontSize: 20, color: '#111', fontWeight: '600', marginBottom: 14, lineHeight: 28 },

  tagRow:               { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagBlue:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#e8f0fe', borderRadius: 20, borderWidth: 1, borderColor: '#c5d8fd' },
  tagBlueText:          { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  tagAmber:             { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff8e1', borderRadius: 20, borderWidth: 1, borderColor: '#ffe082' },
  tagAmberText:         { fontSize: 12, color: '#F9A825', fontWeight: '600' },
  tagGray:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f5f5f5', borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0' },
  tagGrayText:          { fontSize: 12, color: '#777', fontWeight: '500' },

  locRow:               { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  locText:              { fontSize: 14, color: '#555' },
  divider:              { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  secTitle:             { fontSize: 17, fontWeight: 'bold', color: '#000', marginBottom: 12 },
  desc:                 { fontSize: 15, color: '#444', lineHeight: 24 },

  // ── Key Highlights ──────────────────────────────────
  highlightsHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  highlightsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  highlightChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f4fd', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bee3f8',
  },
  highlightChipText:    { fontSize: 13, color: '#007AFF', fontWeight: '600' },

  // Seller card
  sellerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fafafa', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#ebebeb', marginBottom: 10,
  },
  sellerAvatarWrap:     { position: 'relative' },
  sellerAvatarImg:      { width: 58, height: 58, borderRadius: 29 },
  sellerAvatarFallback: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  sellerAvatarLetter:   { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#fafafa',
  },
  sellerName:           { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 4 },
  ratingRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ratingText:           { fontSize: 12, color: '#666', fontWeight: '500' },
  noRatingText:         { fontSize: 12, color: '#aaa' },
  memberSince:          { fontSize: 12, color: '#bbb' },
  viewProfileBtn:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewProfileText:      { fontSize: 12, color: '#007AFF', fontWeight: '600' },

  // Report seller link
  reportSellerLink:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 16, paddingLeft: 4 },
  reportSellerText:     { fontSize: 12, color: '#FF3B30', fontWeight: '500' },

  // Safety card
  safetyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#f1f8f2', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#c8e6c9',
  },
  safetyTitle:          { fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 2 },
  safetyText:           { fontSize: 13, color: '#388E3C', lineHeight: 19 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
    ...Platform.select({ web: { boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }, default: { elevation: 8 } }),
  },
  wishBtn: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e5e5',
  },
  chatBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f0f0f0', paddingVertical: 15, borderRadius: 14,
  },
  chatBtnText:          { fontSize: 16, fontWeight: 'bold', color: '#000', marginLeft: 8 },
  callBtn: {
    flex: 1.4, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#000', paddingVertical: 15, borderRadius: 14,
  },
  callBtnText:          { fontSize: 16, fontWeight: 'bold', color: '#fff', marginLeft: 8 },
  soldBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 18, backgroundColor: '#f8f8f8',
    borderTopWidth: 1, borderTopColor: '#e5e5e5',
  },
  soldBarText:          { fontSize: 15, color: '#888', fontWeight: '600' },
});