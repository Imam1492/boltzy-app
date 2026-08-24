import { Platform } from 'react-native';
import { supabase } from '../supabase';

// ✨ SAFE WRAPPER: Only configure notifications if the native module exists
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async (): Promise<any> => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.log("Expo Notifications module not found.");
}

export async function registerForPushNotificationsAsync(userId: string) {
  let token;
  try {
    const Device = require('expo-device');
    const Notifications = require('expo-notifications');
    const Constants = require('expo-constants').default;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
      
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      
      if (token && userId) {
        await supabase
          .from('profiles')
          .update({ push_token: token })
          .eq('id', userId);
      }
    }
  } catch (error) {
    console.log("Could not register for push notifications. Native modules missing.");
  }
  return token;
}