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
  /** 위치정보 이용 동의 여부. null=아직 선택 안 함 */
  locationConsent: boolean | null;
}

interface SettingsContextValue extends Settings {
  /** 현재 폰트 배율 (일반 1.0 / 큰 글씨 1.35) */
  fontScale: number;
  toggleLargeText: () => void;
  setLocationConsent: (agreed: boolean) => void;
  ready: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** 앱 설정(큰 글씨 모드·위치동의 등)을 기기에 저장하고 전역 공유한다. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [largeText, setLargeText] = useState(false);
  const [locationConsent, setConsent] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setLargeText(!!parsed.largeText);
          if (typeof parsed.locationConsent === "boolean") {
            setConsent(parsed.locationConsent);
          }
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
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ largeText, locationConsent })
    ).catch((e) => console.warn("[settings] 저장 실패", e));
  }, [largeText, locationConsent, ready]);

  const toggleLargeText = useCallback(() => setLargeText((v) => !v), []);
  const setLocationConsent = useCallback(
    (agreed: boolean) => setConsent(agreed),
    []
  );

  return (
    <SettingsContext.Provider
      value={{
        largeText,
        locationConsent,
        fontScale: largeText ? LARGE_TEXT_SCALE : 1,
        toggleLargeText,
        setLocationConsent,
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
