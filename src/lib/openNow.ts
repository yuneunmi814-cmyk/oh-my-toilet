/**
 * 개방시간 문자열로 "지금 개방 중"인지 판별한다.
 * @returns true=개방, false=닫힘, null=알 수 없음(파싱 불가/정보 없음)
 *
 * 지원 형식:
 *   "상시개방", "24시간", "연중무휴", "항상" → 항상 개방
 *   "09:00~18:00", "09:00-18:00", "평일 05:00~24:00" → 시간 범위
 *   자정을 넘는 범위(예: 22:00~02:00)도 처리
 */
export function isOpenNow(openHours?: string, now: Date = new Date()): boolean | null {
  if (!openHours) return null;
  const s = openHours.replace(/\s/g, "");

  if (/상시|24시간|24H|연중무휴|항상|always/i.test(s)) return true;
  if (/휴무|폐쇄|닫힘|closed/i.test(s)) return false;

  const m = s.match(/(\d{1,2}):(\d{2})[~\-–](\d{1,2}):(\d{2})/);
  if (!m) return null;

  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const cur = now.getHours() * 60 + now.getMinutes();

  // 종료가 시작보다 작거나 같으면 자정을 넘는 범위로 간주
  if (end <= start) return cur >= start || cur < end;
  return cur >= start && cur < end;
}
