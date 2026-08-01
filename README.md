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
cp .env.example .env   # (선택) 공공데이터 API 키 입력
npx expo start
```

- Expo Go 앱으로 QR 코드를 찍으면 실기기에서 바로 실행됩니다.
- **API 키가 없어도** 서울 시청 주변 목업 데이터로 동작하므로 UI를 바로 확인할 수 있습니다.
- 네이티브 의존성 버전을 맞추려면: `npx expo install`

---

## 데이터 소스

### 1. 공공데이터포털 – 전국공중화장실표준데이터 (메인)

- 활용신청: https://www.data.go.kr/data/15012892/standard.do
- 발급받은 **일반 인증키(Decoding)** 를 `.env` 의 `EXPO_PUBLIC_PUBLIC_DATA_API_KEY` 에 입력
- 연동 코드: [`src/api/toilets.ts`](src/api/toilets.ts)

> ⚠️ 표준데이터 API는 좌표 반경 검색을 지원하지 않고 전체 목록을 페이지로 내려줍니다.
> MVP는 한 페이지를 받아 클라이언트에서 거리순 정렬합니다.
> 전국 확장 시에는 데이터를 서버/DB에 적재해 반경 쿼리로 바꾸는 것을 권장합니다.

### 2. OpenStreetMap `amenity=toilets` (보완 예정)

- 공공데이터에 없는 카페·건물 화장실, 유료 여부(`fee=yes`), 휠체어 접근(`wheelchair=yes`) 포함
- Overpass API로 실시간 조회 가능 (무료)

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
│   │   ├── toilets.ts      # 공공데이터 API 연동 + 목업 폴백
│   │   └── mockToilets.ts  # 키 없을 때 쓰는 목업 데이터
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
├── app.json                # Expo 설정 (권한/플러그인)
└── .env.example
```

---

## 로드맵

- [ ] **v0.1** 리스트 MVP (현재)
- [ ] **v0.2** 지도 뷰 + 필터(장애인/무료/개방중)
- [ ] **v0.3** 즐겨찾기 · 시니어 큰글씨 모드
- [ ] **v0.4** OSM 데이터 병합, 전국 커버리지
- [ ] **v1.0** 토스 앱인토스(미니앱) 출시 → 이후 구글 플레이

### 앱인토스(미니앱) 참고

- 개발자센터: https://developers-apps-in-toss.toss.im
- 미니앱 가이드라인(서비스 제한) 확인 필수: https://developers-apps-in-toss.toss.im/checklist/miniapp-service.html
- 계약 없이 개인 개발자도 출시 가능. WebView / React Native SDK 지원 → 이 코드베이스 재사용 가능.

---

## 라이선스

TBD
