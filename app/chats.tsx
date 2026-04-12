import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../supabase';

export default function Inbox() {
  const router = useRouter();
  const [chatRooms, setChatRooms]       = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ── Selection mode ─────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds]     = useState<string[]>([]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  //  REAL-TIME FETCH
  // ─────────────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      fetchChats();

      const channel = supabase
        .channel('inbox_realtime_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          if (isMounted) fetchChats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
          if (isMounted) fetchChats();
        })
        .subscribe();

      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
        // Exit selection mode when leaving screen
        setSelectionMode(false);
        setSelectedIds([]);
      };
    }, [])
  );

  const fetchChats = async () => {
    if (chatRooms.length === 0) setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase
      .from('chats')
      .select(`
        *,
        listings(title, image_urls),
        buyer:profiles!buyer_id(display_name, avatar_url),
        seller:profiles!seller_id(display_name, avatar_url),
        messages(is_read, sender_id, content, created_at)
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

    if (data) {
      const processed = data.map(chat => {
        const isBuyer    = chat.buyer_id === user.id;
        const otherPerson = isBuyer ? chat.seller : chat.buyer;

        const unreadCount = chat.messages
          ? chat.messages.filter((m: any) => !m.is_read && m.sender_id !== user.id).length
          : 0;

        const sorted = chat.messages
          ? [...chat.messages].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          : [];

        const lastMessage = sorted.length > 0 ? sorted[0].content : 'No messages yet';
        const lastMessageTime = sorted.length > 0 ? sorted[0].created_at : chat.created_at;

        return { ...chat, otherPerson, unreadCount, lastMessage, lastMessageTime };
      });

      // Pinned first, then sorted by most recent message
      processed.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      setChatRooms(processed);
    }
    setLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const togglePin = async (chatId: string, currentlyPinned: boolean) => {
    await supabase.from('chats')
      .update({ is_pinned: !currentlyPinned, pinned_at: !currentlyPinned ? new Date().toISOString() : null })
      .eq('id', chatId);
    fetchChats();
  };

  const deleteChat = async (chatId: string) => {
    Alert.alert(
      'Delete Chat',
      'This will remove this chat from your inbox. The other person will still see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            // We soft-delete by adding current user to a "hidden_by" array
            const chat = chatRooms.find(c => c.id === chatId);
            if (!chat) return;
            const existing = chat.hidden_by || [];
            if (!existing.includes(currentUserId)) {
              await supabase.from('chats')
                .update({ hidden_by: [...existing, currentUserId] })
                .eq('id', chatId);
            }
            setChatRooms(prev => prev.filter(c => c.id !== chatId));
          }
        },
      ]
    );
  };

  const deleteSelected = () => {
    Alert.alert(
      `Delete ${selectedIds.length} Chat${selectedIds.length > 1 ? 's' : ''}`,
      'These chats will be removed from your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            for (const id of selectedIds) {
              const chat = chatRooms.find(c => c.id === id);
              if (!chat) continue;
              const existing = chat.hidden_by || [];
              if (!existing.includes(currentUserId)) {
                await supabase.from('chats')
                  .update({ hidden_by: [...existing, currentUserId] })
                  .eq('id', id);
              }
            }
            setChatRooms(prev => prev.filter(c => !selectedIds.includes(c.id)));
            setSelectedIds([]);
            setSelectionMode(false);
          }
        },
      ]
    );
  };

  const handleLongPress = (chatId: string) => {
    setSelectionMode(true);
    setSelectedIds([chatId]);
  };

  const toggleSelect = (chatId: string) => {
    setSelectedIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const selectAll = () => {
    setSelectedIds(filteredChats.map(c => c.id));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  FILTER
  // ─────────────────────────────────────────────────────────────────────────
  const filteredChats = chatRooms.filter(chat => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      chat.otherPerson?.display_name?.toLowerCase().includes(q) ||
      chat.listings?.title?.toLowerCase().includes(q) ||
      chat.lastMessage?.toLowerCase().includes(q)
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  FORMAT HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  const formatTime = (dateStr: string) => {
    const d   = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const previewText = (msg: string) => {
    if (msg === 'No messages yet') return msg;
    if (msg.startsWith('📷')) return '📷 Photo';
    if (msg.startsWith('📍')) return '📍 Location';
    if (msg.startsWith('👤')) return '👤 Contact';
    if (msg.startsWith('🎉')) return '🎉 Item marked as sold';
    if (msg.startsWith('🚫')) return '🚫 Message deleted';
    return msg;
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER ITEM
  // ─────────────────────────────────────────────────────────────────────────
  const renderChatItem = ({ item }: { item: any }) => {
    const isSelected   = selectedIds.includes(item.id);
    const itemImage    = item.listings?.image_urls?.[0];
    const hasUnread    = item.unreadCount > 0;

    return (
      <TouchableOpacity
        style={[styles.chatCard, isSelected && styles.chatCardSelected]}
        onPress={() => {
          if (selectionMode) { toggleSelect(item.id); return; }
          router.push(`/chat/${item.id}` as any);
        }}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.75}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}

        {/* Listing image + avatar overlay */}
        <View style={styles.imageWrapper}>
          {itemImage
            ? <Image source={{ uri: itemImage }} style={styles.itemThumb} />
            : <View style={[styles.itemThumb, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="image-outline" size={22} color="#ccc" />
              </View>
          }
          <View style={styles.avatarOverlay}>
            {item.otherPerson?.avatar_url
              ? <Image source={{ uri: item.otherPerson.avatar_url }} style={styles.avatarMini} />
              : <View style={styles.avatarMiniPlaceholder}>
                  <Text style={styles.avatarMiniText}>{item.otherPerson?.display_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
            }
          </View>
        </View>

        {/* Chat info */}
        <View style={styles.chatInfo}>
          <View style={styles.nameRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              {item.is_pinned && (
                <Ionicons name="pin" size={12} color="#007AFF" style={{ transform: [{ rotate: '45deg' }] }} />
              )}
              <Text style={[styles.otherName, hasUnread && styles.otherNameBold]} numberOfLines={1}>
                {item.otherPerson?.display_name || 'Unknown User'}
              </Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.lastMessageTime)}</Text>
          </View>

          <Text style={styles.itemTitle} numberOfLines={1}>{item.listings?.title || '—'}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.lastMessage, hasUnread && styles.lastMessageBold]} numberOfLines={1}>
              {previewText(item.lastMessage)}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick action buttons — only in normal mode */}
        {!selectionMode && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={() => togglePin(item.id, item.is_pinned)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={item.is_pinned ? 'pin' : 'pin-outline'}
                size={18}
                color={item.is_pinned ? '#007AFF' : '#ccc'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={() => deleteChat(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ═══ HEADER ════════════════════════════════════════════ */}
      {selectionMode ? (
        <View style={styles.selectionHeader}>
          <TouchableOpacity style={styles.selHeaderBtn} onPress={exitSelectionMode}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.selHeaderTitle}>
            {selectedIds.length === 0 ? 'Select Chats' : `${selectedIds.length} selected`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.selHeaderBtn} onPress={selectAll}>
              <Text style={styles.selAllText}>All</Text>
            </TouchableOpacity>
            {selectedIds.length > 0 && (
              <TouchableOpacity style={[styles.selHeaderBtn, { backgroundColor: '#FF3B30' }]} onPress={deleteSelected}>
                <Ionicons name="trash" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.selectModeBtn}>
            <Ionicons name="checkmark-circle-outline" size={26} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ SEARCH BAR ═══════════════════════════════════════ */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats, people, items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#bbb"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ═══ PINNED LABEL ═════════════════════════════════════ */}
      {filteredChats.some(c => c.is_pinned) && !searchQuery && (
        <View style={styles.sectionLabel}>
          <Ionicons name="pin" size={12} color="#007AFF" />
          <Text style={styles.sectionLabelText}>Pinned</Text>
        </View>
      )}

      {/* ═══ LIST ═════════════════════════════════════════════ */}
      {loading && chatRooms.length === 0 ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
      ) : filteredChats.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={52} color="#ccc" />
          </View>
          {searchQuery
            ? <Text style={styles.emptyText}>No chats match "{searchQuery}"</Text>
            : <Text style={styles.emptyText}>No messages yet</Text>
          }
          <Text style={styles.emptySubText}>
            {searchQuery ? 'Try a different search term.' : 'When you chat with sellers or buyers, they will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#fff' },

  // Normal header
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle:       { fontSize: 22, fontWeight: 'bold', color: '#000' },
  selectModeBtn:     { padding: 4 },

  // Selection header
  selectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  selHeaderBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  selHeaderTitle:    { fontSize: 17, fontWeight: '700', color: '#000' },
  selAllText:        { fontSize: 14, fontWeight: '700', color: '#007AFF' },

  // Search
  searchSection:     { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:       { flex: 1, fontSize: 15, color: '#000' },

  // Section label
  sectionLabel:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionLabelText:  { fontSize: 12, fontWeight: '700', color: '#007AFF', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Chat list
  listContent:       { paddingBottom: 32 },
  separator:         { height: 1, backgroundColor: '#f5f5f5', marginLeft: 90 },

  // Chat card
  chatCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
  },
  chatCardSelected:  { backgroundColor: '#EFF6FF' },

  // Checkbox
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#ddd',
    marginRight: 12, justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected:  { backgroundColor: '#007AFF', borderColor: '#007AFF' },

  // Image + avatar
  imageWrapper:      { position: 'relative', marginRight: 14 },
  itemThumb:         { width: 58, height: 58, borderRadius: 12, backgroundColor: '#eee' },
  avatarOverlay:     { position: 'absolute', bottom: -5, right: -5, borderWidth: 2, borderColor: '#fff', borderRadius: 12 },
  avatarMini:        { width: 26, height: 26, borderRadius: 13 },
  avatarMiniPlaceholder: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  avatarMiniText:    { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Info
  chatInfo:          { flex: 1, paddingRight: 6 },
  nameRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  otherName:         { fontSize: 15, fontWeight: '500', color: '#222', flex: 1 },
  otherNameBold:     { fontWeight: '700', color: '#000' },
  timeText:          { fontSize: 11, color: '#aaa', marginLeft: 6 },
  itemTitle:         { fontSize: 13, color: '#888', marginBottom: 4 },
  lastMessage:       { fontSize: 13, color: '#aaa', flex: 1 },
  lastMessageBold:   { color: '#333', fontWeight: '600' },
  unreadBadge:       { backgroundColor: '#007AFF', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: 6 },
  unreadBadgeText:   { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Quick action buttons (pin + delete)
  quickActions:      { flexDirection: 'column', gap: 8, marginLeft: 8 },
  quickActionBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f8f8f8', justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyState:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap:     { width: 96, height: 96, borderRadius: 48, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText:         { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' },
  emptySubText:      { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 21 },
});