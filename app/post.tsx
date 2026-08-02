import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, ActivityIndicator, Platform, KeyboardAvoidingView,
  Image, FlatList, Alert, Animated, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';

function categoryI18nKey(cat: string): string {
  return `cat_${cat.replace(/\s+/g, '_')}`;
}

const ALL_CATEGORIES = [
  'Mobiles','Vehicles','Properties','Electronics','Furniture',
  'Fashion','Bikes','Jobs','Books','Sports','Pets','Other',
];

const POPULAR_LOCATIONS = [
  'Abids, Hyderabad', 'Bahadurpura, Hyderabad', 'Banjara Hills, Hyderabad', 'Jubilee Hills, Hyderabad', 'Madhapur, Hyderabad', 'Tolichowki, Hyderabad', 'Charminar, Hyderabad', 'Secunderabad, Telangana',
  'Andheri, Mumbai', 'Bandra, Mumbai', 'Colaba, Mumbai', 'Dharavi, Mumbai',
  'Connaught Place, Delhi', 'Karol Bagh, Delhi', 'Chandni Chowk, Delhi',
  'Koramangala, Bengaluru', 'Indiranagar, Bengaluru', 'Whitefield, Bengaluru'
];

const HIGHLIGHT_SUGGESTION_KEYS: Record<string, string[]> = {
  Mobiles: ['post_sug_mobiles_0', 'post_sug_mobiles_1', 'post_sug_mobiles_2', 'post_sug_mobiles_3', 'post_sug_mobiles_4', 'post_sug_mobiles_5'],
  Vehicles: ['post_sug_vehicles_0', 'post_sug_vehicles_1', 'post_sug_vehicles_2', 'post_sug_vehicles_3', 'post_sug_vehicles_4', 'post_sug_vehicles_5'],
  Electronics: ['post_sug_electronics_0', 'post_sug_electronics_1', 'post_sug_electronics_2', 'post_sug_electronics_3', 'post_sug_electronics_4', 'post_sug_electronics_5'],
  Furniture: ['post_sug_furniture_0', 'post_sug_furniture_1', 'post_sug_furniture_2', 'post_sug_furniture_3', 'post_sug_furniture_4', 'post_sug_furniture_5'],
  default: ['post_sug_default_0', 'post_sug_default_1', 'post_sug_default_2', 'post_sug_default_3', 'post_sug_default_4', 'post_sug_default_5'],
};

const containsInappropriateContent = (text: string): boolean => {
  const bannedWords = [
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 
    'nigger', 'faggot', 'kill', 'murder', 'rape',
    'scam', 'fraud', 'fake', 'stolen'
  ];
  
  const lowerText = text.toLowerCase();
  return bannedWords.some(word => lowerText.includes(word));
};

