import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';

export default function ModerateAds() {
  const router = useRouter();
 const { colors, isDark, toggleTheme } = useTheme(); // ✨ Ensure toggleTheme is here

  const [pendingAds, setPendingAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [isRejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkAdminAndFetchAds();
  }, []);

  const checkAdminAndFetchAds = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace('/');

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      router.replace('/');
      return;
    }

    setIsAdmin(true);
    fetchPendingAds();
  };

  const fetchPendingAds = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        seller:profiles!seller_id(display_name, email)
      `)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching pending ads:", error);
      Toast.show({ type: 'error', text1: 'Fetch Error', text2: error.message, position: 'top' });
    } else {
      setPendingAds(data || []);
    }
    setLoading(false);
  };

  const handleApprove = async (adId: string) => {
    Alert.alert('Approve Ad?', 'This ad will immediately go live on the home feed.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Approve', 
        style: 'default', 
        onPress: async () => {
          setProcessing(true);
          const { error } = await supabase.rpc('admin_moderate_ad', {
            p_listing_id: adId,
            p_status: 'approved',
            p_note: null
          });

          setProcessing(false);
          if (error) {
            Alert.alert('Approval Failed', error.message);
          } else {
            Toast.show({ type: 'success', text1: 'Ad Approved', text2: 'It is now live.', position: 'top' });
            setPendingAds(prev => prev.filter(ad => ad.id !== adId));
          }
        } 
      }
    ]);
  };

  const openRejectModal = (adId: string) => {
    setSelectedAdId(adId);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const executeReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please provide a reason so the user knows what to fix.');
      return;
    }

    setProcessing(true);
    const { error } = await supabase.rpc('admin_moderate_ad', {
      p_listing_id: selectedAdId,
      p_status: 'rejected',
      p_note: rejectReason.trim()
    });
    setProcessing(false);

    if (error) {
      Alert.alert('Rejection Failed', error.message);
    } else {
      Toast.show({ type: 'info', text1: 'Ad Rejected', text2: 'The user will see your moderation note.', position: 'top' });
      setPendingAds(prev => prev.filter(ad => ad.id !== selectedAdId));
      setRejectModalVisible(false);
    }
  };

  if (loading || !isAdmin) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.text} /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Moderation Queue</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={pendingAds}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color="#4CAF50" />
            <Text style={[styles.emptyText, { color: colors.text }]}>Inbox Zero!</Text>
            <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>All pending ads have been reviewed.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.adCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.adMainRow}>
              {item.image_urls?.[0] ? (
                <Image source={{ uri: item.image_urls[0] }} style={styles.adThumb} />
              ) : (
                <View style={[styles.adThumb, styles.adThumbFallback, { backgroundColor: colors.backgroundSecondary }]}>
                  <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
                </View>
              )}
              
              <View style={styles.adInfo}>
                <Text style={[styles.adTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.adPrice}>₹{item.price}</Text>
                <Text style={[styles.adDetail, { color: colors.textSecondary }]} numberOfLines={1}>📍 {item.location}</Text>
                <Text style={[styles.adDetail, { color: colors.textSecondary }]} numberOfLines={1}>👤 {item.seller?.display_name || 'Unknown User'}</Text>
              </View>
            </View>

            <View style={[styles.descriptionBox, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.descText, { color: colors.textSecondary }]} numberOfLines={3}>{item.description}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => openRejectModal(item.id)} disabled={processing}>
                <Ionicons name="close" size={18} color="#FF3B30" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)} disabled={processing}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={isRejectModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reject Ad</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>Provide a reason. The user will see this note and be asked to fix their listing.</Text>
            
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g., Please upload clearer photos of the item."
              placeholderTextColor={colors.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={() => setRejectModalVisible(false)} disabled={processing}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={executeReject} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Confirm Rejection</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptySubText: { fontSize: 14, marginTop: 8 },
  adCard: { borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, elevation: 1 },
  adMainRow: { flexDirection: 'row', marginBottom: 12 },
  adThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 12 },
  adThumbFallback: { justifyContent: 'center', alignItems: 'center' },
  adInfo: { flex: 1, justifyContent: 'space-between' },
  adTitle: { fontSize: 15, fontWeight: '600' },
  adPrice: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  adDetail: { fontSize: 12, marginTop: 2 },
  descriptionBox: { padding: 10, borderRadius: 8, marginBottom: 16 },
  descText: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 12 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8, backgroundColor: '#ffebee', borderWidth: 1, borderColor: '#ffcdd2' },
  rejectBtnText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 15 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8, backgroundColor: '#34C759' },
  approveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  modalSub: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15, height: 100, textAlignVertical: 'top', marginBottom: 20 },
  modalActionRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold', fontSize: 15 },
  modalSubmitBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});