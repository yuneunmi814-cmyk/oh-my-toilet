import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "omt.settings.v1";

/** 큰 글씨 모드일 때 폰트에 곱하는 배율 */
export const LARGE_TEXT_SCALE = 1.35;

interface Settings {
  largeText: boolean;
}

interface SettingsContextValue extends Settings {
  /** 현재 폰트 배율 (일반 1.0 / 큰 글씨 1.35) */
  fontScale: number;
  toggleLargeText: () => void;
  ready: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** 앱 설정(큰 글씨 모드 등)을 기기에 저장하고 전역 공유한다. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [largeText, setLargeText] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setLargeText(!!parsed.largeText);
        }
      } catch (e) {
        console.warn("[settings] 로드 실패", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ largeText })).catch((e) =>
      console.warn("[settings] 저장 실패", e)
    );
  }, [largeText, ready]);

  const toggleLargeText = useCallback(() => setLargeText((v) => !v), []);

  return (
    <SettingsContext.Provider
      value={{
        largeText,
        fontScale: largeText ? LARGE_TEXT_SCALE : 1,
        toggleLargeText,
        ready,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
