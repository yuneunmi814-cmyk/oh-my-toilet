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

const STORAGE_KEY = "omt.submissions.v1";

interface SubmissionsContextValue {
  /** 사용자가 제보한 화장실 목록 */
  submissions: Toilet[];
  addSubmission: (toilet: Toilet) => void;
  removeSubmission: (id: string) => void;
  ready: boolean;
}

const SubmissionsContext = createContext<SubmissionsContextValue | null>(null);

/**
 * 사용자가 직접 제보한 화장실을 기기에 저장하고 전역 공유한다.
 * 공공데이터가 못 따라오는 현장(예: 새로 생긴 개방화장실)을 채우는 용도.
 * (향후 서버 공유/검수 단계로 확장 예정)
 */
export function SubmissionsProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState<Toilet[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSubmissions(JSON.parse(raw));
      } catch (e) {
        console.warn("[submissions] 로드 실패", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(submissions)).catch((e) =>
      console.warn("[submissions] 저장 실패", e)
    );
  }, [submissions, ready]);

  const addSubmission = useCallback((toilet: Toilet) => {
    setSubmissions((prev) => [toilet, ...prev]);
  }, []);

  const removeSubmission = useCallback((id: string) => {
    setSubmissions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <SubmissionsContext.Provider
      value={{ submissions, addSubmission, removeSubmission, ready }}
    >
      {children}
    </SubmissionsContext.Provider>
  );
}

export function useSubmissions() {
  const ctx = useContext(SubmissionsContext);
  if (!ctx) {
    throw new Error("useSubmissions must be used within SubmissionsProvider");
  }
  return ctx;
}
