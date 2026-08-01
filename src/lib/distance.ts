/** 두 좌표 사이의 하버사인 직선거리를 미터 단위로 반환한다. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // 지구 반지름 (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 거리(m)를 사람이 읽기 좋은 문자열로 변환한다. (예: 320m / 1.2km) */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 도보 예상 시간 (분). 평균 보행속도 67m/분 기준. */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 67));
}
