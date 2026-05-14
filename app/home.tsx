import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

import {
  ActivityIndicator, Animated, FlatList, StyleSheet, Text, TouchableOpacity,
  View, Image, Alert, TextInput, ScrollView, Modal, Platform,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import * as Location from 'expo-location';

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
type SortOption  = 'newest' | 'oldest' | 'price_asc' | 'price_desc';
type Condition   = 'All' | 'New' | 'Like New' | 'Gently Used' | 'Used' | 'For Parts';
type PostedWithin = 'All Time' | 'Today' | '3 Days' | 'Week' | 'Month';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const CATEGORIES: string[] = [
  'All','Mobiles','Vehicles','Properties','Electronics',
  'Furniture','Fashion','Bikes','Jobs','Books','Sports','Pets','Other',
];

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'newest',     label: 'Newest First',        icon: 'time-outline'         },
  { key: 'oldest',     label: 'Oldest First',         icon: 'hourglass-outline'    },
  { key: 'price_asc',  label: 'Price: Low to High',   icon: 'trending-up-outline'  },
  { key: 'price_desc', label: 'Price: High to Low',   icon: 'trending-down-outline'},
];

const CONDITIONS: Condition[] = ['All','New','Like New','Gently Used','Used','For Parts'];

const POSTED_WITHIN: PostedWithin[] = ['All Time','Today','3 Days','Week','Month'];

const QUICK_CITIES = [
  'All India','Auto (My Location)','Hyderabad','Mumbai',
  'Delhi','Bengaluru','Chennai','Pune','Telangana',
];

/** @handle for profile card: DB `username`, else slug from display name, else phone-based fallback. */
function resolveProfilePublicHandle(
  username: string | undefined,
  displayName: string | undefined,
  phone: string | undefined,
): string {
  const u = username?.trim();
  if (u) return u;
  const raw = displayName?.trim();
  if (raw) {
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
    if (slug) return slug;
  }
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length >= 4) return `user_${digits.slice(-8)}`;
  return '';
}

const HOME_FEED_CACHE_TTL_MS = 30_000;
const HOME_SAVED_CACHE_TTL_MS = 20_000;
const HOME_LOCATION_CACHE_TTL_MS = 5 * 60_000;

let homeListingsCache: { fetchedAt: number; data: any[] } | null = null;
const homeSavedIdsCache = new Map<string, { fetchedAt: number; data: string[] }>();
let homeLocationCache: { fetchedAt: number; area: string; city: string; state: string } | null = null;

