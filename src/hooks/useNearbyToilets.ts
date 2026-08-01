import { useCallback, useEffect, useState } from "react";
import { getNearbyToilets } from "@/api/toilets";
import type { Coords } from "@/hooks/useLocation";
import type { ToiletWithDistance } from "@/types/toilet";

/** 현재 위치 기준 가까운 화장실을 조회하는 공용 훅 (홈·지도 화면 공유). */
export function useNearbyToilets(coords: Coords | null) {
  const [toilets, setToilets] = useState<ToiletWithDistance[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    try {
      setToilets(await getNearbyToilets(coords));
    } finally {
      setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { toilets, loading, reload };
}
