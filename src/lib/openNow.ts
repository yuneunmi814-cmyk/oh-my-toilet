/**
 * 개방시간 문자열로 "지금 개방 중"인지 판별한다.
 * @returns true=개방, false=닫힘, null=알 수 없음(파싱 불가/정보 없음)
 *
 * 지원 형식:
 *   "00:00~24:00(상시)", "상시개방", "24시간" → 항상 개방
 *   "07:00~22:00(상시)", "09:00~18:00(매일)" → 매일 그 시간대
 *   "09:00~18:00(평일)" → 평일만 (주말 닫힘)
 *   "09:00~18:00(월~토)", "08:00~22:00(화~일)" → 요일 범위 (OSM 유래)
 *   자정을 넘는 범위(예: 22:00~02:00)도 처리
 *
 * OSM 원문("Mo-Fr 09:00-18:00", "24/7")은 파이프라인의 normalizeOpenHours 가
 * 위 형식으로 바꿔서 넣는다. 여기서 OSM 문법을 다시 파싱하지 않는다.
 */

/** 한국어 요일 → Date.getDay() 값 (0=일) */
const DAY_INDEX: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

/** "월~토" 같은 요일 범위에 오늘이 포함되는지 (일요일을 넘어 도는 범위도 처리) */
function inDayRange(from: string, to: string, day: number): boolean {
  const a = DAY_INDEX[from];
  const b = DAY_INDEX[to];
  if (a === undefined || b === undefined) return true;
  return a <= b ? day >= a && day <= b : day >= a || day <= b;
}

export function isOpenNow(openHours?: string, now: Date = new Date()): boolean | null {
  if (!openHours) return null;
  const s = openHours.replace(/\s/g, "");

  if (/휴무|폐쇄|닫힘|closed/i.test(s)) return false;

  const day = now.getDay(); // 0=일, 6=토
  const isWeekend = day === 0 || day === 6;

  // "평일/월~금" 표기인데 주말이면 닫힘
  if (isWeekend && /평일|월~금|월-금/.test(s)) return false;

  // "(월~토)", "(화~일)" 같은 요일 범위 — 범위 밖이면 닫힘
  const dayRange = s.match(/\(([일월화수목금토])[~\-]([일월화수목금토])\)/);
  if (dayRange && !inDayRange(dayRange[1], dayRange[2], day)) return false;

  // 시간 범위가 있으면 그것을 우선 사용 ("상시"는 매일이라는 뜻이지 24시간이 아님)
  const m = s.match(/(\d{1,2}):(\d{2})[~\-–](\d{1,2}):(\d{2})/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    const cur = now.getHours() * 60 + now.getMinutes();
    // 종료가 시작보다 작거나 같으면 자정을 넘는 범위로 간주
    if (end <= start) return cur >= start || cur < end;
    return cur >= start && cur < end;
  }

  // 범위 없이 "상시개방/24시간" 등만 있으면 항상 개방
  if (/상시|24시간|24H|연중무휴|항상|always/i.test(s)) return true;

  return null;
}
