import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
  Modal, Alert, Animated, Image, TouchableWithoutFeedback, Dimensions,PanResponder,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { getCurrentUser } from '../../utils/auth';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedListingField, getLocalizedMessageContent } from '../../utils/localizedContent';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const StarPicker = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 8 }}>
    {[1, 2, 3, 4, 5].map((s) => (
      <TouchableOpacity key={s} onPress={() => onChange(s)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
        <Ionicons name={value >= s ? 'star' : 'star-outline'} size={38} color={value >= s ? '#F5A623' : '#ddd'} />
      </TouchableOpacity>
    ))}
  </View>
);

const RATING_LABELS: Record<number, string> = {
  1: 'Poor 😞', 2: 'Fair 😐', 3: 'Good 😊', 4: 'Great 😄', 5: 'Excellent! 🤩',
};

export const getInitials = (name?: string) => {
  if (!name || typeof name !== 'string') return '?';
  const cleanName = name.trim();
  if (!cleanName) return '?';
  const words = cleanName.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase(); 
  } else {
    const word = words[0];
    if (word.length === 1) return word[0].toUpperCase();
    return (word[0] + word[word.length - 1]).toUpperCase(); 
  }
};

export default function ChatRoom() {
  const {
    id: rawChatId,
    listing_id: rawListingId,
    seller_id: rawSellerId,
    listing_title: rawListingTitle,
    listing_price: rawListingPrice,
  } = useLocalSearchParams<{
    id?: string | string[];
    listing_id?: string | string[];
    seller_id?: string | string[];
    listing_title?: string | string[];
    listing_price?: string | string[];
  }>();
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId;
  const pendingListingId = Array.isArray(rawListingId) ? rawListingId[0] : rawListingId;
  const pendingSellerId = Array.isArray(rawSellerId) ? rawSellerId[0] : rawSellerId;
  const pendingListingTitle = Array.isArray(rawListingTitle) ? rawListingTitle[0] : rawListingTitle;
  const pendingListingPrice = Array.isArray(rawListingPrice) ? rawListingPrice[0] : rawListingPrice;
  const router  = useRouter();
  const { lang, t } = useLanguage();
  const [imgError, setImgError] = useState(false);

  const [messages, setMessages]             = useState<any[]>([]);
  const [newMessage, setNewMessage]         = useState('');
  const [loading, setLoading]               = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null);

  const flatListRef                         = useRef<FlatList>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [chatDetails, setChatDetails]       = useState<any>(null);
  
  const [selectedMsg, setSelectedMsg]       = useState<any>(null);
  const [isModalVisible, setModalVisible]   = useState(false);
  const [popoverCoords, setPopoverCoords]   = useState({ y: 0, alignment: 'right' });
  
  const [editingMsgId, setEditingMsgId]     = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]); 
  const [showStarredOnly, setShowStarredOnly] = useState(false); // ✨ Starred Filter State
  const lastMessagesFetchAtRef              = useRef(0);

  const [isAttachMenuVisible, setIsAttachMenuVisible] = useState(false);
  const [offerModalVisible, setOfferModalVisible]     = useState(false);
  const [offerAmount, setOfferAmount]                 = useState('');
  const [offerNote, setOfferNote]                     = useState('');
  const [offerError, setOfferError]                   = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const [phoneContacts, setPhoneContacts]                   = useState<any[]>([]);
  const [isContactPickerVisible, setIsContactPickerVisible] = useState(false);
  const [contactSearchQuery, setContactSearchQuery]         = useState('');
  const [isFetchingLocation, setIsFetchingLocation]         = useState(false);

  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [otherUserProfile, setOtherUserProfile]   = useState<any>(null);

  const msgChannelRef      = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const typingTimeoutRef   = useRef<NodeJS.Timeout | number | null>(null);
  const isTypingRef        = useRef(false);
  const fadeAnim           = useRef(new Animated.Value(0.3)).current;
  const currentUserIdRef   = useRef<string | null>(null);
  const pinnedMessageIdsRef = useRef<string[]>([]);

  const refetchMessagesRef = useRef<(uid?: string) => Promise<void>>(async () => {});
  const forceMarkAsReadRef = useRef<(userId: string | undefined) => Promise<void>>(async () => {});

  const [markSoldVisible, setMarkSoldVisible]   = useState(false);
  const [ratingVisible, setRatingVisible]       = useState(false);
  const [ratingValue, setRatingValue]           = useState(0);
  const [reviewText, setReviewText]             = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isSeller, setIsSeller]                 = useState(false);

  const dotsRef                               = useRef<View>(null);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [chatMenuPos, setChatMenuPos]         = useState({ x: 0, y: 0 });

  const [searchVisible, setSearchVisible]   = useState(false);
  const [searchText, setSearchText]         = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const searchInputRef                      = useRef<TextInput>(null);

  useEffect(() => {
    if (isOtherUserTyping) {
      Animated.loop(Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ])).start();
    } else {
      fadeAnim.setValue(1);
    }
  }, [fadeAnim, isOtherUserTyping]);

  useEffect(() => {
    const initUser = async () => {
      const user = await getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
      }
    };
    initUser();
  }, []);

  useEffect(() => {
    pinnedMessageIdsRef.current = pinnedMessages.map(pm => String(pm.id));
  }, [pinnedMessages]);

  const refetchMessages = useCallback(async (uid?: string) => {
    if (!chatId || chatId === 'new') {
      setMessages([]);
      setPinnedMessages([]);
      return;
    }
    try {
      const myId = uid ?? currentUserIdRef.current;
      const { data, error } = await supabase.from('messages').select('*')
        .eq('chat_id', chatId).order('created_at', { ascending: false });
      if (error) console.warn('[refetchMessages] error:', error.message);
      if (data && myId) {
        const visible = data.filter((m: any) => !m.deleted_by?.includes(myId));
        setMessages(visible);
        const activePins = visible.filter((m: any) => m.is_pinned && new Date(m.pinned_until) > new Date());
        setPinnedMessages(activePins);
        lastMessagesFetchAtRef.current = Date.now();
      }
    } catch (e: any) {
      console.error('[refetchMessages] unexpected error:', e?.message ?? e);
    }
  }, [chatId]);

  const forceMarkAsRead = useCallback(async (userId: string | undefined) => {
    if (!userId || !chatId || chatId === 'new') return;
    await supabase.rpc('mark_chat_read', { p_chat_id: chatId, p_user_id: userId });
  }, [chatId]);

  useEffect(() => { refetchMessagesRef.current = refetchMessages; }, [refetchMessages]);
  useEffect(() => { forceMarkAsReadRef.current = forceMarkAsRead; }, [forceMarkAsRead]);

  const setupChat = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (user && !currentUserIdRef.current) {
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
      }
      const uid = user?.id ?? currentUserIdRef.current;

      if (chatId === 'new') {
        if (!uid || !pendingListingId) {
          Alert.alert('Chat Unavailable', 'We could not load this conversation. Please try again from the listing.');
          router.back();
          return;
        }

        const { data: listingData, error: listingError } = await supabase
          .from('listings').select('*').eq('id', pendingListingId).maybeSingle();

        if (listingError) console.warn('[setupChat] pending listing fetch error:', listingError.message);

        const resolvedSellerId = listingData?.seller_id ?? pendingSellerId;
        if (!resolvedSellerId) {
          Alert.alert('Chat Unavailable', 'This listing is missing seller information.');
          router.back();
          return;
        }

        const { data: otherProfile } = await supabase
          .from('profiles').select('*').eq('id', resolvedSellerId).maybeSingle();

        setOtherUserProfile(otherProfile ?? null);
        setChatDetails({
          id: 'new', buyer_id: uid, seller_id: resolvedSellerId, listing_id: listingData?.id ?? pendingListingId,
          is_sold: false, review_submitted: false,
          listings: {
            id: listingData?.id ?? pendingListingId, title: listingData?.title ?? pendingListingTitle ?? 'Listing',
            price: listingData?.price ?? Number(pendingListingPrice || 0), image_urls: listingData?.image_urls ?? [], translations: listingData?.translations ?? {},
          },
        });
        setIsSeller(uid === resolvedSellerId);
        setMessages([]);
        setPinnedMessages([]);
        return;
      }

      const { data: cData, error: chatError } = await supabase
        .from('chats').select('*, listings(*)').eq('id', chatId).single();

      if (chatError) console.warn('[setupChat] chat fetch error:', chatError.message);

      if (cData) {
        setChatDetails(cData);
        setIsSeller(uid === cData.seller_id);
        const otherId = uid === cData.seller_id ? cData.buyer_id : cData.seller_id;
        const { data: otherProfile } = await supabase.from('profiles').select('*').eq('id', otherId).single();
        if (otherProfile) setOtherUserProfile(otherProfile);
        if (cData.is_sold && !cData.review_submitted && cData.buyer_id === uid) {
          setTimeout(() => setRatingVisible(true), 700);
        }
      }

      await refetchMessages(uid ?? undefined);

      if (uid && chatId && chatId !== 'new') {
        supabase.rpc('mark_chat_read', { p_chat_id: chatId, p_user_id: uid }).then(
          ({ error }) => { if (error) console.warn('[setupChat] mark_chat_read:', error.message); }
        );
      }
    } catch (e: any) {
      console.error('[setupChat] unexpected error:', e?.message ?? e);
    } finally {
      setLoading(false);
    }
  }, [chatId, pendingListingId, pendingListingPrice, pendingListingTitle, pendingSellerId, refetchMessages, router]);

  useEffect(() => {
    if (chatId) setupChat();
  }, [chatId, setupChat]);

  const resolveChatId = useCallback(async () => {
    if (!chatId) return null;
    if (chatId !== 'new') return chatId;

    const buyerId = currentUserIdRef.current;
    const listingId = pendingListingId ?? chatDetails?.listing_id;
    const sellerId = pendingSellerId ?? chatDetails?.seller_id;

    if (!buyerId || !listingId || !sellerId) {
      Alert.alert('Chat Unavailable', 'We could not create this conversation. Please try again from the listing.');
      return null;
    }

    const { data: existingChat, error: lookupError } = await supabase
      .from('chats').select('id').eq('listing_id', listingId).eq('buyer_id', buyerId).eq('seller_id', sellerId).maybeSingle();

    if (lookupError) {
      Alert.alert('Chat Error', lookupError.message);
      return null;
    }

    let resolvedChatId = existingChat?.id;

    if (!resolvedChatId) {
      const { data: newChat, error: createError } = await supabase
        .from('chats').insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId }).select('id').single();
      if (createError) { Alert.alert('Chat Error', createError.message); return null; }
      resolvedChatId = newChat.id;
    }

    router.replace(`/chat/${resolvedChatId}` as any);
    return resolvedChatId;
  }, [chatDetails?.listing_id, chatDetails?.seller_id, chatId, pendingListingId, pendingSellerId, router]);

  useEffect(() => {
    if (!currentUserId || !chatId || chatId === 'new') return;

    const safe = String(chatId).replace(/[^a-zA-Z0-9]/g, '');
    const msgChannel = supabase.channel(`boltzy_msgs_${safe}`);
    msgChannelRef.current = msgChannel;

    msgChannel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}`,
    }, (payload: any) => {
      const myId = String(currentUserIdRef.current);
      if (payload.eventType === 'INSERT') {
        if (!payload.new.deleted_by?.includes(myId)) {
          setMessages((prev) => {
            if (prev.some((m: any) => String(m.id) === String(payload.new.id))) return prev;
            return [payload.new, ...prev];
          });
        }
        if (String(payload.new.sender_id) !== myId) forceMarkAsReadRef.current(myId);
      } else if (payload.eventType === 'UPDATE') {
        if (payload.new.deleted_by?.includes(myId)) {
          setMessages((prev) => prev.filter((msg: any) => String(msg.id) !== String(payload.new.id)));
        } else {
          setMessages((prev) => prev.map((msg: any) => String(msg.id) === String(payload.new.id) ? payload.new : msg));
        }
        
        if (payload.new.is_pinned && new Date(payload.new.pinned_until) > new Date()) {
          setPinnedMessages(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev.map(p => p.id === payload.new.id ? payload.new : p);
            return [...prev, payload.new];
          });
        } else if (!payload.new.is_pinned && pinnedMessageIdsRef.current.includes(String(payload.new.id))) {
          setPinnedMessages(prev => prev.filter(p => String(p.id) !== String(payload.new.id)));
        }
      }
    });

    msgChannel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}`,
    }, (payload: any) => {
      setChatDetails((prev: any) => ({ ...prev, ...payload.new }));
      if (payload.new.is_sold && !payload.new.review_submitted && payload.new.buyer_id === currentUserIdRef.current) {
        setTimeout(() => setRatingVisible(true), 800);
      }
    });

    msgChannel.subscribe();

    const presenceChannel = supabase.channel(`boltzy_presence_${safe}`, {
      config: { presence:  { key: String(currentUserId) }, broadcast: { ack: false, self: false } },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      setIsOtherUserOnline(Object.keys(state).some(k => String(k) !== String(currentUserId)));
    });
    presenceChannel.on('presence', { event: 'join' }, ({ key }: any) => {
      if (String(key) !== String(currentUserId)) setIsOtherUserOnline(true);
    });
    presenceChannel.on('presence', { event: 'leave' }, ({ key }: any) => {
      if (String(key) !== String(currentUserId)) {
        setTimeout(() => {
          const state = presenceChannel.presenceState();
          setIsOtherUserOnline(Object.keys(state).some(k => String(k) !== String(currentUserId)));
        }, 1500);
      }
    });
    presenceChannel.on('broadcast', { event: 'typing' }, (payload: any) => {
      if (String(payload.payload.userId) !== String(currentUserId)) setIsOtherUserTyping(payload.payload.isTyping);
    });
    presenceChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await presenceChannel.track({ online: true, user_id: String(currentUserId) });
    });

    return () => { supabase.removeChannel(msgChannel); supabase.removeChannel(presenceChannel); };
  }, [chatId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      const shouldResyncMessages = messages.length === 0 || Date.now() - lastMessagesFetchAtRef.current > 30_000;
      if (chatId && currentUserIdRef.current && !loading && shouldResyncMessages) void refetchMessagesRef.current();
      if (chatId && chatId !== 'new' && currentUserIdRef.current) void forceMarkAsReadRef.current(currentUserIdRef.current);
      if (presenceChannelRef.current && currentUserIdRef.current) presenceChannelRef.current.track({ online: true, user_id: String(currentUserIdRef.current) });
    }, [chatId, loading, messages.length])
  );

  const openChatMenu = () => {
    if (!dotsRef.current) return;
    (dotsRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
      setChatMenuPos({ x: x + w - 200, y: y + h + 6 });
      setChatMenuVisible(true);
    });
  };
  const closeChatMenu = () => setChatMenuVisible(false);

  const handleViewProfile = () => {
    closeChatMenu();
    const otherId = currentUserIdRef.current === chatDetails?.seller_id ? chatDetails?.buyer_id : chatDetails?.seller_id;
    router.push(`/user/${otherId}` as any);
  };

  const handleSearchToggle = () => {
    closeChatMenu();
    setSearchText('');
    setSearchMatchIdx(0);
    setSearchVisible(v => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
      return !v;
    });
  };

  const handleMuteChat = async () => {
    closeChatMenu();
    const isMuted = chatDetails?.is_muted;
    await supabase.from('chats').update({ is_muted: !isMuted }).eq('id', chatId);
    setChatDetails((prev: any) => ({ ...prev, is_muted: !isMuted }));
    Alert.alert(isMuted ? 'Unmuted' : 'Muted', isMuted ? 'Notifications turned on.' : 'Notifications silenced for this chat.');
  };

  const handleClearChat = () => {
    closeChatMenu();
    Alert.alert('Clear Chat', 'All messages will be cleared for you only. The other person will still see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          const myId = currentUserIdRef.current;
          if (!myId) return;
          for (const msg of messages) {
            const existing = msg.deleted_by || [];
            if (!existing.includes(myId)) await supabase.from('messages').update({ deleted_by: [...existing, myId] }).eq('id', msg.id);
          }
          setMessages([]); setPinnedMessages([]);
        },
      },
    ]);
  };

  const handleBlockUser = () => {
    closeChatMenu();
    const otherId = currentUserIdRef.current === chatDetails?.seller_id ? chatDetails?.buyer_id : chatDetails?.seller_id;
    const otherName = otherUserProfile?.display_name || 'this user';
    Alert.alert(`Block ${otherName}?`, "They won't be able to message you and you won't see their listings.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive', onPress: async () => {
          await supabase.from('blocked_users').upsert({ blocker_id: currentUserIdRef.current, blocked_id: otherId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
          Alert.alert('Blocked', `${otherName} has been blocked.`);
          router.back();
        },
      },
    ]);
  };

  const handleReportFromMenu = () => {
    closeChatMenu();
    const otherId = currentUserIdRef.current === chatDetails?.seller_id ? chatDetails?.buyer_id : chatDetails?.seller_id;
    Alert.alert('Report User', 'Are you sure you want to report this user for suspicious activity?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('report_user_engine', { p_reported_user_id: otherId, p_reason: 'Reported from chat' });
          if (!error) Alert.alert('Report Received', 'Thank you. We will investigate.');
          else Alert.alert('Already Reported', 'You have already reported this user.');
        },
      },
    ]);
  };

  const localizedListingTitle = useCallback((listing: any) => getLocalizedListingField(listing, 'title', lang) || 'Chat', [lang]);
  const localizedMessageText = useCallback((message: any) => getLocalizedMessageContent(message, lang), [lang]);

  const localizedSystemText = useCallback((message: any) => {
      const rawContent = String(message?.content ?? '');
      if (message?.is_deleted_for_everyone || rawContent.startsWith('🚫')) return `🚫 ${t('chat_message_deleted')}`;
      if (rawContent.startsWith('🎉')) return `🎉 ${t('chat_item_sold')}`;
      return localizedMessageText(message);
    }, [localizedMessageText, t]);

  const searchMatches = searchText.trim() ? messages.filter((m) => {
        const searchableText = m.is_deleted_for_everyone || m.is_system || m.type === 'system' ? localizedSystemText(m) : localizedMessageText(m);
        return searchableText.toLowerCase().includes(searchText.toLowerCase());
      }) : [];

  const jumpToMessageId = (targetId: string) => {
    const index = messages.findIndex(m => m.id === targetId);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMsgId(targetId);
      setTimeout(() => setHighlightedMsgId(null), 1500);
    }
  };

  const jumpToSearchResult = (direction: 'next' | 'prev') => {
    if (!searchMatches.length) return;
    const newIdx = direction === 'next' ? (searchMatchIdx + 1) % searchMatches.length : (searchMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIdx(newIdx);
    jumpToMessageId(searchMatches[newIdx].id);
  };

  const pickImage = async () => {
    setIsAttachMenuVisible(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
    if (!result.canceled && result.assets[0].uri) uploadImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);
      const activeChatId = await resolveChatId();
      if (!activeChatId) return;
      const response = await fetch(uri);
      const blob     = await response.blob();
      const fileExt  = uri.substring(uri.lastIndexOf('.') + 1) || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from('chat_images').upload(fileName, blob);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('chat_images').getPublicUrl(fileName);
      await supabase.from('messages').insert({ chat_id: activeChatId, sender_id: currentUserIdRef.current, content: '📷 Photo', status: 'sent', type: 'image', image_url: publicUrl });
    } catch (error: any) { Alert.alert('Upload Failed', error.message); } finally { setUploadingImage(false); }
  };

  const sendRealLocation = async () => {
    setIsAttachMenuVisible(false);
    if (Platform.OS === 'web') return Alert.alert('Mobile Only', 'Location sharing is only available on the mobile app.');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Please allow Boltzy to access your location.');
    setIsFetchingLocation(true);
    try {
      const activeChatId = await resolveChatId();
      if (!activeChatId) return;
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const { latitude, longitude } = location.coords;
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      const geo: any = geocode.length > 0 ? geocode[0] : {};
      const address  = geo.city ? `${geo.district || geo.subregion || ''}, ${geo.city}, ${geo.region}`.replace(/^, /, '') : `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
      const mapLink  = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      const { error } = await supabase.from('messages').insert({ chat_id: activeChatId, sender_id: currentUserIdRef.current, content: `📍 Live GPS: ${address}\n${mapLink}`, status: 'sent', type: 'location' });
      if (error) Alert.alert('Database Error', 'Failed to send location.');
    } catch (error: any) { Alert.alert('GPS Error', `Could not fetch location: ${error.message}`); } finally { setIsFetchingLocation(false); }
  };

  const getExactContactName = (contact: any) => {
    if (contact.name && contact.name.trim() !== '') return contact.name.trim();
    const parts = [contact.firstName, contact.middleName, contact.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ').trim() : 'Unknown Contact';
  };

  const openContactPicker = async () => {
    setIsAttachMenuVisible(false);
    setContactSearchQuery('');
    if (Platform.OS === 'web') return Alert.alert('Mobile Only', 'Contact sharing is only available on the mobile app.');
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Please allow Boltzy to access your contacts.');
    try {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.MiddleName, Contacts.Fields.LastName], sort: Contacts.SortTypes.FirstName });
      const valid = data.filter((c: any) => c.phoneNumbers && c.phoneNumbers.length > 0);
      if (valid.length > 0) { setPhoneContacts(valid); setIsContactPickerVisible(true); }
      else Alert.alert('Empty Book', 'No contacts found with phone numbers.');
    } catch (error: any) { Alert.alert('Contact Error', `Could not load contacts: ${error.message}`); }
  };

  const sendSelectedContact = async (contact: any) => {
    setIsContactPickerVisible(false);
    const activeChatId = await resolveChatId();
    if (!activeChatId) return;
    const phone = contact.phoneNumbers[0].number;
    const exactName = getExactContactName(contact);
    await supabase.from('messages').insert({ chat_id: activeChatId, sender_id: currentUserIdRef.current, content: `👤 ${exactName}\n📞 ${phone}`, status: 'sent', type: 'contact' });
  };

  const sendTypingBroadcast = (isTyping: boolean) => presenceChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: String(currentUserIdRef.current), isTyping } });

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!isTypingRef.current) { isTypingRef.current = true; sendTypingBroadcast(true); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current as any);
    typingTimeoutRef.current = setTimeout(() => { isTypingRef.current = false; sendTypingBroadcast(false); }, 2000) as any;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserIdRef.current) return;
    const activeChatId = await resolveChatId();
    if (!activeChatId) return;
    const messageText = newMessage.trim();
    setNewMessage('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current as any);
    isTypingRef.current = false; sendTypingBroadcast(false);

    if (editingMsgId) {
      const { data } = await supabase.from('messages').update({ content: messageText, is_edited: true }).eq('id', editingMsgId).select().single();
      if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setEditingMsgId(null); return;
    }
    await supabase.from('messages').insert({ chat_id: activeChatId, sender_id: currentUserIdRef.current, content: messageText, status: 'sent', type: 'text' });
  };

  const sendOffer = async () => {
    setOfferError('');
    const amount       = parseFloat(offerAmount);
    const listingPrice = chatDetails?.listings?.price || 0;
    const minPrice     = listingPrice * 0.5;
    if (isNaN(amount))         return setOfferError('Please enter a valid amount.');
    if (amount < minPrice)     return setOfferError(`Offer must be at least 50% of asking price (₹${minPrice.toFixed(0)}).`);
    if (amount > listingPrice) return setOfferError(`You cannot offer more than the asking price (₹${listingPrice}).`);
    const activeChatId = await resolveChatId();
    if (!activeChatId) return;
    setOfferModalVisible(false);
    if (editingMsgId) {
      const { data } = await supabase.from('messages').update({ offer_amount: amount, content: offerNote.trim() || "I'd like to make an offer for this item.", is_edited: true }).eq('id', editingMsgId).select().single();
      if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setEditingMsgId(null);
    } else {
      await supabase.from('messages').insert({ chat_id: activeChatId, sender_id: currentUserIdRef.current, content: offerNote.trim() || "I'd like to make an offer for this item.", status: 'sent', type: 'offer', offer_amount: amount, offer_status: 'pending' });
    }
    setOfferAmount(''); setOfferNote('');
  };

  const handleOfferAction = async (msgId: string, action: 'accepted' | 'declined') => {
    const { data } = await supabase.from('messages').update({ offer_status: action }).eq('id', msgId).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  WHATSAPP STYLE CONTEXT MENU ACTIONS (PIN, STAR, DELETE)
  // ─────────────────────────────────────────────────────────────────────────

  const handleLongPress = (msg: any, py: number) => { 
    setSelectedMsg(msg); 
    const MENU_HEIGHT = 380; 
    const isMine = msg.sender_id === currentUserIdRef.current;
    
    let safeY = py - 40; 
    if (safeY > SCREEN_HEIGHT - MENU_HEIGHT) {
      safeY = SCREEN_HEIGHT - MENU_HEIGHT - 20; 
    }
    if (safeY < 100) safeY = 100;

    setPopoverCoords({ y: safeY, alignment: isMine ? 'right' : 'left' });
    setModalVisible(true); 
  };

  const handleEdit = () => {
    setModalVisible(false);
    setEditingMsgId(selectedMsg.id);
    if (selectedMsg.type === 'offer') {
      setOfferAmount(selectedMsg.offer_amount.toString());
      setOfferNote(selectedMsg.content);
      setOfferModalVisible(true);
    } else {
      setNewMessage(selectedMsg.content);
    }
  };

  const handleUnpin = (pinnedId: string) => {
    Alert.alert('Unpin Message', 'Are you sure you want to unpin this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpin', style: 'destructive', onPress: async () => {
          const { data } = await supabase.from('messages').update({ is_pinned: false, pinned_until: null }).eq('id', pinnedId).select().single();
          if (data) {
            setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
            setPinnedMessages(prev => prev.filter(p => p.id !== pinnedId));
          }
        },
      },
    ]);
  };

  // ✨ FIX: Pin Logic Update
const handlePinRequest = () => {
    setModalVisible(false);
    if (selectedMsg?.is_pinned) {
      handleUnpin(selectedMsg.id);
      return;
    }
    if (pinnedMessages.length >= 2) {
      Alert.alert('Pin Limit Reached', 'You can only pin up to 2 messages in a chat. Please unpin an older message first.');
      return;
    }
    // ✨ Android Fix: Use a custom modal instead of the system alert!
    setTimeout(() => setPinModalVisible(true), 300);
  };

  const applyPin = async (hours: number) => {
    const exp = new Date();
    exp.setHours(exp.getHours() + hours);
    const { data, error } = await supabase.from('messages').update({
      is_pinned: true, pinned_until: exp.toISOString(),
    }).eq('id', selectedMsg.id).select().single();
    
    if (error) {
       Alert.alert('Database Error', 'Please ensure is_pinned and pinned_until columns exist in Supabase.');
    } else if (data) {
      setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setPinnedMessages(prev => {
        if (prev.find(p => p.id === data.id)) return prev.map(p => p.id === data.id ? data : p);
        return [...prev, data];
      });
    }
  };

  // ✨ FIX: Star Logic Update
  const handleStarMessage = async () => {
    setModalVisible(false);
    const newStatus = !selectedMsg.is_starred;
    const { data, error } = await supabase.from('messages')
      .update({ is_starred: newStatus })
      .eq('id', selectedMsg.id).select().single();
    
    if (data) {
       setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
    } else if (error) {
       Alert.alert('Database Error', 'Please ensure the is_starred column exists in your messages table.');
    }
  };

  const isWithin10Mins  = (timestamp: string) => (new Date().getTime() - new Date(timestamp).getTime()) < 600000;

  const handleDeleteForEveryone = async () => {
    setModalVisible(false);
    const { data } = await supabase.from('messages').update({
      is_deleted_for_everyone: true, content: '🚫 This message was deleted.',
    }).eq('id', selectedMsg.id).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  const handleDeleteForMe = async () => {
    setModalVisible(false);
    if (!currentUserIdRef.current) return;
    const currentDeletedBy = selectedMsg.deleted_by || [];
    if (!currentDeletedBy.includes(currentUserIdRef.current)) {
      await supabase.from('messages').update({ deleted_by: [...currentDeletedBy, currentUserIdRef.current] }).eq('id', selectedMsg.id);
      setMessages(prev => prev.filter(m => String(m.id) !== String(selectedMsg.id)));
    }
  };

  const handleReact = async (emoji: string) => {
    setModalVisible(false);
    const { data } = await supabase.from('messages').update({
      reactions: { ...selectedMsg.reactions, [currentUserIdRef.current as string]: emoji },
    }).eq('id', selectedMsg.id).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  const handleMarkSoldClick = () => {
    const title = chatDetails?.listings?.title ?? 'this item';
    const msg = `This will mark "${title}" as sold.\nThe buyer will be prompted to leave you a review.`;
    if (Platform.OS === 'web') { if (window.confirm(`Mark Item as Sold?\n\n${msg}`)) confirmMarkSold(); } 
    else { Alert.alert("Mark Item as Sold?", msg, [{ text: "Cancel", style: "cancel" }, { text: "Yes, Mark as Sold", onPress: confirmMarkSold }]); }
  };

  const confirmMarkSold = async () => {
    setMarkSoldVisible(false);
    try {
      const { error: chatErr } = await supabase.from('chats').update({ is_sold: true }).eq('id', chatId);
      if (chatErr) throw chatErr;
      const { error: listErr } = await supabase.from('listings').update({ is_sold: true }).eq('id', chatDetails?.listings?.id);
      if (listErr) throw listErr;

      await supabase.from('messages').insert({ chat_id: chatId, sender_id: currentUserIdRef.current, content: '🎉 Item has been marked as sold! Thank you for using Boltzy.', status: 'sent', type: 'system', is_system: true });
      setChatDetails((prev: any) => ({ ...prev, is_sold: true }));
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert("DB Error: " + err.message); else Alert.alert("Database Error", err.message);
    }
  };

  const submitReview = async () => {
    if (ratingValue === 0) { Alert.alert('Rate your experience', 'Please tap the stars to leave a rating.'); return; }
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('reviews').insert({ reviewer_id: currentUserIdRef.current, seller_id: chatDetails.seller_id, chat_id: chatId, listing_id: chatDetails.listing_id, rating: ratingValue, review_text: reviewText.trim() || null });
      if (error) throw error;
      const { error: chatErr } = await supabase.from('chats').update({ review_submitted: true }).eq('id', chatId);
      if (chatErr) throw chatErr;

      setChatDetails((prev: any) => ({ ...prev, review_submitted: true }));
      setRatingVisible(false);
      Alert.alert('Thank you! 🙏', 'Your review helps build trust in the Boltzy community.');
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert("Review Error: " + err.message); else Alert.alert("Review Error", err.message);
    } finally { setSubmittingReview(false); }
  };

  const skipReview = async () => {
    setRatingVisible(false);
    await supabase.from('chats').update({ review_submitted: true }).eq('id', chatId);
    setChatDetails((prev: any) => ({ ...prev, review_submitted: true }));
  };

  const renderTicks = (msg: any) => {
    if (msg.sender_id !== currentUserIdRef.current) return null;
    if (msg.is_read || msg.status === 'read')   return <Ionicons name="checkmark-done" size={16} color="#34B7F1" />;
    if (msg.status === 'delivered')             return <Ionicons name="checkmark-done" size={16} color="#999" />;
    return <Ionicons name="checkmark" size={16} color="#999" />;
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: any }) => {
    const isMine        = item.sender_id === currentUserIdRef.current;
    const isDeleted     = item.is_deleted_for_everyone;
    const myReaction    = item.reactions ? Object.values(item.reactions)[0] as string : null;
    const isHighlighted = item.id === highlightedMsgId;
    const isOffer    = item.type === 'offer';
    const isImage    = item.type === 'image';
    const isLocation = item.type === 'location';
    const isContact  = item.type === 'contact';
    const isSystem   = item.type === 'system' || item.is_system;
    const isSpecial  = isOffer || isImage || isLocation || isContact;
    const messageText = isDeleted || isSystem ? localizedSystemText(item) : localizedMessageText(item);
    const isSearchHit = searchText.trim() && messageText.toLowerCase().includes(searchText.toLowerCase());

    if (isSystem) {
      return (
        <View style={styles.systemMsgWrap}>
          <View style={styles.systemMsgBubble}>
            <Ionicons name="checkmark-circle" size={14} color="#2E7D32" style={{ marginRight: 6 }} />
            <Text style={styles.systemMsgText}>{localizedSystemText(item)}</Text>
          </View>
        </View>
      );
    }

    let touchY = 0;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={(e) => { touchY = e.nativeEvent.pageY; }}
        onLongPress={() => !isDeleted && handleLongPress(item, touchY)}
        delayLongPress={200}
        style={[styles.msgWrapper, isMine ? styles.myMsgWrapper : styles.theirMsgWrapper]}
      >
        {!isMine && (
          <TouchableOpacity onPress={() => {
              const otherId = currentUserIdRef.current === chatDetails?.seller_id ? chatDetails?.buyer_id : chatDetails?.seller_id;
              router.push(`/user/${otherId}` as any);
            }} style={styles.msgAvatarWrap}>
            {otherUserProfile?.avatar_url
              ? <Image source={{ uri: otherUserProfile.avatar_url }} style={styles.msgAvatarImg} />
              : <View style={styles.msgAvatarFallback}><Text style={styles.msgAvatarLetter}>{getInitials(otherUserProfile?.real_name || otherUserProfile?.display_name || '?')}</Text></View>
            }
          </TouchableOpacity>
        )}

        <View style={[
          styles.msgBubble,
          isMine ? styles.myBubble : styles.theirBubble,
          isDeleted && styles.deletedBubble,
          isHighlighted && styles.highlightedBubble,
          isSearchHit && styles.searchHitBubble,
          isOffer && styles.offerBubble,
          isImage && styles.imageBubble,
        ]}>
          {isImage && !isDeleted && (<Image source={{ uri: item.image_url }} style={styles.chatImage} resizeMode="cover" />)}
          {isOffer && !isDeleted && (<View style={styles.offerHeader}><Ionicons name="pricetag" size={16} color="#007AFF" /><Text style={styles.offerHeaderText}>Offer Made</Text></View>)}
          {isOffer && !isDeleted && <Text style={styles.offerAmountText}>₹{item.offer_amount}</Text>}
          
          {isLocation && !isDeleted && (
            <TouchableOpacity style={styles.attachmentBox} onPress={() => { const urlMatch = item.content.match(/https:\/\/www\.google\.com\/maps[^\s]+/); if (urlMatch) Linking.openURL(urlMatch[0]); }}>
              <View style={[styles.attachmentIconWrap, { backgroundColor: '#e8f5e9' }]}><Ionicons name="map" size={24} color="#4CAF50" /></View>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.msgText, isMine ? styles.myText : styles.theirText, { fontWeight: 'bold' }]} numberOfLines={1}>{messageText.split('\n')[0]}</Text>
                <Text style={{ color: '#007AFF', fontSize: 12, marginTop: 2 }}>Tap to view on map</Text>
              </View>
            </TouchableOpacity>
          )}

          {isContact && !isDeleted && (
            <TouchableOpacity style={styles.attachmentBox} onPress={() => { const phoneMatch = item.content.match(/📞\s*([+0-9\s]+)/); if (phoneMatch) Linking.openURL(`tel:${phoneMatch[1].trim()}`); }}>
              <View style={[styles.attachmentIconWrap, { backgroundColor: '#e3f2fd' }]}><Ionicons name="person" size={24} color="#2196F3" /></View>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.msgText, isMine ? styles.myText : styles.theirText, { fontWeight: 'bold' }]} numberOfLines={1}>{messageText.split('\n')[0]}</Text>
                <Text style={{ color: '#007AFF', fontSize: 12, marginTop: 2 }}>Tap to call</Text>
              </View>
            </TouchableOpacity>
          )}

          {(!isSpecial || isOffer) && (
            <Text style={[styles.msgText, isMine ? styles.myText : styles.theirText, isDeleted && styles.deletedText, isOffer && { fontStyle: 'italic' }]}>
              {isOffer && !isDeleted ? `"${messageText}"` : messageText}
            </Text>
          )}

          {isOffer && !isDeleted && item.offer_status === 'pending' && !isMine && currentUserIdRef.current === chatDetails?.seller_id && (
            <View style={styles.offerActionRow}>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleOfferAction(item.id, 'accepted')}><Text style={styles.btnTextWhite}>Accept</Text></TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => handleOfferAction(item.id, 'declined')}><Text style={styles.btnTextWhite}>Decline</Text></TouchableOpacity>
            </View>
          )}
          
          {isOffer && !isDeleted && item.offer_status !== 'pending' && (
            <View style={[styles.offerStatusBadge, item.offer_status === 'accepted' ? styles.bgGreen : styles.bgRed]}>
              <Text style={styles.btnTextWhite}>{item.offer_status === 'accepted' ? 'Offer Accepted' : 'Offer Declined'}</Text>
            </View>
          )}

          <View style={[styles.msgFooter, isImage && styles.imageFooterOverlay]}>
            {item.is_starred && <Ionicons name="star" size={11} color="#aaa" style={[isImage && styles.textShadow, { marginRight: 3 }]} />}
            {item.is_edited && !isDeleted && (<Text style={[styles.editedText, isImage && styles.textShadow]}>(edited)</Text>)}
            <Text style={[styles.timeText, isImage && styles.textShadow]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            {renderTicks(item)}
          </View>
          {myReaction && (<View style={styles.reactionBadge}><Text style={{ fontSize: 12 }}>{myReaction}</Text></View>)}
        </View>
      </TouchableOpacity>
    );
  };

  const hasPendingOffer  = messages.some(m => m.type === 'offer' && m.offer_status === 'pending');
  const hasAcceptedOffer = messages.some(m => m.type === 'offer' && m.offer_status === 'accepted');

  // ✨ FIX: Apply Star Filter to FlatList
  const displayMessages = showStarredOnly ? messages.filter(m => m.is_starred) : messages;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90} style={styles.container}>
      {isFetchingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 10, fontWeight: 'bold' }}>Pinpointing exact location...</Text>
        </View>
      )}

      {/* ═══ HEADER ════════════════════════════════════════ */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.push('/chats' as any)} style={styles.headerBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerTitleContainer} activeOpacity={0.75} onPress={() => { const otherId = currentUserIdRef.current === chatDetails?.seller_id ? chatDetails?.buyer_id : chatDetails?.seller_id; router.push(`/user/${otherId}` as any); }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            {otherUserProfile?.avatar_url && otherUserProfile.avatar_url.trim() !== '' && !imgError ? (
              <Image source={{ uri: otherUserProfile.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} onError={() => setImgError(true)} />
            ) : (
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{getInitials(otherUserProfile?.name || otherUserProfile?.real_name || otherUserProfile?.display_name || '?')}</Text>
            )}
            {isOtherUserOnline && <View style={styles.headerOnlineDot} />}
          </View>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{otherUserProfile ? (otherUserProfile.real_name || otherUserProfile.display_name || 'Unknown User') : '...'}</Text>
            <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>{localizedListingTitle(chatDetails?.listings)}</Text> 
            {isOtherUserTyping ? (<Animated.Text style={[styles.typingText, { opacity: fadeAnim }]}>typing...</Animated.Text>) : isOtherUserOnline ? (<Text style={styles.onlineText}>Online</Text>) : null}
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isSeller && !chatDetails?.is_sold && (
           <TouchableOpacity style={styles.markSoldBtn} onPress={handleMarkSoldClick}> 
              <Text style={styles.markSoldBtnText}>Mark Sold</Text>
            </TouchableOpacity>
          )}
          <View ref={dotsRef} collapsable={false}>
            <TouchableOpacity onPress={openChatMenu} style={{ padding: 6 }}><Ionicons name="ellipsis-vertical" size={24} color="#000" /></TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ═══ LISTING PREVIEW STRIP ═════════════════════════ */}
      {chatDetails?.listings && (
        <TouchableOpacity style={[styles.listingStrip, chatDetails?.is_sold && styles.listingStripSold]} onPress={() => router.push(`/listing/${chatDetails?.listing_id}` as any)} activeOpacity={0.8}>
          {chatDetails.listings.image_urls?.[0]
            ? <Image source={{ uri: chatDetails.listings.image_urls[0] }} style={styles.stripImg} />
            : <View style={[styles.stripImg, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}><Ionicons name="image-outline" size={16} color="#bbb" /></View>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.stripTitle} numberOfLines={1}>{localizedListingTitle(chatDetails.listings)}</Text>
            <Text style={styles.stripPrice}>₹{Number(chatDetails.listings.price).toLocaleString('en-IN')}</Text>
          </View>
          {chatDetails?.is_sold && (<View style={styles.stripSoldBadge}><Text style={styles.stripSoldText}>SOLD</Text></View>)}
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
      )}

      {/* ═══ IN-CHAT SEARCH BAR ════════════════════════════ */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
          <TextInput ref={searchInputRef} style={styles.searchInput} placeholder="Search messages..." value={searchText} onChangeText={t => { setSearchText(t); setSearchMatchIdx(0); }} placeholderTextColor="#bbb" returnKeyType="search" />
          {searchMatches.length > 0 && (<Text style={styles.searchCount}>{searchMatchIdx + 1}/{searchMatches.length}</Text>)}
          <TouchableOpacity onPress={() => jumpToSearchResult('prev')} disabled={!searchMatches.length} style={styles.searchNavBtn}><Ionicons name="chevron-up" size={20} color={searchMatches.length ? '#007AFF' : '#ccc'} /></TouchableOpacity>
          <TouchableOpacity onPress={() => jumpToSearchResult('next')} disabled={!searchMatches.length} style={styles.searchNavBtn}><Ionicons name="chevron-down" size={20} color={searchMatches.length ? '#007AFF' : '#ccc'} /></TouchableOpacity>
          <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchText(''); }} style={styles.searchNavBtn}><Ionicons name="close" size={20} color="#666" /></TouchableOpacity>
        </View>
      )}

      {/* ═══ PINNED MESSAGE BARS (Multi-Pin Supported) ════════ */}
      {pinnedMessages.map((pm, index) => (
        <TouchableOpacity key={pm.id} style={[styles.pinnedBar, index > 0 && { borderTopWidth: 1, borderTopColor: '#f0f0f0' }]} onPress={() => jumpToMessageId(pm.id)} activeOpacity={0.7}>
          <Ionicons name="pin" size={16} color="#007AFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle}>Pinned Message</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>{localizedMessageText(pm)}</Text>
          </View>
          <TouchableOpacity onPress={() => handleUnpin(pm.id)} style={{ padding: 5 }}><Ionicons name="close" size={20} color="#999" /></TouchableOpacity>
        </TouchableOpacity>
      ))}

      {/* ═══ CHAT FEED ═════════════════════════════════════ */}
      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayMessages} 
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={info => { setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }), 500); }}
        />
      )}

      {/* ═══ SOLD BANNER ═══════════════════════════════════ */}
      {chatDetails?.is_sold && (
        <View style={styles.soldBanner}>
          <Ionicons name="checkmark-circle" size={15} color="#2E7D32" />
          <Text style={styles.soldBannerText}>
            Item sold · {!chatDetails.review_submitted && !isSeller ? <Text style={styles.soldBannerLink} onPress={() => setRatingVisible(true)}>Leave a review →</Text> : 'Transaction complete'}
          </Text>
        </View>
      )}

      {/* ═══ INPUT BAR ═════════════════════════════════════ */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={() => setIsAttachMenuVisible(true)} style={styles.attachMenuBtn}><Ionicons name="attach" size={28} color="#666" /></TouchableOpacity>
        {chatDetails && currentUserIdRef.current !== chatDetails.seller_id && !hasPendingOffer && !hasAcceptedOffer && (
          <TouchableOpacity onPress={() => { setEditingMsgId(null); setOfferModalVisible(true); setOfferError(''); }} style={styles.offerIconBtn}><Ionicons name="pricetag-outline" size={24} color="#666" /></TouchableOpacity>
        )}
        <TextInput style={styles.input} placeholder={editingMsgId ? 'Edit message...' : 'Type a message...'} value={newMessage} onChangeText={handleTyping} multiline />
        {!newMessage && (
          <TouchableOpacity onPress={pickImage} style={styles.inlineCameraBtn} disabled={uploadingImage}>
            {uploadingImage ? <ActivityIndicator size="small" color="#007AFF" /> : <Ionicons name="camera" size={24} color="#888" />}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]} onPress={sendMessage}><Ionicons name={editingMsgId ? 'checkmark' : 'send'} size={18} color="#fff" /></TouchableOpacity>
      </View>

      {/* ════════════ MODAL: ATTACHMENT MENU ═══════════════ */}
      <Modal visible={isAttachMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setIsAttachMenuVisible(false)}>
          <View style={styles.attachMenuCard}>
            <View style={styles.attachRow}>
              <TouchableOpacity style={styles.attachItem} onPress={pickImage}><View style={[styles.attachIconCircle, { backgroundColor: '#BF59CF' }]}><Ionicons name="image" size={28} color="#fff" /></View><Text style={styles.attachText}>Gallery</Text></TouchableOpacity>
              <TouchableOpacity style={styles.attachItem} onPress={sendRealLocation}><View style={[styles.attachIconCircle, { backgroundColor: '#009688' }]}><Ionicons name="location" size={28} color="#fff" /></View><Text style={styles.attachText}>Location</Text></TouchableOpacity>
              <TouchableOpacity style={styles.attachItem} onPress={openContactPicker}><View style={[styles.attachIconCircle, { backgroundColor: '#2196F3' }]}><Ionicons name="person" size={28} color="#fff" /></View><Text style={styles.attachText}>Contact</Text></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={isContactPickerVisible} transparent animationType="slide">
        <View style={styles.contactModalOverlay}>
          <View style={styles.contactModalCard}>
            <View style={styles.contactHeader}><Text style={styles.contactTitle}>Select Contact</Text><TouchableOpacity onPress={() => setIsContactPickerVisible(false)}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity></View>
            <View style={styles.contactSearchBox}><Ionicons name="search" size={20} color="#999" style={{ marginRight: 8 }} /><TextInput style={styles.contactSearchInput} placeholder="Search by name..." value={contactSearchQuery} onChangeText={setContactSearchQuery} /></View>
            <FlatList data={phoneContacts.filter(c => getExactContactName(c).toLowerCase().includes(contactSearchQuery.toLowerCase()))} keyExtractor={(item) => item.id || Math.random().toString()} renderItem={({ item }) => {
                const displayName = getExactContactName(item);
                return (<TouchableOpacity style={styles.contactRow} onPress={() => sendSelectedContact(item)}><View style={styles.contactAvatar}><Text style={styles.contactAvatarText}>{displayName.charAt(0).toUpperCase()}</Text></View><View><Text style={styles.contactName}>{displayName}</Text><Text style={styles.contactPhone}>{item.phoneNumbers[0].number}</Text></View></TouchableOpacity>);
              }} />
          </View>
        </View>
      </Modal>

      <Modal visible={offerModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingMsgId ? 'Edit Offer' : 'Make an Offer'}</Text>
            <Text style={styles.modalSub}>Asking Price: ₹{chatDetails?.listings?.price}</Text>
            {offerError !== '' && <Text style={styles.errorText}>{offerError}</Text>}
            <TextInput style={styles.offerInput} placeholder="Enter your offer amount (₹)" keyboardType="numeric" value={offerAmount} onChangeText={(text) => { setOfferAmount(text); if (offerError) setOfferError(''); }} />
            <TextInput style={[styles.offerInput, { height: 80, textAlignVertical: 'top' }]} placeholder="Add a note to the seller..." multiline value={offerNote} onChangeText={setOfferNote} />
            <View style={styles.offerActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setOfferModalVisible(false); setEditingMsgId(null); setOfferError(''); }}><Text style={styles.btnTextBlack}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sendOfferBtn} onPress={sendOffer}><Text style={styles.btnTextWhite}>{editingMsgId ? 'Save Edit' : 'Send Offer'}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ✨ WHATSAPP CONTEXT MENU POPOVER ✨ */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.popoverOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={[
              styles.popoverMenu, 
              { top: popoverCoords.y },
              popoverCoords.alignment === 'right' ? { right: 20 } : { left: 20 }
            ]}>
            
            <View style={styles.popoverReactionRow}>
              {['👍', '❤️', '😂', '😮'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)}><Text style={styles.reactionEmoji}>{emoji}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={styles.popoverDivider} />
            
            <TouchableOpacity style={styles.popoverOption} onPress={handleStarMessage}>
              <Ionicons name={selectedMsg?.is_starred ? 'star' : 'star-outline'} size={20} color="#000" />
              <Text style={styles.popoverOptionText}>{selectedMsg?.is_starred ? 'Unstar Message' : 'Star Message'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.popoverOption} onPress={handlePinRequest}>
              <Ionicons name={selectedMsg?.is_pinned ? 'pin' : 'pin-outline'} size={20} color="#000" />
              <Text style={styles.popoverOptionText}>{selectedMsg?.is_pinned ? 'Unpin Message' : 'Pin Message'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.popoverOption} onPress={handleDeleteForMe}>
              <Ionicons name="eye-off-outline" size={20} color="#000" />
              <Text style={styles.popoverOptionText}>Delete for Me</Text>
            </TouchableOpacity>

            {selectedMsg?.sender_id === currentUserIdRef.current && isWithin10Mins(selectedMsg?.created_at) && (
              <>
                {selectedMsg?.type !== 'image' && selectedMsg?.type !== 'location' && selectedMsg?.type !== 'contact' && (
                  <TouchableOpacity style={styles.popoverOption} onPress={handleEdit}>
                    <Ionicons name="pencil" size={20} color="#000" />
                    <Text style={styles.popoverOptionText}>Edit {selectedMsg.type === 'offer' ? 'Offer' : 'Message'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.popoverOption} onPress={handleDeleteForEveryone}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  <Text style={[styles.popoverOptionText, { color: '#FF3B30' }]}>Delete for Everyone</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={ratingVisible} transparent animationType="slide">
        <View style={styles.overlayBottom}>
          <View style={styles.ratingCard}>
            <View style={styles.ratingHandle} />
          <View style={styles.ratingAvatarWrap}>
              {otherUserProfile?.avatar_url
                ? <Image source={{ uri: otherUserProfile.avatar_url }} style={styles.ratingAvatarImg} />
                : <View style={styles.ratingAvatarFallback}><Text style={styles.ratingAvatarLetter}>{getInitials(otherUserProfile?.real_name || otherUserProfile?.display_name || '?')}</Text></View>
              }
            </View>
            <Text style={styles.ratingTitle}>How was your experience?</Text>
            <Text style={styles.ratingSubtitle}>Rate your transaction with{'\n'}<Text style={{ fontWeight: '700', color: '#000' }}>{otherUserProfile?.display_name || 'the seller'}</Text></Text>
            <StarPicker value={ratingValue} onChange={setRatingValue} />
            {ratingValue > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[ratingValue]}</Text>}
            <TextInput style={styles.reviewInput} placeholder="Write a review (optional)..." placeholderTextColor="#bbb" value={reviewText} onChangeText={setReviewText} multiline maxLength={500} numberOfLines={3} />
            <Text style={styles.reviewCharCount}>{reviewText.length}/500</Text>
            <TouchableOpacity style={[styles.submitReviewBtn, ratingValue === 0 && { opacity: 0.45 }]} onPress={submitReview} disabled={submittingReview || ratingValue === 0}>{submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitReviewText}>Submit Review</Text>}</TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={skipReview}><Text style={styles.skipText}>Skip for now</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ✨ NEW: CUSTOM PIN DURATION MODAL */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>Pin Message</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' }}>How long do you want to pin this message?</Text>

            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(1); }} style={styles.pinOptionBtn}>
              <Text style={styles.pinOptionText}>1 Hour</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(168); }} style={styles.pinOptionBtn}>
              <Text style={styles.pinOptionText}>7 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(720); }} style={styles.pinOptionBtn}>
              <Text style={styles.pinOptionText}>1 Month</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPinModalVisible(false)} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ fontSize: 16, color: '#FF3B30', fontWeight: 'bold' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={chatMenuVisible} transparent animationType="fade" onRequestClose={closeChatMenu} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={closeChatMenu}>
          <View style={styles.chatMenuOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.chatMenuCard, { top: chatMenuPos.y, left: chatMenuPos.x }]}>
                
                {/* ✨ FIX: STARRED FILTER MENU OPTION */}
                <TouchableOpacity style={styles.chatMenuItem} onPress={() => { closeChatMenu(); setShowStarredOnly(!showStarredOnly); }} activeOpacity={0.7}>
                  <View style={[styles.chatMenuIcon, { backgroundColor: '#FFFBEB' }]}>
                    <Ionicons name="star-outline" size={17} color="#F5A623" />
                  </View>
                  <Text style={styles.chatMenuText}>{showStarredOnly ? 'Show All Messages' : 'Show Starred Messages'}</Text>
                </TouchableOpacity>
                <View style={styles.chatMenuDivider} />

                <TouchableOpacity style={styles.chatMenuItem} onPress={handleViewProfile} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#EFF6FF' }]}><Ionicons name="person-outline" size={17} color="#007AFF" /></View><Text style={styles.chatMenuText}>View Profile</Text></TouchableOpacity>
                <View style={styles.chatMenuDivider} />
                <TouchableOpacity style={styles.chatMenuItem} onPress={handleSearchToggle} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#F0FDF4' }]}><Ionicons name="search-outline" size={17} color="#16A34A" /></View><Text style={styles.chatMenuText}>Search Messages</Text></TouchableOpacity>
                <View style={styles.chatMenuDivider} />
                <TouchableOpacity style={styles.chatMenuItem} onPress={handleMuteChat} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#FFF7ED' }]}><Ionicons name={chatDetails?.is_muted ? 'notifications-outline' : 'notifications-off-outline'} size={17} color="#EA580C" /></View><Text style={styles.chatMenuText}>{chatDetails?.is_muted ? 'Unmute Chat' : 'Mute Chat'}</Text></TouchableOpacity>
                <View style={styles.chatMenuDivider} />
                <TouchableOpacity style={styles.chatMenuItem} onPress={handleClearChat} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#F5F5F5' }]}><Ionicons name="trash-outline" size={17} color="#666" /></View><Text style={styles.chatMenuText}>Clear Chat</Text></TouchableOpacity>
                <View style={styles.chatMenuDivider} />
                <TouchableOpacity style={styles.chatMenuItem} onPress={handleBlockUser} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#FFF1F0' }]}><Ionicons name="ban-outline" size={17} color="#FF3B30" /></View><Text style={[styles.chatMenuText, { color: '#FF3B30' }]}>Block User</Text></TouchableOpacity>
                <View style={styles.chatMenuDivider} />
                <TouchableOpacity style={styles.chatMenuItem} onPress={handleReportFromMenu} activeOpacity={0.7}><View style={[styles.chatMenuIcon, { backgroundColor: '#FFF1F0' }]}><Ionicons name="flag-outline" size={17} color="#FF3B30" /></View><Text style={[styles.chatMenuText, { color: '#FF3B30' }]}>Report User</Text></TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#ece5dd' },
  loadingOverlay:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center' },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', zIndex: 10 },
  headerBack:           { paddingRight: 10 },
  headerTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerOnlineDot:      { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50', borderWidth: 1.5, borderColor: '#fff' },
  headerTitle:          { fontSize: 16, fontWeight: 'bold', color: '#000' },
  onlineText:           { fontSize: 12, color: '#007AFF', fontWeight: '500', marginTop: 2 },
  typingText:           { fontSize: 12, color: '#34C759', fontWeight: 'bold', fontStyle: 'italic', marginTop: 2 },
  markSoldBtn:          { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  markSoldBtnText:      { color: '#fff', fontSize: 12, fontWeight: '700' },
  listingStrip:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#eee' },
  listingStripSold:     { backgroundColor: '#fafafa' },
  stripImg:             { width: 40, height: 40, borderRadius: 8 },
  stripTitle:           { fontSize: 13, fontWeight: '600', color: '#222' },
  stripPrice:           { fontSize: 12, color: '#007AFF', fontWeight: '700', marginTop: 1 },
  stripSoldBadge:       { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stripSoldText:        { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  searchBar:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput:          { flex: 1, fontSize: 15, color: '#000' },
  searchCount:          { fontSize: 12, color: '#aaa', marginHorizontal: 8, fontWeight: '600' },
  searchNavBtn:         { padding: 4 },
  pinnedBar:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 12, borderLeftWidth: 4, borderLeftColor: '#007AFF', ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' }, default: { elevation: 2 } }) },
  pinnedTitle:          { fontSize: 12, color: '#007AFF', fontWeight: 'bold', marginBottom: 2 },
  pinnedText:           { fontSize: 14, color: '#333' },
  listContent:          { padding: 16 },
  systemMsgWrap:        { alignItems: 'center', marginVertical: 8 },
  systemMsgBubble:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#c8e6c9' },
  systemMsgText:        { fontSize: 13, color: '#2E7D32', fontWeight: '600' },
  msgWrapper:           { marginBottom: 12, flexDirection: 'row', width: '100%', alignItems: 'flex-end' },
  myMsgWrapper:         { justifyContent: 'flex-end' },
  theirMsgWrapper:      { justifyContent: 'flex-start' },
  msgAvatarWrap:        { width: 32, height: 32, marginRight: 6, marginBottom: 4 },
  msgAvatarImg:         { width: 32, height: 32, borderRadius: 16 },
  msgAvatarFallback:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#bbb', justifyContent: 'center', alignItems: 'center' },
  msgAvatarLetter:      { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  msgBubble:            { maxWidth: '80%', padding: 10, borderRadius: 12, position: 'relative' },
  myBubble:             { backgroundColor: '#dcf8c6', borderBottomRightRadius: 0 },
  theirBubble:          { backgroundColor: '#fff', borderBottomLeftRadius: 0 },
  deletedBubble:        { backgroundColor: '#f0f0f0', fontStyle: 'italic' },
  highlightedBubble:    { backgroundColor: '#FFD700' },
  searchHitBubble:      { borderWidth: 2, borderColor: '#007AFF' },
  attachmentBox:        { flexDirection: 'row', alignItems: 'center', marginVertical: 4, paddingRight: 10 },
  attachmentIconWrap:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  imageBubble:          { padding: 4, width: 250 },
  chatImage:            { width: '100%', height: 250, borderRadius: 8, backgroundColor: '#e0e0e0' },
  imageFooterOverlay:   { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  textShadow:           { color: '#fff', fontWeight: 'bold' },
  offerBubble:          { borderWidth: 2, borderColor: '#007AFF', borderStyle: 'dashed', backgroundColor: '#e6f2ff', padding: 16, width: '70%' },
  offerHeader:          { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  offerHeaderText:      { color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  offerAmountText:      { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  offerActionRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  acceptBtn:            { flex: 1, backgroundColor: '#34C759', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  declineBtn:           { flex: 1, backgroundColor: '#FF3B30', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  offerStatusBadge:     { marginTop: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  bgGreen:              { backgroundColor: '#34C759' },
  bgRed:                { backgroundColor: '#FF3B30' },
  msgText:              { fontSize: 16, marginBottom: 4 },
  myText:               { color: '#000' },
  theirText:            { color: '#000' },
  deletedText:          { color: '#888', fontStyle: 'italic' },
  msgFooter:            { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  timeText:             { fontSize: 10, color: '#888' },
  editedText:           { fontSize: 10, color: '#888', fontStyle: 'italic', marginRight: 4 },
  reactionBadge:        { position: 'absolute', bottom: -10, right: 10, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#eee', ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' }, default: { elevation: 2 } }) },
  soldBanner:           { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f8f2', paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#c8e6c9' },
  soldBannerText:       { fontSize: 13, color: '#388E3C', fontWeight: '500' },
  soldBannerLink:       { color: '#007AFF', fontWeight: '700' },
  inputBar:             { flexDirection: 'row', padding: 10, alignItems: 'center', backgroundColor: '#f0f0f0', paddingBottom: Platform.OS === 'ios' ? 30 : 10 },
  attachMenuBtn:        { marginRight: 8, padding: 4 },
  offerIconBtn:         { marginRight: 8, padding: 4 },
  input:                { flex: 1, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, maxHeight: 100, marginRight: 8 },
  inlineCameraBtn:      { position: 'absolute', right: 65, padding: 8, top: 12 },
  sendBtn:              { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:      { backgroundColor: '#999' },
  attachOverlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  attachMenuCard:       { backgroundColor: '#fff', margin: 16, marginBottom: 80, borderRadius: 16, padding: 20, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' }, default: { elevation: 5 } }) },
  attachRow:            { flexDirection: 'row', justifyContent: 'space-around' },
  attachItem:           { alignItems: 'center', width: 80 },
  attachIconCircle:     { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  attachText:           { fontSize: 14, color: '#333' },
  contactModalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  contactModalCard:     { backgroundColor: '#fff', height: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  contactHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  contactTitle:         { fontSize: 20, fontWeight: 'bold' },
  contactSearchBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12, height: 40, marginBottom: 15 },
  contactSearchInput:   { flex: 1, fontSize: 15, color: '#000' },
  contactRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  contactAvatar:        { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  contactAvatarText:    { fontSize: 18, fontWeight: 'bold', color: '#666' },
  contactName:          { fontSize: 16, fontWeight: '600', color: '#333' },
  contactPhone:         { fontSize: 14, color: '#888', marginTop: 2 },
  modalOverlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:         { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:           { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modalSub:             { fontSize: 14, color: '#666', marginBottom: 20 },
  errorText:            { color: '#FF3B30', marginBottom: 10, fontWeight: 'bold' },
  offerInput:           { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16 },
  cancelBtn:            { flex: 1, backgroundColor: '#eee', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sendOfferBtn:         { flex: 1, backgroundColor: '#000', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnTextBlack:         { color: '#000', fontSize: 16, fontWeight: 'bold' },
  btnTextWhite:         { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  overlayBottom:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  ratingCard:           { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 28, alignItems: 'center' },
  ratingHandle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', marginBottom: 20 },
  ratingAvatarWrap:     { marginBottom: 16 },
  ratingAvatarImg:      { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#f0f0f0' },
  ratingAvatarFallback: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#f0f0f0' },
  ratingAvatarLetter:   { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  ratingTitle:          { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 8 },
  ratingSubtitle:       { fontSize: 15, color: '#777', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  ratingLabel:          { fontSize: 15, fontWeight: '600', color: '#F5A623', marginTop: 4, marginBottom: 12 },
  reviewInput:          { width: '100%', backgroundColor: '#f8f8f8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#ebebeb', textAlignVertical: 'top', marginTop: 8, minHeight: 88 },
  reviewCharCount:      { alignSelf: 'flex-end', fontSize: 11, color: '#ccc', marginTop: 4, marginBottom: 16 },
  submitReviewBtn:      { width: '100%', backgroundColor: '#000', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  submitReviewText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn:              { paddingVertical: 10 },
  skipText:             { fontSize: 14, color: '#aaa', fontWeight: '500' },
  chatMenuOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  chatMenuCard:         { position: 'absolute', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 4, width: 210, ...Platform.select({ web: { boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }, default: { elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 } }) },
  chatMenuItem:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  chatMenuIcon:         { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  chatMenuText:         { fontSize: 15, fontWeight: '500', color: '#222' },
  chatMenuDivider:      { height: 1, backgroundColor: '#f2f2f2', marginHorizontal: 14 },

  popoverOverlay: {
    flex: 1, 
    backgroundColor: 'transparent',
  },
  popoverMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 250,
    ...Platform.select({ 
      web: { boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }, 
      default: { elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 } 
    }),
  },
  popoverReactionRow: {
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    padding: 12,
  },
  reactionEmoji: { 
    fontSize: 28 
  },
  popoverDivider: { 
    height: 1, 
    backgroundColor: '#f0f0f0' 
  },
  popoverOption: {
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    gap: 12 
  },
  popoverOptionText: { 
    fontSize: 16, 
    fontWeight: '500', 
    color: '#000' 
  },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCardCenter: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 24, padding: 24, alignItems: 'center' },
  pinOptionBtn: { width: '100%', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  pinOptionText: { fontSize: 16, color: '#007AFF', fontWeight: '600' }
});