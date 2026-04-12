import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
  Modal, Alert, Animated, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';

// ─── Star Picker ──────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatRoom() {
  const { id: rawChatId } = useLocalSearchParams();
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId;
  const router  = useRouter();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [messages, setMessages]           = useState<any[]>([]);
  const [newMessage, setNewMessage]       = useState('');
  const [loading, setLoading]             = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [chatDetails, setChatDetails]     = useState<any>(null);
  const [selectedMsg, setSelectedMsg]     = useState<any>(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingMsgId, setEditingMsgId]   = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<any>(null);

  // ── Attach / Offer ─────────────────────────────────────────────────────────
  const [isAttachMenuVisible, setIsAttachMenuVisible] = useState(false);
  const [offerModalVisible, setOfferModalVisible]     = useState(false);
  const [offerAmount, setOfferAmount]                 = useState('');
  const [offerNote, setOfferNote]                     = useState('');
  const [offerError, setOfferError]                   = useState('');

  // ── Contacts / Location ────────────────────────────────────────────────────
  const [phoneContacts, setPhoneContacts]                   = useState<any[]>([]);
  const [isContactPickerVisible, setIsContactPickerVisible] = useState(false);
  const [contactSearchQuery, setContactSearchQuery]         = useState('');
  const [isFetchingLocation, setIsFetchingLocation]         = useState(false);

  // ── Presence & typing ──────────────────────────────────────────────────────
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [otherUserProfile, setOtherUserProfile]   = useState<any>(null);

  // Two separate channel refs — messages vs presence/typing
  const msgChannelRef      = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const typingTimeoutRef   = useRef<NodeJS.Timeout | number | null>(null);
  const isTypingRef        = useRef(false);
  const fadeAnim           = useRef(new Animated.Value(0.3)).current;

  // Stable ref so channel callbacks always see latest userId without re-subscribing
  const currentUserIdRef = useRef<string | null>(null);

  // ── Trust Engine ───────────────────────────────────────────────────────────
  const [markSoldVisible, setMarkSoldVisible]   = useState(false);
  const [ratingVisible, setRatingVisible]       = useState(false);
  const [ratingValue, setRatingValue]           = useState(0);
  const [reviewText, setReviewText]             = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isSeller, setIsSeller]                 = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  //  TYPING BLINK ANIMATION
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOtherUserTyping) {
      Animated.loop(Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ])).start();
    } else {
      fadeAnim.setValue(1);
    }
  }, [isOtherUserTyping]);

  // ─────────────────────────────────────────────────────────────────────────
  //  FIX 1 — GET USER ID IMMEDIATELY AT MOUNT
  //  Previously currentUserId was set inside setupChat() which also fetches
  //  messages and chat details. The channel useEffect depends on currentUserId
  //  so there was a large gap between mount and channel subscription.
  //  Now we fetch the user ID first in a dedicated fast effect so channels
  //  are subscribed as soon as possible — before the heavier data loads.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
      }
    };
    initUser();
  }, []); // runs once immediately on mount

  // Setup chat data whenever chatId is available
  useEffect(() => { if (chatId) setupChat(); }, [chatId]);

  // ─────────────────────────────────────────────────────────────────────────
  //  FIX 2 — TWO CLEAN CHANNELS
  //
  //  OLD: one channel mixing postgres_changes + broadcast + presence
  //       → they interfere cross-platform (web↔mobile)
  //
  //  NEW: two separate channels with a single purpose each
  //    • msgChannel     → ONLY postgres_changes (messages + chat row updates)
  //                       100% reliable on all platforms, no config options needed
  //    • presenceChannel → ONLY broadcast (typing) + presence (online)
  //                        ephemeral, best-effort, separate from message delivery
  //
  //  This runs as soon as currentUserId is set (which now happens fast via
  //  the dedicated initUser effect above).
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId || !chatId) return;

    const safe = String(chatId).replace(/[^a-zA-Z0-9]/g, '');

    // ── Channel A: postgres_changes only ─────────────────────────────────────
    // No broadcast, no presence config — just clean DB event delivery.
    const msgChannel = supabase.channel(`boltzy_msgs_${safe}`);
    msgChannelRef.current = msgChannel;

    msgChannel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages',
      filter: `chat_id=eq.${chatId}`,
    }, (payload: any) => {
      const myId = String(currentUserIdRef.current);

      if (payload.eventType === 'INSERT') {
        if (!payload.new.deleted_by?.includes(myId)) {
          setMessages((prev) => {
            if (prev.some(m => String(m.id) === String(payload.new.id))) return prev;
            return [payload.new, ...prev];
          });
        }
        if (String(payload.new.sender_id) !== myId) forceMarkAsRead(myId);

      } else if (payload.eventType === 'UPDATE') {
        if (payload.new.deleted_by?.includes(myId)) {
          setMessages((prev) => prev.filter(msg => String(msg.id) !== String(payload.new.id)));
        } else {
          setMessages((prev) => prev.map(msg =>
            String(msg.id) === String(payload.new.id) ? payload.new : msg
          ));
        }
        if (payload.new.is_pinned && new Date(payload.new.pinned_until) > new Date()) {
          setPinnedMessage(payload.new);
        } else if (!payload.new.is_pinned && pinnedMessage?.id === payload.new.id) {
          setPinnedMessage(null);
        }
      }
    });

    // Chat row changes (is_sold, review_submitted)
    msgChannel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'chats',
      filter: `id=eq.${chatId}`,
    }, (payload: any) => {
      setChatDetails((prev: any) => ({ ...prev, ...payload.new }));
      if (
        payload.new.is_sold &&
        !payload.new.review_submitted &&
        payload.new.buyer_id === currentUserIdRef.current
      ) {
        setTimeout(() => setRatingVisible(true), 800);
      }
    });

    msgChannel.subscribe((status) => {
      // Optionally log: console.log('msgChannel status:', status);
    });

    // ── Channel B: presence + broadcast (typing / online only) ───────────────
    // Kept completely separate so its config cannot interfere with DB events.
    const presenceChannel = supabase.channel(`boltzy_presence_${safe}`, {
      config: {
        presence:  { key: String(currentUserId) },
        broadcast: { ack: false, self: false },
      },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      const othersOnline = Object.keys(state).some(k => String(k) !== String(currentUserId));
      setIsOtherUserOnline(othersOnline);
    });

    presenceChannel.on('presence', { event: 'join' }, ({ key }) => {
      if (String(key) !== String(currentUserId)) setIsOtherUserOnline(true);
    });

    presenceChannel.on('presence', { event: 'leave' }, ({ key }) => {
      if (String(key) !== String(currentUserId)) {
        // Recheck state after a short delay in case of brief reconnects
        setTimeout(() => {
          const state = presenceChannel.presenceState();
          const othersOnline = Object.keys(state).some(k => String(k) !== String(currentUserId));
          setIsOtherUserOnline(othersOnline);
        }, 1500);
      }
    });

    presenceChannel.on('broadcast', { event: 'typing' }, (payload) => {
      if (String(payload.payload.userId) !== String(currentUserId)) {
        setIsOtherUserTyping(payload.payload.isTyping);
      }
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track presence immediately on subscribe
        await presenceChannel.track({
          online:  true,
          user_id: String(currentUserId),
        });
      }
    });

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [chatId, currentUserId]); // currentUserId now arrives fast via initUser

  // ─────────────────────────────────────────────────────────────────────────
  //  FIX 3 — useFocusEffect SAFETY NET
  //  When the app is backgrounded, the WebSocket may drop. When the user
  //  comes back, re-fetch messages and re-track presence so nothing is missed.
  // ─────────────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      // Refetch messages in case any were missed while screen was unfocused
      if (chatId && currentUserIdRef.current && !loading) {
        refetchMessages();
      }
      // Re-announce presence in case our tracking dropped
      if (presenceChannelRef.current && currentUserIdRef.current) {
        presenceChannelRef.current.track({
          online:  true,
          user_id: String(currentUserIdRef.current),
        });
      }
    }, [chatId, loading])
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  SETUP — fetch chat data and messages
  // ─────────────────────────────────────────────────────────────────────────
  const setupChat = async () => {
    setLoading(true);

    // Get user id (may already be set by initUser, but grab it anyway for
    // cases where setupChat runs before initUser resolves)
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !currentUserIdRef.current) {
      setCurrentUserId(user.id);
      currentUserIdRef.current = user.id;
    }
    const uid = user?.id ?? currentUserIdRef.current;

    const { data: cData } = await supabase
      .from('chats')
      .select('*, listings(price, title, image_urls, id)')
      .eq('id', chatId)
      .single();

    if (cData) {
      setChatDetails(cData);
      setIsSeller(uid === cData.seller_id);

      const otherId = uid === cData.seller_id ? cData.buyer_id : cData.seller_id;
      const { data: otherProfile } = await supabase
        .from('profiles').select('*').eq('id', otherId).single();
      if (otherProfile) setOtherUserProfile(otherProfile);

      if (cData.is_sold && !cData.review_submitted && cData.buyer_id === uid) {
        setTimeout(() => setRatingVisible(true), 700);
      }
    }

    await refetchMessages(uid ?? undefined);
    setLoading(false);

    if (uid) await supabase.rpc('mark_chat_read', { p_chat_id: chatId, p_user_id: uid });
  };

  const refetchMessages = async (uid?: string) => {
    const myId = uid ?? currentUserIdRef.current;
    const { data } = await supabase
      .from('messages').select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });
    if (data && myId) {
      const visible  = data.filter(m => !m.deleted_by?.includes(myId));
      setMessages(visible);
      const activePin = visible.find(m => m.is_pinned && new Date(m.pinned_until) > new Date());
      if (activePin) setPinnedMessage(activePin); else setPinnedMessage(null);
    }
  };

  const forceMarkAsRead = async (userId: string | undefined) => {
    if (userId) await supabase.rpc('mark_chat_read', { p_chat_id: chatId, p_user_id: userId });
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  IMAGE UPLOAD
  // ─────────────────────────────────────────────────────────────────────────
  const pickImage = async () => {
    setIsAttachMenuVisible(false);
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7,
    });
    if (!result.canceled && result.assets[0].uri) uploadImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);
      const response = await fetch(uri);
      const blob     = await response.blob();
      const fileExt  = uri.substring(uri.lastIndexOf('.') + 1) || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error } = await supabase.storage.from('chat_images').upload(fileName, blob);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('chat_images').getPublicUrl(fileName);
      // Insert only — postgres_changes delivers it to both sides
      await supabase.from('messages').insert({
        chat_id: chatId, sender_id: currentUserIdRef.current,
        content: '📷 Photo', status: 'sent', type: 'image', image_url: publicUrl,
      });
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  LOCATION SHARING
  // ─────────────────────────────────────────────────────────────────────────
  const sendRealLocation = async () => {
    setIsAttachMenuVisible(false);
    if (Platform.OS === 'web') return Alert.alert('Mobile Only', 'Location sharing is only available on the mobile app.');

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Please allow Boltzy to access your location.');

    setIsFetchingLocation(true);
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const { latitude, longitude } = location.coords;
      const geocode  = await Location.reverseGeocodeAsync({ latitude, longitude });
      const geo: any = geocode.length > 0 ? geocode[0] : {};
      const address  = geo.city
        ? `${geo.district || geo.subregion || ''}, ${geo.city}, ${geo.region}`.replace(/^, /, '')
        : `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
      const mapLink  = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

      const { error } = await supabase.from('messages').insert({
        chat_id: chatId, sender_id: currentUserIdRef.current,
        content: `📍 Live GPS: ${address}\n${mapLink}`,
        status: 'sent', type: 'location',
      });
      if (error) Alert.alert('Database Error', 'Failed to send location to database.');
    } catch (error: any) {
      Alert.alert('GPS Error', `Could not fetch location: ${error.message}`);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  CONTACT SHARING
  // ─────────────────────────────────────────────────────────────────────────
  const getExactContactName = (contact: any) => {
    if (contact.name && contact.name.trim() !== '') return contact.name.trim();
    const parts = [contact.firstName, contact.middleName, contact.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(' ').trim();
    return 'Unknown Contact';
  };

  const openContactPicker = async () => {
    setIsAttachMenuVisible(false);
    setContactSearchQuery('');
    if (Platform.OS === 'web') return Alert.alert('Mobile Only', 'Contact sharing is only available on the mobile app.');

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Please allow Boltzy to access your contacts.');

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers, Contacts.Fields.Name,
          Contacts.Fields.FirstName, Contacts.Fields.MiddleName, Contacts.Fields.LastName,
        ],
        sort: Contacts.SortTypes.FirstName,
      });
      const valid = data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
      if (valid.length > 0) { setPhoneContacts(valid); setIsContactPickerVisible(true); }
      else Alert.alert('Empty Book', 'No contacts found with phone numbers.');
    } catch (error: any) {
      Alert.alert('Contact Error', `Could not load contacts: ${error.message}`);
    }
  };

  const sendSelectedContact = async (contact: any) => {
    setIsContactPickerVisible(false);
    const phone     = contact.phoneNumbers[0].number;
    const exactName = getExactContactName(contact);
    await supabase.from('messages').insert({
      chat_id: chatId, sender_id: currentUserIdRef.current,
      content: `👤 ${exactName}\n📞 ${phone}`,
      status: 'sent', type: 'contact',
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  TYPING INDICATOR — broadcast via presenceChannel only
  // ─────────────────────────────────────────────────────────────────────────
  const sendTypingBroadcast = (isTyping: boolean) => {
    presenceChannelRef.current?.send({
      type: 'broadcast', event: 'typing',
      payload: { userId: String(currentUserIdRef.current), isTyping },
    });
  };

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingBroadcast(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current as any);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTypingBroadcast(false);
    }, 2000) as any;
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  SEND / EDIT MESSAGE
  //  Inserts only — postgres_changes delivers to both parties reliably.
  //  No broadcastNewMessage needed anymore.
  // ─────────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserIdRef.current) return;
    const messageText = newMessage.trim();
    setNewMessage('');

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current as any);
    isTypingRef.current = false;
    sendTypingBroadcast(false);

    if (editingMsgId) {
      const { data } = await supabase.from('messages')
        .update({ content: messageText, is_edited: true })
        .eq('id', editingMsgId).select().single();
      if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setEditingMsgId(null);
      return;
    }

    await supabase.from('messages').insert({
      chat_id: chatId, sender_id: currentUserIdRef.current,
      content: messageText, status: 'sent', type: 'text',
    });
    // postgres_changes INSERT event fires on both web and mobile reliably
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  OFFER SYSTEM
  // ─────────────────────────────────────────────────────────────────────────
  const sendOffer = async () => {
    setOfferError('');
    const amount       = parseFloat(offerAmount);
    const listingPrice = chatDetails?.listings?.price || 0;
    const minPrice     = listingPrice * 0.5;

    if (isNaN(amount))         return setOfferError('Please enter a valid amount.');
    if (amount < minPrice)     return setOfferError(`Offer must be at least 50% of asking price (₹${minPrice.toFixed(0)}).`);
    if (amount > listingPrice) return setOfferError(`You cannot offer more than the asking price (₹${listingPrice}).`);

    setOfferModalVisible(false);

    if (editingMsgId) {
      const { data } = await supabase.from('messages').update({
        offer_amount: amount,
        content: offerNote.trim() || "I'd like to make an offer for this item.",
        is_edited: true,
      }).eq('id', editingMsgId).select().single();
      if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setEditingMsgId(null);
    } else {
      await supabase.from('messages').insert({
        chat_id: chatId, sender_id: currentUserIdRef.current,
        content: offerNote.trim() || "I'd like to make an offer for this item.",
        status: 'sent', type: 'offer',
        offer_amount: amount, offer_status: 'pending',
      });
    }
    setOfferAmount('');
    setOfferNote('');
  };

  const handleOfferAction = async (msgId: string, action: 'accepted' | 'declined') => {
    const { data } = await supabase.from('messages')
      .update({ offer_status: action }).eq('id', msgId).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  MESSAGE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
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

  const jumpToPinnedMessage = () => {
    if (!pinnedMessage) return;
    const index = messages.findIndex(m => m.id === pinnedMessage.id);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMsgId(pinnedMessage.id);
      setTimeout(() => setHighlightedMsgId(null), 1500);
    }
  };

  const handleUnpin = (pinnedId: string) => {
    Alert.alert('Unpin Message', 'Are you sure you want to unpin this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpin', style: 'destructive', onPress: async () => {
          const { data } = await supabase.from('messages')
            .update({ is_pinned: false, pinned_until: null }).eq('id', pinnedId).select().single();
          if (data) {
            setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
            setPinnedMessage(null);
          }
        }
      },
    ]);
  };

  const handleLongPress = (msg: any) => { setSelectedMsg(msg); setModalVisible(true); };

  const isWithin10Mins = (timestamp: string) =>
    (new Date().getTime() - new Date(timestamp).getTime()) < 600000;

  const handleDeleteForEveryone = async () => {
    setModalVisible(false);
    const { data } = await supabase.from('messages').update({
      is_deleted_for_everyone: true,
      content: '🚫 This message was deleted.',
    }).eq('id', selectedMsg.id).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  const handleDeleteForMe = async () => {
    setModalVisible(false);
    if (!currentUserIdRef.current) return;
    const currentDeletedBy = selectedMsg.deleted_by || [];
    if (!currentDeletedBy.includes(currentUserIdRef.current)) {
      await supabase.from('messages').update({
        deleted_by: [...currentDeletedBy, currentUserIdRef.current],
      }).eq('id', selectedMsg.id);
      setMessages(prev => prev.filter(m => String(m.id) !== String(selectedMsg.id)));
    }
  };

  const handlePinRequest = () => {
    setModalVisible(false);
    Alert.alert('Pin Message', 'How long do you want to pin this message?', [
      { text: '1 Week',  onPress: () => applyPin(7)  },
      { text: '1 Month', onPress: () => applyPin(30) },
      { text: 'Cancel',  style: 'cancel'             },
    ]);
  };

  const applyPin = async (days: number) => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);
    if (pinnedMessage) {
      await supabase.from('messages').update({ is_pinned: false, pinned_until: null }).eq('id', pinnedMessage.id);
    }
    const { data } = await supabase.from('messages').update({
      is_pinned: true, pinned_until: expirationDate.toISOString(),
    }).eq('id', selectedMsg.id).select().single();
    if (data) {
      setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
      setPinnedMessage(data);
    }
  };

  const handleReact = async (emoji: string) => {
    setModalVisible(false);
    const { data } = await supabase.from('messages').update({
      reactions: { ...selectedMsg.reactions, [currentUserIdRef.current as string]: emoji },
    }).eq('id', selectedMsg.id).select().single();
    if (data) setMessages(prev => prev.map(m => String(m.id) === String(data.id) ? data : m));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  REPORT USER
  // ─────────────────────────────────────────────────────────────────────────
  const reportUser = () => {
    const otherUserId = currentUserIdRef.current === chatDetails?.seller_id
      ? chatDetails?.buyer_id : chatDetails?.seller_id;
    Alert.alert('Report User', 'Are you sure you want to report this user for suspicious activity?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('report_user_engine', {
            p_reported_user_id: otherUserId, p_reason: 'Reported from chat',
          });
          if (!error) Alert.alert('Report Received', 'Thank you. We will investigate.');
          else Alert.alert('Already Reported', 'You have already reported this user.');
        }
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  TRUST ENGINE: MARK SOLD + REVIEW
  // ─────────────────────────────────────────────────────────────────────────
  const confirmMarkSold = async () => {
    setMarkSoldVisible(false);
    await supabase.from('chats').update({ is_sold: true, sold_at: new Date().toISOString() }).eq('id', chatId);
    await supabase.from('listings').update({ is_sold: true }).eq('id', chatDetails?.listings?.id);
    await supabase.from('messages').insert({
      chat_id: chatId, sender_id: currentUserIdRef.current,
      content: '🎉 Item has been marked as sold! Thank you for using Boltzy.',
      status: 'sent', type: 'system', is_system: true,
    });
    setChatDetails((prev: any) => ({ ...prev, is_sold: true }));
  };

  const submitReview = async () => {
    if (ratingValue === 0) { Alert.alert('Rate your experience', 'Please tap the stars to leave a rating.'); return; }
    setSubmittingReview(true);
    const { error } = await supabase.from('reviews').insert({
      reviewer_id: currentUserIdRef.current,
      seller_id:   chatDetails.seller_id,
      chat_id:     chatId,
      listing_id:  chatDetails.listing_id,
      rating:      ratingValue,
      review_text: reviewText.trim() || null,
    });
    if (!error) {
      await supabase.from('chats').update({ review_submitted: true }).eq('id', chatId);
      setChatDetails((prev: any) => ({ ...prev, review_submitted: true }));
    }
    setSubmittingReview(false);
    setRatingVisible(false);
    if (!error) Alert.alert('Thank you! 🙏', 'Your review helps build trust in the Boltzy community.');
  };

  const skipReview = async () => {
    setRatingVisible(false);
    await supabase.from('chats').update({ review_submitted: true }).eq('id', chatId);
    setChatDetails((prev: any) => ({ ...prev, review_submitted: true }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  READ TICKS
  // ─────────────────────────────────────────────────────────────────────────
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

    if (isSystem) {
      return (
        <View style={styles.systemMsgWrap}>
          <View style={styles.systemMsgBubble}>
            <Ionicons name="checkmark-circle" size={14} color="#2E7D32" style={{ marginRight: 6 }} />
            <Text style={styles.systemMsgText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={() => !isDeleted && handleLongPress(item)}
        delayLongPress={200}
        style={[styles.msgWrapper, isMine ? styles.myMsgWrapper : styles.theirMsgWrapper]}
      >
        {!isMine && (
          <TouchableOpacity
            onPress={() => {
              const otherId = currentUserIdRef.current === chatDetails?.seller_id
                ? chatDetails?.buyer_id : chatDetails?.seller_id;
              router.push(`/user/${otherId}` as any);
            }}
            style={styles.msgAvatarWrap}
          >
            {otherUserProfile?.avatar_url
              ? <Image source={{ uri: otherUserProfile.avatar_url }} style={styles.msgAvatarImg} />
              : <View style={styles.msgAvatarFallback}>
                  <Text style={styles.msgAvatarLetter}>{otherUserProfile?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
            }
          </TouchableOpacity>
        )}

        <View style={[
          styles.msgBubble,
          isMine ? styles.myBubble : styles.theirBubble,
          isDeleted && styles.deletedBubble,
          isHighlighted && styles.highlightedBubble,
          isOffer && styles.offerBubble,
          isImage && styles.imageBubble,
        ]}>
          {isImage && !isDeleted && (
            <Image source={{ uri: item.image_url }} style={styles.chatImage} resizeMode="cover" />
          )}
          {isOffer && !isDeleted && (
            <View style={styles.offerHeader}>
              <Ionicons name="pricetag" size={16} color="#007AFF" />
              <Text style={styles.offerHeaderText}>Offer Made</Text>
            </View>
          )}
          {isOffer && !isDeleted && (
            <Text style={styles.offerAmountText}>₹{item.offer_amount}</Text>
          )}
          {isLocation && !isDeleted && (
            <TouchableOpacity
              style={styles.attachmentBox}
              onPress={() => {
                const urlMatch = item.content.match(/https:\/\/www\.google\.com\/maps[^\s]+/);
                if (urlMatch) Linking.openURL(urlMatch[0]);
              }}
            >
              <View style={[styles.attachmentIconWrap, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="map" size={24} color="#4CAF50" />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.msgText, isMine ? styles.myText : styles.theirText, { fontWeight: 'bold' }]} numberOfLines={1}>
                  {item.content.split('\n')[0]}
                </Text>
                <Text style={{ color: '#007AFF', fontSize: 12, marginTop: 2 }}>Tap to view on map</Text>
              </View>
            </TouchableOpacity>
          )}
          {isContact && !isDeleted && (
            <TouchableOpacity
              style={styles.attachmentBox}
              onPress={() => {
                const phoneMatch = item.content.match(/📞\s*([+0-9\s]+)/);
                if (phoneMatch) Linking.openURL(`tel:${phoneMatch[1].trim()}`);
              }}
            >
              <View style={[styles.attachmentIconWrap, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="person" size={24} color="#2196F3" />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.msgText, isMine ? styles.myText : styles.theirText, { fontWeight: 'bold' }]} numberOfLines={1}>
                  {item.content.split('\n')[0]}
                </Text>
                <Text style={{ color: '#007AFF', fontSize: 12, marginTop: 2 }}>Tap to call</Text>
              </View>
            </TouchableOpacity>
          )}
          {(!isSpecial || isOffer) && (
            <Text style={[
              styles.msgText,
              isMine ? styles.myText : styles.theirText,
              isDeleted && styles.deletedText,
              isOffer && { fontStyle: 'italic' },
            ]}>
              {isOffer && !isDeleted ? `"${item.content}"` : item.content}
            </Text>
          )}
          {isOffer && !isDeleted && item.offer_status === 'pending' && !isMine && currentUserIdRef.current === chatDetails?.seller_id && (
            <View style={styles.offerActionRow}>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleOfferAction(item.id, 'accepted')}>
                <Text style={styles.btnTextWhite}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => handleOfferAction(item.id, 'declined')}>
                <Text style={styles.btnTextWhite}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
          {isOffer && !isDeleted && item.offer_status !== 'pending' && (
            <View style={[styles.offerStatusBadge, item.offer_status === 'accepted' ? styles.bgGreen : styles.bgRed]}>
              <Text style={styles.btnTextWhite}>
                {item.offer_status === 'accepted' ? 'Offer Accepted' : 'Offer Declined'}
              </Text>
            </View>
          )}
          <View style={[styles.msgFooter, isImage && styles.imageFooterOverlay]}>
            {item.is_edited && !isDeleted && (
              <Text style={[styles.editedText, isImage && styles.textShadow]}>(edited)</Text>
            )}
            <Text style={[styles.timeText, isImage && styles.textShadow]}>
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {renderTicks(item)}
          </View>
          {myReaction && (
            <View style={styles.reactionBadge}>
              <Text style={{ fontSize: 12 }}>{myReaction}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const hasPendingOffer  = messages.some(m => m.type === 'offer' && m.offer_status === 'pending');
  const hasAcceptedOffer = messages.some(m => m.type === 'offer' && m.offer_status === 'accepted');

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
      style={styles.container}
    >
      {isFetchingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 10, fontWeight: 'bold' }}>Pinpointing exact location...</Text>
        </View>
      )}

      {/* ═══ HEADER ════════════════════════════════════════ */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerTitleContainer}
          activeOpacity={0.75}
          onPress={() => {
            const otherId = currentUserIdRef.current === chatDetails?.seller_id
              ? chatDetails?.buyer_id : chatDetails?.seller_id;
            router.push(`/user/${otherId}` as any);
          }}
        >
          <View style={styles.headerAvatarWrap}>
            {otherUserProfile?.avatar_url
              ? <Image source={{ uri: otherUserProfile.avatar_url }} style={styles.headerAvatarImg} />
              : <View style={styles.headerAvatarFallback}>
                  <Text style={styles.headerAvatarLetter}>{otherUserProfile?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
            }
            {isOtherUserOnline && <View style={styles.headerOnlineDot} />}
          </View>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{chatDetails?.listings?.title || 'Chat'}</Text>
            {isOtherUserTyping ? (
              <Animated.Text style={[styles.typingText, { opacity: fadeAnim }]}>typing...</Animated.Text>
            ) : isOtherUserOnline ? (
              <Text style={styles.onlineText}>Online</Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isSeller && !chatDetails?.is_sold && (
            <TouchableOpacity style={styles.markSoldBtn} onPress={() => setMarkSoldVisible(true)}>
              <Text style={styles.markSoldBtnText}>Mark Sold</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={reportUser} style={{ paddingLeft: 4 }}>
            <Ionicons name="ellipsis-vertical" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ LISTING PREVIEW STRIP ═════════════════════════ */}
      {chatDetails?.listings && (
        <TouchableOpacity
          style={[styles.listingStrip, chatDetails?.is_sold && styles.listingStripSold]}
          onPress={() => router.push(`/listing/${chatDetails?.listing_id}` as any)}
          activeOpacity={0.8}
        >
          {chatDetails.listings.image_urls?.[0]
            ? <Image source={{ uri: chatDetails.listings.image_urls[0] }} style={styles.stripImg} />
            : <View style={[styles.stripImg, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="image-outline" size={16} color="#bbb" />
              </View>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.stripTitle} numberOfLines={1}>{chatDetails.listings.title}</Text>
            <Text style={styles.stripPrice}>₹{Number(chatDetails.listings.price).toLocaleString('en-IN')}</Text>
          </View>
          {chatDetails?.is_sold && (
            <View style={styles.stripSoldBadge}><Text style={styles.stripSoldText}>SOLD</Text></View>
          )}
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
      )}

      {/* ═══ PINNED MESSAGE BAR ════════════════════════════ */}
      {pinnedMessage && (
        <TouchableOpacity style={styles.pinnedBar} onPress={jumpToPinnedMessage} activeOpacity={0.7}>
          <Ionicons name="pin" size={16} color="#007AFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle}>Pinned Message</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>{pinnedMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={() => handleUnpin(pinnedMessage.id)} style={{ padding: 5 }}>
            <Ionicons name="close" size={20} color="#999" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* ═══ CHAT FEED ═════════════════════════════════════ */}
      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={info => {
            setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }), 500);
          }}
        />
      )}

      {/* ═══ SOLD BANNER ═══════════════════════════════════ */}
      {chatDetails?.is_sold && (
        <View style={styles.soldBanner}>
          <Ionicons name="checkmark-circle" size={15} color="#2E7D32" />
          <Text style={styles.soldBannerText}>
            Item sold ·{' '}
            {!chatDetails.review_submitted && !isSeller
              ? <Text style={styles.soldBannerLink} onPress={() => setRatingVisible(true)}>Leave a review →</Text>
              : 'Transaction complete'
            }
          </Text>
        </View>
      )}

      {/* ═══ INPUT BAR ═════════════════════════════════════ */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={() => setIsAttachMenuVisible(true)} style={styles.attachMenuBtn}>
          <Ionicons name="attach" size={28} color="#666" />
        </TouchableOpacity>

        {chatDetails && currentUserIdRef.current !== chatDetails.seller_id && !hasPendingOffer && !hasAcceptedOffer && (
          <TouchableOpacity
            onPress={() => { setEditingMsgId(null); setOfferModalVisible(true); setOfferError(''); }}
            style={styles.offerIconBtn}
          >
            <Ionicons name="pricetag-outline" size={24} color="#666" />
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          placeholder={editingMsgId ? 'Edit message...' : 'Type a message...'}
          value={newMessage}
          onChangeText={handleTyping}
          multiline
        />

        {!newMessage && (
          <TouchableOpacity onPress={pickImage} style={styles.inlineCameraBtn} disabled={uploadingImage}>
            {uploadingImage
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Ionicons name="camera" size={24} color="#888" />
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage}
        >
          <Ionicons name={editingMsgId ? 'checkmark' : 'send'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ════════════════ MODAL: CONTACT PICKER ════════════ */}
      <Modal visible={isContactPickerVisible} transparent animationType="slide">
        <View style={styles.contactModalOverlay}>
          <View style={styles.contactModalCard}>
            <View style={styles.contactHeader}>
              <Text style={styles.contactTitle}>Select Contact</Text>
              <TouchableOpacity onPress={() => setIsContactPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.contactSearchBox}>
              <Ionicons name="search" size={20} color="#999" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.contactSearchInput}
                placeholder="Search by name..."
                value={contactSearchQuery}
                onChangeText={setContactSearchQuery}
              />
            </View>
            <FlatList
              data={phoneContacts.filter(c =>
                getExactContactName(c).toLowerCase().includes(contactSearchQuery.toLowerCase())
              )}
              keyExtractor={(item) => item.id || Math.random().toString()}
              renderItem={({ item }) => {
                const displayName = getExactContactName(item);
                return (
                  <TouchableOpacity style={styles.contactRow} onPress={() => sendSelectedContact(item)}>
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.contactName}>{displayName}</Text>
                      <Text style={styles.contactPhone}>{item.phoneNumbers[0].number}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ════════════════ MODAL: ATTACHMENT MENU ═══════════ */}
      <Modal visible={isAttachMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setIsAttachMenuVisible(false)}>
          <View style={styles.attachMenuCard}>
            <View style={styles.attachRow}>
              <TouchableOpacity style={styles.attachItem} onPress={pickImage}>
                <View style={[styles.attachIconCircle, { backgroundColor: '#BF59CF' }]}>
                  <Ionicons name="image" size={28} color="#fff" />
                </View>
                <Text style={styles.attachText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachItem} onPress={sendRealLocation}>
                <View style={[styles.attachIconCircle, { backgroundColor: '#009688' }]}>
                  <Ionicons name="location" size={28} color="#fff" />
                </View>
                <Text style={styles.attachText}>Location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachItem} onPress={openContactPicker}>
                <View style={[styles.attachIconCircle, { backgroundColor: '#2196F3' }]}>
                  <Ionicons name="person" size={28} color="#fff" />
                </View>
                <Text style={styles.attachText}>Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ════════════════ MODAL: SEND / EDIT OFFER ═════════ */}
      <Modal visible={offerModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingMsgId ? 'Edit Offer' : 'Make an Offer'}</Text>
            <Text style={styles.modalSub}>Asking Price: ₹{chatDetails?.listings?.price}</Text>
            {offerError !== '' && <Text style={styles.errorText}>{offerError}</Text>}
            <TextInput
              style={styles.offerInput}
              placeholder="Enter your offer amount (₹)"
              keyboardType="numeric"
              value={offerAmount}
              onChangeText={(text) => { setOfferAmount(text); if (offerError) setOfferError(''); }}
            />
            <TextInput
              style={[styles.offerInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Add a note to the seller..."
              multiline value={offerNote} onChangeText={setOfferNote}
            />
            <View style={styles.offerActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setOfferModalVisible(false); setEditingMsgId(null); setOfferError(''); }}
              >
                <Text style={styles.btnTextBlack}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendOfferBtn} onPress={sendOffer}>
                <Text style={styles.btnTextWhite}>{editingMsgId ? 'Save Edit' : 'Send Offer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════ MODAL: MESSAGE OPTIONS ═══════════ */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.reactionRow}>
              {['👍', '❤️', '😂', '😮'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.modalOption} onPress={handlePinRequest}>
              <Ionicons name="pin-outline" size={22} color="#000" />
              <Text style={styles.modalOptionText}>Pin Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleDeleteForMe}>
              <Ionicons name="eye-off-outline" size={22} color="#000" />
              <Text style={styles.modalOptionText}>Delete for Me</Text>
            </TouchableOpacity>
            {selectedMsg?.sender_id === currentUserIdRef.current && isWithin10Mins(selectedMsg?.created_at) && (
              <>
                {selectedMsg?.type !== 'image' && selectedMsg?.type !== 'location' && selectedMsg?.type !== 'contact' && (
                  <TouchableOpacity style={styles.modalOption} onPress={handleEdit}>
                    <Ionicons name="pencil" size={22} color="#000" />
                    <Text style={styles.modalOptionText}>
                      Edit {selectedMsg.type === 'offer' ? 'Offer' : 'Message'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.modalOption} onPress={handleDeleteForEveryone}>
                  <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                  <Text style={[styles.modalOptionText, { color: '#FF3B30' }]}>Delete for Everyone</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ════════════════ MODAL: MARK AS SOLD ══════════════ */}
      <Modal visible={markSoldVisible} transparent animationType="fade">
        <View style={styles.overlayCenter}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#2E7D32" />
            </View>
            <Text style={styles.confirmTitle}>Mark Item as Sold?</Text>
            <Text style={styles.confirmSubtitle}>
              This will mark "{chatDetails?.listings?.title}" as sold.{'\n'}
              The buyer will be prompted to leave you a review to build your reputation.
            </Text>
            <TouchableOpacity style={styles.confirmYesBtn} onPress={confirmMarkSold}>
              <Text style={styles.confirmYesText}>Yes, Mark as Sold</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setMarkSoldVisible(false)}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════ MODAL: RATE & REVIEW ═════════════ */}
      <Modal visible={ratingVisible} transparent animationType="slide">
        <View style={styles.overlayBottom}>
          <View style={styles.ratingCard}>
            <View style={styles.ratingHandle} />
            <View style={styles.ratingAvatarWrap}>
              {otherUserProfile?.avatar_url
                ? <Image source={{ uri: otherUserProfile.avatar_url }} style={styles.ratingAvatarImg} />
                : <View style={styles.ratingAvatarFallback}>
                    <Text style={styles.ratingAvatarLetter}>{otherUserProfile?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
              }
            </View>
            <Text style={styles.ratingTitle}>How was your experience?</Text>
            <Text style={styles.ratingSubtitle}>
              Rate your transaction with{'\n'}
              <Text style={{ fontWeight: '700', color: '#000' }}>{otherUserProfile?.display_name || 'the seller'}</Text>
            </Text>
            <StarPicker value={ratingValue} onChange={setRatingValue} />
            {ratingValue > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[ratingValue]}</Text>}
            <TextInput
              style={styles.reviewInput}
              placeholder="Write a review (optional)..."
              placeholderTextColor="#bbb"
              value={reviewText}
              onChangeText={setReviewText}
              multiline maxLength={500} numberOfLines={3}
            />
            <Text style={styles.reviewCharCount}>{reviewText.length}/500</Text>
            <TouchableOpacity
              style={[styles.submitReviewBtn, ratingValue === 0 && { opacity: 0.45 }]}
              onPress={submitReview}
              disabled={submittingReview || ratingValue === 0}
            >
              {submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitReviewText}>Submit Review</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={skipReview}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STYLES  (identical to your original — nothing changed here)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#ece5dd' },
  loadingOverlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center' },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', zIndex: 10 },
  headerBack:          { paddingRight: 10 },
  headerTitleContainer:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatarWrap:    { position: 'relative', width: 38, height: 38 },
  headerAvatarImg:     { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback:{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  headerAvatarLetter:  { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerOnlineDot:     { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50', borderWidth: 1.5, borderColor: '#fff' },
  headerTitle:         { fontSize: 16, fontWeight: 'bold', color: '#000' },
  onlineText:          { fontSize: 12, color: '#007AFF', fontWeight: '500', marginTop: 2 },
  typingText:          { fontSize: 12, color: '#34C759', fontWeight: 'bold', fontStyle: 'italic', marginTop: 2 },
  markSoldBtn:         { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  markSoldBtnText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  listingStrip:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#eee' },
  listingStripSold:    { backgroundColor: '#fafafa' },
  stripImg:            { width: 40, height: 40, borderRadius: 8 },
  stripTitle:          { fontSize: 13, fontWeight: '600', color: '#222' },
  stripPrice:          { fontSize: 12, color: '#007AFF', fontWeight: '700', marginTop: 1 },
  stripSoldBadge:      { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stripSoldText:       { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pinnedBar:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 12, borderLeftWidth: 4, borderLeftColor: '#007AFF', ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' }, default: { elevation: 2 } }) },
  pinnedTitle:         { fontSize: 12, color: '#007AFF', fontWeight: 'bold', marginBottom: 2 },
  pinnedText:          { fontSize: 14, color: '#333' },
  listContent:         { padding: 16 },
  systemMsgWrap:       { alignItems: 'center', marginVertical: 8 },
  systemMsgBubble:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#c8e6c9' },
  systemMsgText:       { fontSize: 13, color: '#2E7D32', fontWeight: '600' },
  msgWrapper:          { marginBottom: 12, flexDirection: 'row', width: '100%', alignItems: 'flex-end' },
  myMsgWrapper:        { justifyContent: 'flex-end' },
  theirMsgWrapper:     { justifyContent: 'flex-start' },
  msgAvatarWrap:       { width: 32, height: 32, marginRight: 6, marginBottom: 4 },
  msgAvatarImg:        { width: 32, height: 32, borderRadius: 16 },
  msgAvatarFallback:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#bbb', justifyContent: 'center', alignItems: 'center' },
  msgAvatarLetter:     { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  msgBubble:           { maxWidth: '80%', padding: 10, borderRadius: 12, position: 'relative' },
  myBubble:            { backgroundColor: '#dcf8c6', borderBottomRightRadius: 0 },
  theirBubble:         { backgroundColor: '#fff', borderBottomLeftRadius: 0 },
  deletedBubble:       { backgroundColor: '#f0f0f0', fontStyle: 'italic' },
  highlightedBubble:   { backgroundColor: '#FFD700' },
  attachmentBox:       { flexDirection: 'row', alignItems: 'center', marginVertical: 4, paddingRight: 10 },
  attachmentIconWrap:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  imageBubble:         { padding: 4, width: 250 },
  chatImage:           { width: '100%', height: 250, borderRadius: 8, backgroundColor: '#e0e0e0' },
  imageFooterOverlay:  { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  textShadow:          { color: '#fff', fontWeight: 'bold' },
  offerBubble:         { borderWidth: 2, borderColor: '#007AFF', borderStyle: 'dashed', backgroundColor: '#e6f2ff', padding: 16, width: '70%' },
  offerHeader:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  offerHeaderText:     { color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  offerAmountText:     { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  offerActionRow:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  acceptBtn:           { flex: 1, backgroundColor: '#34C759', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  declineBtn:          { flex: 1, backgroundColor: '#FF3B30', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  offerStatusBadge:    { marginTop: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  bgGreen:             { backgroundColor: '#34C759' },
  bgRed:               { backgroundColor: '#FF3B30' },
  msgText:             { fontSize: 16, marginBottom: 4 },
  myText:              { color: '#000' },
  theirText:           { color: '#000' },
  deletedText:         { color: '#888', fontStyle: 'italic' },
  msgFooter:           { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  timeText:            { fontSize: 10, color: '#888' },
  editedText:          { fontSize: 10, color: '#888', fontStyle: 'italic', marginRight: 4 },
  reactionBadge:       { position: 'absolute', bottom: -10, right: 10, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#eee', ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' }, default: { elevation: 2 } }) },
  soldBanner:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f8f2', paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#c8e6c9' },
  soldBannerText:      { fontSize: 13, color: '#388E3C', fontWeight: '500' },
  soldBannerLink:      { color: '#007AFF', fontWeight: '700' },
  inputBar:            { flexDirection: 'row', padding: 10, alignItems: 'center', backgroundColor: '#f0f0f0', paddingBottom: Platform.OS === 'ios' ? 30 : 10 },
  attachMenuBtn:       { marginRight: 8, padding: 4 },
  offerIconBtn:        { marginRight: 8, padding: 4 },
  input:               { flex: 1, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, maxHeight: 100, marginRight: 8 },
  inlineCameraBtn:     { position: 'absolute', right: 65, padding: 8, top: 12 },
  sendBtn:             { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:     { backgroundColor: '#999' },
  attachOverlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  attachMenuCard:      { backgroundColor: '#fff', margin: 16, marginBottom: 80, borderRadius: 16, padding: 20, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' }, default: { elevation: 5 } }) },
  attachRow:           { flexDirection: 'row', justifyContent: 'space-around' },
  attachItem:          { alignItems: 'center', width: 80 },
  attachIconCircle:    { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  attachText:          { fontSize: 14, color: '#333' },
  contactModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  contactModalCard:    { backgroundColor: '#fff', height: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  contactHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  contactTitle:        { fontSize: 20, fontWeight: 'bold' },
  contactSearchBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12, height: 40, marginBottom: 15 },
  contactSearchInput:  { flex: 1, fontSize: 15, color: '#000' },
  contactRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  contactAvatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  contactAvatarText:   { fontSize: 18, fontWeight: 'bold', color: '#666' },
  contactName:         { fontSize: 16, fontWeight: '600', color: '#333' },
  contactPhone:        { fontSize: 14, color: '#888', marginTop: 2 },
  modalOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:        { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:          { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modalSub:            { fontSize: 14, color: '#666', marginBottom: 20 },
  errorText:           { color: '#FF3B30', marginBottom: 10, fontWeight: 'bold' },
  offerInput:          { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16 },
  cancelBtn:           { flex: 1, backgroundColor: '#eee', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sendOfferBtn:        { flex: 1, backgroundColor: '#000', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnTextBlack:        { color: '#000', fontSize: 16, fontWeight: 'bold' },
  btnTextWhite:        { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  reactionRow:         { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  reactionEmoji:       { fontSize: 32 },
  divider:             { height: 1, backgroundColor: '#eee', marginBottom: 10 },
  modalOption:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  modalOptionText:     { fontSize: 16, fontWeight: '500', color: '#000' },
  overlayCenter:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmCard:         { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', ...Platform.select({ web: { boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }, default: { elevation: 10 } }) },
  confirmIconWrap:     { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f1f8f2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmTitle:        { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 10, textAlign: 'center' },
  confirmSubtitle:     { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  confirmYesBtn:       { width: '100%', backgroundColor: '#000', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  confirmYesText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  confirmCancelBtn:    { width: '100%', paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#f5f5f5' },
  confirmCancelText:   { color: '#666', fontSize: 15, fontWeight: '600' },
  overlayBottom:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  ratingCard:          { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 28, alignItems: 'center' },
  ratingHandle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', marginBottom: 20 },
  ratingAvatarWrap:    { marginBottom: 16 },
  ratingAvatarImg:     { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#f0f0f0' },
  ratingAvatarFallback:{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#f0f0f0' },
  ratingAvatarLetter:  { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  ratingTitle:         { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 8 },
  ratingSubtitle:      { fontSize: 15, color: '#777', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  ratingLabel:         { fontSize: 15, fontWeight: '600', color: '#F5A623', marginTop: 4, marginBottom: 12 },
  reviewInput:         { width: '100%', backgroundColor: '#f8f8f8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#ebebeb', textAlignVertical: 'top', marginTop: 8, minHeight: 88 },
  reviewCharCount:     { alignSelf: 'flex-end', fontSize: 11, color: '#ccc', marginTop: 4, marginBottom: 16 },
  submitReviewBtn:     { width: '100%', backgroundColor: '#000', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  submitReviewText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn:             { paddingVertical: 10 },
  skipText:            { fontSize: 14, color: '#aaa', fontWeight: '500' },
});