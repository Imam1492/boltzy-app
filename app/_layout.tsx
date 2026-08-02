import 'react-native-url-polyfill/auto';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { LanguageProvider } from '../context/LanguageContext';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Session } from '@supabase/supabase-js';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '../context/ThemeContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setIsInitialized(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return; 

    const routeSegments = segments as string[];
    const firstSegment = routeSegments[0];
    const isLoginScreen = routeSegments.length === 0 || firstSegment === 'index' || !firstSegment;
    const isResetScreen = firstSegment === 'reset-password'; 

    if (!session && !isLoginScreen && !isResetScreen) {
      router.replace('/' as any);
    } else if (session && isLoginScreen) {
      router.replace('/home' as any);
    }
  }, [session, segments, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      setTimeout(() => {
        SplashScreen.hideAsync();
      }, 100);
    }
  }, [isInitialized]);

  if (!isInitialized) {
    return null; 
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <Head>
          <title>Boltzy - Buy & Sell Locally</title>
          <meta name="description" content="Buy, sell, and discover amazing local deals near you on Boltzy. India's trusted peer-to-peer marketplace." />
          <meta name="keywords" content="buy, sell, classifieds, used electronics, second hand cars, Hyderabad marketplace, Boltzy" />
          <meta name="robots" content="index, follow" />
          <meta property="og:site_name" content="Boltzy" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="Boltzy - Buy & Sell Locally" />
          <meta property="og:description" content="Buy, sell, and discover amazing local deals near you on Boltzy." />
          <meta property="og:image" content="https://boltzy.in/assets/images/icon.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Boltzy - Buy & Sell Locally" />
          <meta name="twitter:description" content="Buy, sell, and discover amazing local deals near you on Boltzy." />
          <meta name="twitter:image" content="https://boltzy.in/assets/images/icon.png" />
        </Head>

        {/* ✨ Changed to "auto" to automatically support Dark Mode Status Bar */}
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        <Toast />
      </LanguageProvider>
    </ThemeProvider>
  );
}