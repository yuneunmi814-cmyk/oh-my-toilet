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
| 시니어 큰 글씨 모드 (전역 폰트 배율) | 제보 서버 공유 · 검수 |
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
- **앱 실행에는 API 키가 필요 없습니다.** 기본으로 **전국 화장실 6,784곳**
  실데이터([`src/data/toilets.json`](src/data/toilets.json))가 포함돼 있습니다.
  (OSM 전국 + 제천 개방화장실 42곳 병합 / 데이터셋이 비면 서울 목업으로 폴백)
- 데이터 갱신/확장은 아래 [데이터 파이프라인](#데이터-파이프라인) 참고.
- 네이티브 의존성 버전을 맞추려면: `npx expo install`

---

## 데이터 파이프라인

### 구조: 수집과 병합의 분리

```
scripts/sources/*.mjs  →  data/raw/<소스>.json  →  build-dataset  →  src/data/toilets.json
     (소스별 독립 수집)         (중간 산출물)         (병합·중복제거)        (앱 번들)
```

소스 스크립트는 **절대 `src/data/toilets.json` 을 직접 쓰지 않는다.**
각자 `data/raw/` 에만 쓰고, 병합은 [`build-dataset.mjs`](scripts/build-dataset.mjs) 가 전담한다.
(예전에는 각 스크립트가 최종 파일을 직접 덮어써서, 하나를 돌리면 다른 소스가 통째로 날아갔다.)

```bash
npm run fetch:osm        # 1) 수집 — 키 불필요, 좌표 내장
npm run fetch:jecheon    #    제천 개방화장실
npm run fetch:csv -- --csv <경로>   # 전국표준데이터 (지오코딩 필요)

npm run build:dataset    # 2) 병합 → src/data/toilets.json
npm run build:dataset -- --dry-run  #    저장 없이 통계만
```

### 소스 A. OpenStreetMap `amenity=toilets` — 키 불필요

**좌표가 데이터에 내장**돼 있어 지오코딩도, 포털 로그인도 필요 없다. 지금 바로 전국 수집이 된다.
(유럽 화장실 앱들이 콜드스타트 데이터로 쓰는 그 소스다.)

```bash
npm run fetch:osm                         # 전국
npm run fetch:osm -- --bbox 37.4,126.8,37.7,127.2   # 특정 영역만
```

- 스크립트: [`scripts/sources/osm.mjs`](scripts/sources/osm.mjs)
- 넓은 영역은 Overpass 가 타임아웃 나므로 2° 타일로 시작해 실패 시 4등분 재시도(적응형 분할)
- 타일 결과는 `data/raw/.osm-tiles.json` 에 캐시 → 중단해도 이어받음
- `access=private|no` 인 사유 화장실은 제외
- **한계: 이름·주소 결측이 많다**(전국 7,004건 중 이름 10%, 주소 8%). 좌표 커버리지용이고,
  이름·개방시간은 아래 B·C 가 채운다 → 그래서 병합 단계가 중요하다

### 소스 B. 전국공중화장실표준데이터 + 지오코딩

> ⚠️ **이 데이터셋(공공데이터포털 15012892)은 2025년 2월부터 WGS84 좌표 제공이 중단**됐고,
> 오픈 API 없이 **CSV 다운로드만** 제공된다. 위치 앱에 쓰려면 **주소 → 좌표 변환(지오코딩)** 이 필수다.
> 이 변환이 [`scripts/sources/public-csv.mjs`](scripts/sources/public-csv.mjs) 다.

```bash
# 1) CSV 다운로드 (포털 로그인 필요)
#    https://www.data.go.kr/data/15012892/standard.do → "다운로드"
# 2) 지오코딩 키 발급 → .env 또는 환경변수 (.env.example 참고)
# 3) 실행 (지역 한정 권장 — 번들·키 절약)
KAKAO_REST_API_KEY=xxxx npm run fetch:csv -- \
  --csv ~/Downloads/전국공중화장실표준데이터.csv \
  --sido "서울특별시"
```

| 제공자 | 키 | 속도 | 비고 |
| --- | --- | --- | --- |
| `kakao` | `KAKAO_REST_API_KEY` | 일 10만건 | 국내 주소 정확도 최상 **(권장)** |
| `vworld` | `VWORLD_API_KEY` | — | 국토부 공식, 도로명주소에 강함 |
| `nominatim` | 불필요 | 초당 1건 | 폴백용. 5만건이면 15시간+ |

- 기본 `auto` — 환경변수가 있는 제공자를 우선순위대로 자동 선택 (`--provider` 로 고정 가능)
- 좌표는 `scripts/.geocode-cache.json` 에 영구 캐싱 → 중단/재실행해도 이어서 진행
- **일일 한도에 걸리면 거기까지 저장하고 종료**하므로, 다음 날 같은 명령을 다시 돌리면 된다
- 실패 건은 `data/raw/public-csv.failures.json` 에 남는다 (대부분 옛 지번·오타 주소)
- CSV 가 EUC-KR/CP949 여도 `iconv` 로 자동 변환
- `화장실소유구분` 이 "개방"이면 `type: "open"` 으로 분류 → 앱에서 개방화장실 배지

### 소스 C. 지자체 개방화장실 공식 페이지

제천시는 개방화장실 현황을 공식 Notion 페이지로 공개하고 현장 표지판에 QR로 안내한다.
표의 네이버지도 링크(`naver.me`)를 따라가면 좌표가 나오므로 **지오코딩 없이** 데이터화된다.

```bash
npm run fetch:jecheon
```

- 스크립트: [`scripts/sources/jecheon-notion.mjs`](scripts/sources/jecheon-notion.mjs)
- 출처: 제천시 개방화장실 안내 Notion (2026.07 기준 45곳, 좌표확보 42곳)
- 개방시간·연락처까지 검증된 데이터라 **병합 시 최우선**(신뢰도 100)
- 다른 지자체도 유사 페이지가 있으면 같은 방식으로 인제스트 가능

### 보강. 역지오코딩으로 빈 주소 채우기 (선택)

OSM 은 좌표는 정확한데 주소 태그가 거의 없다(전국 수집분 기준 9%).
앱 카드에 주소가 없으면 "여기가 어디지?" 를 지도로 되짚어야 해서 시니어에게 특히 불친절하다.

```bash
KAKAO_REST_API_KEY=xxxx npm run enrich:addresses            # osm 소스 대상
npm run enrich:addresses -- --provider nominatim --limit 50  # 키 없이 소량 테스트
```

- 스크립트: [`scripts/enrich-addresses.mjs`](scripts/enrich-addresses.mjs)
- 주소가 빈 레코드만 골라 좌표 → 주소로 변환하고 같은 raw 파일에 다시 쓴다
- 정지오코딩과 같은 캐시를 쓰므로 중단해도 이어서 진행
- nominatim 응답은 영어식 역순이라 한국 주소 어순으로 재조립해서 저장한다

### 병합 규칙 ([`build-dataset.mjs`](scripts/build-dataset.mjs))

같은 화장실이 여러 소스에 중복 등장한다(제천 개방화장실은 표준데이터에도 있다).

- **동일 판정**: 15m 이내면 이름 무관 / 60m 이내면서 이름이 포함관계면 동일
- **남기는 쪽**: 소스 신뢰도 순 `jecheon(100) > public-csv(80) > osm(50)`
- **결측 병합**: 신뢰도 낮은 쪽에만 있는 필드(주소·개방시간·전화 등)는 살려서 채움
- **이상치 제거**: 국내 범위(위 33~38.7, 경 124.5~132) 밖 좌표는 지오코딩 오류로 보고 폐기
- 좌표를 100m 격자로 버킷팅해 인접 버킷만 비교 (5만건 전수비교 회피)

생성된 데이터는 앱 번들에 포함되어 클라이언트에서 거리순 정렬된다
([`src/api/toilets.ts`](src/api/toilets.ts)). 데이터셋이 비면 목업으로 폴백한다.

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
│   ├── favorites.tsx       # 즐겨찾기 목록
│   └── submit.tsx          # 사용자 제보 폼
├── src/
│   ├── api/
│   │   ├── toilets.ts      # 데이터셋 로드 + 거리순 정렬 + 목업 폴백
│   │   └── mockToilets.ts  # 데이터 없을 때 쓰는 목업 데이터
│   ├── data/
│   │   └── toilets.json    # 파이프라인 생성 좌표 데이터 (전국 6,784곳)
│   ├── components/
│   │   ├── ToiletCard.tsx  # 화장실 리스트 카드
│   │   ├── AppText.tsx     # 큰 글씨 배율 반영 Text
│   │   └── FilterBar.tsx   # 필터 칩 (장애인/개방중)
│   ├── hooks/
│   │   ├── useLocation.ts       # 위치 권한 + 현재 위치
│   │   └── useNearbyToilets.ts  # 가까운 화장실 조회 (홈·지도 공유)
│   ├── lib/
│   │   ├── distance.ts     # 하버사인 거리 · 도보시간
│   │   ├── directions.ts   # 카카오맵 길찾기 연결
│   │   └── openNow.ts      # 개방시간 → 지금 개방중 판별
│   ├── store/
│   │   ├── favorites.tsx   # 즐겨찾기 Context (AsyncStorage 영구저장)
│   │   ├── settings.tsx    # 앱 설정 Context (큰 글씨 모드 등)
│   │   └── submissions.tsx # 사용자 제보 Context (AsyncStorage)
│   ├── theme/              # 시니어 접근성 고려 테마
│   └── types/
│       └── toilet.ts       # 화장실 데이터 타입
├── scripts/                # 데이터 파이프라인
│   ├── lib/
│   │   ├── dataset.mjs     # raw 입출력 · 중복제거 · 좌표 검증
│   │   └── geocode.mjs     # 주소→좌표 (kakao/vworld/nominatim + 캐시)
│   ├── sources/            # 소스별 수집 → data/raw/*.json
│   │   ├── osm.mjs             # OSM Overpass (키 불필요, 좌표 내장)
│   │   ├── public-csv.mjs      # 전국표준데이터 CSV + 지오코딩
│   │   └── jecheon-notion.mjs  # 제천 개방화장실 Notion
│   ├── enrich-addresses.mjs # 좌표 → 주소 역지오코딩 (빈 주소 채우기)
│   └── build-dataset.mjs   # raw 병합 → src/data/toilets.json
├── data/raw/               # 소스별 중간 산출물 (커밋됨, 캐시는 제외)
├── app.json                # Expo 설정 (권한/플러그인)
└── .env.example            # 지오코딩 키 (파이프라인용, 앱 실행엔 불필요)
```

---

## 로드맵

- [x] **v0.1** 리스트 MVP
- [x] **v0.2** 지도 뷰 (마커 + 길찾기)
- [x] **v0.3** 즐겨찾기 · 시니어 큰글씨 모드
- [x] **v0.4** 공공데이터 + 카카오 지오코딩 파이프라인 (실데이터 연동)
- [x] **v0.5** 필터 (♿ 장애인 · 🕒 지금 개방중)
- [x] **v0.6** 사용자 제보 + 개방화장실 유형(공중/개방·제휴처) 모델
- [x] **v0.7** 데이터 파이프라인 재구성 (수집/병합 분리) + OSM 전국 6,784곳
- [ ] **v0.8** 표준데이터 CSV 지오코딩 실행 · 제보 서버 공유·검수 · 지도 필터
- [ ] **v1.0** 토스 앱인토스(미니앱) 출시 → 이후 구글 플레이

### 앱인토스(미니앱) 참고

- 개발자센터: https://developers-apps-in-toss.toss.im
- 미니앱 가이드라인(서비스 제한) 확인 필수: https://developers-apps-in-toss.toss.im/checklist/miniapp-service.html
- 계약 없이 개인 개발자도 출시 가능. WebView / React Native SDK 지원 → 이 코드베이스 재사용 가능.

---

## 라이선스

TBD
