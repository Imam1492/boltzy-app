import 'react-native-url-polyfill/auto';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import { LanguageProvider } from '../context/LanguageContext';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';
import { Session } from '@supabase/supabase-js';
import { preventAutoHideAsync, hideAsync } from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { View, Animated, StyleSheet, Image, StatusBar as RNStatusBar, Dimensions,Platform } from 'react-native';

import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

preventAutoHideAsync().catch(() => {});

function SplashOverlay() {
  const { isDark } = useTheme();
  const splashImage = isDark 
    ? require('../assets/images/splash-light.png') 
    : require('../assets/images/splash-dark.png'); 
  const bgColor = isDark ? '#050014' : '#ffffff';

  return (
    <View style={[styles.oversizeContainer, { backgroundColor: bgColor }]}>
      <Image source={splashImage} style={styles.fullScreenImage} resizeMode="cover" />
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  
  const [fontsLoaded] = useFonts({
    'Jakarta-Regular': PlusJakartaSans_400Regular,
    'Jakarta-Medium': PlusJakartaSans_500Medium,
    'Jakarta-SemiBold': PlusJakartaSans_600SemiBold,
    'Jakarta-Bold': PlusJakartaSans_700Bold,
  });
  
 function ThemedToast() {
  const { colors, isDark } = useTheme();
  
  // Custom Neumorphic popup configurations
  const shadowStyle = Platform.select({ default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }});
  const baseStyle = { backgroundColor: colors.card, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, ...shadowStyle };
  const text1Style = { fontSize: 15, fontWeight: '700', color: colors.text };
  const text2Style = { fontSize: 13, color: colors.textSecondary };

  const toastConfig = {
    success: (props: any) => <BaseToast {...props} style={[{ borderLeftColor: '#34C759' }, baseStyle]} contentContainerStyle={{ paddingHorizontal: 15 }} text1Style={text1Style} text2Style={text2Style} />,
    error: (props: any) => <ErrorToast {...props} style={[{ borderLeftColor: '#FF3B30' }, baseStyle]} text1Style={text1Style} text2Style={text2Style} />,
    info: (props: any) => <BaseToast {...props} style={[{ borderLeftColor: '#007AFF' }, baseStyle]} text1Style={text1Style} text2Style={text2Style} />
  };

  return <Toast config={toastConfig} />;
}

  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [splashVisible, setSplashVisible] = useState(true);

  // 1. Fetch Auth State Safely (Native modules removed for Expo Go)
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

  // 2. Route Guard
  useEffect(() => {
    if (!isInitialized) return; 
    const routeSegments = segments as string[];
    const firstSegment = routeSegments[0];
    const isLoginScreen = routeSegments.length === 0 || firstSegment === 'index' || !firstSegment;
    const isResetScreen = firstSegment === 'reset-password'; 

    const timer = setTimeout(() => {
      if (!session && !isLoginScreen && !isResetScreen) {
        router.replace('/' as any);
      } else if (session && isLoginScreen) {
        router.replace('/home' as any);
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [session, segments, isInitialized, router]);

  // 3. Hide Native Splash IMMEDIATELY
  useEffect(() => {
    const initTimer = setTimeout(() => { hideAsync().catch(() => {}); }, 100);
    return () => clearTimeout(initTimer);
  }, []);

  // 4. Fade Out Custom Splash instantly when fully loaded (NO DELAY)
  useEffect(() => {
    if (isInitialized && fontsLoaded) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250, // 🔥 Snappy 250ms fade instead of 600ms
        useNativeDriver: true,
      }).start(() => { setSplashVisible(false); });
    }
  }, [isInitialized, fontsLoaded, fadeAnim]);
  return (
    <ThemeProvider>
      <LanguageProvider>
        <Head>
          <title>Boltzy - Buy & Sell Locally</title>
        </Head>
        <View style={styles.container}>
         <RNStatusBar translucent backgroundColor="transparent" />
          <StatusBar style={splashVisible ? "light" : "auto"} />
          <Stack screenOptions={{ headerShown: false }} />
          
          {/* ✨ Replaced default <Toast /> with our dynamic theme-aware version */}
          <ThemedToast />
          {splashVisible && (
            <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 99999, opacity: fadeAnim }]} pointerEvents="none">
              <SplashOverlay />
            </Animated.View>
          )}
        </View>
      </LanguageProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  oversizeContainer: { position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT + 200, top: -100, left: 0 },
  fullScreenImage: { width: '100%', height: '100%' },
});