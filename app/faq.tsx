import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter, useFocusEffect,useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import ConfirmModal from '../components/ConfirmModal';
import * as ImageManipulator from 'expo-image-manipulator';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { LinearGradient } from 'expo-linear-gradient';




// Enable layout animation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_DATA = [
  {
    id: '1',
    question: 'How do I post an ad?',
    answer: 'Simply tap the purple "+" button at the bottom of your screen, upload a few clear photos, add a title and description, and set your price. Your ad will be reviewed and posted shortly!'
  },
  {
    id: '2',
    question: 'Is Boltzy free to use?',
    answer: 'Yes! You can browse, chat, and buy for completely free. Sellers get 3 free ads per year. If you want to sell more, you can upgrade to our Yearly Pro plan.'
  },
  {
    id: '3',
    question: 'How do I promote my ad to the top?',
    answer: 'Go to the "My Ads" tab, find your active listing, and tap "Promote Ad to Top". This will give your ad a Gold badge and push it to the top of the search results for a whole month.'
  },
  {
    id: '4',
    question: 'How do I stay safe while buying or selling?',
    answer: 'Always meet in well-lit, public places. Inspect the item thoroughly before handing over money, and NEVER pay in advance for an item you haven\'t seen.'
  },
  {
    id: '5',
    question: 'How do I delete my account?',
    answer: 'Go to your Profile Settings, scroll to the bottom Danger Zone, and tap "Delete Account". Your account will be held for 30 days in case you change your mind before being permanently deleted.'
  }
];

export default function FAQ() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>FAQ</Text>
        <View style={{ width: 36 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 30, marginTop: 10 }}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#422006' : '#fff8e1' }]}>
            <Ionicons name="help-buoy" size={40} color="#F5A623" />
          </View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>How can we help?</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>Find answers to commonly asked questions.</Text>
        </View>

        {FAQ_DATA.map((faq) => {
          const isExpanded = expandedId === faq.id;
          return (
            <View key={faq.id} style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.faqHeader} onPress={() => toggleExpand(faq.id)} activeOpacity={0.7}>
                <Text style={[styles.question, { color: colors.text, fontWeight: isExpanded ? 'bold' : '600' }]}>{faq.question}</Text>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              {isExpanded && (
                <View style={[styles.answerWrap, { borderTopColor: colors.border }]}>
                  <Text style={[styles.answer, { color: colors.textSecondary }]}>{faq.answer}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 60 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  mainTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  subTitle: { fontSize: 15 },
  faqCard: { 
    borderRadius: 16, marginBottom: 12, overflow: 'hidden', 
    borderWidth: 0,
    ...Platform.select({ default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 }})
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  question: { fontSize: 16, flex: 1, marginRight: 12, lineHeight: 22 },
  answerWrap: { padding: 16, paddingTop: 12, borderTopWidth: 1 },
  answer: { fontSize: 15, lineHeight: 24 },
});