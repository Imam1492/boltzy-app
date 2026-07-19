import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View, Modal, TouchableWithoutFeedback, KeyboardAvoidingView
} from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { getLocalizedMessageContent } from '../utils/localizedContent';
import { useLanguage } from '../context/LanguageContext';

// ✨ SMART INITIALS ENGINE (Safely uses only what is available)
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

export default function Inbox() {
  const router = useRouter();
  const { lang, t, translateUGC } = useLanguage();

  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [starModalVisible, setStarModalVisible] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [starNickname, setStarNickname] = useState('');
  
  const [activeTab, setActiveTab] = useState<'selling' | 'buying'>('selling');
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const currentUserIdRef = useRef<string | null>(null);
  const chatRoomsRef = useRef<any[]>([]);
  const fetchInFlightRef = useRef(false);

  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  useEffect(() => { chatRoomsRef.current = chatRooms; }, [chatRooms]);

  useFocusEffect(useCallback(() => { void fetchChats({ force: true }); }, []));

  const fetchChats = async ({ force = false }: { force?: boolean } = {}) => {
    let userId = currentUserIdRef.current;
    if (!userId) {
      const user = await getCurrentUser();
      if (!user) return;
      userId = user.id;
      currentUserIdRef.current = user.id;
      setCurrentUserId(user.id);
    }

    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (chatRoomsRef.current.length === 0) setLoading(true);

   try {
      // ✨ CRASH-PROOF QUERY: 'translations' removed from the messages fetch!
      const { data, error } = await supabase.from('chats').select(`
         *,
         listings(id, title, price, image_urls, translations),
         buyer:profiles!buyer_id(id, display_name, real_name, avatar_url),
         seller:profiles!seller_id(id, display_name, real_name, avatar_url),
         messages(id, is_read, sender_id, content, created_at, type, is_system, is_deleted_for_everyone)
      `).or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

      if (error) throw error;

      const processed = (data ?? []).filter((chat) => !(chat.hidden_by || []).includes(userId)).map((chat) => {
        const isBuyer = chat.buyer_id === userId;
        const otherPerson = isBuyer ? chat.seller : chat.buyer;
        
        // Safely map stars and pins (falls back to old shared columns if new ones aren't in DB yet)
        const is_starred = isBuyer ? (chat.buyer_starred || chat.is_starred) : (chat.seller_starred || chat.is_starred);
        const chat_nickname = isBuyer ? (chat.buyer_nickname || chat.chat_nickname) : (chat.seller_nickname || chat.chat_nickname);
        const pinned_until = isBuyer ? chat.buyer_pinned_until : chat.seller_pinned_until;
        const isPinActive = pinned_until ? new Date(pinned_until) > new Date() : (isBuyer ? (chat.buyer_pinned || chat.is_pinned) : (chat.seller_pinned || chat.is_pinned));

        const unreadCount = chat.messages ? chat.messages.filter((m: any) => !m.is_read && m.sender_id !== userId).length : 0;
        const sorted = chat.messages ? [...chat.messages].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
        const lastMessageRecord = sorted[0] ?? null;
        const lastMessageTime = lastMessageRecord?.created_at ?? chat.created_at;

        return { ...chat, otherPerson, unreadCount, lastMessageRecord, lastMessageTime, isPinActive, is_starred, chat_nickname };
      });

      processed.sort((a, b) => {
        if (a.isPinActive && !b.isPinActive) return -1;
        if (!a.isPinActive && b.isPinActive) return 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      setChatRooms(processed);
    } catch (e: any) {
      console.error('[fetchChats] failed:', e);
      if (Platform.OS === 'web') window.alert("Fetch Error: " + e.message);
      else Alert.alert("Fetch Error", e.message);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const openPinMenu = (chatId: string) => {
    const chat = chatRooms.find(c => c.id === chatId);
    if (!chat) return;

    if (chat.isPinActive) {
      if (Platform.OS === 'web') {
        if (window.confirm("Unpin this chat?")) applyPin(chat.id, 0);
      } else {
        Alert.alert(t('pinned') || 'Pinned', 'Unpin this conversation?', [
          { text: 'Unpin', style: 'destructive', onPress: () => applyPin(chat.id, 0) }, { text: 'Cancel', style: 'cancel' }
        ]);
      }
    } else {
      const currentPins = chatRooms.filter(c => c.isPinActive).length;
      if (currentPins >= 2) {
        if (Platform.OS === 'web') window.alert("Limit Reached: Max 2 pinned chats.");
        else Alert.alert('Pin Limit', 'You can only pin a maximum of 2 chats at a time.');
        return;
      }
      setPinModalVisible(true);
    }
  };

  const applyPin = async (chatId: string, days: number) => {
    const chat = chatRooms.find(c => c.id === chatId);
    if (!chat) return;
    const isBuyer = chat.buyer_id === currentUserIdRef.current;
    const isPinning = days > 0;
    
    let pinnedUntil = null;
    if (isPinning) {
      const exp = new Date(); exp.setDate(exp.getDate() + days);
      pinnedUntil = exp.toISOString();
    }

    setChatRooms((prev) => {
      const updated = prev.map((c) => c.id === chatId ? { ...c, isPinActive: isPinning } : c);
      return [...updated].sort((a, b) => {
        if (a.isPinActive && !b.isPinActive) return -1;
        if (!a.isPinActive && b.isPinActive) return 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });
    });

    const payload = isBuyer ? { buyer_pinned: isPinning, buyer_pinned_until: pinnedUntil } : { seller_pinned: isPinning, seller_pinned_until: pinnedUntil };
    await supabase.from('chats').update(payload).eq('id', chatId);
  };

  const openStarMenu = (chatId: string) => {
    const chat = chatRooms.find(c => c.id === chatId);
    if (!chat) return;
    setStarNickname(chat.chat_nickname || '');
    setStarModalVisible(true);
  };

  const applyStar = async () => {
    if (!activeChatId) return;
    const chat = chatRooms.find(c => c.id === activeChatId);
    const isBuyer = chat?.buyer_id === currentUserIdRef.current;
    const nickname = starNickname.trim() || null;
    
    setChatRooms(prev => prev.map(c => c.id === activeChatId ? { ...c, is_starred: true, chat_nickname: nickname } : c));
    setStarModalVisible(false);

    const payload = isBuyer ? { buyer_starred: true, buyer_nickname: nickname } : { seller_starred: true, seller_nickname: nickname };
    await supabase.from('chats').update(payload).eq('id', activeChatId);
  };

  const removeStar = async () => {
    if (!activeChatId) return;
    const chat = chatRooms.find(c => c.id === activeChatId);
    const isBuyer = chat?.buyer_id === currentUserIdRef.current;
    
    setChatRooms(prev => prev.map(c => c.id === activeChatId ? { ...c, is_starred: false, chat_nickname: null } : c));
    setStarModalVisible(false);

    const payload = isBuyer ? { buyer_starred: false, buyer_nickname: null } : { seller_starred: false, seller_nickname: null };
    await supabase.from('chats').update(payload).eq('id', activeChatId);
  };

  const confirmDeleteChat = async (chatId: string) => {
    const msg = 'This will remove this chat from your inbox. The other person will still see it.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) executeChatDelete(chatId);
    } else {
      Alert.alert('Delete Chat', msg, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => executeChatDelete(chatId) },
      ]);
    }
  };

  const executeChatDelete = async (chatId: string) => {
    if (!currentUserIdRef.current) return;
    setChatRooms((prev) => prev.filter((c) => c.id !== chatId));
    const chat = chatRoomsRef.current.find((c) => c.id === chatId);
    const existing: string[] = chat?.hidden_by || [];
    if (!existing.includes(currentUserIdRef.current)) {
      await supabase.from('chats').update({ hidden_by: [...existing, currentUserIdRef.current] }).eq('id', chatId);
    }
  };

  const getStandardChatList = () => chatRooms.filter(chat => {
    if (filterMode === 'unread' && chat.unreadCount === 0) return false;
    const isBuying = chat.buyer_id === currentUserIdRef.current;
    if (activeTab === 'buying' && !isBuying) return false;
    if (activeTab === 'selling' && isBuying) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = (chat.listings?.translations?.[lang]?.title || translateUGC(chat.listings?.title) || '').toLowerCase();
    const nick = (chat.chat_nickname || '').toLowerCase();
    return ((chat.otherPerson?.display_name || '').toLowerCase().includes(q) || title.includes(q) || nick.includes(q));
  });

  const renderChatItem = ({ item }: { item: any }) => {
    const isSelected = selectedIds.includes(item.id);
    const hasUnread = item.unreadCount > 0;
    const itemImage = item.listings?.image_urls?.[0];
    const displayTitle = item.listings?.translations?.[lang]?.title || translateUGC(item.listings?.title) || '—';
    const displayPrice = item.listings?.price ? `₹${Number(item.listings.price).toLocaleString('en-IN')}` : '';
    
   // ✨ FIX: Safely grab their real name, ignoring the tag for now
    const displayName = item.otherPerson?.real_name || item.otherPerson?.display_name || 'Unknown User';

    return (
      <View style={[styles.chatCard, isSelected && styles.chatCardSelected]}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => router.push(`/chat/${item.id}` as any)} activeOpacity={0.7}>
          <View style={styles.imageWrapper}>
            {itemImage ? <Image source={{ uri: itemImage }} style={styles.itemThumb} /> : <View style={[styles.itemThumb, styles.itemThumbFallback]}><Ionicons name="image-outline" size={22} color="#ccc" /></View>}
            <View style={styles.avatarOverlay}>
              {item.otherPerson?.avatar_url && item.otherPerson.avatar_url.trim() !== '' ? (
                <Image source={{ uri: item.otherPerson.avatar_url }} style={styles.avatarMini} />
              ) : (
                <View style={styles.avatarMiniPlaceholder}>
                {/* ✨ FIX: Properly uses real_name for initials! */}
                  <Text style={styles.avatarMiniText}>{getInitials(item.otherPerson?.real_name || item.otherPerson?.display_name || '?')}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.chatInfo}>
           <View style={styles.nameRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                {item.isPinActive && <Ionicons name="pin" size={12} color="#007AFF" style={{ transform: [{ rotate: '45deg' }] }} />}
                
                {/* 1. The Normal Name */}
                <Text style={[styles.otherName, hasUnread && styles.otherNameBold]} numberOfLines={1}>{displayName}</Text>
                
                {/* 2. ✨ THE NEW TAG UI ✨ */}
                {item.is_starred && item.chat_nickname ? (
                  <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#FDE68A' }}>
                    <Ionicons name="star" size={10} color="#F5A623" />
                    <Text style={{ fontSize: 10, color: '#D97706', fontWeight: 'bold', maxWidth: 80 }} numberOfLines={1}>{item.chat_nickname}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.itemTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{displayTitle}</Text>
              {displayPrice ? <Text style={{ fontSize: 13, color: '#007AFF', fontWeight: '700' }}>{displayPrice}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.lastMessage, hasUnread && styles.lastMessageBold]} numberOfLines={1}>{item.lastMessageRecord?.content || 'No messages'}</Text>
              {hasUnread && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionBtn} onPress={() => { setActiveChatId(item.id); setChatMenuVisible(true); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-vertical" size={20} color="#888" />
        </TouchableOpacity>
      </View>
    );
  };

  const currentData = getStandardChatList();

  return (
    <View style={styles.container}>
        <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <View style={[styles.header, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#000" /></TouchableOpacity>
            <Text style={styles.headerTitle}>{t('messages_title') || 'Messages'}</Text>
            
            {/* ✨ RESTORED: All/Unread Filter & Selection Mode */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity 
                style={{ backgroundColor: filterMode === 'unread' ? '#007AFF' : '#f0f0f0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}
                onPress={() => setFilterMode(prev => prev === 'all' ? 'unread' : 'all')}
              >
                <Text style={{ color: filterMode === 'unread' ? '#fff' : '#666', fontSize: 12, fontWeight: 'bold' }}>{filterMode === 'all' ? t('filter_all') || 'All' : t('filter_unread') || 'Unread'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.selectModeBtn}>
                <Ionicons name="checkmark-circle-outline" size={26} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 }}>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'selling' && styles.tabBtnActive]} onPress={() => setActiveTab('selling')}>
              <Text style={[styles.tabText, activeTab === 'selling' && styles.tabTextActive]}>{t('tab_selling') || 'Selling'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'buying' && styles.tabBtnActive]} onPress={() => setActiveTab('buying')}>
              <Text style={[styles.tabText, activeTab === 'buying' && styles.tabTextActive]}>{t('tab_buying') || 'Buying'}</Text>
            </TouchableOpacity>
          </View>
        </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput style={styles.searchInput} placeholder={t('search_chats') || 'Search...'} value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor="#bbb" />
          {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color="#ccc" /></TouchableOpacity>}
        </View>
      </View>

      {loading && chatRooms.length === 0 ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
      ) : currentData.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}><Ionicons name="chatbubble-ellipses-outline" size={52} color="#ccc" /></View>
          <Text style={styles.emptyText}>{searchQuery ? `No matches for "${searchQuery}"` : (t('no_msg') || 'No messages')}</Text>
        </View>
      ) : (
        <FlatList data={currentData} renderItem={renderChatItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} />
      )}

      {/* ═══ 3-DOT ACTION MENU ════════════════════════════ */}
      <Modal visible={chatMenuVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.bottomSheetOverlay} activeOpacity={1} onPress={() => setChatMenuVisible(false)}>
          <View style={styles.bottomSheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Chat Options</Text>
            
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setChatMenuVisible(false); setTimeout(() => openPinMenu(activeChatId as string), 300); }}>
              <View style={[styles.sheetIconWrap, { backgroundColor: '#EFF6FF' }]}><Ionicons name="pin" size={20} color="#007AFF" /></View>
              <Text style={styles.sheetActionText}>Pin / Unpin Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetAction} onPress={() => { setChatMenuVisible(false); setTimeout(() => openStarMenu(activeChatId as string), 300); }}>
              <View style={[styles.sheetIconWrap, { backgroundColor: '#FFFBEB' }]}><Ionicons name="star" size={20} color="#F5A623" /></View>
              <Text style={styles.sheetActionText}>{t('star_chat') || 'Star & Tag Chat'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetAction} onPress={() => { setChatMenuVisible(false); setTimeout(() => confirmDeleteChat(activeChatId as string), 300); }}>
              <View style={[styles.sheetIconWrap, { backgroundColor: '#FEF2F2' }]}><Ionicons name="trash" size={20} color="#FF3B30" /></View>
              <Text style={[styles.sheetActionText, { color: '#FF3B30' }]}>Delete Chat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ═══ STAR MODAL ════════════════════════════ */}
      <Modal visible={starModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FFFBEB' }]}><Ionicons name="star" size={32} color="#F5A623" /></View>
            <Text style={styles.modalTitleCenter}>{t('star_chat') || 'Star & Tag Chat'}</Text>
            <Text style={styles.modalSubCenter}>Add a nickname so you remember who this is.</Text>
            <TextInput style={styles.modalInput} placeholder={t('enter_tag') || 'Enter a nickname or tag...'} value={starNickname} onChangeText={setStarNickname} maxLength={20} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStarModalVisible(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={applyStar}><Text style={styles.modalSaveText}>{t('save_tag') || 'Save Tag'}</Text></TouchableOpacity>
            </View>
            {chatRooms.find(c => c.id === activeChatId)?.is_starred && (
              <TouchableOpacity style={{ marginTop: 20 }} onPress={removeStar}><Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>{t('unstar_chat') || 'Remove Star'}</Text></TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ PIN MODAL ════════════════════════════════════ */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>Pin Chat</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' }}>How long do you want to pin this conversation?</Text>

            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(activeChatId as string, 1); }} style={styles.pinOptionBtn}><Text style={styles.pinOptionText}>24 Hours</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(activeChatId as string, 7); }} style={styles.pinOptionBtn}><Text style={styles.pinOptionText}>7 Days</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setPinModalVisible(false); applyPin(activeChatId as string, 30); }} style={styles.pinOptionBtn}><Text style={styles.pinOptionText}>30 Days</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setPinModalVisible(false)} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}><Text style={{ fontSize: 16, color: '#FF3B30', fontWeight: 'bold' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  selectModeBtn: { padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 12, borderBottomWidth: 2, borderColor: 'transparent', alignItems: 'center' },
  tabBtnActive: { borderColor: '#000' },
  tabText: { fontWeight: '600', color: '#888', fontSize: 15 },
  tabTextActive: { fontWeight: 'bold', color: '#000' },
  searchSection: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  listContent: { paddingBottom: 32 },
  
  chatCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  chatCardSelected: { backgroundColor: '#EFF6FF' },
  imageWrapper: { position: 'relative', marginRight: 14 },
  itemThumb: { width: 58, height: 58, borderRadius: 12 },
  itemThumbFallback: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  avatarOverlay: { position: 'absolute', bottom: -5, right: -5, borderWidth: 2, borderColor: '#fff', borderRadius: 12 },
  avatarMini: { width: 26, height: 26, borderRadius: 13 },
  avatarMiniPlaceholder: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  avatarMiniText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  chatInfo: { flex: 1, paddingRight: 6 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  otherName: { fontSize: 15, fontWeight: '500', color: '#222', flex: 1 },
  otherNameBold: { fontWeight: '700', color: '#000' },
  itemTitle: { fontSize: 13, color: '#888' },
  lastMessage: { fontSize: 13, color: '#aaa', flex: 1 },
  lastMessageBold: { color: '#333', fontWeight: '600' },
  unreadBadge: { backgroundColor: '#007AFF', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: 6 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  quickActionBtn: { padding: 4, marginLeft: 8 },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' },

  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheetCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  sheetIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sheetActionText: { fontSize: 16, fontWeight: '600', color: '#222' },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCardCenter: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 24, padding: 24, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalTitleCenter: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  modalSubCenter: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  modalInput: { width: '100%', backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 14, fontSize: 16 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center' },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: '#666' },
  modalSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#000', alignItems: 'center' },
  modalSaveText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  pinOptionBtn: { width: '100%', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  pinOptionText: { fontSize: 16, color: '#007AFF', fontWeight: '600' }
});