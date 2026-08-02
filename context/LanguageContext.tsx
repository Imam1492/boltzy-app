import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import i18n, { normalizeLanguage, type SupportedLanguage } from '../i18n';
import { supabase } from '../supabase';

type LanguageContextValue = {
  lang: SupportedLanguage;
  setLang: (language: string) => Promise<void>; // ✨ Updated to async Promise
  t: (key: string, options?: Record<string, unknown>) => string;
  translateUGC: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const LanguageContextBridge = ({ children }: { children: ReactNode }) => {
  const { i18n: i18nInstance } = useTranslation();
  const [isReady, setIsReady] = useState(false); // ✨ NEW: Halts app until language loads

  const lang = normalizeLanguage(i18nInstance.resolvedLanguage ?? i18nInstance.language);

  // ✨ NEW: The Bulletproof Initialization Logic
  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        let savedLang = 'en'; // Default fallback

        // 1. Check if user is logged in
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // 2. Logged In: Fetch from Supabase Profile
          const { data } = await supabase
            .from('profiles')
            .select('language_preference')
            .eq('id', session.user.id)
            .single();
            
          if (data?.language_preference) {
            savedLang = data.language_preference;
          } else {
            // If they are logged in but don't have a cloud preference yet, check local
            const localLang = await AsyncStorage.getItem('appLanguage');
            if (localLang) savedLang = localLang;
          }
        } else {
          // 3. Logged Out: Fetch from local phone storage
          const localLang = await AsyncStorage.getItem('appLanguage');
          if (localLang) savedLang = localLang;
        }

        // Apply the language
        await i18nInstance.changeLanguage(normalizeLanguage(savedLang));
      } catch (error) {
        console.error("Error loading language:", error);
      } finally {
        setIsReady(true); // ✨ Release the app to render!
      }
    };

    initializeLanguage();
  }, [i18nInstance]);

  // 1. Static UI Translator (Powered by your new JSON files)
  const t = (key: string, options?: Record<string, unknown>) =>
    String(i18nInstance.t(key, { defaultValue: key, ...(options ?? {}) }));

  // 2. Temporary Mock AI Translator (Keeps your ad titles working until Phase 2)
  const translateUGC = (text: string) => {
    if (!text || lang === 'en') return text;
    let translated = text;
    
    const mockDict: Record<string, Record<string, string>> = {
      ur: { 
        "iPhone": "آئی فون", "Condition": "حالت", "Hyderabad": "حیدرآباد", "Mumbai": "ممبئی", 
        "Delhi": "دہلی", "Auto (My Location)": "آٹو (میرا مقام)", 
        "Mandi": "منڈی", "Khana": "کھانا", "Qalam": "قلم", 
        "yes": "ہاں", "I'd like to make an offer for this item.": "میں اس آئٹم کے لئے ایک پیشکش کرنا چاہوں گا.",
        "dead skin remover": "مردہ جلد ہٹانے والا" // ✨ ADDED THIS!
      },
      hi: {
        "iPhone": "आईफोन", "Condition": "स्थिति", "Hyderabad": "हैदराबाद", "Mumbai": "मुंबई",
        "Delhi": "दिल्ली", "Auto (My Location)": "ऑटो (मेरा स्थान)",
        "Mandi": "मंडी", "Khana": "खाना", "Qalam": "कलम"
      }
    };

    if (mockDict[lang]) {
      Object.keys(mockDict[lang]).forEach(word => {
        const regex = new RegExp(word, "gi");
        translated = translated.replace(regex, mockDict[lang][word]);
      });
    }
    return translated;
  };

  // ✨ NEW: Upgraded setLang saves to UI, Local Storage, and the Cloud simultaneously
  const setLang = async (language: string) => {
    const normalizedLang = normalizeLanguage(language);
    
    // Instantly update UI
    await i18nInstance.changeLanguage(normalizedLang);
    
    // Save locally
    await AsyncStorage.setItem('appLanguage', normalizedLang);

    // Save to Cloud (if logged in)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from('profiles')
        .update({ language_preference: normalizedLang })
        .eq('id', session.user.id);
    }
  };

  // ✨ NEW: Loading Screen Block
  // Do not render the app until we know what language to use
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, translateUGC }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <LanguageContextBridge>{children}</LanguageContextBridge>
  </I18nextProvider>
);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  
  // ✨ THE FIX: Instead of fatally crashing the app, we provide a safe fallback!
  if (!context) {
    console.warn("⚠️ LanguageContext loaded out of order! Using safe fallback.");
    return {
      lang: 'en',
      t: (key: string) => key, // Just returns the text normally
      translateUGC: (text: string) => text,
      setLang: () => {},
    };
  }
  
  return context;
};