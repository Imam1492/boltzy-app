import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';

class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    // ✨ FIX: Use Expo's native hardware crypto to safely generate a 256-bit (32 byte) key
    const encryptionKey = await Crypto.getRandomBytesAsync(32);

    // Initialize the AES cipher
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    // Save the encryption key in the hardware-backed SecureStore (well under 2KB)
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    // Return the heavily encrypted string to be stored elsewhere
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    // Retrieve the AES key from the hardware vault
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return encryptionKeyHex;

    // Initialize the cipher with the retrieved key
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  // Supabase Auth Adapter Interface Methods
  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return encrypted;
    return await this._decrypt(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

export const secureStorage = new LargeSecureStore();