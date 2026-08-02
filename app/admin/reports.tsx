import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export default function AdminReports() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminAndFetchReports();
  }, []);

  const checkAdminAndFetchReports = async () => {
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
    fetchReports();
  };

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reports')
      .select(`
        *,
        reporter:profiles!reporter_id(display_name),
        listing:listings(title, seller_id)
      `)
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching reports:", error);
    else setReports(data || []);
    setLoading(false);
  };

  const handleDismiss = async (reportId: string) => {
    await supabase.from('reports').delete().eq('id', reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  const handleDeleteListing = async (listingId: string, reportId: string) => {
    Alert.alert('Delete Listing?', 'This will permanently remove the item.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          await supabase.from('listings').delete().eq('id', listingId);
          await supabase.from('reports').delete().eq('id', reportId);
          setReports(prev => prev.filter(r => r.id !== reportId));
          Alert.alert('Deleted', 'The listing has been removed.');
        } 
      }
    ]);
  };

  const handleBanUser = async (userId: string) => {
    if (!userId) return Alert.alert('Error', 'No user ID provided.');

    Alert.alert('Ban User?', 'Suspend this user for 30 days?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Ban 30 Days', 
        style: 'destructive', 
        onPress: async () => {
          const { error } = await supabase.rpc('admin_ban_user', {
            p_target_user_id: userId,
            p_ban_days: 30
          });

          if (error) {
            Alert.alert('Ban Failed', error.message);
          } else {
            Alert.alert('User Banned', 'They have been suspended for 30 days.');
          }
        } 
      }
    ]);
  };

  if (loading || !isAdmin) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.text} /></View>;
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Admin: Review Reports</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.textSecondary }]}>No pending reports! 🎉</Text>}
        renderItem={({ item }) => (
          <View style={[s.reportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <Text style={s.reasonText}>Reason: {item.reason}</Text>
              <Text style={[s.dateText, { color: colors.textSecondary }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            
            <Text style={[s.detailText, { color: colors.textSecondary }]}>Reported By: {item.reporter?.display_name || 'Unknown'}</Text>
            
            {item.listing_id && (
              <View style={[s.targetBox, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[s.targetLabel, { color: colors.textSecondary }]}>Target Listing:</Text>
                <Text style={[s.targetTitle, { color: colors.text }]}>{item.listing?.title || 'Listing deleted'}</Text>
              </View>
            )}

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.dismissBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={() => handleDismiss(item.id)}>
                <Text style={[s.btnTextBlack, { color: colors.text }]}>Dismiss</Text>
              </TouchableOpacity>
              
              {item.listing_id && (
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteListing(item.listing_id, item.id)}>
                  <Text style={s.btnTextWhite}>Delete Listing</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={[s.banBtn, { backgroundColor: colors.text }]} onPress={() => handleBanUser(item.listing?.seller_id || item.reported_user_id)}>
                <Text style={[s.btnTextWhite, { color: colors.background }]}>Ban User</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16 },
  reportCard: { borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  reasonText: { fontSize: 16, fontWeight: 'bold', color: '#FF3B30' },
  dateText: { fontSize: 12 },
  detailText: { fontSize: 14, marginBottom: 12 },
  targetBox: { padding: 10, borderRadius: 8, marginBottom: 16 },
  targetLabel: { fontSize: 12, fontWeight: 'bold' },
  targetTitle: { fontSize: 15, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8 },
  dismissBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  deleteBtn: { flex: 1.5, backgroundColor: '#FF3B30', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  banBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnTextBlack: { fontWeight: '600' },
  btnTextWhite: { fontWeight: '600' }
});