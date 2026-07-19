import 'react-native-url-polyfill/auto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { LanguageProvider } from '../context/LanguageContext';

export default function RootLayout() {
  // #region agent log
  fetch('http://127.0.0.1:7546/ingest/42e54d35-cc8a-4b1b-bffe-c2beae8d3b77', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6726c7' },
    body: JSON.stringify({
      sessionId: '6726c7',
      location: 'app/_layout.tsx',
      message: 'root_layout_mounted',
      data: { hypothesisId: 'H1' },
      timestamp: Date.now(),
      runId: 'boot',
      hypothesisId: 'H1',
    }),
  }).catch(() => {});
  // #endregion

  return (
    <LanguageProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </LanguageProvider>
  );
}
