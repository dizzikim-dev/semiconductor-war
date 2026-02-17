# Semiconductor War (반도체 전쟁)

## 프로젝트 개요
- 웹 기반 실시간 멀티플레이어 탑다운 2D 슈팅 게임
- Slither.io처럼 브라우저 접속 → 닉네임 입력 → 진영 선택 → 즉시 플레이 → 사망 시 재접속하는 가벼운 루프
- 삼성전자 vs SK하이닉스 진영전 + 빅테크 중립몬스터 + 미니언 시스템

## 기술 스택 (반드시 준수)
- Frontend: HTML5 Canvas + 바닐라 JavaScript (프레임워크 없음)
- Backend: Node.js + Express + Socket.io
- 프로토콜: WebSocket (Socket.io)
- 배포 대상: 단일 서버 (VPS 또는 Railway/Render)
- 패키지 매니저: npm
- 빌드 도구: 없음 (번들러 사용 금지, 단순 구조 유지)

## 프로젝트 구조
```
semiconductor-war/
├── CLAUDE.md
├── package.json
├── server/
│   ├── index.js          # Express + Socket.io 서버 진입점
│   ├── game.js           # 게임 루프 & 물리엔진 (서버 권위적)
│   ├── entities.js       # Player, Bot, Minion, Monster, Bullet, Pickup 클래스
│   └── constants.js      # 모든 게임 상수 (밸런스 값)
├── public/
│   ├── index.html         # 시작화면 + 게임 캔버스 + HUD + 사망화면
│   ├── css/
│   │   └── style.css      # UI 스타일
│   └── js/
│       ├── main.js        # 클라이언트 진입점, Socket.io 연결
│       ├── renderer.js    # Canvas 렌더링 (카메라, 엔티티, 파티클, 미니맵)
│       ├── input.js       # 키보드/마우스 입력 → 서버 전송
│       ├── hud.js         # HUD 업데이트 (HP, 킬, 탄약, 팀스코어, 버프)
│       └── interpolation.js # 서버 스냅샷 보간 (부드러운 움직임)
└── README.md
```

## 아키텍처 원칙
1. **서버 권위적(Server-Authoritative)**: 모든 게임 로직은 서버에서 실행. 클라이언트는 입력 전송 + 렌더링만 담당
2. **Tick 기반 게임 루프**: 서버는 60Hz(16.67ms)로 게임 상태 업데이트, 20Hz(50ms)로 클라이언트에 스냅샷 브로드캐스트
3. **클라이언트 예측 & 보간**: 클라이언트는 서버 스냅샷 사이를 보간하여 부드러운 렌더링
4. **Stateless 접속**: 로그인/DB 없음. 접속 시 닉네임+진영만 선택하면 즉시 플레이

## 게임 디자인 상세