// ─────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  
  // ✨ ACTIVATE BOTH STATIC AND DYNAMIC TRANSLATORS ✨
  const { t, translateUGC } = useLanguage(); 

  // ── Core Data ──────────────────────────────
  const [listings, setListings]               = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [savedIds, setSavedIds]               = useState<string[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // ── Basic Filters ──────────────────────────
  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filteredListings, setFilteredListings] = useState<any[]>([]);

  // ── Advanced Filter & Sort (NEW) ───────────
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [filterTab, setFilterTab]             = useState<'sort' | 'filter'>('sort');
  // Staged (inside modal — only committed on Apply)
  const [stagedSort, setStagedSort]           = useState<SortOption>('newest');
  const [stagedPriceMin, setStagedPriceMin]   = useState('');
  const [stagedPriceMax, setStagedPriceMax]   = useState('');
  const [stagedCondition, setStagedCondition] = useState<Condition>('All');
  const [stagedPostedWithin, setStagedPostedWithin] = useState<PostedWithin>('All Time');
  // Committed (applied to feed)
  const [activeSort, setActiveSort]           = useState<SortOption>('newest');
  const [activePriceMin, setActivePriceMin]   = useState('');
  const [activePriceMax, setActivePriceMax]   = useState('');
  const [activeCondition, setActiveCondition] = useState<Condition>('All');
  const [activePostedWithin, setActivePostedWithin] = useState<PostedWithin>('All Time');

  // ── Location ────────────────────────────────
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [activeLocation, setActiveLocation]   = useState('Auto');
  const [locationSearchInput, setLocationSearchInput] = useState('');
  const [userArea, setUserArea]               = useState('');
  const [userCity, setUserCity]               = useState('');
  const [userState, setUserState]             = useState('');
  const [feedScopeLabel, setFeedScopeLabel]   = useState('Loading nearby ads...');

  // ── Profile / Help ─────────────────────────
  const [isHelpVisible, setIsHelpVisible]     = useState(false);
  const [isProfileMenuVisible, setIsProfileMenuVisible] = useState(false);
  const [profileData, setProfileData]         = useState<any>(null);
  const [loadingProfile, setLoadingProfile]   = useState(false);

  // ── Voice Search ───────────────────────────
  const [isListening, setIsListening]             = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const voicePulse = useRef(new Animated.Value(1)).current;
  const recognitionRef = useRef<any>(null);
  const unreadRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchListingsRef = useRef<(options?: { force?: boolean; pullToRefresh?: boolean }) => Promise<void>>(async () => {});
  const fetchSavedItemsRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const fetchSmartLocationRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const queueUnreadCountRefreshRef = useRef<(userId: string) => void>(() => {});

  const numColumns = Platform.OS === 'web' && width > 1024 ? 4
    : Platform.OS === 'web' && width > 768 ? 3 : 1;

  // ── Active filter count badge ──────────────
  const activeFilterCount = [
    activeSort !== 'newest',
    activePriceMin !== '',
    activePriceMax !== '',
    activeCondition !== 'All',
    activePostedWithin !== 'All Time',
  ].filter(Boolean).length;

  // ─────────────────────────────────────────────
  //  EFFECTS
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (activeLocation === 'Auto' && Platform.OS !== 'web') {
      void fetchSmartLocationRef.current();
    }
  }, [activeLocation]);

  useFocusEffect(useCallback(() => {
    void fetchListingsRef.current();
    void fetchSavedItemsRef.current();
  }, []));

  useFocusEffect(
    useCallback(() => {
      let user: any = null;
      const initNotification = async () => {
        const currentUser = await getCurrentUser();
        if (!currentUser) return;
        user = currentUser;
        await refreshUnreadCount(user.id);
        const channel = supabase.channel('unread_messages_count')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
            queueUnreadCountRefreshRef.current(user.id);
          }).subscribe();
        return channel;
      };
      const channelPromise = initNotification();
      return () => {
        if (unreadRefreshTimeoutRef.current) {
          clearTimeout(unreadRefreshTimeoutRef.current);
          unreadRefreshTimeoutRef.current = null;
        }
        channelPromise.then(channel => { if (channel) supabase.removeChannel(channel); });
      };
    }, [])
  );

  // ─────────────────────────────────────────────
  //  DATA FETCHING
  // ─────────────────────────────────────────────
  function queueUnreadCountRefresh(userId: string) {
    if (unreadRefreshTimeoutRef.current) {
      clearTimeout(unreadRefreshTimeoutRef.current);
    }

    unreadRefreshTimeoutRef.current = setTimeout(() => {
      void refreshUnreadCount(userId);
      unreadRefreshTimeoutRef.current = null;
    }, 250);
  }

  async function refreshUnreadCount(userId: string) {
    const { data: count } = await supabase.rpc('get_unread_chat_count', { p_user_id: userId });
    setUnreadMessagesCount(count || 0);
  }

  const fetchSavedItems = async (force = false) => {
    const user = await getCurrentUser();
    if (!user) return;

    const cached = homeSavedIdsCache.get(user.id);
    if (!force && cached && Date.now() - cached.fetchedAt < HOME_SAVED_CACHE_TTL_MS) {
      setSavedIds(cached.data);
      return;
    }

    const { data } = await supabase.from('wishlist').select('listing_id').eq('user_id', user.id);
    if (data) {
      const nextSavedIds = data.map(item => item.listing_id);
      setSavedIds(nextSavedIds);
      homeSavedIdsCache.set(user.id, { fetchedAt: Date.now(), data: nextSavedIds });
    }
  };

  const fetchSmartLocation = async (force = false) => {
    if (!force && homeLocationCache && Date.now() - homeLocationCache.fetchedAt < HOME_LOCATION_CACHE_TTL_MS) {
      setUserArea(homeLocationCache.area);
      setUserCity(homeLocationCache.city);
      setUserState(homeLocationCache.state);
      applyFilters(
        searchQuery,
        selectedCategory,
        'Auto',
        listings,
        homeLocationCache.area,
        homeLocationCache.city,
        homeLocationCache.state,
        activeSort,
        activePriceMin,
        activePriceMax,
        activeCondition,
        activePostedWithin,
      );
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setActiveLocation('All India'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geocode = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geocode.length > 0) {
        const geo: any = geocode[0];
        const area  = geo.district || geo.subregion || '';
        const city  = geo.city || '';
        const state = geo.region || '';
        setUserArea(area); setUserCity(city); setUserState(state);
        homeLocationCache = { fetchedAt: Date.now(), area, city, state };
        applyFilters(searchQuery, selectedCategory, 'Auto', listings, area, city, state, activeSort, activePriceMin, activePriceMax, activeCondition, activePostedWithin);
      }
    } catch { setActiveLocation('All India'); }
  };

  const fetchListings = async ({ force = false, pullToRefresh = false }: { force?: boolean; pullToRefresh?: boolean } = {}) => {
    if (!force && homeListingsCache && Date.now() - homeListingsCache.fetchedAt < HOME_FEED_CACHE_TTL_MS) {
      setListings(homeListingsCache.data);
      applyFilters(
        searchQuery,
        selectedCategory,
        activeLocation,
        homeListingsCache.data,
        userArea,
        userCity,
        userState,
        activeSort,
        activePriceMin,
        activePriceMax,
        activeCondition,
        activePostedWithin,
      );
      setLoading(false);
      return;
    }

    if (pullToRefresh) {
      setRefreshing(true);
    } else if (listings.length === 0) {
      setLoading(true);
    }

    const { data, error } = await supabase
      .from('listings')
      .select('id, title, price, location, description, category, condition, image_urls, created_at')
      .eq('is_sold', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      homeListingsCache = { fetchedAt: Date.now(), data };
      setListings(data);
      applyFilters(searchQuery, selectedCategory, activeLocation, data, userArea, userCity, userState, activeSort, activePriceMin, activePriceMax, activeCondition, activePostedWithin);
    }
    setLoading(false);
    setRefreshing(false);
  };

  // ─────────────────────────────────────────────
  //  MASTER FILTER ENGINE 
  // ─────────────────────────────────────────────
  const applyFilters = (
    query:        string,
    category:     string,
    locationSetting: string,
    sourceData    = listings,
    area          = userArea,
    city          = userCity,
    state         = userState,
    sort          = activeSort,
    priceMin      = activePriceMin,
    priceMax      = activePriceMax,
    condition     = activeCondition,
    postedWithin  = activePostedWithin,
  ) => {
    let result = [...sourceData];

    // 1. Category
    if (category !== 'All') result = result.filter(i => i.category === category);

    // 2. Text search
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.location?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      );
    }

    // 3. Price range
    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    if (!isNaN(min)) result = result.filter(i => parseFloat(i.price) >= min);
    if (!isNaN(max)) result = result.filter(i => parseFloat(i.price) <= max);

    // 4. Condition
    if (condition !== 'All') result = result.filter(i => i.condition === condition);

    // 5. Posted within
    if (postedWithin !== 'All Time') {
      const now = Date.now();
      const msMap: Record<string, number> = {
        'Today':  1 * 24 * 3600 * 1000,
        '3 Days': 3 * 24 * 3600 * 1000,
        'Week':   7 * 24 * 3600 * 1000,
        'Month': 30 * 24 * 3600 * 1000,
      };
      const cutoff = now - (msMap[postedWithin] || 0);
      result = result.filter(i => new Date(i.created_at).getTime() >= cutoff);
    }

    // 6. Location
    if (locationSetting === 'All India') {
      setFeedScopeLabel('Showing ads from All India');
    } else if (locationSetting !== 'Auto') {
      const locFilter = result.filter(i => i.location?.toLowerCase().includes(locationSetting.toLowerCase()));
      if (locFilter.length > 0) {
        result = locFilter;
        setFeedScopeLabel(`Showing ads from ${locationSetting}`);
      } else {
        setFeedScopeLabel(`No ads in ${locationSetting}. Showing All India.`);
      }
    } else {
      if (area) {
        const m = result.filter(i => i.location?.toLowerCase().includes(area.toLowerCase()));
        if (m.length) { result = m; setFeedScopeLabel(`Showing ads near your area (${area})`); }
        else if (city) {
          const m2 = result.filter(i => i.location?.toLowerCase().includes(city.toLowerCase()));
          if (m2.length) { result = m2; setFeedScopeLabel(`Expanding search to your city (${city})`); }
          else if (state) {
            const m3 = result.filter(i => i.location?.toLowerCase().includes(state.toLowerCase()));
            if (m3.length) { result = m3; setFeedScopeLabel(`Expanding search to your state (${state})`); }
            else setFeedScopeLabel('No local ads found. Showing All India.');
          } else setFeedScopeLabel('No local ads found. Showing All India.');
        } else setFeedScopeLabel('No local ads found. Showing All India.');
      } else if (city) {
        const m = result.filter(i => i.location?.toLowerCase().includes(city.toLowerCase()));
        if (m.length) { result = m; setFeedScopeLabel(`Expanding search to your city (${city})`); }
        else setFeedScopeLabel('No local ads found. Showing All India.');
      } else setFeedScopeLabel('No local ads found. Showing All India.');
    }

    // 7. Sort
    switch (sort) {
      case 'price_asc':  result.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));       break;
      case 'price_desc': result.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));       break;
      case 'oldest':     result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      default:           result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }

    setFilteredListings(result);
  };

  // ─────────────────────────────────────────────
  //  FILTER MODAL ACTIONS
  // ─────────────────────────────────────────────
  const openFilterModal = () => {
    setStagedSort(activeSort);
    setStagedPriceMin(activePriceMin);
    setStagedPriceMax(activePriceMax);
    setStagedCondition(activeCondition);
    setStagedPostedWithin(activePostedWithin);
    setFilterTab('sort');
    setIsFilterModalVisible(true);
  };

  const applyFilterModal = () => {
    setActiveSort(stagedSort);
    setActivePriceMin(stagedPriceMin);
    setActivePriceMax(stagedPriceMax);
    setActiveCondition(stagedCondition);
    setActivePostedWithin(stagedPostedWithin);
    setIsFilterModalVisible(false);
    applyFilters(
      searchQuery, selectedCategory, activeLocation,
      listings, userArea, userCity, userState,
      stagedSort, stagedPriceMin, stagedPriceMax, stagedCondition, stagedPostedWithin,
    );
  };

  const resetFilterModal = () => {
    setStagedSort('newest');
    setStagedPriceMin('');
    setStagedPriceMax('');
    setStagedCondition('All');
    setStagedPostedWithin('All Time');
  };

  const clearAllFilters = () => {
    setActiveSort('newest');
    setActivePriceMin('');
    setActivePriceMax('');
    setActiveCondition('All');
    setActivePostedWithin('All Time');
    applyFilters(searchQuery, selectedCategory, activeLocation, listings, userArea, userCity, userState, 'newest', '', '', 'All', 'All Time');
  };

  const removeChip = (type: string) => {
    const ns = type === 'sort'     ? 'newest'   : activeSort;
    const nc = type === 'condition'? 'All'       : activeCondition;
    const np = type === 'posted'   ? 'All Time'  : activePostedWithin;
    const nMin = type === 'price'  ? ''          : activePriceMin;
    const nMax = type === 'price'  ? ''          : activePriceMax;
    setActiveSort(ns as SortOption);
    setActiveCondition(nc as Condition);
    setActivePostedWithin(np as PostedWithin);
    setActivePriceMin(nMin);
    setActivePriceMax(nMax);
    applyFilters(searchQuery, selectedCategory, activeLocation, listings, userArea, userCity, userState, ns as SortOption, nMin, nMax, nc as Condition, np as PostedWithin);
  };

  // ─────────────────────────────────────────────
  //  LOCATION & PROFILE HELPERS
  // ─────────────────────────────────────────────
  const updateLocation = (newLocation: string) => {
    if (!newLocation.trim()) return;
    const clean = newLocation === 'Auto (My Location)' ? 'Auto' : newLocation;
    setActiveLocation(clean);
    setIsLocationModalVisible(false);
    setLocationSearchInput('');
    applyFilters(searchQuery, selectedCategory, clean);
  };

  const onCategoryPress = (category: string) => {
    setSelectedCategory(category);
    applyFilters(searchQuery, category, activeLocation);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(text, selectedCategory, activeLocation);
  };

  // ── Voice Search ─────────────────────────────────────────────────────────
  const startVoiceSearch = async () => {
    if (Platform.OS === 'web') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        Alert.alert('Not Supported', 'Voice search is not supported in this browser. Try Chrome or Edge.');
        return;
      }
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang         = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceModalVisible(true);
        startPulse();
      };
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        stopVoiceSearch();
        handleSearch(transcript);
      };
      recognition.onerror = () => stopVoiceSearch();
      recognition.onend   = () => stopVoiceSearch();
      recognition.start();
    } else {
      setIsListening(true);
      setVoiceModalVisible(true);
      startPulse();

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Voice = require('@react-native-voice/voice').default;
        Voice.onSpeechResults = (e: any) => {
          const transcript = e.value?.[0] || '';
          stopVoiceSearch();
          if (transcript) handleSearch(transcript);
        };
        Voice.onSpeechError = () => stopVoiceSearch();
        Voice.start('en-IN');
        recognitionRef.current = Voice;
      } catch {
        setTimeout(() => {
          stopVoiceSearch();
          Alert.alert(
            'Voice Search',
            'For voice search on mobile, run:\nnpx expo install @react-native-voice/voice',
          );
        }, 3000);
      }
    }
  };

  const stopVoiceSearch = () => {
    setIsListening(false);
    setVoiceModalVisible(false);
    voicePulse.setValue(1);
    if (recognitionRef.current) {
      try {
        if (Platform.OS === 'web') {
          recognitionRef.current.stop?.();
        } else {
          recognitionRef.current.stop?.();
          recognitionRef.current.destroy?.();
        }
      } catch {}
      recognitionRef.current = null;
    }
  };

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(voicePulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const openProfileModal = async () => {
    setIsProfileMenuVisible(true);
    setLoadingProfile(true);
    const user = await getCurrentUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfileData({ email: user.email, phone: user.phone, name: data?.display_name || '', username: data?.username || '', avatar_url: data?.avatar_url || '' });
    }
    setLoadingProfile(false);
  };

  const handleLogout = async () => {
    setIsProfileMenuVisible(false);
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout of Boltzy?')) {
        await supabase.auth.signOut(); router.replace('/');
      }
    } else {
      Alert.alert('Logout','Are you sure you want to logout of Boltzy?',[
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/'); } },
      ]);
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Permanently delete your account? This cannot be undone.')) executeDelete();
    } else {
      Alert.alert('Delete Account','Permanently delete your account? This cannot be undone.',[
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: executeDelete },
      ]);
    }
  };

  const executeDelete = async () => {
    const user = await getCurrentUser();
    if (user) {
      await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', user.id);
      await supabase.auth.signOut(); router.replace('/');
    }
  };

  const handleManualRefresh = async () => {
    await Promise.all([
      fetchListings({ force: true, pullToRefresh: true }),
      fetchSavedItems(true),
    ]);
  };

  const toggleWishlist = async (listingId: string) => {
    const user = await getCurrentUser();
    if (!user) return Alert.alert('Login Required','Please log in to save items.');
    const isSaved = savedIds.includes(listingId);
    if (isSaved) {
      const nextSavedIds = savedIds.filter(id => id !== listingId);
      setSavedIds(nextSavedIds);
      homeSavedIdsCache.set(user.id, { fetchedAt: Date.now(), data: nextSavedIds });
      await supabase.from('wishlist').delete().match({ user_id: user.id, listing_id: listingId });
    } else {
      const nextSavedIds = [...savedIds, listingId];
      setSavedIds(nextSavedIds);
      homeSavedIdsCache.set(user.id, { fetchedAt: Date.now(), data: nextSavedIds });
      await supabase.from('wishlist').insert({ user_id: user.id, listing_id: listingId });
    }
  };

  // ─────────────────────────────────────────────
  //  RENDER HELPERS
  // ─────────────────────────────────────────────
  fetchListingsRef.current = fetchListings;
  fetchSavedItemsRef.current = fetchSavedItems;
  fetchSmartLocationRef.current = fetchSmartLocation;
  queueUnreadCountRefreshRef.current = queueUnreadCountRefresh;

  const ActiveChips = () => {
    const chips: { key: string; label: string }[] = [];
    if (activeSort !== 'newest') chips.push({ key: 'sort', label: SORT_OPTIONS.find(s => s.key === activeSort)?.label || '' });
    if (activePriceMin || activePriceMax) chips.push({ key: 'price', label: `₹${activePriceMin || '0'} – ₹${activePriceMax || '∞'}` });
    if (activeCondition !== 'All') chips.push({ key: 'condition', label: activeCondition });
    if (activePostedWithin !== 'All Time') chips.push({ key: 'posted', label: activePostedWithin });
    if (!chips.length) return null;
    return (
      <View style={styles.activeChipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
          {chips.map(chip => (
            <TouchableOpacity key={chip.key} style={styles.activeChip} onPress={() => removeChip(chip.key)}>
              {/* ✨ TRANSLATE ACTIVE FILTER CHIPS ✨ */}
              <Text style={styles.activeChipText}>{translateUGC(chip.label)}</Text>
              <Ionicons name="close" size={13} color="#fff" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.clearAllChip} onPress={clearAllFilters}>
            {/* ✨ TRANSLATE CLEAR ALL ✨ */}
            <Text style={styles.clearAllChipText}>{t('clear_filters')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls?.length > 0 ? item.image_urls[0] : null;
    return (
      <TouchableOpacity
        style={[styles.card, numColumns > 1 && { flex: 1, maxWidth: `${100 / numColumns}%` as any }]}
        onPress={() => router.push(('/listing/' + item.id) as any)}
      >
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={styles.imagePlaceholder} />
          : <View style={styles.imagePlaceholder} />
        }
        <View style={styles.cardContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.price}>₹{item.price}</Text>
            <TouchableOpacity onPress={() => toggleWishlist(item.id)}>
              <Ionicons
                name={savedIds.includes(item.id) ? 'heart' : 'heart-outline'}
                size={26}
                color={savedIds.includes(item.id) ? '#FF3B30' : '#666'}
              />
            </TouchableOpacity>
          </View>
          {/* ✨ TRANSLATE AD TITLE ✨ */}
          <Text style={styles.title} numberOfLines={1}>{translateUGC(item.title)}</Text>
          {item.condition && item.condition !== 'All' && (
            <View style={styles.conditionBadge}>
              {/* ✨ TRANSLATE CONDITION ✨ */}
              <Text style={styles.conditionBadgeText}>{translateUGC(item.condition)}</Text>
            </View>
          )}
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#666" />
            {/* ✨ TRANSLATE LOCATION ✨ */}
            <Text style={styles.location} numberOfLines={1}>{translateUGC(item.location)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <View style={styles.container}>

    {/* ── HEADER ────────────────────────────── */}
      <View style={styles.header}>
        {/* ✨ TRANSLATE BOLTZY LOGO ✨ */}
        <Text style={styles.headerTitle}>{t('app_title')}</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {(Platform.OS === 'web' || width > 768) && (
            <>
              <TouchableOpacity onPress={() => router.push('/chats' as any)}>
                <Ionicons name="chatbubbles-outline" size={26} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/post')}>
                <Ionicons name="add-circle-outline" size={28} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/saved' as any)}>
                <Ionicons name="heart-outline" size={26} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/my-ads' as any)}>
                <Ionicons name="list-circle-outline" size={26} color="#000" />
              </TouchableOpacity>
            </>
          )}
          
          <TouchableOpacity onPress={() => setIsHelpVisible(true)}>
            <Ionicons name="help-circle-outline" size={26} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/profile' as any)}>
            <Ionicons name="settings-outline" size={28} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity onPress={openProfileModal}>
            <Ionicons name="person-circle-outline" size={28} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── LOCATION BAR ──────────────────────── */}
      <View style={styles.locationSelectorBar}>
        <TouchableOpacity style={styles.locationSelectorBtn} onPress={() => setIsLocationModalVisible(true)}>
          <Ionicons name="location" size={20} color="#000" />
          {/* ✨ TRANSLATE ACTIVE LOCATION ✨ */}
          <Text style={styles.locationSelectorText} numberOfLines={1}>
            {translateUGC(activeLocation === 'Auto' ? (userArea || userCity || 'Auto (My Location)') : activeLocation)}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#666" />
        </TouchableOpacity>
      </View>

      {/* ── SEARCH + FILTER ROW ───────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={{ marginRight: 10 }} />
            {/* ✨ TRANSLATE SEARCH PLACEHOLDER ✨ */}
            <TextInput
              style={styles.searchInput}
              placeholder={t('home_search')}
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')} style={{ padding: 5 }}>
                <Ionicons name="close-circle" size={20} color="#ccc" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={isListening ? stopVoiceSearch : startVoiceSearch}
              style={[styles.micBtn, isListening && styles.micBtnActive]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={20} color={isListening ? '#fff' : '#666'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]} onPress={openFilterModal}>
            <Ionicons name="options" size={20} color={activeFilterCount > 0 ? '#fff' : '#000'} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── VOICE SEARCH MODAL ────────────────── */}
      <Modal visible={voiceModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.voiceOverlay} activeOpacity={1} onPress={stopVoiceSearch}>
          <View style={styles.voiceCard}>
            <Animated.View style={[styles.voicePulseRing, { transform: [{ scale: voicePulse }] }]} />
            <View style={styles.voiceMicCircle}>
              <Ionicons name="mic" size={36} color="#fff" />
            </View>
            {/* ✨ TRANSLATE VOICE MODAL TEXT ✨ */}
            <Text style={styles.voiceListeningText}>{t('Listening...')}</Text>
            <Text style={styles.voiceHintText}>{t("Speak now — say what you're looking for")}</Text>
            <TouchableOpacity style={styles.voiceCancelBtn} onPress={stopVoiceSearch}>
              <Text style={styles.voiceCancelText}>{t('Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── CATEGORY PILLS ────────────────────── */}
      <View style={styles.categorySection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScrollContainer}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => onCategoryPress(cat)}
              style={[styles.categoryCapsule, selectedCategory === cat && styles.categoryCapsuleSelected]}
            >
              {/* ✨ TRANSLATE CATEGORY TABS ✨ */}
              <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextSelected]}>
                {t(`cat_${cat}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── ACTIVE FILTER CHIPS ───────────────── */}
      <ActiveChips />

      {/* ── FEED SCOPE BANNER ─────────────────── */}
      {!loading && filteredListings.length > 0 && (
        <View style={styles.scopeBanner}>
          <Ionicons name="information-circle-outline" size={14} color="#666" />
          {/* ✨ TRANSLATE DYNAMIC SCOPE BANNER ✨ */}
          <Text style={styles.scopeText}>{translateUGC(feedScopeLabel)}</Text>
          {activeFilterCount > 0 && (
            <Text style={styles.scopeFilterNote}> · {filteredListings.length} results</Text>
          )}
        </View>
      )}

      {/* ── FEED ──────────────────────────────── */}
      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
      ) : filteredListings.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrapper}>
            <Ionicons name="search-outline" size={44} color="#ccc" />
          </View>
          {/* ✨ TRANSLATE EMPTY STATE TEXT ✨ */}
          <Text style={styles.emptyTitle}>{t('no_results')}</Text>
          <Text style={styles.emptySubtitle}>{t('Try adjusting your filters or search term')}</Text>
          <View style={styles.emptyActions}>
            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.emptyActionBtn} onPress={clearAllFilters}>
                <Ionicons name="options" size={16} color="#007AFF" />
                <Text style={styles.emptyActionText}>{t('clear_filters')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.emptyActionBtn, { backgroundColor: '#f0f0f0' }]} onPress={() => updateLocation('All India')}>
              <Ionicons name="earth" size={16} color="#000" />
              <Text style={[styles.emptyActionText, { color: '#000' }]}>{t('all_india')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
          data={filteredListings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onRefresh={handleManualRefresh}
          refreshing={refreshing}
          extraData={savedIds}
        />
      )}

      {/* ── BOTTOM TAB BAR ────────────────────── */}
      {Platform.OS !== 'web' && width <= 768 && (
        <View style={styles.bottomTabBar}>
          <TouchableOpacity style={styles.tabItem} onPress={() => {}}>
            <Ionicons name="home" size={24} color="#000" />
            {/* ✨ TRANSLATE BOTTOM TABS ✨ */}
            <Text style={[styles.tabText, { color: '#000', fontWeight: 'bold' }]}>{t('tab_home')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/chats' as any)}>
            <View>
              <Ionicons name="chatbubbles-outline" size={24} color="#666" />
              {unreadMessagesCount > 0 && (
                <View style={styles.notificationBadgeBottom}>
                  <Text style={styles.badgeText}>{unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tabText}>{t('tab_chats')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItemPost} onPress={() => router.push('/post')}>
            <View style={styles.postTabCircle}><Ionicons name="add" size={32} color="#fff" /></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/saved' as any)}>
            <Ionicons name="heart-outline" size={24} color="#666" />
            <Text style={styles.tabText}>{t('tab_saved')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/my-ads' as any)}>
            <Ionicons name="list-outline" size={24} color="#666" />
            <Text style={styles.tabText}>{t('tab_my_ads')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ════════════════════════════════════════
          FILTER & SORT MODAL  
      ════════════════════════════════════════ */}
      <Modal visible={isFilterModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsFilterModalVisible(false)} />
          <View style={styles.filterModalCard}>

            <View style={styles.modalHandle} />

            <View style={styles.filterModalHeader}>
              {/* ✨ TRANSLATE MODAL HEADER ✨ */}
              <Text style={styles.filterModalTitle}>{t('sort_filter')}</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)} style={styles.filterModalClose}>
                <Ionicons name="close" size={22} color="#000" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterTabRow}>
              <TouchableOpacity
                style={[styles.filterTab, filterTab === 'sort' && styles.filterTabActive]}
                onPress={() => setFilterTab('sort')}
              >
                <Ionicons name="swap-vertical" size={16} color={filterTab === 'sort' ? '#fff' : '#666'} style={{ marginRight: 6 }} />
                {/* ✨ TRANSLATE SORT TAB ✨ */}
                <Text style={[styles.filterTabText, filterTab === 'sort' && styles.filterTabTextActive]}>{t('Sort')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filterTab === 'filter' && styles.filterTabActive]}
                onPress={() => setFilterTab('filter')}
              >
                <Ionicons name="options" size={16} color={filterTab === 'filter' ? '#fff' : '#666'} style={{ marginRight: 6 }} />
                {/* ✨ TRANSLATE FILTER TAB ✨ */}
                <Text style={[styles.filterTabText, filterTab === 'filter' && styles.filterTabTextActive]}>{t('filter')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {filterTab === 'sort' && (
                <View style={styles.filterSection}>
                  {/* ✨ TRANSLATE SORT BY ✨ */}
                  <Text style={styles.filterSectionTitle}>{t('sort_by')}</Text>
                  {SORT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.sortRow, stagedSort === opt.key && styles.sortRowActive]}
                      onPress={() => setStagedSort(opt.key)}
                    >
                      <View style={[styles.sortIconWrap, stagedSort === opt.key && styles.sortIconWrapActive]}>
                        <Ionicons name={opt.icon as any} size={18} color={stagedSort === opt.key ? '#fff' : '#555'} />
                      </View>
                      {/* ✨ TRANSLATE SORT LABELS ✨ */}
                     <Text style={[styles.sortLabel, stagedSort === opt.key && styles.sortLabelActive]}>
    {t(opt.label)} 
  </Text>
                      {stagedSort === opt.key
                        ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" style={{ marginLeft: 'auto' }} />
                        : <View style={styles.radioUnchecked} />
                      }
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {filterTab === 'filter' && (
                <>
                  <View style={styles.filterSection}>
                    {/* ✨ TRANSLATE PRICE RANGE ✨ */}
                    <Text style={styles.filterSectionTitle}>{t('price_range')}</Text>
                    <View style={styles.priceInputRow}>
                      <View style={styles.priceInputWrap}>
                        <Text style={styles.priceInputLabel}>Min</Text>
                        <TextInput
                          style={styles.priceInput}
                          keyboardType="numeric"
                          placeholder="₹ 0"
                          value={stagedPriceMin}
                          onChangeText={setStagedPriceMin}
                        />
                      </View>
                      <View style={styles.priceDash}><Text style={styles.priceDashText}>—</Text></View>
                      <View style={styles.priceInputWrap}>
                        <Text style={styles.priceInputLabel}>Max</Text>
                        <TextInput
                          style={styles.priceInput}
                          keyboardType="numeric"
                          placeholder="₹ Any"
                          value={stagedPriceMax}
                          onChangeText={setStagedPriceMax}
                        />
                      </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[['Under ₹500','','500'],['₹500–₹2K','500','2000'],['₹2K–₹10K','2000','10000'],['₹10K–₹50K','10000','50000'],['₹50K+','50000','']].map(([label, mn, mx]) => (
                          <TouchableOpacity
                            key={label}
                            style={[styles.presetChip, stagedPriceMin === mn && stagedPriceMax === mx && styles.presetChipActive]}
                            onPress={() => { setStagedPriceMin(mn); setStagedPriceMax(mx); }}
                          >
                            {/* ✨ TRANSLATE PRESET CHIPS ✨ */}
                            <Text style={[styles.presetChipText, stagedPriceMin === mn && stagedPriceMax === mx && styles.presetChipTextActive]}>{translateUGC(label)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  <View style={styles.filterSection}>
                    {/* ✨ TRANSLATE CONDITION ✨ */}
                    <Text style={styles.filterSectionTitle}>{t('condition')}</Text>
                    <View style={styles.conditionGrid}>
                      {CONDITIONS.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.conditionChip, stagedCondition === c && styles.conditionChipActive]}
                          onPress={() => setStagedCondition(c)}
                        >
                          {/* ✨ TRANSLATE CONDITIONS ✨ */}
                          <Text style={[styles.conditionChipText, stagedCondition === c && styles.conditionChipTextActive]}>{translateUGC(c)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.filterSection, { borderBottomWidth: 0 }]}>
                    {/* ✨ TRANSLATE POSTED WITHIN ✨ */}
                    <Text style={styles.filterSectionTitle}>{t('posted_within')}</Text>
                    {POSTED_WITHIN.map((pw) => (
                      <TouchableOpacity
                        key={pw}
                        style={[styles.postedRow, stagedPostedWithin === pw && styles.postedRowActive]}
                        onPress={() => setStagedPostedWithin(pw)}
                      >
                        {/* ✨ TRANSLATE POSTED WITHIN OPTIONS ✨ */}
                        <Text style={[styles.postedLabel, stagedPostedWithin === pw && styles.postedLabelActive]}>{translateUGC(pw)}</Text>
                        {stagedPostedWithin === pw
                          ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                          : <View style={styles.radioUnchecked} />
                        }
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilterModal}>
                {/* ✨ TRANSLATE RESET BUTTON ✨ */}
                <Text style={styles.resetBtnText}>{t('reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilterModal}>
                {/* ✨ TRANSLATE APPLY BUTTON ✨ */}
                <Text style={styles.applyBtnText}>{t('apply_filters')}</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════
          PROFILE MODAL 
      ════════════════════════════════════════ */}
      <Modal visible={isProfileMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.fullScreenModalOverlay} activeOpacity={1} onPress={() => setIsProfileMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.fullProfileCard}>
            <View style={styles.profileModalHeader}>
              {/* ✨ TRANSLATE ACC DETAILS ✨ */}
              <Text style={styles.profileModalTitle}>{t('acc_details')}</Text>
              <TouchableOpacity onPress={() => setIsProfileMenuVisible(false)}>
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>
            {loadingProfile ? (
              <ActivityIndicator size="large" color="#000" style={{ marginTop: 50 }} />
            ) : (
              <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                <View style={styles.profileAvatarLarge}>
                  {profileData?.avatar_url
                    ? <Image source={{ uri: profileData.avatar_url }} style={styles.profileAvatarImage} />
                    : <Text style={styles.profileAvatarTextLarge}>{profileData?.name ? profileData.name.charAt(0).toUpperCase() : 'U'}</Text>
                  }
                </View>
                {/* ✨ TRANSLATE FALLBACK NAME ✨ */}
                <Text style={styles.profileModalName}>{profileData?.name || t('Setup your name')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                  {(() => {
                    const handle = resolveProfilePublicHandle(
                      profileData?.username,
                      profileData?.name,
                      profileData?.phone,
                    );
                    return handle ? (
                      <Text style={styles.profileModalUsername}>@{handle}</Text>
                    ) : (
                      <Text style={[styles.profileModalUsername, { color: '#999' }]}>{t('profile_no_username')}</Text>
                    );
                  })()}
                  <TouchableOpacity style={{ marginLeft: 8, padding: 4 }} onPress={() => { setIsProfileMenuVisible(false); router.push('/profile' as any); }}>
                    <Ionicons name="pencil" size={16} color="#007AFF" />
                  </TouchableOpacity>
                </View>
                <View style={styles.profileDetailsBox}>
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="mail" size={20} color="#666" />
                    <Text style={styles.profileDetailText}>{profileData?.email || t('profile_no_email')}</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="call" size={20} color="#666" />
                    <Text style={styles.profileDetailText}>{profileData?.phone || t('profile_no_phone')}</Text>
                  </View>
                </View>
                <View style={styles.profileActionDivider} />
                <TouchableOpacity style={styles.profileActionBtn} onPress={handleLogout}>
                  <View style={styles.profileActionIconWrap}><Ionicons name="log-out" size={22} color="#000" /></View>
                  {/* ✨ TRANSLATE LOGOUT ✨ */}
                  <Text style={styles.profileActionText}>{t('logout')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileActionBtnDanger} onPress={handleDeleteAccount}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: '#ffebee' }]}><Ionicons name="trash" size={22} color="#FF3B30" /></View>
                  {/* ✨ TRANSLATE DELETE ACC ✨ */}
                  <Text style={styles.profileActionTextDanger}>{t('delete_acc')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ════════════════════════════════════════
          LOCATION MODAL 
      ════════════════════════════════════════ */}
      <Modal visible={isLocationModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.locationModalCard}>
            <View style={styles.helpHeader}>
              {/* ✨ TRANSLATE SELECT LOCATION ✨ */}
              <Text style={styles.helpTitle}>{t('select_loc')}</Text>
              <TouchableOpacity onPress={() => setIsLocationModalVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.locationSearchBox}>
              <Ionicons name="search" size={20} color="#999" style={{ marginRight: 10 }} />
              {/* ✨ TRANSLATE LOCATION INPUT PLACEHOLDER ✨ */}
             <TextInput
    style={styles.searchInput}
    placeholder={t('type_city_state')} // ✨ Translated Placeholder
    value={locationSearchInput}
    onChangeText={setLocationSearchInput}
    onSubmitEditing={() => updateLocation(locationSearchInput)}
    returnKeyType="search"
    autoFocus
  />
  <TouchableOpacity onPress={() => updateLocation(locationSearchInput)} style={styles.applyLocBtn}>
    <Text style={styles.applyLocText}>{t('apply')}</Text> {/* ✨ Translated Apply */}
  </TouchableOpacity>
</View>

<Text style={styles.sectionSubTitle}>{t('pop_loc')}</Text>
<View style={styles.quickCitiesWrapper}>
  {QUICK_CITIES.map((city) => (
    <TouchableOpacity key={city} style={styles.quickCityChip} onPress={() => updateLocation(city)}>
      {city === 'Auto (My Location)' && <Ionicons name="locate" size={14} color="#007AFF" style={{ marginRight: 4 }} />}
      {/* ✨ OLD: {translateUGC(city)} ---> NEW: {t(city)} ✨ */}
      <Text style={[styles.quickCityText, city === 'Auto (My Location)' && { color: '#007AFF', fontWeight: 'bold' }]}>
        {t(city)}
      </Text>
    </TouchableOpacity>
  ))}
</View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════
          HELP MODAL 
      ════════════════════════════════════════ */}
      <Modal visible={isHelpVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsHelpVisible(false)}>
          <View style={styles.helpMenuCard}>
            <View style={styles.helpHeader}>
              {/* ✨ TRANSLATE HELP TITLE ✨ */}
              <Text style={styles.helpTitle}>{t('support')}</Text>
              <TouchableOpacity onPress={() => setIsHelpVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.helpOption} onPress={() => { setIsHelpVisible(false); Alert.alert('Safety Tips','1. Never pay in advance.\n2. Meet in public places.\n3. Inspect items before buying.'); }}>
              <View style={[styles.helpIconCircle, { backgroundColor: '#4CAF50' }]}><Ionicons name="shield-checkmark" size={20} color="#fff" /></View>
              {/* ✨ TRANSLATE SAFETY TIPS ✨ */}
              <Text style={styles.helpOptionText}>{t('safety_tips')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helpOption} onPress={() => { setIsHelpVisible(false); Alert.alert('Contact Support','Email us at support@boltzy.in for any disputes or account issues.'); }}>
              <View style={[styles.helpIconCircle, { backgroundColor: '#2196F3' }]}><Ionicons name="mail" size={20} color="#fff" /></View>
              {/* ✨ TRANSLATE EMAIL SUPPORT ✨ */}
              <Text style={styles.helpOptionText}>{t('email_support')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Layout ────────────────────────────────
  container:        { flex: 1, backgroundColor: '#f5f5f5' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingTop: Platform.OS === 'ios' ? 50 : 20, backgroundColor: '#fff' },
  headerTitle:      { fontSize: 26, fontWeight: 'bold', color: '#000', letterSpacing: -0.5 },

  // ── Location bar ──────────────────────────
  locationSelectorBar:  { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 10 },
  locationSelectorBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationSelectorText: { fontSize: 16, fontWeight: 'bold', color: '#000', maxWidth: 250 },

  // ── Search + filter ───────────────────────
  searchSection:     { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#fff' },
  searchRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchContainer:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 15, height: 48 },
  searchInput:       { flex: 1, fontSize: 15, color: '#000' },
  filterBtn:         { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e5e5e5' },
  filterBtnActive:   { backgroundColor: '#000', borderColor: '#000' },
  filterBadge:       { position: 'absolute', top: -4, right: -4, backgroundColor: '#007AFF', borderRadius: 9, width: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  filterBadgeText:   { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // ── Mic / Voice search ─────────────────────
  micBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center',
    marginLeft: 4,
  },
  micBtnActive: { backgroundColor: '#FF3B30' },
  voiceOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  voiceCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 40,
    alignItems: 'center', width: '80%',
    ...Platform.select({ web: { boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }, default: { elevation: 20 } }),
  },
  voicePulseRing: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,59,48,0.15)',
  },
  voiceMicCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({ web: { boxShadow: '0 4px 20px rgba(255,59,48,0.4)' }, default: { elevation: 8 } }),
  },
  voiceListeningText: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 8 },
  voiceHintText:      { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  voiceCancelBtn:     { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, backgroundColor: '#f0f0f0' },
  voiceCancelText:    { fontSize: 15, fontWeight: '600', color: '#333' },

  // ── Categories ────────────────────────────
  categorySection:         { backgroundColor: '#fff', paddingBottom: 10, paddingTop: 5 },
  categoryScrollContainer: { paddingHorizontal: 16, gap: 8 },
  categoryCapsule:         { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee' },
  categoryCapsuleSelected: { backgroundColor: '#000', borderColor: '#000' },
  categoryText:            { fontSize: 13, color: '#666', fontWeight: '500' },
  categoryTextSelected:    { color: '#fff', fontWeight: 'bold' },

  // ── Active chips ──────────────────────────
  activeChipsRow:     { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  activeChip:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  activeChipText:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  clearAllChip:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#ddd' },
  clearAllChipText:   { color: '#666', fontSize: 12, fontWeight: '600' },

  // ── Scope banner ──────────────────────────
  scopeBanner:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  scopeText:          { fontSize: 12, color: '#666', fontStyle: 'italic' },
  scopeFilterNote:    { fontSize: 12, color: '#007AFF', fontWeight: '600' },

  // ── Feed ──────────────────────────────────
  listContainer: { padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0px 4px 8px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }),
  },
  imagePlaceholder: { height: 180, backgroundColor: '#e0e0e0' },
  cardContent:      { padding: 14 },
  price:            { fontSize: 20, fontWeight: 'bold', color: '#000' },
  title:            { fontSize: 15, color: '#333', marginBottom: 4 },
  conditionBadge:   { alignSelf: 'flex-start', backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  conditionBadgeText: { fontSize: 11, color: '#555', fontWeight: '600' },
  locationRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location:         { fontSize: 12, color: '#666' },

  // ── Empty state ───────────────────────────
  emptyState:        { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyIconWrapper:  { width: 96, height: 96, borderRadius: 48, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:        { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  emptySubtitle:     { fontSize: 14, color: '#999', marginBottom: 24, textAlign: 'center', paddingHorizontal: 32 },
  emptyActions:      { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  emptyActionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#e8f0fe', borderRadius: 20 },
  emptyActionText:   { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  // ── Bottom tab bar ────────────────────────
  bottomTabBar:           { flexDirection: 'row', height: Platform.OS === 'ios' ? 85 : 70, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingHorizontal: 5, alignItems: 'flex-start', paddingTop: 10, justifyContent: 'space-between' },
  tabItem:                { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText:                { fontSize: 10, color: '#666', marginTop: 4, fontWeight: '500' },
  tabItemPost:            { alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: -25 },
  postTabCircle:          { width: 60, height: 60, borderRadius: 30, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', ...Platform.select({ web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.2)' }, default: { elevation: 5 } }), borderWidth: 4, borderColor: '#fff' },
  notificationBadgeBottom: { position: 'absolute', top: -5, right: -10, backgroundColor: '#FF3B30', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  badgeText:              { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // ── Modals (shared) ───────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },

  // ── Filter/Sort modal (NEW) ───────────────
  filterModalCard: {
    width: '100%', backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '88%',
  },
  modalHandle:        { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  filterModalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  filterModalTitle:   { fontSize: 20, fontWeight: 'bold', color: '#000' },
  filterModalClose:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },

  filterTabRow:       { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 14, padding: 4, marginBottom: 20 },
  filterTab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  filterTabActive:    { backgroundColor: '#000' },
  filterTabText:      { fontSize: 14, fontWeight: '600', color: '#666' },
  filterTabTextActive:{ color: '#fff' },

  filterSection:        { borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingBottom: 20, marginBottom: 20 },
  filterSectionTitle:   { fontSize: 15, fontWeight: 'bold', color: '#000', marginBottom: 14 },

  // Sort rows
  sortRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, marginBottom: 6 },
  sortRowActive:    { backgroundColor: '#f5f9ff' },
  sortIconWrap:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  sortIconWrapActive:{ backgroundColor: '#007AFF' },
  sortLabel:        { fontSize: 15, color: '#333', fontWeight: '500' },
  sortLabelActive:  { color: '#007AFF', fontWeight: '700' },
  radioUnchecked:   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd', marginLeft: 'auto' as any },

  // Price
  priceInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  priceInputWrap: { flex: 1 },
  priceInputLabel:{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  priceInput:     { borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#000', backgroundColor: '#fafafa' },
  priceDash:      { paddingTop: 20 },
  priceDashText:  { color: '#ccc', fontSize: 18 },
  presetChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: '#e5e5e5' },
  presetChipActive:   { backgroundColor: '#000', borderColor: '#000' },
  presetChipText:     { fontSize: 13, color: '#555', fontWeight: '500' },
  presetChipTextActive:{ color: '#fff', fontWeight: '700' },

  // Condition grid
  conditionGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  conditionChip:        { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e5e5', backgroundColor: '#fafafa' },
  conditionChipActive:  { backgroundColor: '#000', borderColor: '#000' },
  conditionChipText:    { fontSize: 13, color: '#555', fontWeight: '500' },
  conditionChipTextActive:{ color: '#fff', fontWeight: '700' },

  // Posted within rows
  postedRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  postedRowActive: { },
  postedLabel:     { fontSize: 15, color: '#333' },
  postedLabelActive:{ color: '#007AFF', fontWeight: '700' },

  // Footer
  filterModalFooter:{ flexDirection: 'row', gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  resetBtn:         { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  resetBtnText:     { fontSize: 15, fontWeight: '700', color: '#666' },
  applyBtn:         { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  applyBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Profile modal ─────────────────────────
  fullScreenModalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  fullProfileCard:         { backgroundColor: '#fff', width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 24, padding: 24, ...Platform.select({ web: { boxShadow: '0px 10px 30px rgba(0,0,0,0.3)' }, default: { elevation: 10 } }), ...(Platform.OS !== 'web' ? { position: 'absolute', bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}) },
  profileModalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 15 },
  profileModalTitle:       { fontSize: 20, fontWeight: 'bold', color: '#000' },
  profileAvatarLarge:      { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, borderColor: '#f0f0f0' },
  profileAvatarImage:      { width: '100%', height: '100%', borderRadius: 50 },
  profileAvatarTextLarge:  { fontSize: 40, fontWeight: 'bold', color: '#666' },
  profileModalName:        { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4, textAlign: 'center' },
  profileModalUsername:    { fontSize: 16, color: '#666', marginBottom: 24, textAlign: 'center' },
  profileDetailsBox:       { width: '100%', backgroundColor: '#f9f9f9', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#eee' },
  profileDetailRow:        { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 12 },
  profileDetailText:       { fontSize: 16, color: '#333', fontWeight: '500' },
  editProfileBtn:          { width: '100%', backgroundColor: '#000', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
  editProfileBtnText:      { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  profileActionDivider:    { height: 1, width: '100%', backgroundColor: '#eee', marginBottom: 16 },
  profileActionBtn:        { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 12, marginBottom: 8 },
  profileActionIconWrap:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profileActionText:       { fontSize: 16, fontWeight: '600', color: '#000' },
  profileActionBtnDanger:  { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 12 },
  profileActionTextDanger: { fontSize: 16, fontWeight: '600', color: '#FF3B30' },

  // ── Location modal ────────────────────────
  locationModalCard:  { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  locationSearchBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 15, height: 55, marginBottom: 20 },
  applyLocBtn:        { padding: 8, backgroundColor: '#000', borderRadius: 8 },
  applyLocText:       { color: '#fff', fontWeight: 'bold' },
  sectionSubTitle:    { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  quickCitiesWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCityChip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 20 },
  quickCityText:      { fontSize: 14, color: '#333' },

  // ── Help modal ────────────────────────────
  helpMenuCard:   { width: '90%', backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 40 },
  helpHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  helpTitle:      { fontSize: 20, fontWeight: 'bold' },
  helpOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  helpIconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  helpOptionText: { fontSize: 16, fontWeight: '500', color: '#333' },
});
