import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";

export interface Coords {
  latitude: number;
  longitude: number;
}

type Status = "idle" | "loading" | "granted" | "denied" | "error";

/**
 * 현재 위치를 한 번 가져오는 훅.
 * MVP에서는 실시간 추적(watch) 없이 진입 시 1회 조회로 충분하다.
 */
export function useLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const request = useCallback(async () => {
    setStatus("loading");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      setStatus("granted");
    } catch (e) {
      console.warn("[useLocation] failed", e);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  return { coords, status, refresh: request };
}
