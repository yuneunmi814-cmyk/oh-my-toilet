# Oh My Toilet 🚽

내 주변 화장실을 3초 안에 찾아주는 위치 기반 앱.
**"길 가다 급한 사람"부터 "화장실 위치를 미리 알아둬야 안심되는 시니어와 그 가족"까지.**

> React Native + Expo 기반. 토스 미니앱(앱인토스) → 구글 플레이 순으로 확장하는 것을 목표로 코드베이스를 구성했습니다.

---

## MVP 범위

| 포함 (v0.1~0.4) | 이후 버전 |
| --- | --- |
| 내 위치 기준 가까운 화장실 리스트 (거리순) | 사용자 제보 / 리뷰 |
| 지도 뷰 (핀 · 현재위치 · 탭하면 길찾기) | 필터 (장애인/무료/개방중) |
| 즐겨찾기 (기기 저장 · "미리 저장" 지원) | 가족 공유 |
| 시니어 큰 글씨 모드 (전역 폰트 배율) | OSM 데이터 병합 · 전국 커버리지 |
| 화장실 상세: 개방시간 · 장애인칸 · 무료 여부 | |
| 카카오맵 길찾기 연결 · 위치권한 · 목업 폴백 | |

핵심 지표: **앱을 열었을 때 가장 가까운 화장실이 즉시 뜬다.**

---

## 빠른 시작

```bash
npm install
npx expo start
```

- Expo Go 앱으로 QR 코드를 찍으면 실기기에서 바로 실행됩니다.
- **앱 실행에는 API 키가 필요 없습니다.** 실데이터([`src/data/toilets.json`](src/data/toilets.json))가
  비어 있으면 서울 시청 주변 목업으로 동작하므로 UI를 바로 확인할 수 있습니다.
- 실데이터를 채우려면 아래 [데이터 파이프라인](#데이터-파이프라인-실행법)을 실행하세요.
- 네이티브 의존성 버전을 맞추려면: `npx expo install`

---

## 데이터 소스

### 공공데이터 + 카카오 지오코딩 (메인)

원본은 **전국공중화장실표준데이터**(공공데이터포털 15012892)를 쓴다.

> ⚠️ **중요:** 이 표준데이터는 **2025년 2월부터 WGS84 위·경도 좌표 제공이 중단**됐고,
> 현재 오픈 API 없이 **CSV 다운로드만** 제공된다. 위치 기반 앱에 쓰려면 CSV의
> **주소를 좌표로 변환(지오코딩)** 해야 한다. → [`scripts/build-toilets.mjs`](scripts/build-toilets.mjs)

생성된 좌표 데이터는 [`src/data/toilets.json`](src/data/toilets.json) 에 저장되고,
앱은 이를 번들에 포함해 클라이언트에서 거리순 정렬한다 ([`src/api/toilets.ts`](src/api/toilets.ts)).
데이터셋이 비어 있으면 자동으로 목업으로 폴백한다.

#### 데이터 파이프라인 실행법

```bash
# 1) 공공데이터포털에서 CSV 다운로드 (포털 로그인 필요)
#    https://www.data.go.kr/data/15012892/standard.do  → "다운로드"

# 2) 카카오 REST API 키 발급
#    https://developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키

# 3) 지오코딩 실행 (지역 한정 권장 — 번들 크기 축소)
KAKAO_REST_API_KEY=xxxx npm run build:toilets -- \
  --csv ~/Downloads/전국공중화장실표준데이터.csv \
  --sido "서울특별시"
```

- 재실행 시 `scripts/.geocode-cache.json` 에 캐싱된 좌표를 재사용 → 중단해도 이어서 진행
- 옵션: `--out <경로>`, `--limit <n>`(테스트), `--sido` 생략 시 전국
- CSV가 EUC-KR이면 `iconv`로 자동 변환

### OpenStreetMap `amenity=toilets` (보완 예정)

- 공공데이터에 없는 카페·건물 화장실, 유료 여부(`fee=yes`), 휠체어 접근(`wheelchair=yes`) 포함
- 좌표 내장 + Overpass API 반경 조회 가능 (무료, 키 불필요) → 커버리지 보완용

---

## 지도 (react-native-maps)

- **Expo Go 개발 중에는 별도 키 없이** 지도가 뜹니다 (Expo가 제공하는 키 사용).
- iOS 정식 빌드는 Apple Maps라 키가 필요 없습니다.
- **Android 정식(standalone) 빌드**에는 본인 Google Maps API 키가 필요합니다.
  Google Cloud Console에서 "Maps SDK for Android" 키를 발급받아 `app.json` 에 추가하세요:
  ```json
  "android": {
    "config": { "googleMaps": { "apiKey": "YOUR_ANDROID_MAPS_KEY" } }
  }
  ```

## 프로젝트 구조

```
oh-my-toilet/
├── app/                    # expo-router 화면
│   ├── _layout.tsx         # 루트 네비게이션 + FavoritesProvider
│   ├── index.tsx           # 홈: 가까운 화장실 리스트
│   ├── map.tsx             # 지도 뷰 (마커 + 길찾기)
│   └── favorites.tsx       # 즐겨찾기 목록
├── src/
│   ├── api/
│   │   ├── toilets.ts      # 데이터셋 로드 + 거리순 정렬 + 목업 폴백
│   │   └── mockToilets.ts  # 데이터 없을 때 쓰는 목업 데이터
│   ├── data/
│   │   └── toilets.json    # 파이프라인 생성 좌표 데이터 (기본 비어있음)
│   ├── components/
│   │   ├── ToiletCard.tsx  # 화장실 리스트 카드
│   │   └── AppText.tsx     # 큰 글씨 배율 반영 Text
│   ├── hooks/
│   │   ├── useLocation.ts       # 위치 권한 + 현재 위치
│   │   └── useNearbyToilets.ts  # 가까운 화장실 조회 (홈·지도 공유)
│   ├── lib/
│   │   ├── distance.ts     # 하버사인 거리 · 도보시간
│   │   └── directions.ts   # 카카오맵 길찾기 연결
│   ├── store/
│   │   ├── favorites.tsx   # 즐겨찾기 Context (AsyncStorage 영구저장)
│   │   └── settings.tsx    # 앱 설정 Context (큰 글씨 모드 등)
│   ├── theme/              # 시니어 접근성 고려 테마
│   └── types/
│       └── toilet.ts       # 화장실 데이터 타입
├── scripts/
│   └── build-toilets.mjs   # CSV → 카카오 지오코딩 → toilets.json
├── app.json                # Expo 설정 (권한/플러그인)
└── .env.example            # KAKAO_REST_API_KEY (파이프라인용)
```

---

## 로드맵

- [x] **v0.1** 리스트 MVP
- [x] **v0.2** 지도 뷰 (마커 + 길찾기)
- [x] **v0.3** 즐겨찾기 · 시니어 큰글씨 모드
- [x] **v0.4** 공공데이터 + 카카오 지오코딩 파이프라인 (실데이터 연동)
- [ ] **v0.5** 필터(장애인/무료/개방중) · OSM 병합 · 전국 커버리지
- [ ] **v1.0** 토스 앱인토스(미니앱) 출시 → 이후 구글 플레이

### 앱인토스(미니앱) 참고

- 개발자센터: https://developers-apps-in-toss.toss.im
- 미니앱 가이드라인(서비스 제한) 확인 필수: https://developers-apps-in-toss.toss.im/checklist/miniapp-service.html
- 계약 없이 개인 개발자도 출시 가능. WebView / React Native SDK 지원 → 이 코드베이스 재사용 가능.

---

## 라이선스

TBD
