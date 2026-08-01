import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Toilet } from "@/types/toilet";

const STORAGE_KEY = "omt.favorites.v1";

interface FavoritesContextValue {
  favorites: Toilet[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (toilet: Toilet & { distanceMeters?: number }) => void;
  /** AsyncStorage 로딩 완료 여부 */
  ready: boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/**
 * 즐겨찾기를 기기에 영구 저장(AsyncStorage)하고 앱 전역에서 공유한다.
 * 화장실 객체 전체를 저장하므로, 나중에 그 근처에 가기 전에 미리
 * 확인해두는 "미리 저장" 시나리오(시니어 안심)를 지원한다.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Toilet[]>([]);
  const [ready, setReady] = useState(false);

  // 최초 1회 로드
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setFavorites(JSON.parse(raw));
      } catch (e) {
        console.warn("[favorites] 로드 실패", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // 변경 시 저장 (로드 완료 후에만)
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)).catch((e) =>
      console.warn("[favorites] 저장 실패", e)
    );
  }, [favorites, ready]);

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (toilet: Toilet & { distanceMeters?: number }) => {
      // 거리(distanceMeters)는 위치에 따라 변하므로 저장하지 않는다.
      const { distanceMeters: _drop, ...base } = toilet;
      setFavorites((prev) =>
        prev.some((f) => f.id === base.id)
          ? prev.filter((f) => f.id !== base.id)
          : [base, ...prev]
      );
    },
    []
  );

  return (
    <FavoritesContext.Provider
      value={{ favorites, isFavorite, toggleFavorite, ready }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}
