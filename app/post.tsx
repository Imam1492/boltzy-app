import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
  Image, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const ALL_CATEGORIES = [
  'Mobiles','Vehicles','Properties','Electronics','Furniture',
  'Fashion','Bikes','Jobs','Books','Sports','Pets','Other',
];

// Suggested highlight starters to help sellers write good chips
const HIGHLIGHT_SUGGESTIONS: Record<string, string[]> = {
  Mobiles:     ['128GB Storage', 'Single Owner', 'Box Included', 'Warranty Active', 'No Scratches', 'Face ID'],
  Vehicles:    ['1st Owner', 'Insurance Valid', 'Fuel Full', 'AC Working', 'Service Updated', 'No Accidents'],
  Electronics: ['Working Perfectly', 'Original Charger', 'Screen Guard', 'Bill Available', 'Warranty Left', '6 Months Old'],
  Furniture:   ['Solid Wood', 'No Damage', 'Self-Pickup Only', 'Dismantled Easily', 'Water Resistant', 'Branded'],
  default:     ['Good Condition', 'Original Product', 'Negotiable', 'Bill Available', 'Warranty Left', 'Brand New'],
};

export default function PostAd() {
  const router = useRouter();

  const [title, setTitle]           = useState('');
  const [price, setPrice]           = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition]   = useState('');

  // ── Category ──────────────────────────────────────────────────────────────
  const [category, setCategory]               = useState('');
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categorySearch, setCategorySearch]   = useState('');

  // ── Location ──────────────────────────────────────────────────────────────
  const [locationText, setLocationText]       = useState('');
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  // ── Images ────────────────────────────────────────────────────────────────
  const [images, setImages]                   = useState<string[]>([]);
  const [isUploading, setIsUploading]         = useState(false);

  // ── Key Highlights (NEW) ──────────────────────────────────────────────────
  // Up to 8 short chips sellers can add to describe the item at a glance
  const [highlights, setHighlights]           = useState<string[]>([]);
  const [highlightInput, setHighlightInput]   = useState('');

  const CONDITIONS = ['New', 'Like New', 'Gently Used', 'Used', 'For Parts'];
  const filteredCategories = ALL_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const suggestions = HIGHLIGHT_SUGGESTIONS[category] || HIGHLIGHT_SUGGESTIONS.default;

  // ─────────────────────────────────────────────────────────────────────────
  //  HIGHLIGHTS HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  const addHighlight = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (highlights.length >= 8) {
      Alert.alert('Max 8 Highlights', 'Remove one before adding another.');
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

  // ─────────────────────────────────────────────────────────────────────────
  //  IMAGE PICKER
  // ─────────────────────────────────────────────────────────────────────────
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.7,
    });
    if (!result.canceled) {
      const newUris = result.assets.map(a => a.uri);
      setImages(prev => [...prev, ...newUris].slice(0, 5));
    }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  // ─────────────────────────────────────────────────────────────────────────
  //  GPS FETCH
  // ─────────────────────────────────────────────────────────────────────────
  const fetchExactLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Please allow Boltzy to access your location.');

    setIsFetchingLocation(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
      });
      if (geocode.length > 0) {
        const geo: any = geocode[0];
        const addr = [geo.street, geo.district || geo.subregion, geo.city, geo.region]
          .filter(Boolean).join(', ');
        setLocationText(addr);
      }
    } catch {
      Alert.alert('GPS Error', 'Could not fetch your location. Please type it manually.');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  POST AD
  // ─────────────────────────────────────────────────────────────────────────
  const handlePostAd = async () => {
    if (!title || !price || !category || !locationText) {
      return Alert.alert('Missing Fields', 'Please fill in the title, price, category, and location.');
    }

    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to post an ad.');

      // Upload images
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

      // Insert listing — includes highlights array and condition
      const { error } = await supabase.from('listings').insert({
        seller_id:   user.id,
        title,
        price:       parseFloat(price),
        description,
        category,
        condition:   condition || null,
        location:    locationText,
        image_urls:  uploadedUrls,
        highlights:  highlights.length > 0 ? highlights : null,
      });

      if (error) throw error;

      Alert.alert('🎉 Ad Posted!', 'Your ad has been posted successfully.', [
        { text: 'OK', onPress: () => router.replace('/home') },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post an Ad</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── PHOTOS ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Add Photos</Text>
        <Text style={styles.sectionHint}>First photo will be the cover · Max 5 photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
          {images.length < 5 && (
            <TouchableOpacity style={styles.addImageBtn} onPress={pickImage}>
              <Ionicons name="camera" size={32} color="#666" />
              <Text style={styles.addImageText}>Add Photo</Text>
            </TouchableOpacity>
          )}
          {images.map((uri, index) => (
            <View key={index} style={styles.imagePreviewContainer}>
              {index === 0 && (
                <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>Cover</Text></View>
              )}
              <Image source={{ uri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                <Ionicons name="close-circle" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {/* ── AD DETAILS ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Ad Details</Text>

        <Text style={styles.label}>Title <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. iPhone 13 Pro Max - Mint Condition"
          value={title}
          onChangeText={setTitle}
          maxLength={70}
        />
        <Text style={styles.charCount}>{title.length}/70</Text>

        <Text style={styles.label}>Price (₹) <Text style={styles.required}>*</Text></Text>
        <View style={styles.priceRow}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="e.g. 45000"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.label}>Category <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity style={styles.categorySelector} onPress={() => setCategoryModalVisible(true)}>
          <Text style={{ color: category ? '#000' : '#999', fontSize: 16 }}>
            {category || 'Select a Category'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <Text style={styles.label}>Condition</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.condChip, condition === c && styles.condChipActive]}
                onPress={() => setCondition(condition === c ? '' : c)}
              >
                <Text style={[styles.condChipText, condition === c && styles.condChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── LOCATION ────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Location <Text style={styles.required}>*</Text></Text>
        <View style={styles.locationContainer}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Type area, city, or state..."
            value={locationText}
            onChangeText={setLocationText}
          />
          <TouchableOpacity style={styles.gpsBtn} onPress={fetchExactLocation} disabled={isFetchingLocation}>
            {isFetchingLocation
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="locate" size={24} color="#fff" />
            }
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>Type manually or tap the GPS icon to pin your exact location.</Text>

        {/* ── KEY HIGHLIGHTS (NEW) ────────────────────────── */}
        <View style={styles.highlightsSection}>
          <View style={styles.highlightsHeader}>
            <Ionicons name="flash" size={18} color="#F5A623" />
            <Text style={styles.sectionTitle}>Key Highlights</Text>
            <Text style={styles.highlightCount}>{highlights.length}/8</Text>
          </View>
          <Text style={styles.sectionHint}>
            Short one-liners that buyers see at a glance — e.g. "128GB Storage", "Single Owner"
          </Text>

          {/* Added chips */}
          {highlights.length > 0 && (
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

          {/* Input + add */}
          {highlights.length < 8 && (
            <View style={styles.highlightInputRow}>
              <TextInput
                style={styles.highlightInput}
                placeholder="Type a highlight and press +"
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

          {/* Suggestions */}
          {highlights.length < 8 && (
            <View>
              <Text style={styles.suggestLabel}>Quick add:</Text>
              <View style={styles.chipsWrap}>
                {suggestions
                  .filter(s => !highlights.includes(s))
                  .map((sug, i) => (
                    <TouchableOpacity key={i} style={styles.suggestionChip} onPress={() => addSuggestion(sug)}>
                      <Ionicons name="add-circle-outline" size={13} color="#007AFF" style={{ marginRight: 3 }} />
                      <Text style={styles.suggestionChipText}>{sug}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>
            </View>
          )}
        </View>

        {/* ── DESCRIPTION ─────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
          placeholder="Describe what you are selling in detail..."
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />
        <Text style={styles.charCount}>{description.length}/2000</Text>

        {/* ── SUBMIT ──────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.submitBtn, isUploading && styles.submitBtnDisabled]}
          onPress={handlePostAd}
          disabled={isUploading}
        >
          {isUploading
            ? <ActivityIndicator color="#fff" />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.submitBtnText}>Post Now</Text>
              </View>
            )
          }
        </TouchableOpacity>

      </ScrollView>

      {/* ── CATEGORY MODAL ──────────────────────────────── */}
      <Modal visible={isCategoryModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#999" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search categories..."
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
                  style={styles.categoryRow}
                  onPress={() => { setCategory(item); setCategoryModalVisible(false); setCategorySearch(''); }}
                >
                  <Text style={styles.categoryRowText}>{item}</Text>
                  {category === item
                    ? <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                    : <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  }
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No categories found.</Text>}
            />
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle:    { fontSize: 20, fontWeight: 'bold' },
  scrollContent:  { padding: 20, paddingBottom: 120 },

  sectionTitle:   { fontSize: 17, fontWeight: 'bold', marginTop: 24, marginBottom: 6, color: '#000' },
  sectionHint:    { fontSize: 12, color: '#aaa', marginBottom: 12 },
  label:          { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  required:       { color: '#FF3B30' },
  hintText:       { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
  charCount:      { fontSize: 11, color: '#ccc', textAlign: 'right', marginTop: 2, marginBottom: 4 },

  input: {
    backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee',
    borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 8,
  },

  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  currencySymbol: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 8 },

  locationContainer: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
  gpsBtn:         { backgroundColor: '#000', width: 55, height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  categorySelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16, marginBottom: 8 },

  condChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e0e0e0' },
  condChipActive:     { backgroundColor: '#000', borderColor: '#000' },
  condChipText:       { fontSize: 13, color: '#666', fontWeight: '500' },
  condChipTextActive: { color: '#fff', fontWeight: '700' },

  imageScroll:          { flexDirection: 'row', marginBottom: 10 },
  addImageBtn:          { width: 100, height: 100, borderRadius: 12, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1.5, borderColor: '#ddd', borderStyle: 'dashed' },
  addImageText:         { color: '#888', marginTop: 6, fontSize: 12, fontWeight: '500' },
  imagePreviewContainer:{ position: 'relative', marginRight: 12 },
  imagePreview:         { width: 100, height: 100, borderRadius: 12 },
  removeImageBtn:       { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 12 },
  coverBadge:           { position: 'absolute', bottom: 6, left: 6, zIndex: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverBadgeText:       { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // ── Key Highlights ─────────────────────────────────
  highlightsSection: {
    backgroundColor: '#fffbf0', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#ffe082', marginTop: 24, marginBottom: 8,
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
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  addHighlightBtn:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  suggestLabel:       { fontSize: 12, color: '#aaa', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8f8f8', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  suggestionChipText: { fontSize: 13, color: '#555' },

  submitBtn:          { backgroundColor: '#000', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 32 },
  submitBtnDisabled:  { backgroundColor: '#666' },
  submitBtnText:      { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:   { backgroundColor: '#fff', height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:     { fontSize: 22, fontWeight: 'bold' },
  searchBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 16, height: 50, marginBottom: 20 },
  searchInput:    { flex: 1, fontSize: 16, color: '#000' },
  categoryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  categoryRowText:{ fontSize: 16, color: '#333' },
  emptyText:      { textAlign: 'center', color: '#999', marginTop: 20 },
});