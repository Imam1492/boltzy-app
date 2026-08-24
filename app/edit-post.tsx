import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { 
  ActivityIndicator, 
  Image, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View, 
  Platform 
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { Skeleton } from '../components/ShimmerSkeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditPost() {
  const router = useRouter();
  const { colors, isDark } = useTheme(); 
  const { id: rawListingId } = useLocalSearchParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(rawListingId) ? rawListingId[0] : rawListingId;

  const insets = useSafeAreaInsets();

  // Multi-image state
  const [images, setImages] = useState<string[]>([]);
  const [newImagesBase64, setNewImagesBase64] = useState<{ uri: string; base64: string }[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [highlights, setHighlights] = useState<string[]>([]);

  const fetchListingDetails = useCallback(async () => {
    if (!listingId) return router.back();
    const { data, error } = await supabase.from('listings').select('*').eq('id', listingId).single();
    if (data && !error) {
      setTitle(data.title || ''); 
      setPrice(data.price ? data.price.toString() : ''); 
      setCategory(data.category || '');
      setLocation(data.location || ''); 
      setDescription(data.description || '');
      setHighlights(data.highlights || []); 
      if (data.image_urls && Array.isArray(data.image_urls)) {
        setImages(data.image_urls);
      }
    }
    setLoading(false);
  }, [listingId, router]);

  useEffect(() => { void fetchListingDetails(); }, [fetchListingDetails]);

  const pickImage = async () => {
    const remainingSlots = 5 - images.length;
    if (remainingSlots <= 0) {
      Toast.show({ type: 'info', text1: 'Limit Reached', text2: 'You can have up to 5 photos.', position: 'top' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 1,
    });
    
    if (!result.canceled) { 
      setIsProcessingImages(true);
      try {
        const newProcessed: { uri: string; base64: string }[] = [];
        const newUris: string[] = [];

        for (const asset of result.assets) {
          const compressed = await ImageManipulator.manipulateAsync(
            asset.uri, 
            [{ resize: { width: 1080 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          newProcessed.push({ uri: compressed.uri, base64: compressed.base64! });
          newUris.push(compressed.uri);
        }
        
        setImages(prev => [...prev, ...newUris].slice(0, 5)); 
        setNewImagesBase64(prev => [...prev, ...newProcessed]); 
      } catch (err) {
        Toast.show({ type: 'error', text1: 'Compression Error', text2: 'Could not process selected image.', position: 'top' });
      } finally {
        setIsProcessingImages(false);
      }
    }
  };

  const removeImage = (indexToRemove: number) => {
    const removedUri = images[indexToRemove];
    setImages(prev => prev.filter((_, i) => i !== indexToRemove));
    setNewImagesBase64(prev => prev.filter(item => item.uri !== removedUri));
  };

  const updateAd = async () => {
    if (!title.trim() || !price || !category || !location.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'Please fill in all required fields.', position: 'top' });
      return;
    }
    if (images.length === 0) {
      Toast.show({ type: 'error', text1: 'Photo Required', text2: 'Please keep at least one photo.', position: 'top' });
      return;
    }

    setSaving(true);
    try {
      // 1. Separate existing Supabase URLs from newly selected local URIs
      const finalUrls: string[] = [];

      for (const uri of images) {
        // If it's already a hosted URL, keep it
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          finalUrls.push(uri);
        } else {
          // Find matching base64 payload to upload
          const match = newImagesBase64.find(item => item.uri === uri);
          if (match && match.base64) {
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const { error: uploadError } = await supabase.storage
              .from('listing_images')
              .upload(fileName, decode(match.base64), { contentType: 'image/jpeg' });
            
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('listing_images').getPublicUrl(fileName);
            finalUrls.push(publicUrl);
          }
        }
      }
      
      // 2. Update listing record
      const { error: dbError } = await supabase.from('listings').update({
        title: title.trim(), 
        price: parseFloat(price), 
        location: location.trim(), 
        description: description.trim(), 
        highlights: highlights.length > 0 ? highlights : null,
        image_urls: finalUrls, 
        approval_status: 'pending', // Re-triggers automated review
        moderation_note: null, 
      }).eq('id', listingId);

      if (dbError) throw dbError; 

      Toast.show({ type: 'success', text1: 'Changes Submitted', text2: 'Your ad is under review.', position: 'top' });
      router.replace('/my-ads');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Could not update ad.', position: 'top' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Ad</Text>
          <View style={{ width: 28 }} />
        </View>
        <Skeleton width="100%" height={120} borderRadius={12} style={{ marginBottom: 24 }} />
        <Skeleton width={80} height={16} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 20 }} />
        <Skeleton width={80} height={16} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={56} borderRadius={12} style={{ marginBottom: 20 }} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Ad</Text>
        <View style={{ width: 28 }} />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Photos ({images.length}/5)</Text>
      
      {/* Multi-Image Scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
        {images.length < 5 && (
          <TouchableOpacity 
            style={[styles.addImageBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} 
            onPress={pickImage}
          >
            <Ionicons name="camera" size={28} color={colors.textSecondary} />
            <Text style={[styles.addImageText, { color: colors.textSecondary }]}>Add Photo</Text>
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
              <View style={styles.coverBadge}>
                <Text style={styles.coverBadgeText}>Cover</Text>
              </View>
            )}
            <Image source={{ uri }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
              <Ionicons name="close-circle" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

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

      <TouchableOpacity 
        style={[styles.button, { backgroundColor: colors.tint }]} 
        onPress={updateAd} 
        disabled={saving || isProcessingImages}
      >
        {saving ? (
          <ActivityIndicator color={isDark ? '#000' : '#fff'} />
        ) : (
          <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Submit for Review</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  
  imageScroll: { flexDirection: 'row', marginBottom: 20 },
  addImageBtn: { width: 100, height: 100, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  addImageText: { marginTop: 4, fontSize: 12, fontWeight: '500' },
  imagePreviewContainer: { position: 'relative', marginRight: 12 },
  imagePreview: { width: 100, height: 100, borderRadius: 12 },
  removeImageBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 12 },
  coverBadge: { position: 'absolute', bottom: 6, left: 6, zIndex: 5, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  input: { 
    borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16, 
    borderWidth: 0 
  },
  textArea: { height: 110, textAlignVertical: 'top' },
  button: { 
    padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 16,
    ...Platform.select({ default: { elevation: 5, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }})
  },
  buttonText: { fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  cancelText: { fontSize: 16 },
});