### 진영
- Samsung (파란색 #1e64ff): GAA, HBM3E, 2nm 공정
- SK Hynix (빨간색 #ff3250): HBM4, NAND, 1β 공정

### 플레이어
- WASD 이동, 마우스 조준, 클릭 사격, R 재장전
- HP 100, 탄약 30발, 재장전 1.5초
- 사망 시 5초 후 리스폰 가능

### 미니언 (Die)
- 각 진영 Fab(기지)에서 8초마다 3기씩 자동 출격
- 적 방향으로 직진, 근접 공격
- 플레이어보다 약함 (HP 30, 저데미지)

### 중립 몬스터 (빅테크)
- 30초마다 맵 중앙에 1마리 스폰
- NVIDIA(DMG+30%), Apple(SPD+25%), TSMC(HBM공급계약 DMG+50%), Google(HP REGEN), META(ARMOR+20%)
- 막타(Last Hit) 팀에게 30초간 팀 전체 버프
- LoL의 드래곤/바론 컨셉

### 아이템
- Wafer(웨이퍼): HP +30 회복
- EUV(노광장비): 공격력 +15% 영구 스택 (최대 2배)

### 승리 조건
- 시간제 (5분) 후 팀 킬 합산으로 승패 결정
- 또는 지속 플레이 (점수 누적)

## 코딩 규칙
- ES6+ 문법 사용 (const/let, 화살표 함수, 디스트럭처링)
- 각 파일은 단일 책임 원칙 준수
- 매직 넘버 금지 → constants.js에 모든 수치 정의
- console.log 디버깅 대신 구조화된 로깅
- 주석은 "왜(Why)"에 집중, "무엇(What)"은 코드로 설명

## 테스트 방법
- 로컬에서 `node server/index.js` 실행
- 브라우저 탭 2개로 localhost:3001 접속하여 멀티플레이 테스트
- 봇은 서버에서 자동 생성 (실제 플레이어 수가 적을 때 보충)

## 배포 (Render)
- 플랫폼: Render (https://render.com)
- 리전: Singapore (한국 사용자 최적)
- 빌드: `npm install` / 시작: `node server/index.js`
- PORT: `process.env.PORT || 3001` (Render 자동 할당 우선)
- 배포 절차: `deploy-render` 스킬 참조
- 패치노트: `patch-notes` 스킬로 자동 생성

## 에이전트 (Agents)

### 개발 에이전트
| 에이전트 | 역할 |
|----------|------|
| `gamedev-architect` | 아키텍처 설계, 구조 결정 |
| `gamedev-implementer` | 코드 구현, 버그 수정 |
| `market-data-architect` | 주가 데이터 연동 설계 |
| `compliance-reviewer` | 금융 규정 준수 리뷰 |

### 운영 에이전트
| 에이전트 | 역할 |
|----------|------|
| `critic-pessimist` | 비관적 리뷰 (문제/리스크/밸런스 붕괴 탐색) |
| `critic-optimist` | 낙관적 리뷰 (강점/확장성/성장 잠재력 발견) |
| `deploy-manager` | Render 배포 파이프라인 관리 |
| `patch-manager` | 버전 관리, 패치노트, CHANGELOG |
| `project-doctor` | 프로젝트 건강 진단, 유지보수 |

## 스킬 (Skills)

| 스킬 | 용도 | 호출 시점 |
|------|------|-----------|
| `feature-add` | 새 기능 추가 체크리스트 | 새 기능 구현 시 |
| `balance-tuning` | 밸런스 수치 조정 | 수치 변경 시 |
| `netcode-debug` | 네트워크 버그 디버깅 | 네트워크 이슈 시 |
| `game-review` | 비관/낙관 종합 리뷰 | 주요 변경 후, 배포 전 |
| `deploy-render` | Render 배포 절차 | 배포 시 |
| `patch-notes` | 패치노트 자동생성 | 배포 전, 변경 후 |
| `project-health` | 프로젝트 건강 진단 | 주기적, 변경 후 |
| `update-game-guide` | GAME_GUIDE.md 동기화 | 게임 변경 후 |
| `market-data-integration` | 마켓 데이터 연동 | 마켓 기능 작업 시 |
| `game-event-balancing` | 마켓 이벤트 밸런싱 | 이벤트 수치 조정 시 |

## 규칙 (Rules)
- `git-conventions` — 커밋 메시지(Conventional Commits), 브랜치 전략(main/dev/feature), 태그 규칙
- `deployment-safety` — 배포 전 필수 체크, 환경변수 관리, 롤백 절차
- `live-service-ops` — 패치 주기, 피드백 루프, 핫픽스 기준, 밸런스 변경 프로토콜

## 라이브 서비스 워크플로우
```
[코드 변경] → game-review → patch-notes → deploy-render → 모니터링
                  ↑                                           │
                  └── 유저 피드백 / 플레이 데이터 ←────────────┘
```

## Market Data Integration (Phase 1)

### Architecture
- Adapter pattern: `server/market/providers/` — BaseProvider interface
- Providers: MockProvider (default), YahooProvider (yahoo-finance2), DataGoKrProvider (data.go.kr FSC)
- ProviderManager: failover with circuit breaker (3 failures → 5min skip)
- MarketDataService: in-memory cache, 5min TTL during market hours, 30min outside
- BuffEngine: daily % change → team buff (±10% cap)
- EventEngine: admin-triggered game events (boss spawn, zone mod, global param)

### Feature Flags (in constants.js)
- `USE_MOCK_MARKET_DATA` — true: use deterministic mock data (default for dev)
- `ENABLE_LIVE_MARKET_BUFFS` — true: apply stock-based team buffs to gameplay
- `ENABLE_NEWS_EVENTS` — true: enable DART news polling and admin event system

### Compliance Rules (MUST enforce)
- This is a GAME, not gambling. No wagering, no cash-out, no exchangeable points.
- Stock data must be 15min+ delayed. Never display as "real-time" or "live."
- Always show disclaimer: "주가 정보는 15분 이상 지연된 데이터이며, 투자 참고용이 아닌 게임 연출 목적입니다."
- News events require admin approval. No automated news → gameplay triggers.
- Market buff cap: ±10% maximum effect on game stats.

### Key Files (Market Data)
- `server/market/providers/baseProvider.js` — Provider interface
- `server/market/providers/mockProvider.js` — Deterministic mock data
- `server/market/providers/yahooProvider.js` — yahoo-finance2 wrapper
- `server/market/providers/dataGoKrProvider.js` — FSC fallback
- `server/market/providers/dartProvider.js` — DART news
- `server/market/providerManager.js` — Failover + circuit breaker
- `server/market/marketDataService.js` — Cache + polling orchestration
- `server/market/buffEngine.js` — % change → game buff mapping
- `server/market/eventEngine.js` — Admin event queue + execution

### Admin Panel
- `public/admin.html` — Password-protected event trigger panel
- Auth: ADMIN_PASSWORD env var
- REST: POST /api/admin/events, GET /api/admin/market-status
