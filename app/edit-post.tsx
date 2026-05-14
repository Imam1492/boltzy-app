import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, Image } from 'react-native';
import { supabase } from '../supabase'; 
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';

export default function EditPost() {
  const router = useRouter();
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
    if (!listingId) {
      Alert.alert("Error", "Missing listing ID.");
      router.back();
      return;
    }

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (data && !error) {
      setTitle(data.title);
      setPrice(data.price.toString());
      setCategory(data.category);
      setLocation(data.location);
      setDescription(data.description || '');
      if (data.image_urls && data.image_urls.length > 0) {
        setImageUri(data.image_urls[0]); // Show existing image
      }
    } else {
      Alert.alert("Error", "Could not load ad details.");
      router.back();
    }
    setLoading(false);
  }, [listingId, router]);

  // Fetch existing data when screen loads
  useEffect(() => {
    void fetchListingDetails();
  }, [fetchListingDetails]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
    }
  };

  const updateAd = async () => {
    if (!title || !price || !category || !location) {
      Alert.alert("Missing Info", "Please fill in all required fields.");
      return;
    }

    setSaving(true);

    try {
      let uploadedImageUrl = imageUri; // Keep old image by default

      // If they picked a NEW image, upload it
      if (imageBase64) {
        const fileName = `${Date.now()}-edit.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('listings')
          .upload(fileName, decode(imageBase64), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('listings')
          .getPublicUrl(fileName);
          
        uploadedImageUrl = publicUrlData.publicUrl;
      }

      const { error: dbError } = await supabase.from('listings').update({
        title: title,
        price: parseFloat(price),
        category: category,
        location: location,
        description: description,
        image_urls: uploadedImageUrl ? [uploadedImageUrl] : [], 
      }).eq('id', listingId);

      if (dbError) throw dbError;

      Alert.alert("Success!", "Your ad has been updated.");
      router.back(); // Go back to My Ads

    } catch (error: any) {
      Alert.alert("Update Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Ad</Text>
        <View style={{ width: 28 }} />
      </View>

      <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />
        ) : (
          <Text style={styles.imagePickerText}>+ Update Photo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Ad Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Price (₹)</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice} />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} />

      <Text style={styles.label}>Description</Text>
      <TextInput 
        style={[styles.input, styles.textArea]} 
        multiline 
        numberOfLines={4} 
        value={description} 
        onChangeText={setDescription} 
      />

      <TouchableOpacity style={styles.button} onPress={updateAd} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  imagePickerButton: { height: 200, backgroundColor: '#f9f9f9', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' },
  imagePickerText: { fontSize: 16, color: '#666', fontWeight: 'bold' },
  imagePreview: { width: '100%', height: '100%' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20, backgroundColor: '#f9f9f9' },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#000', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 16, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  cancelText: { color: '#666', fontSize: 16 },
});