export default function PostAd() {
  const router = useRouter();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();

  const [title, setTitle]           = useState('');
  const [price, setPrice]           = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition]   = useState('');
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const [category, setCategory]               = useState('');
  const [customCategory, setCustomCategory]   = useState('');
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categorySearch, setCategorySearch]   = useState('');

  const [locationText, setLocationText]       = useState('');
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);

  const [images, setImages]                   = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false); 
  const [isUploading, setIsUploading]         = useState(false);

  const [highlights, setHighlights]           = useState<string[]>([]);
  const [highlightInput, setHighlightInput]   = useState('');

  const CONDITIONS = ['New', 'Like New', 'Gently Used', 'Used', 'For Parts'];
  const filteredCategories = ALL_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const suggestionKeys = HIGHLIGHT_SUGGESTION_KEYS[category] || HIGHLIGHT_SUGGESTION_KEYS.default;

  const Skeleton = ({ width, height, style, borderRadius = 8 }: { width?: any, height: any, style?: any, borderRadius?: number }) => {
    const fadeAnim = useRef(new Animated.Value(0.5)).current;
    
    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }, [fadeAnim]);

    return (
      <Animated.View 
        style={[
          { width, height, backgroundColor: isDark ? '#333' : '#e0e0e0', borderRadius, opacity: fadeAnim }, 
          style
        ]} 
      />
    );
  };

  const saveAsDraft = async () => {
    setIsUploading(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const uploadedUrls: string[] = [];
      for (const uri of images) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const fileName = `draft_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        await supabase.storage.from('listing_images').upload(fileName, blob);
        const { data: { publicUrl } } = supabase.storage.from('listing_images').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }

      await supabase.from('listings').insert({
        seller_id: user.id,
        title: title.trim() || 'Untitled Draft',
        description: description.trim() || '',
        price: parseFloat(price) || 0,
        category: category || 'Other',
        location: locationText || '',
        image_urls: uploadedUrls,
        approval_status: 'draft',
        is_sold: false
      });

      Toast.show({ type: 'success', text1: 'Draft Saved', position: 'top' });
      router.back();
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Failed to save draft', position: 'top' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackPress = useCallback(() => {
    const hasInput = title.trim() || description.trim() || price || images.length > 0;
    
    if (hasInput && !isUploading) {
      Alert.alert(
        "Discard Ad?",
        "You have unsaved changes. Would you like to save this as a draft to finish later?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => router.back() },
          { text: "Save Draft", onPress: saveAsDraft }
        ]
      );
      return true; 
    }
    router.back();
    return true;
  }, [title, description, price, images, isUploading]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [handleBackPress]);

  const addHighlight = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (highlights.length >= 8) {
      Toast.show({ type: 'info', text1: t('post_alert_max_highlights_title'), text2: t('post_alert_max_highlights_msg'), position: 'top' });
      return;
    }
    if (highlights.includes(trimmed)) return;
    setHighlights(prev => [...prev, trimmed]);
    setHighlightInput('');
  };

  const removeHighlight = (idx: number) => {
    setHighlights(prev => prev.filter((_, i) => i !== idx));
  };

  const addSuggestion = (sug: string) => {
    if (!highlights.includes(sug) && highlights.length < 8) {
      setHighlights(prev => [...prev, sug]);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 1, 
    });
    
    if (!result.canceled) {
      setIsProcessingImages(true); 
      try {
        const processedUris: string[] = []; 
        
        for (const asset of result.assets) {
          const compressedImage = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1080 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          processedUris.push(compressedImage.uri);
        }
        setImages(prev => [...prev, ...processedUris].slice(0, 5));
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Could not compress image.', position: 'top' });
      } finally {
        setIsProcessingImages(false);
      }
    }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const fetchExactLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const getGps = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('denied');
        
        let loc = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); 
        
        const geocode = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (geocode.length > 0) {
          const geo: any = geocode[0];
          const addressParts = [
            geo.streetNumber, geo.street, geo.name && geo.name !== geo.city ? geo.name : null, 
            geo.subregion, geo.district, geo.city, geo.region
          ].filter(Boolean); 
          
          return [...new Set(addressParts)].join(', '); 
        }
        throw new Error('no_geocode');
      };

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('timeout'), 3000));

      let addr: string | null = null;
      try {
        addr = await Promise.race([getGps(), timeoutPromise]) as string;
      } catch (err) {
        const res = await fetch('https://ipinfo.io/json');
        const data = await res.json();
        if (data.city && data.region) {
          addr = `${data.city}, ${data.region}`;
        }
      }

      if (addr) {
        setLocationText(addr);
        setMissingFields(prev => prev.filter(f => f !== 'location')); 
      }
    } catch (error) {
      console.log("Location Error: ", error);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const generateAIDescription = async () => {
    if (!title.trim() || !category) {
      Toast.show({ type: 'error', text1: 'Hold up!', text2: "Please enter a Title and select a Category first.", position: 'top' });
      return;
    }

    setIsGeneratingAI(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error(t('post_login_required') || 'Login required');

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count: dailyCount } = await supabase.from('ai_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('created_at', oneDayAgo);

      if (dailyCount !== null && dailyCount >= 10) {
        Toast.show({ type: 'error', text1: 'AI Limit Reached', text2: 'You have used your 10 AI generations for today.', position: 'top' });
        return;
      }

      const { count: hourlyCount } = await supabase.from('ai_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('created_at', oneHourAgo);

      if (hourlyCount !== null && hourlyCount >= 3) {
        Toast.show({ type: 'error', text1: 'AI Cooldown', text2: 'You can only generate 3 descriptions per hour. Take a break!', position: 'top' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-ad', { body: { title, category } });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from('ai_usage_logs').insert({ user_id: user.id });

      if (data?.description) {
        setDescription(data.description);
        setMissingFields(prev => prev.filter(f => f !== 'description'));
      }
      if (data?.highlights) {
        const newHighlights = data.highlights.filter((h: string) => !highlights.includes(h)).slice(0, 8);
        setHighlights(prev => [...prev, ...newHighlights].slice(0, 8));
      }
      
    } catch (error: any) {
      console.error("AI Error:", error);
      Toast.show({ type: 'error', text1: 'AI Error', text2: error.message, position: 'top' });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handlePostAd = async () => {
    let localMissing: string[] = [];
    
    if (images.length === 0) localMissing.push('images');
    if (!title.trim()) localMissing.push('title');
    if (!category) localMissing.push('category');
    if (category === 'Other' && !customCategory.trim()) localMissing.push('customCategory');
    if (!price) localMissing.push('price');
    if (!locationText.trim()) localMissing.push('location'); 
    if (!description.trim()) localMissing.push('description');
    
    setMissingFields(localMissing);

    if (localMissing.length > 0) {
      const missingList = localMissing.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ');
      Toast.show({ type: 'error', text1: 'Missing Information', text2: `Please add: ${missingList}`, position: 'top' });
      return;
    }

    setIsUploading(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error(t('post_login_required') || 'Login required');

      let currentLat: number | null = null;
      let currentLng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          currentLat = loc.coords.latitude;
          currentLng = loc.coords.longitude;
        }
      } catch (err) {
        console.log("GPS fetch failed or was denied.");
      }

      const contentToScan = `${title} ${description}`;
      const isFlagged = containsInappropriateContent(contentToScan);
      
      const autoStatus = isFlagged ? 'action_required' : 'approved';
      const autoNote = isFlagged 
        ? "Automated Review: Your ad contains flagged keywords or inappropriate language. Please edit your title or description to comply with our community guidelines." 
        : null;

      const uploadedUrls: string[] = [];
      for (const uri of images) {
        const response = await fetch(uri);
        const blob     = await response.blob();
        const fileExt  = uri.substring(uri.lastIndexOf('.') + 1) || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('listing_images').upload(fileName, blob);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('listing_images').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }

      const { data, error } = await supabase.rpc('post_new_ad', {
        p_user_id: user.id,
        p_category: category,
        p_title: title,
        p_description: description,
        p_location: locationText,
        p_price: parseFloat(price),
        p_image_urls: uploadedUrls,
        p_condition: condition || null,
        p_highlights: highlights.length > 0 ? highlights : null,
        p_lat: currentLat,
        p_lng: currentLng
      });

      if (error) {
        Toast.show({ type: 'error', text1: 'Database Error', text2: error.message, position: 'top' });
        setIsUploading(false);
        return;
      }

      if (data && data.success === false) {
        setIsUploading(false);
        Alert.alert(
          "Limit Reached", 
          data.error,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Upgrade to Pro", onPress: () => router.push('/billing' as any) }
          ]
        );
        return;
      }

      if (category === 'Other' && customCategory.trim() && data?.listing_id) {
        await supabase.from('listings').update({ custom_category: customCategory.trim() }).eq('id', data.listing_id);
      }

      if (data?.listing_id) {
         await supabase.from('listings')
           .update({ approval_status: autoStatus, moderation_note: autoNote })
           .eq('id', data.listing_id);
      }

      if (isFlagged) {
        Toast.show({ 
          type: 'error', 
          text1: 'Ad Flagged', 
          text2: 'Your ad was flagged for inappropriate content. Please check your inactive ads to edit it.', 
          position: 'top' 
        });
      } else {
        Toast.show({ 
          type: 'success', 
          text1: 'Ad Published', 
          text2: 'Your ad is now live on Boltzy!', 
          position: 'top' 
        });
      }
      
      router.replace('/my-ads' as any);
      
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message, position: 'top' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBackPress} style={{ padding: 8 }}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('post_title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('post_add_photos')}</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>{t('post_photos_hint')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
          {images.length < 5 && (
            <TouchableOpacity style={[styles.addImageBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={pickImage}>
              <Ionicons name="camera" size={32} color={colors.textSecondary} />
              <Text style={[styles.addImageText, { color: colors.textSecondary }]}>{t('post_add_photo_btn')}</Text>
            </TouchableOpacity>
          )}
          {isProcessingImages && (
            <View style={styles.imagePreviewContainer}>
              <Skeleton width={100} height={100} borderRadius={12} />
            </View>
          )}
          {images.map((uri, index) => (
            <View key={index} style={styles.imagePreviewContainer}>
              {index === 0 && (
                <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>{t('post_cover')}</Text></View>
              )}
              <Image source={{ uri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                <Ionicons name="close-circle" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('post_ad_details')}</Text>

        <Text style={[styles.label, { color: colors.text }]}>{t('post_label_title')} <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }, missingFields.includes('title') && { borderColor: '#FF3B30', borderWidth: 2 }]}
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (missingFields.includes('title')) setMissingFields(prev => prev.filter(e => e !== 'title')); 
          }}
        />
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>{title.length}/70</Text>

        <Text style={[styles.label, { color: colors.text }]}>{t('post_label_price')} <Text style={styles.required}>*</Text></Text>
        <View style={styles.priceRow}>
          <Text style={[styles.currencySymbol, { color: colors.text }]}>₹</Text>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }, missingFields.includes('price') && { borderColor: '#FF3B30', borderWidth: 2 }]}
            placeholder={t('post_placeholder_price')}
            placeholderTextColor={colors.textSecondary}
            value={price}
            onChangeText={(val) => { setPrice(val); setMissingFields(prev => prev.filter(f => f !== 'price')); }}
            keyboardType="numeric"
          />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>{t('post_label_category')} <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity 
          style={[styles.categorySelector, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }, missingFields.includes('category') && { borderColor: '#FF3B30', borderWidth: 2 }]} 
          onPress={() => { setCategoryModalVisible(true); setMissingFields(prev => prev.filter(f => f !== 'category')); }}
        >
          <Text style={{ color: category ? colors.text : colors.textSecondary, fontSize: 16 }}>
            {category ? t(categoryI18nKey(category)) : t('post_select_category')}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {category === 'Other' && (
          <View style={{ marginTop: 8, marginBottom: 8 }}>
            <Text style={[styles.label, { color: colors.text }]}>Specify Category <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[
                styles.input, 
                { marginBottom: 0, backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text },
                missingFields.includes('customCategory') && { borderColor: '#FF3B30', borderWidth: 2 }
              ]}
              placeholder="e.g. Antique Coins, Musical Instruments"
              placeholderTextColor={colors.textSecondary}
              value={customCategory}
              onChangeText={(text) => {
                setCustomCategory(text);
                if (missingFields.includes('customCategory')) {
                  setMissingFields(prev => prev.filter(e => e !== 'customCategory'));
                }
              }}
            />
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>Help us improve by typing what you are selling.</Text>
          </View>
        )}

        <Text style={[styles.label, { color: colors.text }]}>{t('post_label_condition')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.condChip, 
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                  condition === c && { backgroundColor: colors.tint, borderColor: colors.tint }
                ]}
                onPress={() => setCondition(condition === c ? '' : c)}
              >
                <Text style={[
                  styles.condChipText, 
                  { color: colors.textSecondary },
                  condition === c && { color: isDark ? '#000' : '#fff', fontWeight: '700' }
                ]}>
                  {t(c)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('post_location_title')}<Text style={styles.required}>*</Text>
        </Text>
        
        <View style={{ zIndex: 10 }}>
          <View style={styles.locationContainer}>
            {isFetchingLocation ? (
              <Skeleton height={55} borderRadius={12} style={{ flex: 1, marginBottom: 0 }} />
            ) : (
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }, missingFields.includes('location') && { borderColor: '#FF3B30', borderWidth: 2 }]}
                placeholder={t('post_placeholder_location')}
                placeholderTextColor={colors.textSecondary}
                value={locationText}
                onChangeText={(text) => {
                  setLocationText(text);
                  setShowLocSuggestions(text.length > 0);
                  setMissingFields(prev => prev.filter(f => f !== 'location'));
                }}
                onFocus={() => locationText.length > 0 && setShowLocSuggestions(true)}
              />
            )}
            <TouchableOpacity style={[styles.gpsBtn, { backgroundColor: colors.tint }]} onPress={fetchExactLocation} disabled={isFetchingLocation}>
              {isFetchingLocation
                ? <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
                : <Ionicons name="locate" size={24} color={isDark ? '#000' : '#fff'} />
              }
            </TouchableOpacity>
          </View>

          {showLocSuggestions && (
            <View style={[styles.suggestionsDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 150 }}>
                {POPULAR_LOCATIONS
                  .filter(loc => loc.toLowerCase().includes(locationText.toLowerCase()))
                  .map(loc => (
                    <TouchableOpacity 
                      key={loc} 
                      style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                      onPress={() => { setLocationText(loc); setShowLocSuggestions(false); }}
                    >
                      <Ionicons name="location-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 14, color: colors.text }}>{loc}</Text>
                    </TouchableOpacity>
                  ))
                }
                {POPULAR_LOCATIONS.filter(loc => loc.toLowerCase().includes(locationText.toLowerCase())).length === 0 && (
                  <TouchableOpacity 
                    style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                    onPress={() => setShowLocSuggestions(false)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color="#007AFF" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, color: '#007AFF' }}>Use "{locationText}"</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('post_location_hint')}</Text>

        <View style={[styles.highlightsSection, { backgroundColor: isDark ? '#231e13' : '#fffbf0', borderColor: isDark ? '#5c450c' : '#ffe082' }]}>
          <View style={styles.highlightsHeader}>
            <Ionicons name="flash" size={18} color="#F5A623" />
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>{t('post_highlights_title')}</Text>
            <Text style={styles.highlightCount}>{highlights.length}/8</Text>
          </View>
          
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>{t('post_highlights_hint')}</Text>

          {isGeneratingAI && (
            <View style={styles.chipsWrap}>
              <Skeleton width={80} height={32} borderRadius={16} />
              <Skeleton width={110} height={32} borderRadius={16} />
              <Skeleton width={90} height={32} borderRadius={16} />
            </View>
          )}

          {!isGeneratingAI && highlights.length > 0 && (
            <View style={styles.chipsWrap}>
              {highlights.map((h, i) => (
                <View key={i} style={styles.highlightChip}>
                  <Text style={styles.highlightChipText}>{h}</Text>
                  <TouchableOpacity onPress={() => removeHighlight(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={14} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {highlights.length < 8 && (
            <View style={styles.highlightInputRow}>
              <TextInput
                style={[styles.highlightInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder={t('post_highlights_placeholder')}
                placeholderTextColor={colors.textSecondary}
                value={highlightInput}
                onChangeText={setHighlightInput}
                onSubmitEditing={() => addHighlight(highlightInput)}
                maxLength={30}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addHighlightBtn, !highlightInput.trim() && { opacity: 0.4 }]}
                onPress={() => addHighlight(highlightInput)}
                disabled={!highlightInput.trim()}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {highlights.length < 8 && (
            <View>
              <Text style={[styles.suggestLabel, { color: colors.textSecondary }]}>{t('post_highlights_quick_add')}</Text>
              <View style={styles.chipsWrap}>
                {suggestionKeys
                  .map(k => t(k))
                  .filter(s => !highlights.includes(s))
                  .map((sug, i) => (
                    <TouchableOpacity key={i} style={[styles.suggestionChip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => addSuggestion(sug)}>
                      <Ionicons name="add-circle-outline" size={13} color="#007AFF" style={{ marginRight: 3 }} />
                      <Text style={[styles.suggestionChipText, { color: colors.text }]}>{sug}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 6 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>
            {t('post_desc_title') || 'Description'} <Text style={styles.required}>*</Text>
          </Text>
          
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5A623', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 }}
            onPress={generateAIDescription}
            disabled={isGeneratingAI}
          >
            {isGeneratingAI ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Auto-Write</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {isGeneratingAI ? (
          <Skeleton width="100%" height={110} borderRadius={12} style={{ marginBottom: 8 }} />
        ) : (
          <TextInput
            style={[
              styles.input, 
              { height: 110, textAlignVertical: 'top', backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text },
              missingFields.includes('description') && { borderColor: '#FF3B30', borderWidth: 2 }
            ]}
            placeholder={t('post_desc_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (missingFields.includes('description')) {
                setMissingFields(prev => prev.filter(e => e !== 'description')); 
              }
            }}
            multiline
            maxLength={2000}
          />
        )}
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>{description.length}/2000</Text>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.tint }, isUploading && styles.submitBtnDisabled]}
          onPress={handlePostAd}
          disabled={isUploading}
        >
          {isUploading
            ? <ActivityIndicator color={isDark ? '#000' : '#fff'} />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color={isDark ? '#000' : '#fff'} />
                <Text style={[styles.submitBtnText, { color: isDark ? '#000' : '#fff' }]}>{t('post_submit')}</Text>
              </View>
            )
          }
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={isCategoryModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('post_modal_category')}</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('post_search_categories')}
                placeholderTextColor={colors.textSecondary}
                value={categorySearch}
                onChangeText={setCategorySearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredCategories}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.categoryRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setCategory(item); setCategoryModalVisible(false); setCategorySearch(''); }}
                >
                  <Text style={[styles.categoryRowText, { color: colors.text }]}>{t(categoryI18nKey(item))}</Text>
                  {category === item
                    ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                    : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                  }
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('post_no_categories')}</Text>}
            />
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  headerTitle:    { fontSize: 20, fontWeight: 'bold' },
  scrollContent:  { padding: 20, paddingBottom: 120 },

  sectionTitle:   { fontSize: 17, fontWeight: 'bold', marginTop: 24, marginBottom: 6 },
  sectionHint:    { fontSize: 12, marginBottom: 12 },
  label:          { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  required:       { color: '#FF3B30' },
  hintText:       { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  charCount:      { fontSize: 11, textAlign: 'right', marginTop: 2, marginBottom: 4 },

  input: {
    borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 8,
  },

  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  currencySymbol: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },

  locationContainer: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
  gpsBtn:         { width: 55, height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  categorySelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 8 },

  condChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  condChipText:       { fontSize: 13, fontWeight: '500' },

  imageScroll:          { flexDirection: 'row', marginBottom: 10 },
  addImageBtn:          { width: 100, height: 100, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addImageText:         { marginTop: 6, fontSize: 12, fontWeight: '500' },
  imagePreviewContainer:{ position: 'relative', marginRight: 12 },
  imagePreview:         { width: 100, height: 100, borderRadius: 12 },
  removeImageBtn:       { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 12 },
  coverBadge:           { position: 'absolute', bottom: 6, left: 6, zIndex: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverBadgeText:       { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  highlightsSection: {
    borderRadius: 16, padding: 16,
    borderWidth: 1, marginTop: 24, marginBottom: 8,
  },
  highlightsHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  highlightCount:     { fontSize: 12, color: '#F5A623', fontWeight: '700', marginLeft: 'auto' as any },
  chipsWrap:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  highlightChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f0fe', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#c5d8fd',
  },
  highlightChipText:  { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  highlightInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  highlightInput: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  addHighlightBtn:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  suggestLabel:       { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1,
  },
  suggestionChipText: { fontSize: 13 },

  submitBtn:          { borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 32 },
  submitBtnDisabled:  { opacity: 0.6 },
  submitBtnText:      { fontSize: 18, fontWeight: 'bold' },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:   { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:     { fontSize: 22, fontWeight: 'bold' },
  searchBox:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 16, height: 50, marginBottom: 20 },
  searchInput:    { flex: 1, fontSize: 16 },
  categoryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  categoryRowText:{ fontSize: 16 },
  emptyText:      { textAlign: 'center', marginTop: 20 },
  suggestionsDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden'
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
});