import { useCallback, useEffect, useState } from "react";
import { getNearbyToilets } from "@/api/toilets";
import type { Coords } from "@/hooks/useLocation";
import { useSubmissions } from "@/store/submissions";
import type { ToiletWithDistance } from "@/types/toilet";

/**
 * 현재 위치 기준 가까운 화장실을 조회하는 공용 훅 (홈·지도 화면 공유).
 * 공공/목업 데이터셋에 사용자 제보를 합쳐서 거리순으로 반환한다.
 */
export function useNearbyToilets(coords: Coords | null) {
  const { submissions } = useSubmissions();
  const [toilets, setToilets] = useState<ToiletWithDistance[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    try {
      setToilets(await getNearbyToilets(coords, submissions));
    } finally {
      setLoading(false);
    }
  }, [coords, submissions]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { toilets, loading, reload };
}
