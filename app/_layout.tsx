import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FavoritesProvider } from "@/store/favorites";
import { SettingsProvider } from "@/store/settings";
import { SubmissionsProvider } from "@/store/submissions";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <FavoritesProvider>
          <SubmissionsProvider>
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
              <Stack.Screen name="submit" options={{ title: "화장실 제보하기 ➕" }} />
              <Stack.Screen name="my-submissions" options={{ title: "내 제보 관리 🙋" }} />
            </Stack>
          </SubmissionsProvider>
        </FavoritesProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
