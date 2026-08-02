import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Platform, Animated } from 'react-native';
import { supabase } from '../supabase'; 
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme } from '../context/ThemeContext'; 

const Skeleton = ({ width, height, style, borderRadius = 8, isDark = false }: { width?: any, height: any, style?: any, borderRadius?: number, isDark?: boolean }) => {
  const fadeAnim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [fadeAnim]);
  return <Animated.View style={[{ width, height, backgroundColor: isDark ? '#333' : '#e0e0e0', borderRadius, opacity: fadeAnim }, style]} />;
};

export default function EditPost() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { id: rawListingId } = useLocalSearchParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(rawListingId) ? rawListingId[0] : rawListingId;

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null); 
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchListingDetails = useCallback(async () => {
    if (!listingId) return router.back();
    const { data, error } = await supabase.from('listings').select('*').eq('id', listingId).single();
    if (data && !error) {
      setTitle(data.title); setPrice(data.price.toString()); setCategory(data.category);
      setLocation(data.location); setDescription(data.description || '');
      if (data.image_urls && data.image_urls.length > 0) setImageUri(data.image_urls[0]);
    }
    setLoading(false);
  }, [listingId, router]);

  useEffect(() => { void fetchListingDetails(); }, [fetchListingDetails]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsEditing: true, 
      aspect: [4, 3], 
      quality: 1,
      base64: false, 
    });
    
    if (!result.canceled) { 
      const compressedImage = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1080 } }], 
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      setImageUri(compressedImage.uri); 
      setImageBase64(compressedImage.base64 || null); 
    }
  };

  const updateAd = async () => {
    if (!title || !price || !category || !location) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'Please fill in all fields.', position: 'top' });
      return;
    }
    setSaving(true);
    try {
      let uploadedImageUrl = imageUri;
      if (imageBase64) {
        const fileName = `${Date.now()}-edit.jpg`;
        const { error: uploadError } = await supabase.storage.from('listing_images').upload(fileName, decode(imageBase64), { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        uploadedImageUrl = supabase.storage.from('listing_images').getPublicUrl(fileName).data.publicUrl;
      }
      const { error: dbError } = await supabase.from('listings').update({
        title, 
        price: parseFloat(price), 
        location, 
        description, 
        image_urls: uploadedImageUrl ? [uploadedImageUrl] : [], 
      }).eq('id', listingId);

      if (dbError) throw dbError; 

      Toast.show({ type: 'success', text1: 'Success!', text2: 'Your ad has been updated.', position: 'top' });
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message, position: 'top' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Ad</Text>
          <View style={{ width: 28 }} />
        </View>
        <Skeleton width="100%" height={200} borderRadius={12} style={{ marginBottom: 24 }} isDark={isDark} />
        <Skeleton width={80} height={16} style={{ marginBottom: 8 }} isDark={isDark} />
        <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 20 }} isDark={isDark} />
        <Skeleton width={80} height={16} style={{ marginBottom: 8 }} isDark={isDark} />
        <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 20 }} isDark={isDark} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Ad</Text>
        <View style={{ width: 28 }} />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Photo</Text>
      <TouchableOpacity style={[styles.imagePickerButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />
        ) : (
          <Text style={[styles.imagePickerText, { color: colors.textSecondary }]}>Tap to update photo</Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.text }]}>Title</Text>
      <TextInput 
        style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
        value={title} 
        onChangeText={setTitle} 
        placeholderTextColor={colors.textSecondary} 
      />

      <Text style={[styles.label, { color: colors.text }]}>Price (₹)</Text>
      <TextInput 
        style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
        value={price} 
        onChangeText={setPrice} 
        keyboardType="numeric" 
        placeholderTextColor={colors.textSecondary} 
      />

      <Text style={[styles.label, { color: colors.text }]}>Location</Text>
      <TextInput 
        style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
        value={location} 
        onChangeText={setLocation} 
        placeholderTextColor={colors.textSecondary} 
      />

      <Text style={[styles.label, { color: colors.text }]}>Description</Text>
      <TextInput 
        style={[styles.input, styles.textArea, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]} 
        value={description} 
        onChangeText={setDescription} 
        multiline 
        placeholderTextColor={colors.textSecondary} 
      />

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={updateAd} disabled={saving}>
        {saving ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Save Changes</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  imagePickerButton: { height: 200, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed' },
  imagePickerText: { fontSize: 16, fontWeight: 'bold' },
  imagePreview: { width: '100%', height: '100%' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20 },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: { padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 16, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  cancelText: { fontSize: 16 },
});