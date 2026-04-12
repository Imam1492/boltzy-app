import 'react-native-url-polyfill/auto';
import 'react-native-url-polyfill/auto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* No need to list screens, this hides headers for everything in the app folder */}
      </Stack>
    </>
  );
}