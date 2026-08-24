import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext'; // ✨ Import Theme

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
};

export default function ConfirmModal({ visible, title, message, onConfirm, onCancel, isDestructive = false }: ConfirmModalProps) {
  const { colors, isDark } = useTheme(); // ✨ Use Theme Colors

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        {/* ✨ Dynamic Background */}
        <View style={[styles.modalView, { backgroundColor: colors.card }]}> 
          
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          
          <View style={[styles.buttonContainer, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.button, styles.cancelButton, { borderRightColor: colors.border }]} onPress={onCancel}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
              <Text style={[styles.buttonText, { color: isDestructive ? '#FF3B30' : colors.tint, fontWeight: 'bold' }]}>
                {isDestructive ? 'Delete' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', marginHorizontal: 20, marginBottom: 20 },
  button: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  modalView: { 
    width: '80%', borderRadius: 14, alignItems: 'center', overflow: 'hidden',
    borderWidth: 0,
    ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }, default: { elevation: 10, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 } })
  },
  buttonContainer: { 
    flexDirection: 'row', 
    borderTopWidth: 0 // Removed harsh divider line
  },
  cancelButton: { 
    borderRightWidth: 0 // Removed harsh divider line
  },
  confirmButton: {},
  buttonText: { fontSize: 16 },
});