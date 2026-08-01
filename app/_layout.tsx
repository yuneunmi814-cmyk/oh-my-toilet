import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FavoritesProvider } from "@/store/favorites";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FavoritesProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "800" },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Oh My Toilet 🚽" }} />
          <Stack.Screen name="map" options={{ title: "지도로 보기" }} />
          <Stack.Screen name="favorites" options={{ title: "즐겨찾기 ⭐" }} />
        </Stack>
      </FavoritesProvider>
    </SafeAreaProvider>
  );
}
