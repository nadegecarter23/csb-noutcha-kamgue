import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme';

/** Disposition racine : zone sûre native, barre d’état et navigation sans en-têtes doublons. */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Inter-Medium': require('../assets/fonts/Inter-Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Manrope-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });
  if (!fontsLoaded && !fontError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SafeAreaProvider>
  );
}
