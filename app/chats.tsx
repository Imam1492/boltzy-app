import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { getLocalizedListingField, getLocalizedMessageContent } from '../utils/localizedContent';
import { useLanguage } from '../context/LanguageContext'; // ✨ IMPORTED TRANSLATOR

const INBOX_CACHE_TTL_MS = 20_000;

let inboxCache: { userId: string; fetchedAt: number; data: any[] } | null = null;

export default function Inbox() {
  const router = useRouter();
  const { lang, t, translateUGC } = useLanguage();

  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const currentUserIdRef = useRef<string | null>(null);
  const chatRoomsRef = useRef<any[]>([]);
  const inboxRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    chatRoomsRef.current = chatRooms;

    if (currentUserIdRef.current) {
      inboxCache = {
        userId: currentUserIdRef.current,
        fetchedAt: Date.now(),
        data: chatRooms,
      };
    }
  }, [chatRooms]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void fetchChats();

      const queueInboxRefresh = () => {
        if (inboxRefreshTimeoutRef.current) {
          clearTimeout(inboxRefreshTimeoutRef.current);
        }

        inboxRefreshTimeoutRef.current = setTimeout(() => {
          if (isMounted) {
            void fetchChats({ force: true, background: true });
          }
          inboxRefreshTimeoutRef.current = null;
        }, 250);
      };

      const channel = supabase
        .channel('inbox_realtime_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          queueInboxRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
          queueInboxRefresh();
        })
        .subscribe();

      return () => {
        isMounted = false;
        if (inboxRefreshTimeoutRef.current) {
          clearTimeout(inboxRefreshTimeoutRef.current);
          inboxRefreshTimeoutRef.current = null;
        }
        supabase.removeChannel(channel);
        setSelectionMode(false);
        setSelectedIds([]);
      };
    }, [])
  );

  const fetchChats = async (
    { force = false, background = false }: { force?: boolean; background?: boolean } = {}
  ) => {
    let userId = currentUserIdRef.current;

    if (!userId) {
      const user = await getCurrentUser();
      if (!user) return;
      userId = user.id;
      currentUserIdRef.current = user.id;
      setCurrentUserId(user.id);
    }

    if (
      !force &&
      inboxCache &&
      inboxCache.userId === userId &&
      Date.now() - inboxCache.fetchedAt < INBOX_CACHE_TTL_MS
    ) {
      setChatRooms(inboxCache.data);
      setLoading(false);
      return;
    }

    if (fetchInFlightRef.current) {
      return;
    }

    fetchInFlightRef.current = true;

    if (!background && chatRoomsRef.current.length === 0) {
      setLoading(true);
    }

    const runChatsQuery = (includeTranslations: boolean) =>
      supabase
        .from('chats')
        .select(
          includeTranslations
            ? `
                id, buyer_id, seller_id, listing_id, is_sold, is_pinned, pinned_at, hidden_by, created_at,
                listings(title, image_urls, translations),
                buyer:profiles!buyer_id(display_name, avatar_url),
                seller:profiles!seller_id(display_name, avatar_url),
                messages(
                  is_read,
                  sender_id,
                  content,
                  translations,
                  created_at,
                  type,
                  is_system,
                  is_deleted_for_everyone
                )
              `
            : `
                id, buyer_id, seller_id, listing_id, is_sold, is_pinned, pinned_at, hidden_by, created_at,
                listings(title, image_urls),
                buyer:profiles!buyer_id(display_name, avatar_url),
                seller:profiles!seller_id(display_name, avatar_url),
                messages(
                  is_read,
                  sender_id,
                  content,
                  created_at,
                  type,
                  is_system,
                  is_deleted_for_everyone
                )
              `
        )
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    try {
      let { data, error } = await runChatsQuery(true);

      if (error) {
        console.warn('[fetchChats] localized query failed, retrying without translations:', error.message);
        const fallback = await runChatsQuery(false);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error('[fetchChats] failed:', error.message);
        return;
      }

      const processed = (data ?? [])
        .filter((chat) => {
          const hiddenBy: string[] = chat.hidden_by || [];
          return !hiddenBy.includes(userId);
        })
        .map((chat) => {
          const isBuyer = chat.buyer_id === userId;
          const otherPerson = isBuyer ? chat.seller : chat.buyer;

          const unreadCount = chat.messages
            ? chat.messages.filter((m: any) => !m.is_read && m.sender_id !== userId).length
            : 0;

          const sorted = chat.messages
            ? [...chat.messages].sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )
            : [];

          const lastMessageRecord = sorted[0] ?? null;
          const lastMessageTime = lastMessageRecord?.created_at ?? chat.created_at;

          return { ...chat, otherPerson, unreadCount, lastMessageRecord, lastMessageTime };
        });

      processed.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      inboxCache = { userId, fetchedAt: Date.now(), data: processed };
      setChatRooms(processed);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const togglePin = async (chatId: string, currentlyPinned: boolean) => {
    const nextPinned = !currentlyPinned;

    setChatRooms((prev) => {
      const updated = prev.map((c) =>
        c.id === chatId
          ? { ...c, is_pinned: nextPinned, pinned_at: nextPinned ? new Date().toISOString() : null }
          : c
      );

      return [...updated].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });
    });

    const { error } = await supabase
      .from('chats')
      .update({
        is_pinned: nextPinned,
        pinned_at: nextPinned ? new Date().toISOString() : null,
      })
      .eq('id', chatId);

    if (error) {
      Alert.alert('Error', 'Could not update pin status.');
      fetchChats();
    }
  };

  const deleteChat = async (chatId: string) => {
    Alert.alert(
      'Delete Chat',
      'This will remove this chat from your inbox. The other person will still see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentUserId) return;

            setChatRooms((prev) => prev.filter((c) => c.id !== chatId));

            const chat = chatRooms.find((c) => c.id === chatId);
            const existing: string[] = chat?.hidden_by || [];

            if (!existing.includes(currentUserId)) {
              const { error } = await supabase
                .from('chats')
                .update({ hidden_by: [...existing, currentUserId] })
                .eq('id', chatId);

              if (error) {
                Alert.alert('Error', 'Could not delete chat.');
                fetchChats();
              }
            }
          },
        },
      ]
    );
  };

  const deleteSelected = () => {
    if (!currentUserId || selectedIds.length === 0) return;

    Alert.alert(
      'Delete Selected Chats',
      `This will remove ${selectedIds.length} chat${selectedIds.length === 1 ? '' : 's'} from your inbox. Other people will still see them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const idsToDelete = [...selectedIds];
            const snapshot = chatRooms;

            setChatRooms((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
            setSelectedIds([]);
            setSelectionMode(false);

            const results = await Promise.all(
              idsToDelete.map(async (id) => {
                const chat = snapshot.find((c) => c.id === id);
                const existing: string[] = chat?.hidden_by || [];

                if (existing.includes(currentUserId)) return null;

                return supabase
                  .from('chats')
                  .update({ hidden_by: [...existing, currentUserId] })
                  .eq('id', id);
              })
            );

            const hasError = results.some((result) => result?.error);
            if (hasError) {
              Alert.alert('Error', 'Could not delete some chats.');
              fetchChats();
            }
          },
        },
      ]
    );
  };

  const handleLongPress = (chatId: string) => {
    setSelectionMode(true);
    setSelectedIds([chatId]);
  };

  const toggleSelect = (chatId: string) => {
    setSelectedIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const localizedPreviewText = (message?: any) => {
    if (!message) return t('no_msg');
    if (message.is_deleted_for_everyone) return `🚫 ${t('chat_message_deleted')}`;
    if (message.type === 'image') return `📷 ${t('chat_photo')}`;
    if (message.type === 'location') return `📍 ${t('chat_location')}`;
    if (message.type === 'contact') return `👤 ${t('chat_contact')}`;

    const rawContent = String(message.content ?? '');
    if ((message.type === 'system' || message.is_system || rawContent.startsWith('🎉')) && rawContent.startsWith('🎉')) {
      return `🎉 ${t('chat_item_sold')}`;
    }

    return getLocalizedMessageContent(message, lang);
  };

  const filteredChats = chatRooms.filter((chat) => {
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const localizedTitle = getLocalizedListingField(chat.listings, 'title', lang).toLowerCase();
    const localizedLastMessage = localizedPreviewText(chat.lastMessageRecord).toLowerCase();

    return (
      (chat.otherPerson?.display_name ?? '').toLowerCase().includes(q) ||
      localizedTitle.includes(q) ||
      localizedLastMessage.includes(q)
    );
  });

  const selectAll = () => {
    setSelectedIds(filteredChats.map((c) => c.id));
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);

    if (diff === 0) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const previewText = (msg: string) => {
    if (msg === 'No messages yet') return t('no_msg');
    if (msg.startsWith('📷')) return '📷 Photo';
    if (msg.startsWith('📍')) return '📍 Location';
    if (msg.startsWith('👤')) return '👤 Contact';
    if (msg.startsWith('🎉')) return '🎉 Item marked as sold';
    if (msg.startsWith('🚫')) return '🚫 Message deleted';
    return translateUGC(msg); // ✨ TRANSLATE USER CHAT MESSAGES
  };
  void previewText;

  const renderChatItem = ({ item }: { item: any }) => {
    const isSelected = selectedIds.includes(item.id);
    const itemImage = item.listings?.image_urls?.[0];
    const hasUnread = item.unreadCount > 0;

    return (
      <TouchableOpacity
        style={[styles.chatCard, isSelected && styles.chatCardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
            return;
          }
          router.push(`/chat/${item.id}` as any);
        }}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.75}
      >
        {selectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}

        <View style={styles.imageWrapper}>
          {itemImage ? (
            <Image source={{ uri: itemImage }} style={styles.itemThumb} />
          ) : (
            <View
              style={[
                styles.itemThumb,
                { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
              ]}
            >
              <Ionicons name="image-outline" size={22} color="#ccc" />
            </View>
          )}

          <View style={styles.avatarOverlay}>
            {item.otherPerson?.avatar_url ? (
              <Image source={{ uri: item.otherPerson.avatar_url }} style={styles.avatarMini} />
            ) : (
              <View style={styles.avatarMiniPlaceholder}>
                <Text style={styles.avatarMiniText}>
                  {item.otherPerson?.display_name?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.nameRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              {item.is_pinned && (
                <Ionicons
                  name="pin"
                  size={12}
                  color="#007AFF"
                  style={{ transform: [{ rotate: '45deg' }] }}
                />
              )}
              <Text style={[styles.otherName, hasUnread && styles.otherNameBold]} numberOfLines={1}>
                {item.otherPerson?.display_name || t('Unknown User')}
              </Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.lastMessageTime)}</Text>
          </View>

          {/* ✨ TRANSLATE AD TITLE IN CHAT LIST ✨ */}
          <Text style={styles.itemTitle} numberOfLines={1}>
            {getLocalizedListingField(item.listings, 'title', lang) || '—'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.lastMessage, hasUnread && styles.lastMessageBold]} numberOfLines={1}>
              {localizedPreviewText(item.lastMessageRecord)}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!selectionMode && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={() => togglePin(item.id, !!item.is_pinned)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={item.is_pinned ? 'pin' : 'pin-outline'}
                size={18}
                color={item.is_pinned ? '#007AFF' : '#888'}
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

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.selectionHeader}>
          <TouchableOpacity style={styles.selHeaderBtn} onPress={exitSelectionMode}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.selHeaderTitle}>
            {selectedIds.length === 0 ? t('select_chats') : `${selectedIds.length} selected`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.selHeaderBtn} onPress={selectAll}>
              <Text style={styles.selAllText}>{t('all')}</Text>
            </TouchableOpacity>
            {selectedIds.length > 0 && (
              <TouchableOpacity
                style={[styles.selHeaderBtn, { backgroundColor: '#FF3B30' }]}
                onPress={deleteSelected}
              >
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
          <Text style={styles.headerTitle}>{t('messages_title')}</Text>
          <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.selectModeBtn}>
            <Ionicons name="checkmark-circle-outline" size={26} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search_chats')}
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

      {filteredChats.some((c) => c.is_pinned) && !searchQuery && (
        <View style={styles.sectionLabel}>
          <Ionicons name="pin" size={12} color="#007AFF" />
          <Text style={styles.sectionLabelText}>{t('pinned')}</Text>
        </View>
      )}

      {loading && chatRooms.length === 0 ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
      ) : filteredChats.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={52} color="#ccc" />
          </View>
          {searchQuery ? (
            <Text style={styles.emptyText}>{`No chats match "${searchQuery}"`}</Text>
          ) : (
            <Text style={styles.emptyText}>{t('no_msg')}</Text>
          )}
          <Text style={styles.emptySubText}>
            {searchQuery ? 'Try a different search term.' : t('no_msg_sub')}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  selectModeBtn: { padding: 4 },

  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  selAllText: { fontSize: 14, fontWeight: '700', color: '#007AFF' },

  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },

  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  listContent: { paddingBottom: 32 },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 90 },

  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  chatCardSelected: { backgroundColor: '#EFF6FF' },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },

  imageWrapper: { position: 'relative', marginRight: 14 },
  itemThumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#eee' },
  avatarOverlay: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
  },
  avatarMini: { width: 26, height: 26, borderRadius: 13 },
  avatarMiniPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMiniText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  chatInfo: { flex: 1, paddingRight: 6 },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  otherName: { fontSize: 15, fontWeight: '500', color: '#222', flex: 1 },
  otherNameBold: { fontWeight: '700', color: '#000' },
  timeText: { fontSize: 11, color: '#aaa', marginLeft: 6 },
  itemTitle: { fontSize: 13, color: '#888', marginBottom: 4 },
  lastMessage: { fontSize: 13, color: '#aaa', flex: 1 },
  lastMessageBold: { color: '#333', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  quickActions: { flexDirection: 'column', gap: 8, marginLeft: 8 },
  quickActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubText: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 21 },
});
