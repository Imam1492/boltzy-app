import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Linking,
  Platform, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View, NativeScrollEvent, NativeSyntheticEvent, Modal, Animated,
} from 'react-native';
import { supabase } from '../../supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import Toast from 'react-native-toast-message';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

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

  const { lang, t, translateUGC } = useLanguage();
  const { colors, isDark } = useTheme();

  const [listing, setListing]             = useState<any>(null);
  const [seller, setSeller]               = useState<any>(null);
  const [sellerStats, setSellerStats]     = useState<{ avg_rating: number; review_count: number } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSaved, setIsSaved]             = useState(false);
  const [activeImg, setActiveImg]         = useState(0);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget]             = useState<'listing' | 'user' | null>(null);
  const [reportStep, setReportStep]                 = useState<'form' | 'success'>('form');

  const flatRef = useRef<FlatList>(null);

  const Skeleton = ({ width, height, style, borderRadius = 8 }: { width?: any, height: any, style?: any, borderRadius?: number }) => {
    const fadeAnim = useRef(new Animated.Value(0.5)).current;
    
    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }, [fadeAnim]);

    return (
      <Animated.View 
        style={[
          { width, height, backgroundColor: isDark ? '#333' : '#e0e0e0', borderRadius, opacity: fadeAnim }, 
          style
        ]} 
      />
    );
  };

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data: listingData } = await supabase
      .from('listings').select('*').eq('id', id).single();

    if (listingData) {
      setListing(listingData);

      if (!user || user.id !== listingData.seller_id) {
        supabase.rpc('increment_listing_views', { p_listing_id: listingData.id }).then(() => {
          setListing((prev: any) => prev ? { ...prev, views: (prev.views || 0) + 1 } : prev);
        });
      }

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

  const handleDiscardAd = () => {
    const confirmMsg = "Are you sure you want to permanently discard this ad?";
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) executeDeepDelete();
    } else {
      Alert.alert("Discard Ad", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: executeDeepDelete }
      ]);
    }
  };

  const executeDeepDelete = async () => {
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

      Toast.show({ type: 'success', text1: 'Ad Discarded', position: 'top' });
      router.replace('/my-ads' as any);
    } catch (e: any) {
      Alert.alert("Delete Error", "Could not delete ad. " + e.message);
      setLoading(false);
    }
  };

  const timeAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return `${diff} days ago`;
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
    return `${Math.floor(diff / 30)} months ago`;
  };

  const handleOffer = async () => {
    if (!currentUserId) return Alert.alert('Login Required', 'Please log in to make an offer.');
    if (currentUserId === listing.seller_id) return Alert.alert('Oops!', "You can't make an offer on your own item.");

    const { data: existingChat } = await supabase
      .from('chats').select('id')
      .eq('listing_id', listing.id)
      .eq('buyer_id', currentUserId)
      .eq('seller_id', listing.seller_id)
      .single();

    if (existingChat) {
      router.push(`/chat/${existingChat.id}?action=offer` as any);
    } else {
      router.push(
        `/chat/new?listing_id=${listing.id}&seller_id=${listing.seller_id}&listing_title=${encodeURIComponent(listing.title)}&listing_price=${listing.price}&action=offer` as any
      );
    }
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

  const submitReport = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReportModalVisible(false); return Alert.alert('Login Required', 'Please log in to report.'); }
    await supabase.from('reports').insert({ listing_id: listing.id, reporter_id: user.id, reason });
    setReportStep('success');
  };

  const submitUserReport = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReportModalVisible(false); return Alert.alert('Login Required', 'Please log in to report.'); }
    await supabase.rpc('report_user_engine', { p_reported_user_id: listing.seller_id, p_reason: reason });
    setReportStep('success');
  };

  const handleReport = () => {
    setMenuOpen(false);
    setReportTarget('listing');
    setReportModalVisible(true);
  };

  const handleReportUser = () => {
    setReportTarget('user');
    setReportModalVisible(true);
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

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[s.carouselWrap, { backgroundColor: colors.backgroundSecondary }]}>
            <Skeleton width="100%" height={320} borderRadius={0} />
            <View style={s.overlayHeader}>
              <Skeleton width={38} height={38} borderRadius={19} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Skeleton width={38} height={38} borderRadius={19} />
                <Skeleton width={38} height={38} borderRadius={19} />
              </View>
            </View>
          </View>
          <View style={s.details}>
            <Skeleton width={160} height={36} style={{ marginBottom: 12 }} />
            <Skeleton width="90%" height={22} style={{ marginBottom: 8 }} />
            <Skeleton width="60%" height={22} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <Skeleton width={80} height={28} borderRadius={14} />
              <Skeleton width={90} height={28} borderRadius={14} />
              <Skeleton width={100} height={28} borderRadius={14} />
            </View>
            <Skeleton width={180} height={16} style={{ marginBottom: 20 }} />
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <Skeleton width={140} height={20} style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <Skeleton width={110} height={32} borderRadius={16} />
              <Skeleton width={130} height={32} borderRadius={16} />
              <Skeleton width={90} height={32} borderRadius={16} />
            </View>
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <Skeleton width={160} height={20} style={{ marginBottom: 12 }} />
            <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="95%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="80%" height={14} style={{ marginBottom: 20 }} />
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <Skeleton width={150} height={20} style={{ marginBottom: 12 }} />
            <View style={[s.sellerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Skeleton width={58} height={58} borderRadius={29} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width={120} height={16} />
                <Skeleton width={100} height={12} />
                <Skeleton width={80} height={12} />
              </View>
            </View>
          </View>
        </ScrollView>
        <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Skeleton width={50} height={50} borderRadius={14} />
          <Skeleton height={50} borderRadius={14} style={{ flex: 1 }} />
          <Skeleton height={50} borderRadius={14} style={{ flex: 1.4 }} />
        </View>
      </View>
    );
  }

  if (!listing) return (
    <View style={[s.center, { backgroundColor: colors.background }]}>
      <Ionicons name="alert-circle-outline" size={60} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}>Item not found.</Text>
    </View>
  );

  const images: string[] = listing.image_urls?.length > 0 ? listing.image_urls : [];
  const isOwner          = currentUserId === listing.seller_id;
  const highlights: string[] = listing.highlights || [];

  const isPending = listing.approval_status === 'pending';
  const isRejected = listing.approval_status === 'rejected' || listing.approval_status === 'action_required';
  const isApproved = listing.approval_status === 'approved' || !listing.approval_status;

  if (!isOwner && !isApproved) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Ionicons name="eye-off-outline" size={60} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}>This ad is currently unavailable.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, padding: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formattedPrice = `₹${Number(listing.price).toLocaleString('en-IN')}`;
  const seoTitle = `${listing.title} for ${formattedPrice} on Boltzy`;
  const seoDescription = listing.description
    ? listing.description.substring(0, 160)
    : `Buy ${listing.title} for ${formattedPrice} in ${listing.location || 'India'} on Boltzy.`;
  const mainImage = images.length > 0 ? images[0] : 'https://boltzy.in/assets/images/icon.png';
  const canonicalUrl = `https://boltzy.in/listing/${listing.id}`;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Head>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:image" content={mainImage} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Boltzy" />
        <meta property="product:price:amount" content={String(listing.price)} />
        <meta property="product:price:currency" content="INR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={mainImage} />
      </Head>

      <ScrollView showsVerticalScrollIndicator={false} bounces>
        <View style={[s.carouselWrap, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={s.overlayHeader}>
            <TouchableOpacity style={[s.overlayBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.93)' }]} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.overlayBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.93)' }]} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={22} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.overlayBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.93)' }]} onPress={toggleWishlist}>
                <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF3B30' : (isDark ? '#fff' : '#000')} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.overlayBtn, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.93)' }]} onPress={() => setMenuOpen(v => !v)}>
                <Ionicons name="ellipsis-vertical" size={22} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>
          </View>

          {menuOpen && (
            <View style={[s.dropdown, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#888' }]}>
              {isOwner && (
                <TouchableOpacity style={[s.dropItem, { borderBottomColor: colors.border }]} onPress={() => { setMenuOpen(false); router.push(`/edit-post?id=${listing.id}` as any); }}>
                  <Ionicons name="create-outline" size={18} color={colors.text} />
                  <Text style={[s.dropItemText, { color: colors.text }]}>Edit Listing</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.dropItem, { borderBottomColor: colors.border }]} onPress={handleReport}>
                <Ionicons name="flag-outline" size={18} color="#FF3B30" />
                <Text style={[s.dropItemText, { color: '#FF3B30' }]}>Report Listing</Text>
              </TouchableOpacity>
              {!isOwner && (
                <TouchableOpacity style={[s.dropItem, { borderBottomWidth: 0 }]} onPress={() => { setMenuOpen(false); handleReportUser(); }}>
                  <Ionicons name="person-remove-outline" size={18} color="#FF3B30" />
                  <Text style={[s.dropItemText, { color: '#FF3B30' }]}>Report Seller</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

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
              <Ionicons name="image-outline" size={60} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 14 }}>No photos added</Text>
            </View>
          )}
        </View>

        {isOwner && isPending && (
          <View style={[s.pendingBanner, { backgroundColor: isDark ? '#3d2e00' : '#FFFBEB', borderBottomColor: isDark ? '#7a5c00' : '#FDE68A' }]}>
            <Ionicons name="time-outline" size={20} color="#D97706" />
            <Text style={[s.pendingBannerText, { color: isDark ? '#fbbf24' : '#B45309' }]}>Your ad is under review and will be visible to buyers shortly.</Text>
          </View>
        )}

        {isOwner && isRejected && (
          <View style={[s.rejectedBanner, { backgroundColor: isDark ? '#450a0a' : '#FEF2F2', borderBottomColor: isDark ? '#7f1d1d' : '#FECACA' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="warning" size={20} color="#ef4444" />
              <Text style={[s.rejectedTitle, { color: isDark ? '#fca5a5' : '#DC2626' }]}>Action Required</Text>
            </View>
            <Text style={[s.rejectedReason, { color: isDark ? '#fecaca' : '#991B1B' }]}>{listing.moderation_note || 'Your ad violates community guidelines.'}</Text>
            
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={s.fixAdBtn} onPress={() => router.push(`/edit-post?id=${listing.id}` as any)}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={s.fixAdText}>Edit & Fix Ad</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.discardAdBtn, { backgroundColor: colors.background }]} onPress={handleDiscardAd}>
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text style={s.discardAdText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={s.details}>
          <View style={s.priceRow}>
            <Text style={[s.price, { color: colors.text }]}>{formattedPrice}</Text>
            {listing.is_sold && (
              <View style={s.soldBadge}><Text style={s.soldBadgeText}>SOLD</Text></View>
            )}
          </View>

          <Text style={[s.title, { color: colors.text }]}>{listing.title}</Text>

          <View style={s.tagRow}>
            {listing.category && (
              <View style={[s.tagBlue, { backgroundColor: isDark ? '#1e3a8a' : '#e8f0fe', borderColor: isDark ? '#1e40af' : '#c5d8fd' }]}>
                <Ionicons name="pricetag-outline" size={11} color={isDark ? '#93c5fd' : '#007AFF'} />
                <Text style={[s.tagBlueText, { color: isDark ? '#93c5fd' : '#007AFF' }]}>{listing.category}</Text>
              </View>
            )}
            {listing.condition && (
              <View style={[s.tagAmber, { backgroundColor: isDark ? '#422006' : '#fff8e1', borderColor: isDark ? '#713f12' : '#ffe082' }]}>
                <Ionicons name="shield-checkmark-outline" size={11} color={isDark ? '#fde047' : '#F9A825'} />
                <Text style={[s.tagAmberText, { color: isDark ? '#fde047' : '#F9A825' }]}>{listing.condition}</Text>
              </View>
            )}
            <View style={[s.tagGray, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
              <Text style={[s.tagGrayText, { color: colors.textSecondary }]}>{timeAgo(listing.created_at)}</Text>
            </View>

            <View style={[s.tagGray, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Ionicons name="eye-outline" size={11} color={colors.textSecondary} />
              <Text style={[s.tagGrayText, { color: colors.textSecondary }]}>{(listing.views || 0).toLocaleString()} views</Text>
            </View>
          </View>

          <View style={s.locRow}>
            <Ionicons name="location" size={16} color="#007AFF" />
            <Text style={[s.locText, { color: colors.textSecondary }]}>{listing.location || 'Location not specified'}</Text>
          </View>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {highlights.length > 0 && (
            <>
              <View style={s.highlightsHeader}>
                <Ionicons name="flash" size={16} color="#F5A623" />
                <Text style={[s.secTitle, { color: colors.text }]}>Key Highlights</Text>
              </View>
              <View style={s.highlightsGrid}>
                {highlights.map((h, i) => (
                  <View key={i} style={[s.highlightChip, { backgroundColor: isDark ? '#1e3a8a' : '#e8f4fd', borderColor: isDark ? '#1e40af' : '#bee3f8' }]}>
                    <Ionicons name="checkmark-circle" size={13} color={isDark ? '#60a5fa' : '#007AFF'} />
                    <Text style={[s.highlightChipText, { color: isDark ? '#60a5fa' : '#007AFF' }]}>{h}</Text>
                  </View>
                ))}
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
            </>
          )}

          <Text style={[s.secTitle, { color: colors.text }]}>About this listing</Text>
          <Text style={[s.desc, { color: colors.textSecondary }]}>{listing.description || 'No description provided.'}</Text>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          <Text style={[s.secTitle, { color: colors.text }]}>Seller Information</Text>

          <TouchableOpacity
            style={[s.sellerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.85}
            onPress={() => router.push(`/user/${listing.seller_id}` as any)}
          >
            <View style={s.sellerAvatarWrap}>
              {seller?.avatar_url
                ? <Image source={{ uri: seller.avatar_url }} style={s.sellerAvatarImg} />
                : <View style={s.sellerAvatarFallback}>
                    <Text style={s.sellerAvatarLetter}>{seller?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
              }
              <View style={s.onlineDot} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[s.sellerName, { color: colors.text }]}>{seller?.display_name || 'Unknown Seller'}</Text>
              <View style={s.ratingRow}>
                {sellerStats && sellerStats.review_count > 0 ? (
                  <>
                    <StarRow rating={sellerStats.avg_rating} size={13} />
                    <Text style={[s.ratingText, { color: colors.textSecondary }]}>
                      {sellerStats.avg_rating} ({sellerStats.review_count} review{sellerStats.review_count !== 1 ? 's' : ''})
                    </Text>
                  </>
                ) : (
                  <Text style={[s.noRatingText, { color: colors.textSecondary }]}>New seller · No reviews yet</Text>
                )}
              </View>
              <Text style={[s.memberSince, { color: colors.textSecondary }]}>
                Member since {seller?.created_at
                  ? new Date(seller.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                  : '—'}
              </Text>
            </View>

            <View style={s.viewProfileBtn}>
              <Text style={s.viewProfileText}>View Profile</Text>
              <Ionicons name="chevron-forward" size={14} color="#007AFF" />
            </View>
          </TouchableOpacity>

          {!isOwner && currentUserId && (
            <TouchableOpacity style={s.reportSellerLink} onPress={handleReportUser}>
              <Ionicons name="flag-outline" size={13} color="#FF3B30" />
              <Text style={s.reportSellerText}>Report this seller</Text>
            </TouchableOpacity>
          )}

          <View style={[s.safetyCard, { backgroundColor: isDark ? '#142e19' : '#f1f8f2', borderColor: isDark ? '#1f4726' : '#c8e6c9' }]}>
            <Ionicons name="shield-checkmark" size={20} color="#2E7D32" />
            <View style={{ flex: 1 }}>
              <Text style={[s.safetyTitle, { color: isDark ? '#4ade80' : '#2E7D32' }]}>Stay Safe on Boltzy</Text>
              <Text style={[s.safetyText, { color: isDark ? '#22c55e' : '#388E3C' }]}>Meet in public · Inspect before buying · Never pay in advance</Text>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      {!listing.is_sold && !isOwner && isApproved && (
        <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity style={[s.wishBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={toggleWishlist}>
            <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF3B30' : colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[s.chatBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={startChat}>
            <Ionicons name="chatbubbles" size={20} color={colors.text} />
            <Text style={[s.chatBtnText, { color: colors.text }]}>Chat</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={s.callBtn} onPress={handleOffer}>
            <Ionicons name="pricetag" size={20} color="#fff" />
            <Text style={s.callBtnText}>Make Offer</Text>
          </TouchableOpacity>
        </View>
      )}
      {listing.is_sold && (
        <View style={[s.soldBar, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.textSecondary} />
          <Text style={[s.soldBarText, { color: colors.textSecondary }]}>This item has been sold</Text>
        </View>
      )}
      
      <Modal visible={reportModalVisible} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={[s.modalCardCenter, { backgroundColor: colors.card }]}>
            {reportStep === 'form' ? (
              <>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: colors.text }}>
                  {reportTarget === 'listing' ? 'Report Listing' : 'Report Seller'}
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>
                  Why are you reporting this {reportTarget}?
                </Text>

                {reportTarget === 'listing' ? (
                  <>
                    <TouchableOpacity onPress={() => submitReport('spam')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Spam / Misleading</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => submitReport('prohibited')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Prohibited Item</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => submitReport('fraud')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Fraud / Scam</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => submitUserReport('spam_profile')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Spam / Fake Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => submitUserReport('fraud')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Fraud / Scam Seller</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => submitUserReport('abusive')} style={[s.reportOptionBtn, { borderBottomColor: colors.border }]}>
                      <Text style={s.reportOptionText}>Abusive Behaviour</Text>
                    </TouchableOpacity>
                  </>
                )}
                
                <TouchableOpacity onPress={() => setReportModalVisible(false)} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 16, color: '#FF3B30', fontWeight: 'bold' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={60} color="#34C759" style={{ marginBottom: 16 }} />
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: colors.text }}>Reported ✓</Text>
                <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
                  Thank you. Our team will {reportTarget === 'listing' ? 'review this listing' : 'investigate this seller'}.
                </Text>
                <TouchableOpacity 
                  onPress={() => { setReportModalVisible(false); setTimeout(() => setReportStep('form'), 300); }} 
                  style={[s.reportOptionBtn, { backgroundColor: colors.tint, borderRadius: 12, borderBottomWidth: 0 }]}
                >
                  <Text style={[s.reportOptionText, { color: isDark ? '#000' : '#fff' }]}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:            { flex: 1 },
  center:               { flex: 1, justifyContent: 'center', alignItems: 'center' },

  carouselWrap:         { width: '100%', height: 320, position: 'relative' },
  carouselImg:          { width: SCREEN_W, height: 320 },
  noImageBox:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlayHeader: {
    position: 'absolute', zIndex: 20,
    top: Platform.OS === 'ios' ? 54 : 22, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  overlayBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }, default: { elevation: 4 } }),
  },
  dropdown: {
    position: 'absolute', zIndex: 30,
    top: Platform.OS === 'ios' ? 100 : 68, right: 16,
    borderRadius: 14, paddingVertical: 6, minWidth: 190,
    ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(0,0,0,0.13)' }, default: { elevation: 8 } }),
  },
  dropItem:             { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  dropItemText:         { fontSize: 15, fontWeight: '500' },
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

  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1 },
  pendingBannerText: { fontSize: 14, fontWeight: '500', flex: 1 },
  rejectedBanner: { padding: 20, borderBottomWidth: 1 },
  rejectedTitle: { fontSize: 16, fontWeight: 'bold' },
  rejectedReason: { fontSize: 14, lineHeight: 20 },
  fixAdBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 8 },
  fixAdText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  discardAdBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#DC2626', paddingVertical: 12, borderRadius: 8 },
  discardAdText: { color: '#DC2626', fontWeight: 'bold', fontSize: 14 },

  details:              { padding: 20 },
  priceRow:             { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  price:                { fontSize: 34, fontWeight: 'bold' },
  soldBadge:            { backgroundColor: '#FF3B30', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  soldBadgeText:        { color: '#fff', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  title:                { fontSize: 20, fontWeight: '600', marginBottom: 14, lineHeight: 28 },

  tagRow:               { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagBlue:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagBlueText:          { fontSize: 12, fontWeight: '600' },
  tagAmber:             { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagAmberText:         { fontSize: 12, fontWeight: '600' },
  tagGray:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagGrayText:          { fontSize: 12, fontWeight: '500' },

  locRow:               { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  locText:              { fontSize: 14 },
  divider:              { height: 1, marginVertical: 20 },
  secTitle:             { fontSize: 17, fontWeight: 'bold', marginBottom: 12 },
  desc:                 { fontSize: 15, lineHeight: 24 },

  highlightsHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  highlightsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  highlightChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1,
  },
  highlightChipText:    { fontSize: 13, fontWeight: '600' },

  sellerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 10,
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
  sellerName:           { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  ratingRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ratingText:           { fontSize: 12, fontWeight: '500' },
  noRatingText:         { fontSize: 12 },
  memberSince:          { fontSize: 12 },
  viewProfileBtn:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewProfileText:      { fontSize: 12, color: '#007AFF', fontWeight: '600' },

  reportSellerLink:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 16, paddingLeft: 4 },
  reportSellerText:     { fontSize: 12, color: '#FF3B30', fontWeight: '500' },

  safetyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 14, padding: 14,
    borderWidth: 1,
  },
  safetyTitle:          { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  safetyText:           { fontSize: 13, lineHeight: 19 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }, default: { elevation: 8 } }),
  },
  wishBtn: {
    width: 50, height: 50, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  chatBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 15, borderRadius: 14,
  },
  chatBtnText:          { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  callBtn: {
    flex: 1.4, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#000', paddingVertical: 15, borderRadius: 14,
  },
  callBtnText:          { fontSize: 16, fontWeight: 'bold', color: '#fff', marginLeft: 8 },
  soldBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 18, borderTopWidth: 1,
  },
  soldBarText:          { fontSize: 15, fontWeight: '600' },
  modalOverlayCenter:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCardCenter:      { width: '100%', maxWidth: 340, borderRadius: 24, padding: 24, alignItems: 'center' },
  reportOptionBtn:      { width: '100%', paddingVertical: 14, borderBottomWidth: 1, alignItems: 'center' },
  reportOptionText:     { fontSize: 16, color: '#007AFF', fontWeight: '600' }
});