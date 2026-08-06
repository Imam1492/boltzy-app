import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect,useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import ConfirmModal from '../components/ConfirmModal';
import * as ImageManipulator from 'expo-image-manipulator';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



import {
  ActivityIndicator, Animated, FlatList, StyleSheet, Text, TouchableOpacity,
  View, Alert, TextInput, ScrollView, Modal, Platform,
  KeyboardAvoidingView, useWindowDimensions, Linking, Share,
} from 'react-native';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import * as Location from 'expo-location';
import { Image } from 'expo-image'; // ✨ Using the high-performance expo-image

type SortOption  = 'newest' | 'oldest' | 'price_asc' | 'price_desc';
type Condition   = 'All' | 'New' | 'Like New' | 'Gently Used' | 'Used' | 'For Parts';
type PostedWithin = 'All Time' | 'Today' | '3 Days' | 'Week' | 'Month';

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

const HOME_SAVED_CACHE_TTL_MS = 20_000;
const homeSavedIdsCache = new Map<string, { fetchedAt: number; data: string[] }>();

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const p = 0.017453292519943295;
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p)/2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))/2;
  return (12742 * Math.asin(Math.sqrt(a))).toFixed(1); 
};

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, isDark, toggleTheme } = useTheme();
  const { lang, t, translateUGC } = useLanguage();
  // ✨ ADD THIS LINE
  const insets = useSafeAreaInsets();

  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  
  const [listings, setListings]               = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [savedIds, setSavedIds]               = useState<string[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [userInterests, setUserInterests]     = useState<string[]>([]);

  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filteredListings, setFilteredListings] = useState<any[]>([]);

  const [searchRadius, setSearchRadius]       = useState(20);
  const [userLat, setUserLat]                 = useState<number | null>(null);
  const [userLng, setUserLng]                 = useState<number | null>(null);

  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [filterTab, setFilterTab]             = useState<'sort' | 'filter'>('sort');
  const [stagedSort, setStagedSort]           = useState<SortOption>('newest');
  const [stagedPriceMin, setStagedPriceMin]   = useState('');
  const [stagedPriceMax, setStagedPriceMax]   = useState('');
  const [stagedCondition, setStagedCondition] = useState<Condition>('All');
  const [stagedPostedWithin, setStagedPostedWithin] = useState<PostedWithin>('All Time');

  const [activeSort, setActiveSort]           = useState<SortOption>('newest');
  const [activePriceMin, setActivePriceMin]   = useState('');
  const [activePriceMax, setActivePriceMax]   = useState('');
  const [activeCondition, setActiveCondition] = useState<Condition>('All');
  const [activePostedWithin, setActivePostedWithin] = useState<PostedWithin>('All Time');

  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [activeLocation, setActiveLocation]   = useState('Auto');
  const [locationSearchInput, setLocationSearchInput] = useState('');
  const [userArea, setUserArea]               = useState('');
  const [userCity, setUserCity]               = useState('');
  const [userState, setUserState]             = useState('');
  const [feedScope, setFeedScope]             = useState<{key: string, val: string} | null>(null);

  // ✨ Removed isHelpVisible entirely
  const [isProfileMenuVisible, setIsProfileMenuVisible] = useState(false);
  const [profileData, setProfileData]         = useState<any>(null);
  const [loadingProfile, setLoadingProfile]   = useState(false);
  const [headerProfile, setHeaderProfile]     = useState<any>(null);
  const [headerImgError, setHeaderImgError]   = useState(false);
  const [modalImgError, setModalImgError]     = useState(false);

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({ title: '', message: '', isDestructive: false });
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{ action: () => void } | null>(null);

  const triggerConfirm = (title: string, message: string, isDestructive: boolean, action: () => void) => {
    setConfirmModalConfig({ title, message, isDestructive });
    setPendingConfirmAction({ action });
    setConfirmModalVisible(true);
  };

  const [notifications, setNotifications] = useState([
    { id: '1', title: 'Ad is Live! 🎉', message: 'Your ad went live successfully.', icon: 'checkmark-circle', color: '#34C759', time: 'Just now' },
    { id: '2', title: 'Action Required', message: 'Modify your ad to make it live. It may violate community guidelines.', icon: 'alert-circle', color: '#F5A623', time: '2 hours ago' },
    { id: '3', title: 'Ad Expired', message: 'Your ad has expired. Relist it to keep selling!', icon: 'time', color: '#8E8E93', time: '1 day ago' },
    { id: '4', title: 'Ad Deleted', message: 'Your ad has been successfully deleted.', icon: 'trash', color: '#FF3B30', time: '2 days ago' },
    { id: '5', title: 'Security Alert', message: 'Your password was changed successfully.', icon: 'lock-closed', color: '#007AFF', time: '3 days ago' },
    { id: '6', title: 'Report Submitted', message: 'Your report against an ad/user was submitted to our moderation team.', icon: 'flag', color: '#007AFF', time: '1 week ago' },
    { id: '7', title: 'Account Warning', message: 'You have been reported. Please contact support to resolve the issue.', icon: 'warning', color: '#FF3B30', time: '1 week ago' }
  ]);

  const { openProfile } = useLocalSearchParams();
  const [isHelpExpanded, setIsHelpExpanded] = useState(false);

  const [isListening, setIsListening]             = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const voicePulse = useRef(new Animated.Value(1)).current;
  const unreadRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchListingsRef = useRef<(options?: { force?: boolean; pullToRefresh?: boolean }) => Promise<void>>(async () => {});
  const fetchSavedItemsRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const fetchSmartLocationRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const queueUnreadCountRefreshRef = useRef<(userId: string) => void>(() => {});
  

  const numColumns = width > 1024 ? 4 : width > 768 ? 3 : 2;

  const activeFilterCount = [
    activeSort !== 'newest',
    activePriceMin !== '',
    activePriceMax !== '',
    activeCondition !== 'All',
    activePostedWithin !== 'All Time',
  ].filter(Boolean).length;

  
  useEffect(() => {
    if (openProfile === 'true') {
      openProfileModal();
    }
  }, [openProfile]);

  const SkeletonCard = ({ numColumns, width }: { numColumns: number, width: number }) => {
  const { isDark } = useTheme();
  
  // 1. Set up the animation loop
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // 2. Horizontal slide calculation
  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  // 3. Shimmer color palette
  const baseColor = isDark ? '#1E293B' : '#E2E8F0';
  const highlightColor = isDark ? '#334155' : '#F8FAFC';

  const cardWidth = numColumns === 1 ? '100%' : (width - 48) / 2;
  const imageHeight = numColumns === 1 ? 200 : 140;

  // ✨ Clean absolute fill object helper to prevent TS errors
  const absoluteFillStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };

  return (
    <View style={{ width: cardWidth, marginBottom: 16 }}>
      {/* Image Skeleton Block */}
      <View style={{ 
        height: imageHeight, 
        backgroundColor: baseColor, 
        borderRadius: 12, 
        overflow: 'hidden',
        marginBottom: 8 
      }}>
        <Animated.View style={[absoluteFillStyle, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', highlightColor, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={absoluteFillStyle}
          />
        </Animated.View>
      </View>

      {/* Title Text Skeleton Block */}
      <View style={{ 
        height: 16, 
        backgroundColor: baseColor, 
        borderRadius: 4, 
        overflow: 'hidden',
        marginBottom: 6,
        width: '80%' 
      }}>
        <Animated.View style={[absoluteFillStyle, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', highlightColor, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={absoluteFillStyle}
          />
        </Animated.View>
      </View>

      {/* Price Text Skeleton Block */}
      <View style={{ 
        height: 16, 
        backgroundColor: baseColor, 
        borderRadius: 4, 
        overflow: 'hidden',
        width: '40%' 
      }}>
        <Animated.View style={[absoluteFillStyle, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', highlightColor, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={absoluteFillStyle}
          />
        </Animated.View>
      </View>
    </View>
  );
};

  useEffect(() => {
    if (activeLocation === 'Auto') {
      void fetchSmartLocationRef.current();
    }
  }, [activeLocation]);

  useEffect(() => {
    if (listings.length > 0) {
      applyFilters(
        searchQuery, selectedCategory, activeLocation, listings, 
        userArea, userCity, userState, 
        activeSort, activePriceMin, activePriceMax, activeCondition, activePostedWithin
      );
    }
  }, [activeLocation, userCity, userArea, userState, listings, userInterests, userLat, userLng]);

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

        supabase.from('profiles').select('*').eq('id', user.id).single().then(({data}) => {
          if (data) {
            setHeaderProfile(data);
            setUserInterests(data.interests || []);
          }
        });

        await refreshUnreadCount(user.id);
        const channelName = `unread_msgs_${user.id}_${Date.now()}`;
        const channel = supabase.channel(channelName)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
            queueUnreadCountRefreshRef.current(user.id);
          });
        
        channel.subscribe();
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
    try {
      const getGps = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('denied');
        let loc = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        
        if (loc) {
          setUserLat(loc.coords.latitude);
          setUserLng(loc.coords.longitude);
        }

        const geocode = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (geocode.length > 0) {
          const geo = geocode[0];
          // Grab the most granular area possible
          const area = geo.district || geo.subregion || geo.street || '';
          // Grab the city or fallback to region
          const city = geo.city || geo.region || '';
          const state = geo.region || '';
          return { area, city, state };
        }
        throw new Error('no_geocode');
      };

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('timeout'), 3000));

      let locData: any = null;
      try {
        locData = await Promise.race([getGps(), timeoutPromise]);
      } catch (err) {
        // Fallback to IP-based location if GPS fails
        const res = await fetch('https://ipinfo.io/json');
        const data = await res.json();
        if (data.city) locData = { city: data.city, state: data.region || '', area: '' };
      }

      if (locData) {
        setActiveLocation('Auto');
        setUserArea(locData.area);
        setUserCity(locData.city);
        setUserState(locData.state);
      }
    } catch (err) {
      console.log('Smart Loc Error:', err);
    }
  };

  const fetchListings = async ({ force = false, pullToRefresh = false }: { force?: boolean; pullToRefresh?: boolean } = {}) => {
  if (pullToRefresh) setRefreshing(true);
  else if (listings.length === 0) setLoading(true);

  try {
    const user = await getCurrentUser();
    let blockedIds: string[] = [];
    if (user) {
      const { data: blockedData } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', user.id);
      if (blockedData) blockedIds = blockedData.map(b => b.blocked_id);
    }

    // ✨ Resilient query: handles NULL values properly
    let query = supabase
      .from('listings')
      .select('*')
      .or('is_sold.eq.false,is_sold.is.null')
      .order('created_at', { ascending: false });

    if (blockedIds.length > 0) {
      query = query.not('seller_id', 'in', `(${blockedIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    let finalData = data || [];

    setListings(finalData);
    applyFilters(
      searchQuery, selectedCategory, activeLocation, finalData, 
      userArea, userCity, userState, 
      activeSort, activePriceMin, activePriceMax, activeCondition, activePostedWithin
    );
  } catch (err: any) {
    console.error('Fetch error:', err);
  }
  
  setLoading(false);
  setRefreshing(false);
};

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

    if (category !== 'All') result = result.filter(i => i.category === category);

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      );
    }

    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    if (!isNaN(min)) result = result.filter(i => parseFloat(i.price) >= min);
    if (!isNaN(max)) result = result.filter(i => parseFloat(i.price) <= max);

    if (condition !== 'All') result = result.filter(i => i.condition === condition);

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

    setFeedScope(null);

    if (locationSetting === 'All India') {
    } else if (locationSetting !== 'Auto') {
      const locFilter = result.filter(i => i.location?.toLowerCase().includes(locationSetting.toLowerCase()));
      if (locFilter.length > 0) {
        result = locFilter;
      } else {
        setFeedScope({ key: 'scope_no_local', val: '' });
      }
    } else {
      let foundLocal = false;
      if (area) {
        const m = result.filter(i => i.location?.toLowerCase().includes(area.toLowerCase()));
        if (m.length) { result = m; foundLocal = true; }
        else if (city) {
          const m2 = result.filter(i => i.location?.toLowerCase().includes(city.toLowerCase()));
          if (m2.length) { result = m2; foundLocal = true; }
          else if (state) {
            const m3 = result.filter(i => i.location?.toLowerCase().includes(state.toLowerCase()));
            if (m3.length) { result = m3; foundLocal = true; }
          }
        }
      } else if (city) {
        const m = result.filter(i => i.location?.toLowerCase().includes(city.toLowerCase()));
        if (m.length) { result = m; foundLocal = true; }
      }

      if (!foundLocal) {
        setFeedScope({ key: 'scope_no_local', val: '' });
      }
    }

    switch (sort) {
      case 'price_asc':  
        result.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));       
        break;
      case 'price_desc': 
        result.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));       
        break;
      case 'oldest':     
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); 
        break;
      default:           
        const premiumAds = result.filter(ad => ad.is_premium)
                                 .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const organicInterested = result.filter(ad => !ad.is_premium && userInterests.includes(ad.category))
                                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                                        
        const organicDiscovery = result.filter(ad => !ad.is_premium && !userInterests.includes(ad.category))
                                       .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const wovenFeed: any[] = [];
        let pIndex = 0;
        let iIndex = 0;
        let dIndex = 0;

        if (premiumAds[pIndex]) wovenFeed.push(premiumAds[pIndex++]);
        if (premiumAds[pIndex]) wovenFeed.push(premiumAds[pIndex++]);

        while (iIndex < organicInterested.length || dIndex < organicDiscovery.length) {
          let addedInterested = 0;
          while (addedInterested < 3 && iIndex < organicInterested.length) {
            wovenFeed.push(organicInterested[iIndex++]);
            addedInterested++;
          }
          
          if (dIndex < organicDiscovery.length) {
             wovenFeed.push(organicDiscovery[dIndex++]);
          }

          if (pIndex < premiumAds.length) {
            wovenFeed.push(premiumAds[pIndex++]);
          }
        }

        while (pIndex < premiumAds.length) {
          wovenFeed.push(premiumAds[pIndex++]);
        }

        result = wovenFeed;
        break;
    }

    const finalWithDistance = result.map(item => ({
      ...item,
      precalculatedDistance: userLat && userLng && item.lat && item.lng
        ? calculateDistance(userLat, userLng, item.lat, item.lng)
        : null
    }));

    setFilteredListings(finalWithDistance);
  };

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

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(voicePulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopVoiceSearchState = () => {
    setIsListening(false);
    setVoiceModalVisible(false);
    voicePulse.setValue(1);
  };

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setVoiceModalVisible(true);
    startPulse();
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript || '';
    if (transcript) {
      handleSearch(transcript);
    }
  });

  useSpeechRecognitionEvent("end", () => stopVoiceSearchState());
  useSpeechRecognitionEvent("error", () => stopVoiceSearchState());

  const startVoiceSearch = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      if (Platform.OS === 'web') window.alert("Microphone permissions denied.");
      else Alert.alert('Permission Denied', 'Boltzy needs microphone access to use voice search.');
      return;
    }
    
    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN',
      interimResults: false,
    });
  };

  const stopVoiceSearch = () => {
    ExpoSpeechRecognitionModule.stop();
    stopVoiceSearchState();
  };

  const openProfileModal = async () => {
    setIsProfileMenuVisible(true);
    setLoadingProfile(true);
    const user = await getCurrentUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      const realName = (data?.real_name || '').trim();
      const publicUsername = (data?.username || data?.display_name || '').trim();

      setProfileData({
        email: user.email,
        phone: user.phone || data?.phone || '',
        name: realName,
        username: publicUsername,
        avatar_url: data?.avatar_url || '',
      });
    }
    setLoadingProfile(false);
  };

  const handleLogout = () => {
    setIsProfileMenuVisible(false);
    triggerConfirm('Logout', 'Are you sure you want to logout of Boltzy?', true, async () => { 
      await supabase.auth.signOut(); 
      router.replace('/'); 
    });
  };

  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  const handleUpdatePhone = async () => {
    if (!newPhone.trim() || newPhone.length < 10) {
      if (Platform.OS === 'web') window.alert('Please enter a valid phone number.');
      else Alert.alert('Invalid Number', 'Please enter a valid phone number.');
      return;
    }
    
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase.from('profiles').update({ phone: newPhone }).eq('id', user.id);
    
    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('Error', error.message);
    } else {
      setProfileData((prev: any) => ({ ...prev, phone: newPhone }));
      setIsPhoneModalVisible(false);
      setNewPhone('');
      if (Platform.OS === 'web') window.alert('Phone number added successfully!');
      else Alert.alert('Success', 'Phone number added successfully!');
    }
  };

  const handleLogoutAllDevices = () => {
    setIsProfileMenuVisible(false);
    triggerConfirm('Logout All Devices', 'Are you sure you want to log out from every device you are currently logged into?', true, async () => { 
      await supabase.auth.signOut({ scope: 'global' }); 
      router.replace('/'); 
    });
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      if (Platform.OS === 'web') window.alert('Please enter a valid email.');
      else Alert.alert('Invalid Email', 'Please enter a valid email.');
      return;
    }
    
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    
    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('Error', error.message);
    } else {
      const msg = 'A verification link has been sent to ' + newEmail + '. Please check your inbox.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Check Your Inbox', msg);
      setIsEmailModalVisible(false);
      setNewEmail('');
    }
  };

  const handleDeleteAccount = () => {
    setIsProfileMenuVisible(false);
    triggerConfirm(
      'Delete Account', 
      'Your account will be deactivated. You can log back in within 30 days to recover your account and data before it is permanently deleted.', 
      true, 
      executeDelete
    );
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
      <View style={[styles.activeChipsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
          {chips.map(chip => (
            <TouchableOpacity key={chip.key} style={styles.activeChip} onPress={() => removeChip(chip.key)}>
              <Text style={styles.activeChipText}>{translateUGC(chip.label)}</Text>
              <Ionicons name="close" size={13} color="#fff" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.clearAllChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={clearAllFilters}>
            <Text style={[styles.clearAllChipText, { color: colors.textSecondary }]}>{t('clear_filters')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const imageUrl = item.image_urls?.length > 0 ? item.image_urls[0] : null;
    const distance = item.precalculatedDistance;
    
    const displayTitle = item.translations?.[lang]?.title || translateUGC(item.title);
    const displayLocation = item.translations?.[lang]?.location || translateUGC(item.location);
    const displayCondition = item.condition 
      ? (item.translations?.[lang]?.condition || translateUGC(item.condition)) 
      : null;

    return (
      <TouchableOpacity
        style={[
          styles.card, 
          { backgroundColor: colors.card, borderColor: colors.border },
          numColumns > 1 && { flex: 1, maxWidth: width > 1024 ? '23%' : width > 768 ? '31%' : '48%' },
          item.is_premium && { borderColor: '#F5A623', borderWidth: 2, backgroundColor: isDark ? '#1a180f' : '#fffdf5' }
        ]}
        onPress={() => router.push(('/listing/' + item.id) as any)}
      >
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={styles.imagePlaceholder} contentFit="cover" transition={200} />
          : <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]} />
        }
        
        {item.is_premium && (
          <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#F5A623', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>{t('promoted')}</Text>
          </View>
        )}

        <View style={styles.cardContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.price, { color: colors.text }]}>₹{item.price}</Text>
            <TouchableOpacity onPress={() => toggleWishlist(item.id)}>
              <Ionicons
                name={savedIds.includes(item.id) ? 'heart' : 'heart-outline'}
                size={26}
                color={savedIds.includes(item.id) ? '#FF3B30' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{displayTitle}</Text>
          
          {displayCondition && displayCondition !== 'All' && (
            <View style={[styles.conditionBadge, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.conditionBadgeText, { color: colors.textSecondary }]}>{displayCondition}</Text>
            </View>
          )}

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
            <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
              {distance ? `${distance} km away • ` : ''}{displayLocation}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── HEADER ────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        
        {/* ✨ BRAND LOGO */}
        <Image 
          // We flipped the logic here so the white-text logo shows in Dark Mode!
          source={isDark ? require('../assets/images/logo-light.png') : require('../assets/images/logo-dark.png')} 
          style={{ width: 145, height: 45 }} // Increased the size for better readability
          contentFit="contain"
          transition={200}
        />
        
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {(Platform.OS === 'web' || width > 768) && (
            <>
              <TouchableOpacity onPress={() => router.push('/chats' as any)}>
                <Ionicons name="chatbubbles-outline" size={26} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/post')}>
                <Ionicons name="add-circle-outline" size={28} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/saved' as any)}>
                <Ionicons name="heart-outline" size={26} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/my-ads' as any)}>
                <Ionicons name="list-circle-outline" size={26} color={colors.text} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => setIsNotifModalVisible(true)}>
            <View>
              <Ionicons name="notifications-outline" size={26} color={colors.text} />
              <View style={{ position: 'absolute', top: 0, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30', borderWidth: 1, borderColor: colors.card }} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={openProfileModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            {headerProfile?.avatar_url && !headerImgError ? (
              <Image source={{ uri: headerProfile.avatar_url }} style={{ width: '100%', height: '100%' }} onError={() => setHeaderImgError(true)} />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>
                {getInitials(headerProfile?.real_name || headerProfile?.display_name || 'User')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── LOCATION BAR ──────────────────────── */}
      <View style={[styles.locationSelectorBar, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.locationSelectorBtn} onPress={() => setIsLocationModalVisible(true)}>
          <Ionicons name="location" size={20} color={colors.text} />
          <Text style={[styles.locationSelectorText, { color: colors.text }]} numberOfLines={1}>
            {activeLocation === 'Auto' 
              ? ((userArea && userCity && userArea !== userCity) ? `${userArea}, ${userCity}` : (userArea || userCity || t('auto_loc')))
              : activeLocation === 'All India' 
                ? t('all_india') 
                : translateUGC(activeLocation)
            }
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── SEARCH + FILTER ROW ───────────────── */}
      <View style={[styles.searchSection, { backgroundColor: colors.card }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('home_search')}
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')} style={{ padding: 5 }}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={isListening ? stopVoiceSearch : startVoiceSearch}
              style={[styles.micBtn, { backgroundColor: colors.backgroundSecondary }, isListening && styles.micBtnActive]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={20} color={isListening ? '#fff' : colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.filterBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }, activeFilterCount > 0 && styles.filterBtnActive]} onPress={openFilterModal}>
            <Ionicons name="options" size={20} color={activeFilterCount > 0 ? '#fff' : colors.text} />
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
          <View style={[styles.voiceCard, { backgroundColor: colors.card }]}>
            <Animated.View style={[styles.voicePulseRing, { transform: [{ scale: voicePulse }] }]} />
            <View style={styles.voiceMicCircle}>
              <Ionicons name="mic" size={36} color="#fff" />
            </View>
            <Text style={[styles.voiceListeningText, { color: colors.text }]}>{t('Listening...')}</Text>
            <Text style={[styles.voiceHintText, { color: colors.textSecondary }]}>{t("Speak now — say what you're looking for")}</Text>
            <TouchableOpacity style={[styles.voiceCancelBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={stopVoiceSearch}>
              <Text style={[styles.voiceCancelText, { color: colors.text }]}>{t('Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── CATEGORY PILLS ────────────────────── */}
      <View style={[styles.categorySection, { backgroundColor: colors.card }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScrollContainer}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => onCategoryPress(cat)}
              style={[
                styles.categoryCapsule, 
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                selectedCategory === cat && { backgroundColor: colors.tint, borderColor: colors.tint }
              ]}
            >
              <Text style={[
                styles.categoryText, 
                { color: colors.textSecondary },
                selectedCategory === cat && { color: isDark ? '#000' : '#fff', fontWeight: 'bold' }
              ]}>
                {t(`cat_${cat}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── ACTIVE FILTER CHIPS ───────────────── */}
      <ActiveChips />

      {/* ── FEED SCOPE BANNER ─────────────────── */}
      {!loading && filteredListings.length > 0 && feedScope && (
        <View style={styles.scopeBanner}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.scopeText, { color: colors.textSecondary }]}>
            {feedScope.key === 'scope_showing_near' 
              ? `${t('scope_showing_near')} ${translateUGC(feedScope.val)}`
              : t(feedScope.key)}
          </Text>
          {activeFilterCount > 0 && (
            <Text style={styles.scopeFilterNote}> · {filteredListings.length} {t('results')}</Text>
          )}
        </View>
      )}

      {/* ── FEED ──────────────────────────────── */}
      // ✅ NEW:
{loading ? (
  <FlatList
    key={`skeleton-grid-${numColumns}`}
    numColumns={numColumns}
    columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
    data={[1, 2, 3, 4, 5, 6, 7, 8]}
    keyExtractor={(item) => String(item)}
    renderItem={() => <SkeletonCard numColumns={numColumns} width={width} />}
    contentContainerStyle={styles.listContainer}
    showsVerticalScrollIndicator={false}
  />
) : filteredListings.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrapper, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="search-outline" size={44} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('no_results')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('Try adjusting your filters or search term')}</Text>
          <View style={styles.emptyActions}>
            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.emptyActionBtn} onPress={clearAllFilters}>
                <Ionicons name="options" size={16} color="#007AFF" />
                <Text style={styles.emptyActionText}>{t('clear_filters')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.emptyActionBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={() => updateLocation('All India')}>
              <Ionicons name="earth" size={16} color={colors.text} />
              <Text style={[styles.emptyActionText, { color: colors.text }]}>{t('all_india')}</Text>
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
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      )}

      {/* ── BOTTOM TAB BAR ────────────────────── */}
      {Platform.OS !== 'web' && width <= 768 && (
        <View style={[styles.bottomTabBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 10, height: 60 + insets.bottom }]}>
          <TouchableOpacity style={styles.tabItem} onPress={() => {}}>
            <Ionicons name="home" size={24} color={colors.text} />
            <Text style={[styles.tabText, { color: colors.text, fontWeight: 'bold' }]}>{t('tab_home')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/chats' as any)}>
            <View>
              <Ionicons name="chatbubbles-outline" size={24} color={colors.textSecondary} />
              {unreadMessagesCount > 0 && (
                <View style={styles.notificationBadgeBottom}>
                  <Text style={styles.badgeText}>{unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabText, { color: colors.textSecondary }]}>{t('tab_chats')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItemPost} onPress={() => router.push('/post')}>
            <View style={[styles.postTabCircle, { backgroundColor: colors.tint, borderColor: colors.card }]}>
              <Ionicons name="add" size={32} color={isDark ? '#000' : '#fff'} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/saved' as any)}>
            <Ionicons name="heart-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.tabText, { color: colors.textSecondary }]}>{t('tab_saved')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/my-ads' as any)}>
            <Ionicons name="list-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.tabText, { color: colors.textSecondary }]}>{t('tab_my_ads')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ════════════ FILTER & SORT MODAL ════════════ */}
      <Modal visible={isFilterModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsFilterModalVisible(false)} />
          <View style={[styles.filterModalCard, { backgroundColor: colors.card }]}>

            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <View style={styles.filterModalHeader}>
              <Text style={[styles.filterModalTitle, { color: colors.text }]}>{t('sort_filter')}</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)} style={[styles.filterModalClose, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.filterTabRow, { backgroundColor: colors.backgroundSecondary }]}>
              <TouchableOpacity
                style={[styles.filterTab, filterTab === 'sort' && { backgroundColor: colors.tint }]}
                onPress={() => setFilterTab('sort')}
              >
                <Ionicons name="swap-vertical" size={16} color={filterTab === 'sort' ? (isDark ? '#000' : '#fff') : colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.filterTabText, { color: colors.textSecondary }, filterTab === 'sort' && { color: isDark ? '#000' : '#fff' }]}>{t('Sort')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filterTab === 'filter' && { backgroundColor: colors.tint }]}
                onPress={() => setFilterTab('filter')}
              >
                <Ionicons name="options" size={16} color={filterTab === 'filter' ? (isDark ? '#000' : '#fff') : colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.filterTabText, { color: colors.textSecondary }, filterTab === 'filter' && { color: isDark ? '#000' : '#fff' }]}>{t('filter')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
              {filterTab === 'sort' && (
                <View style={[styles.filterSection, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.filterSectionTitle, { color: colors.text }]}>{t('sort_by')}</Text>
                  {SORT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.sortRow, stagedSort === opt.key && { backgroundColor: isDark ? '#1a2733' : '#f5f9ff' }]}
                      onPress={() => setStagedSort(opt.key)}
                    >
                      <View style={[styles.sortIconWrap, { backgroundColor: colors.backgroundSecondary }, stagedSort === opt.key && styles.sortIconWrapActive]}>
                        <Ionicons name={opt.icon as any} size={18} color={stagedSort === opt.key ? '#fff' : colors.textSecondary} />
                      </View>
                      <Text style={[styles.sortLabel, { color: colors.text }, stagedSort === opt.key && styles.sortLabelActive]}>
                        {t(opt.label)} 
                      </Text>
                      {stagedSort === opt.key
                        ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" style={{ marginLeft: 'auto' }} />
                        : <View style={[styles.radioUnchecked, { borderColor: colors.border }]} />
                      }
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {filterTab === 'filter' && (
                <>
                  <View style={[styles.filterSection, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.filterSectionTitle, { color: colors.text }]}>{t('price_range')}</Text>
                    <View style={styles.priceInputRow}>
                      <View style={styles.priceInputWrap}>
                        <Text style={[styles.priceInputLabel, { color: colors.textSecondary }]}>Min</Text>
                        <TextInput
                          style={[styles.priceInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.backgroundSecondary }]}
                          keyboardType="numeric"
                          placeholder="₹ 0"
                          placeholderTextColor={colors.textSecondary}
                          value={stagedPriceMin}
                          onChangeText={setStagedPriceMin}
                        />
                      </View>
                      <View style={styles.priceDash}><Text style={[styles.priceDashText, { color: colors.textSecondary }]}>—</Text></View>
                      <View style={styles.priceInputWrap}>
                        <Text style={[styles.priceInputLabel, { color: colors.textSecondary }]}>Max</Text>
                        <TextInput
                          style={[styles.priceInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.backgroundSecondary }]}
                          keyboardType="numeric"
                          placeholder="₹ Any"
                          placeholderTextColor={colors.textSecondary}
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
                            style={[
                              styles.presetChip, 
                              { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                              stagedPriceMin === mn && stagedPriceMax === mx && { backgroundColor: colors.tint, borderColor: colors.tint }
                            ]}
                            onPress={() => { setStagedPriceMin(mn); setStagedPriceMax(mx); }}
                          >
                            <Text style={[
                              styles.presetChipText, 
                              { color: colors.textSecondary },
                              stagedPriceMin === mn && stagedPriceMax === mx && { color: isDark ? '#000' : '#fff', fontWeight: '700' }
                            ]}>
                              {t(label)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  <View style={[styles.filterSection, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.filterSectionTitle, { color: colors.text }]}>{t('condition')}</Text>
                    <View style={styles.conditionGrid}>
                      {CONDITIONS.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.conditionChip, 
                            { borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
                            stagedCondition === c && { backgroundColor: colors.tint, borderColor: colors.tint }
                          ]}
                          onPress={() => setStagedCondition(c)}
                        >
                          <Text style={[
                            styles.conditionChipText, 
                            { color: colors.textSecondary },
                            stagedCondition === c && { color: isDark ? '#000' : '#fff', fontWeight: '700' }
                          ]}>
                            {t(c)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.filterSection, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.filterSectionTitle, { color: colors.text }]}>{t('posted_within')}</Text>
                    {POSTED_WITHIN.map((pw) => (
                      <TouchableOpacity
                        key={pw}
                        style={[styles.postedRow, { borderBottomColor: colors.border }]}
                        onPress={() => setStagedPostedWithin(pw)}
                      >
                        <Text style={[styles.postedLabel, { color: colors.text }, stagedPostedWithin === pw && styles.postedLabelActive]}>
                          {t(pw)}
                        </Text>
                        {stagedPostedWithin === pw
                          ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                          : <View style={[styles.radioUnchecked, { borderColor: colors.border }]} />
                        }
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={[styles.filterModalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={resetFilterModal}>
                <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>{t('reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.tint }]} onPress={applyFilterModal}>
                <Text style={[styles.applyBtnText, { color: isDark ? '#000' : '#fff' }]}>{t('apply_filters')}</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════ UNIFIED SETTINGS & ACCOUNT MODAL ════════════ */}
      <Modal visible={isProfileMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.fullScreenModalOverlay} activeOpacity={1} onPress={() => setIsProfileMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.fullProfileCard, { backgroundColor: colors.card }]}>
            <View style={styles.profileModalHeader}>
              <Text style={[styles.profileModalTitle, { color: colors.text }]}>Account & Settings</Text>
              <TouchableOpacity onPress={() => setIsProfileMenuVisible(false)}>
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            {loadingProfile ? (
              <ActivityIndicator size="large" color={colors.text} style={{ marginTop: 50 }} />
            ) : (
              <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }} showsVerticalScrollIndicator={false}>

                <View style={[styles.profileAvatarLarge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  {profileData?.avatar_url && !modalImgError
                    ? <Image source={{ uri: profileData.avatar_url }} style={styles.profileAvatarImage} onError={() => setModalImgError(true)} />
                    : <Text style={[styles.profileAvatarTextLarge, { color: colors.textSecondary }]}>
                        {getInitials(profileData?.name || profileData?.username || 'User')}
                      </Text>
                  }
                </View>
                
                <Text style={[styles.profileModalName, { color: colors.text }]}>
                  {profileData?.name || t('Setup your name')}
                </Text>

                <View style={styles.profileUsernameRow}>
                  {profileData?.username ? (
                    <Text style={[styles.profileModalUsernameText, { color: colors.textSecondary }]}>@{profileData.username}</Text>
                  ) : (
                    <Text style={[styles.profileModalUsernameText, { color: colors.textSecondary }]}>
                      {t('profile_no_username')}
                    </Text>
                  )}
                </View>

                {/* ✨ PREFERENCES ✨ */}
                <View style={[styles.profileActionDivider, { backgroundColor: colors.border }]} />

                <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); router.push('/profile' as any); }}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: colors.backgroundSecondary }]}><Ionicons name="globe-outline" size={22} color={colors.text} /></View>
                  <Text style={[styles.profileActionText, { color: colors.text }]}>App Language & Identity</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); router.push('/billing' as any); }}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: colors.backgroundSecondary }]}><Ionicons name="card" size={22} color={colors.text} /></View>
                  <Text style={[styles.profileActionText, { color: colors.text }]}>{t('billing_sub')}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); router.push('/billing' as any); }}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: colors.backgroundSecondary }]}><Ionicons name="card" size={22} color={colors.text} /></View>
                  <Text style={[styles.profileActionText, { color: colors.text }]}>{t('billing_sub') || 'Billing & Subscriptions'}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* ✨ NEW BILLING HISTORY BUTTON ✨ */}
                <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); router.push('/billing-history' as any); }}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: colors.backgroundSecondary }]}><Ionicons name="receipt-outline" size={22} color={colors.text} /></View>
                  <Text style={[styles.profileActionText, { color: colors.text }]}>Billing History</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* ✨ EXPANDABLE HELP & SUPPORT ✨ */}
                <View style={[styles.profileActionDivider, { backgroundColor: colors.border }]} />

                <TouchableOpacity style={styles.profileActionBtn} onPress={() => setIsHelpExpanded(!isHelpExpanded)}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#1e3a8a' : '#e3f2fd' }]}><Ionicons name="help-buoy" size={22} color="#2196F3" /></View>
                  <Text style={[styles.profileActionText, { color: colors.text }]}>Help & Support</Text>
                  <Ionicons name={isHelpExpanded ? "chevron-down" : "chevron-forward"} size={20} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {isHelpExpanded && (
                  
                  <View style={{ width: '100%', paddingLeft: 12, marginBottom: 8 }}>

                    {/* ✨ NEW FAQ BUTTON ✨ */}
                    <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); router.push('/faq' as any); }}>
                      <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#422006' : '#fff8e1', width: 32, height: 32, borderRadius: 16 }]}><Ionicons name="help-circle" size={18} color="#F5A623" /></View>
                      <Text style={[styles.profileActionText, { color: colors.text, fontSize: 15 }]}>FAQ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); setSafetyModalVisible(true); }}>
                      <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#064e3b' : '#e8f5e9', width: 32, height: 32, borderRadius: 16 }]}><Ionicons name="shield-checkmark" size={18} color="#4CAF50" /></View>
                      <Text style={[styles.profileActionText, { color: colors.text, fontSize: 15 }]}>{t('safety_tips') === 'safety_tips' ? 'Trust & Safety Tips' : t('safety_tips')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.profileActionBtn} onPress={() => { setIsProfileMenuVisible(false); Linking.openURL('mailto:support@boltzy.in?subject=Boltzy Support Request'); }}>
                      <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#1e3a8a' : '#e3f2fd', width: 32, height: 32, borderRadius: 16 }]}><Ionicons name="mail" size={18} color="#2196F3" /></View>
                      <Text style={[styles.profileActionText, { color: colors.text, fontSize: 15 }]}>{t('email_support') === 'email_support' ? 'Email Support' : t('email_support')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.profileActionBtn} onPress={async () => { setIsProfileMenuVisible(false); try { await Share.share({ message: 'Hey! Join Boltzy to buy and sell awesome items locally. Download the app now: https://boltzy.in' }); } catch (e) {} }}>
                      <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#4a044e' : '#f3e5f5', width: 32, height: 32, borderRadius: 16 }]}><Ionicons name="person-add" size={18} color="#9C27B0" /></View>
                      <Text style={[styles.profileActionText, { color: colors.text, fontSize: 15 }]}>{t('invite_friends') === 'invite_friends' ? 'Invite Friends' : t('invite_friends')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ✨ LOGOUT ✨ */}
                <View style={[styles.profileActionDivider, { backgroundColor: colors.border }]} />

                <TouchableOpacity style={styles.profileActionBtn} onPress={handleLogout}>
                  <View style={[styles.profileActionIconWrap, { backgroundColor: isDark ? '#450a0a' : '#ffebee' }]}><Ionicons name="log-out" size={22} color="#FF3B30" /></View>
                  <Text style={[styles.profileActionText, { color: '#FF3B30' }]}>{t('logout') || 'Logout'}</Text>
                </TouchableOpacity>

              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>


      {/* ════════════ LOCATION MODAL ════════════ */}
      <Modal visible={isLocationModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.locationModalCard, { backgroundColor: colors.card }]}>
            <View style={styles.helpHeader}>
              <Text style={[styles.helpTitle, { color: colors.text }]}>{t('select_loc')}</Text>
              <TouchableOpacity onPress={() => setIsLocationModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.locationSearchBox, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('type_city_state')}
                placeholderTextColor={colors.textSecondary}
                value={locationSearchInput}
                onChangeText={setLocationSearchInput}
                onSubmitEditing={() => updateLocation(locationSearchInput)}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity onPress={() => updateLocation(locationSearchInput)} style={[styles.applyLocBtn, { backgroundColor: colors.tint }]}>
                <Text style={[styles.applyLocText, { color: isDark ? '#000' : '#fff' }]}>{t('apply')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionSubTitle, { color: colors.text }]}>{t('pop_loc')}</Text>
            <View style={styles.quickCitiesWrapper}>
              {QUICK_CITIES.map((city) => (
                <TouchableOpacity key={city} style={[styles.quickCityChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={() => updateLocation(city)}>
                  {city === 'Auto (My Location)' && <Ionicons name="locate" size={14} color="#007AFF" style={{ marginRight: 4 }} />}
                  <Text style={[styles.quickCityText, { color: colors.text }, city === 'Auto (My Location)' && { color: '#007AFF', fontWeight: 'bold' }]}>
                    {city === 'All India' ? t('all_india') : city === 'Auto (My Location)' ? t('auto_loc') : t(city)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════ EMAIL UPDATE MODAL ════════════ */}
      <Modal visible={isEmailModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.helpMenuCard, { backgroundColor: colors.card }]}>
            <View style={styles.helpHeader}>
              <Text style={[styles.helpTitle, { color: colors.text }]}>Update Email</Text>
              <TouchableOpacity onPress={() => setIsEmailModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
              Enter your new email address. We will send a verification link to confirm the change.
            </Text>
            <TextInput
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text, borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 16 }}
              placeholder="Enter new email"
              placeholderTextColor={colors.textSecondary}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={{ backgroundColor: colors.tint, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={handleUpdateEmail}>
              <Text style={{ color: isDark ? '#000' : '#fff', fontSize: 16, fontWeight: 'bold' }}>Send Verification</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════ PHONE UPDATE MODAL ════════════ */}
      <Modal visible={isPhoneModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.helpMenuCard, { backgroundColor: colors.card }]}>
            <View style={styles.helpHeader}>
              <Text style={[styles.helpTitle, { color: colors.text }]}>Add Phone Number</Text>
              <TouchableOpacity onPress={() => setIsPhoneModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
              Add a contact number so buyers and sellers can easily reach you regarding your listings.
            </Text>
            <TextInput
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text, borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 16 }}
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.textSecondary}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={{ backgroundColor: colors.tint, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={handleUpdatePhone}>
              <Text style={{ color: isDark ? '#000' : '#fff', fontSize: 16, fontWeight: 'bold' }}>Save Number</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════ TRUST & SAFETY MODAL ════════════ */}
      <Modal visible={safetyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.locationModalCard, { backgroundColor: colors.card, alignItems: 'center', paddingVertical: 40 }]}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="shield-checkmark" size={40} color="#4CAF50" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 24, color: colors.text }}>Trust & Safety</Text>
            
            <View style={{ width: '100%', gap: 16, marginBottom: 30 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="close-circle" size={24} color="#FF3B30" />
                <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>Never pay in advance.</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="people" size={24} color="#007AFF" />
                <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>Meet in safe, public places.</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="eye" size={24} color="#F5A623" />
                <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>Inspect items thoroughly before buying.</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={{ backgroundColor: colors.tint, width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }} 
              onPress={() => setSafetyModalVisible(false)}
            >
              <Text style={{ color: isDark ? '#000' : '#fff', fontSize: 16, fontWeight: 'bold' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={confirmModalVisible}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        isDestructive={confirmModalConfig.isDestructive}
        onConfirm={() => {
          if (pendingConfirmAction) pendingConfirmAction.action();
          setConfirmModalVisible(false);
        }}
        onCancel={() => setConfirmModalVisible(false)}
      />

{/* ════════════ NOTIFICATIONS MODAL ════════════ */}
<Modal visible={isNotifModalVisible} transparent animationType="slide">
  <View style={styles.modalOverlay}>
    <View style={[styles.locationModalCard, { backgroundColor: colors.card, height: '80%', paddingBottom: insets.bottom + 20 }]}>
      
      <View style={styles.helpHeader}>
        <Text style={[styles.helpTitle, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity onPress={() => setIsNotifModalVisible(false)}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrapper, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="notifications-off-outline" size={44} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No new notifications</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>We'll let you know when you get messages or updates.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {notifications.map(notif => (
            <TouchableOpacity key={notif.id} style={[styles.notifCard, { borderBottomColor: colors.border }]} activeOpacity={0.7}>
              <View style={[styles.notifIconWrap, { backgroundColor: notif.color + '20' }]}>
                <Ionicons name={notif.icon as any} size={24} color={notif.color} />
              </View>
              <View style={styles.notifContent}>
                <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                <Text style={[styles.notifMsg, { color: colors.textSecondary }]}>{notif.message}</Text>
                <Text style={[styles.notifTime, { color: colors.textSecondary }]}>{notif.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  </View>
</Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  headerTitle:      { fontSize: 26, fontWeight: 'bold', letterSpacing: -0.5 },

  locationSelectorBar:  { paddingHorizontal: 16, paddingBottom: 10 },
  locationSelectorBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationSelectorText: { fontSize: 16, fontWeight: 'bold', maxWidth: 250 },

  searchSection:     { paddingHorizontal: 16, paddingBottom: 10 },
  searchRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchContainer:   { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 15, height: 48 },
  searchInput:       { flex: 1, fontSize: 15 },
  filterBtn:         { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  filterBtnActive:   { backgroundColor: '#000', borderColor: '#000' },
  filterBadge:       { position: 'absolute', top: -4, right: -4, backgroundColor: '#007AFF', borderRadius: 9, width: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  filterBadgeText:   { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  micBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 4,
  },
  micBtnActive: { backgroundColor: '#FF3B30' },
  voiceOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  voiceCard: {
    borderRadius: 28, padding: 40,
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
  voiceListeningText: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  voiceHintText:      { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  voiceCancelBtn:     { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20 },
  voiceCancelText:    { fontSize: 15, fontWeight: '600' },

  categorySection:         { paddingBottom: 10, paddingTop: 5 },
  categoryScrollContainer: { paddingHorizontal: 16, gap: 8 },
  categoryCapsule:         { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  categoryText:            { fontSize: 13, fontWeight: '500' },

  activeChipsRow:     { borderBottomWidth: 1 },
  activeChip:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  activeChipText:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  clearAllChip:       { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  clearAllChipText:   { fontSize: 12, fontWeight: '600' },

  scopeBanner:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  scopeText:          { fontSize: 12, fontStyle: 'italic' },
  scopeFilterNote:    { fontSize: 12, color: '#007AFF', fontWeight: '600' },

  listContainer: { padding: 16 },
  card: {
    borderRadius: 12, marginBottom: 16, overflow: 'hidden', borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0px 4px 8px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }),
  },
  imagePlaceholder: { height: 120 },
  cardContent:      { padding: 10 },
  price:            { fontSize: 16, fontWeight: 'bold' },
  title:            { fontSize: 13, marginBottom: 4 },
  locationRow:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  location:         { fontSize: 11 },
  conditionBadge:   { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  conditionBadgeText: { fontSize: 11, fontWeight: '600' },

  emptyState:        { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyIconWrapper:  { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:        { fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  emptySubtitle:     { fontSize: 14, marginBottom: 24, textAlign: 'center', paddingHorizontal: 32 },
  emptyActions:      { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  emptyActionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#e8f0fe', borderRadius: 20 },
  emptyActionText:   { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  bottomTabBar:           { flexDirection: 'row', borderTopWidth: 1, paddingHorizontal: 5, alignItems: 'flex-start', paddingTop: 10, justifyContent: 'space-between' },
  tabItem:                { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText:                { fontSize: 10, marginTop: 4, fontWeight: '500' },
  tabItemPost:            { alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: -25 },
  postTabCircle:          { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', ...Platform.select({ web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.2)' }, default: { elevation: 5 } }), borderWidth: 4 },
  notificationBadgeBottom: { position: 'absolute', top: -5, right: -10, backgroundColor: '#FF3B30', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  badgeText:              { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },

  filterModalCard: {
    width: '100%',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    height: '85%',
  },
  modalHandle:        { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  filterModalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  filterModalTitle:   { fontSize: 20, fontWeight: 'bold' },
  filterModalClose:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  filterTabRow:       { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 20 },
  filterTab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  filterTabText:      { fontSize: 14, fontWeight: '600' },

  filterSection:        { borderBottomWidth: 1, paddingBottom: 20, marginBottom: 20 },
  filterSectionTitle:   { fontSize: 15, fontWeight: 'bold', marginBottom: 14 },

  sortRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, marginBottom: 6 },
  sortIconWrap:     { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  sortIconWrapActive:{ backgroundColor: '#007AFF' },
  sortLabel:        { fontSize: 15, fontWeight: '500' },
  sortLabelActive:  { color: '#007AFF', fontWeight: '700' },
  radioUnchecked:   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginLeft: 'auto' as any },

  priceInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  priceInputWrap: { flex: 1 },
  priceInputLabel:{ fontSize: 12, marginBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  priceInput:     { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  priceDash:      { paddingTop: 20 },
  priceDashText:  { fontSize: 18 },
  presetChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  presetChipText:     { fontSize: 13, fontWeight: '500' },

  conditionGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  conditionChip:        { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  conditionChipText:    { fontSize: 13, fontWeight: '500' },

  postedRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1 },
  postedLabel:     { fontSize: 15 },
  postedLabelActive:{ color: '#007AFF', fontWeight: '700' },

  filterModalFooter:{ flexDirection: 'row', gap: 12, paddingTop: 16, borderTopWidth: 1 },
  resetBtn:         { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  resetBtnText:     { fontSize: 15, fontWeight: '700' },
  applyBtn:         { flex: 2, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  applyBtnText:     { fontSize: 15, fontWeight: '700' },

  fullScreenModalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  fullProfileCard:         { width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 24, padding: 24, ...Platform.select({ web: { boxShadow: '0px 10px 30px rgba(0,0,0,0.3)' }, default: { elevation: 10 } }), ...(Platform.OS !== 'web' ? { position: 'absolute', bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}) },
  profileModalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 15 },
  profileModalTitle:       { fontSize: 20, fontWeight: 'bold' },
  profileAvatarLarge:      { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4 },
  profileAvatarImage:      { width: '100%', height: '100%', borderRadius: 50 },
  profileAvatarTextLarge:  { fontSize: 40, fontWeight: 'bold' },
  profileModalName:        { fontSize: 24, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  profileUsernameRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 8 },
  profileModalUsernameText:{ fontSize: 16, fontWeight: '500' },
  profileEditIconBtn:      { padding: 8, borderRadius: 12 },
  profileDetailsBox:       { width: '100%', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1 },
  profileDetailRow:        { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 12 },
  profileDetailText:       { fontSize: 16, fontWeight: '500' },
  profileActionDivider:    { height: 1, width: '100%', marginBottom: 16 },
  
  modalSectionLabel:       { fontSize: 13, fontWeight: 'bold', color: '#888', marginBottom: 8, marginTop: 4, alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  profileActionBtn:        { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 12, marginBottom: 8 },
  profileActionIconWrap:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profileActionText:       { fontSize: 16, fontWeight: '600' },
  profileActionBtnDanger:  { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 12 },
  profileActionTextDanger: { fontSize: 16, fontWeight: '600', color: '#FF3B30' },

  locationModalCard:  { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  locationSearchBox:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 15, height: 55, marginBottom: 20 },
  applyLocBtn:        { padding: 8, borderRadius: 8 },
  applyLocText:       { fontWeight: 'bold' },
  sectionSubTitle:    { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  quickCitiesWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCityChip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 20 },
  quickCityText:      { fontSize: 14 },

notifCard: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1 },
  notifIconWrap: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  notifContent: { flex: 1, justifyContent: 'center' },
  notifTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  notifMsg: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  notifTime: { fontSize: 12, fontStyle: 'italic' },

  helpMenuCard:   { width: '90%', borderRadius: 16, padding: 24, marginBottom: 40 },
  helpHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  helpTitle:      { fontSize: 20, fontWeight: 'bold' },
});