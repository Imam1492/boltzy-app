import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Keyboard, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

const QUICK_REPLIES = [
  { id: 'promote', label: "Promote my ad", response: "To promote your ad, go to the 'My Ads' tab, tap on your active listing, and select 'Promote Ad to Top'. It costs ₹249 or 1 Gold Token!" },
  { id: 'scammer', label: "Report a scammer", response: "If you suspect a scammer, go to their profile or the chat window, tap the 3 dots in the top right, and select 'Report User'. Our team will investigate within 24 hours." },
  { id: 'delete', label: "Delete account", response: "You can delete your account by going to Profile > Edit Profile > Danger Zone > Delete Account. Note: It takes 30 days to permanently erase your data." },
  { id: 'username', label: "Change username", response: "Go to Profile > Edit Profile. Note that usernames can only be changed once every 30 days to prevent spam." },
  { id: 'safety', label: "Safety tips", response: "Always meet in public, well-lit places. Inspect items thoroughly, and NEVER pay in advance before receiving the item." },
  { id: 'other', label: "Other queries", response: "Please type your specific question below, and our AI assistant will do its best to help you!" }
];

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
}

export default function SupportBot() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi there! 👋 I'm the Boltzy Support Bot. Choose a quick question below, or tap 'Other queries' to chat with my AI!", sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const onShow = (e: any) => {
      // ✨ We push exactly by the keyboard height
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 220,
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: any) => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 220,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeight]);

  useEffect(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isTyping, showInput]);

  const handleChipPress = (reply: typeof QUICK_REPLIES[0]) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), text: reply.label, sender: 'user' }]);

    setTimeout(() => {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: reply.response, sender: 'bot' }]);
      if (reply.id === 'other') setShowInput(true);
    }, 600);
  };

  const handleSendCustom = async () => {
    const text = inputText.trim();
    if (!text) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), text, sender: 'user' }]);
    setInputText('');
    setIsTyping(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('chat-support', {
        body: { query: text },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages(prev => [...prev, { id: Date.now().toString(), text: data.reply || "I couldn't process that right now.", sender: 'bot' }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), text: `Error: ${err.message || 'Something went wrong.'}`, sender: 'bot' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Boltzy Support</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView ref={scrollViewRef} style={styles.scrollArea} contentContainerStyle={styles.chatArea} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.messageBubble, msg.sender === 'user' ? [styles.userBubble, { backgroundColor: colors.tint }] : [styles.botBubble, { backgroundColor: colors.card, borderColor: colors.border }]]}>
            {msg.sender === 'bot' && <Ionicons name="hardware-chip" size={16} color="#F5A623" style={{ marginRight: 6 }} />}
            <Text style={[styles.messageText, { color: msg.sender === 'user' ? (isDark ? '#000' : '#fff') : colors.text }]}>{msg.text}</Text>
          </View>
        ))}

        {isTyping && (
          <View style={[styles.messageBubble, styles.botBubble, { backgroundColor: colors.card, borderColor: colors.border, width: 60, height: 40, justifyContent: 'center' }]}>
            <ActivityIndicator size="small" color="#F5A623" />
          </View>
        )}
      </ScrollView>

      {!showInput && (
        <View style={[styles.chipsContainer, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border, paddingBottom: 12 }]}>
          <View style={styles.gridWrap}>
            {QUICK_REPLIES.map((reply) => (
              <TouchableOpacity
                key={reply.id}
                style={[styles.gridChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleChipPress(reply)}
              >
                <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{reply.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {showInput && (
        <View style={[styles.inputContainer, { backgroundColor: colors.card, paddingBottom: 12 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
            placeholder="Type your question..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSendCustom}
            returnKeyType="send"
          />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.tint : colors.backgroundSecondary }]} onPress={handleSendCustom} disabled={!inputText.trim()}>
            <Ionicons name="send" size={20} color={inputText.trim() ? (isDark ? '#000' : '#fff') : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* ✨ THE FIX: We stack BOTH spacers. We never shrink the gesture bar to 0. 
          This guarantees the keyboard lifts the input box perfectly above the keys! */}
      <Animated.View style={{ height: keyboardHeight }} />
      <View style={{ height: Math.max(insets.bottom, 12) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  scrollArea: { flex: 1 },
  chatArea: { padding: 16, paddingBottom: 20 },

  messageBubble: { maxWidth: '82%', padding: 14, borderRadius: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  botBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1 },
  messageText: { fontSize: 15, lineHeight: 22, flexShrink: 1 },

  chipsContainer: { paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  gridChip: { width: '48%', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },

  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 14, borderTopWidth: 1, borderColor: 'rgba(150,150,150,0.1)' },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 18, fontSize: 15, marginRight: 10 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' }
});