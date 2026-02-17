# Semiconductor War — Claude Code 세팅 프롬프트 가이드

> Claude Code에 순서대로 입력하면 멀티플레이어 게임 개발 환경이 세팅됨

---

## 1단계: 프로젝트 초기화 & CLAUDE.md 생성

아래 프롬프트를 Claude Code에 붙여넣기:

```
프로젝트를 초기화하고 CLAUDE.md를 생성해줘.

## 프로젝트 개요
- 프로젝트명: Semiconductor War (반도체 전쟁)
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
- 브라우저 탭 2개로 localhost:3000 접속하여 멀티플레이 테스트
- 봇은 서버에서 자동 생성 (실제 플레이어 수가 적을 때 보충)

이 내용으로 CLAUDE.md를 프로젝트 루트에 생성하고, package.json도 초기화해줘.
npm init -y 후 express와 socket.io를 설치해줘.
```

---

## 2단계: Agent 생성

아래 프롬프트를 Claude Code에 붙여넣기:

```
.claude/agents/ 디렉토리에 게임 개발 전용 에이전트 2개를 만들어줘.

### 1) gamedev-architect 에이전트
파일: .claude/agents/gamedev-architect.md

---
name: gamedev-architect
description: "게임 아키텍처 설계 및 서버-클라이언트 구조 결정 전문 에이전트. 네트워크 프로토콜, 게임 루프, 엔티티 설계, 밸런싱 관련 질문에 활용."
model: opus
---

# Game Architect Agent

당신은 실시간 멀티플레이어 게임 아키텍처 전문가입니다.

## 핵심 역할
- 서버 권위적 아키텍처 설계 (cheating 방지)
- Socket.io 이벤트 프로토콜 정의
- 게임 루프 틱레이트 및 네트워크 최적화
- 엔티티 시스템 설계 (Player, Bullet, Minion, Monster)
- 클라이언트 예측(Client Prediction) & 서버 보정(Server Reconciliation) 구현 전략

## 제약 조건
- 반드시 Server-Authoritative 패턴 준수
- 클라이언트에 게임 로직 배치 금지
- 대역폭 최적화: 델타 압축, 관심 영역(Area of Interest) 필터링 고려
- Socket.io 이벤트는 최소화 (1개 스냅샷 이벤트로 전체 상태 전송)

## 참고 패턴
- Snapshot Interpolation (Gabriel Gambetta 방식)
- Entity Component System (간소화 버전)
- Fixed Timestep Game Loop

설계 결정 시 항상 "왜 이 방식인지" 근거를 함께 제시하세요.

---

### 2) gamedev-implementer 에이전트
파일: .claude/agents/gamedev-implementer.md

---
name: gamedev-implementer
description: "실제 코드 구현 전문 에이전트. 서버/클라이언트 코드 작성, 버그 수정, 기능 추가에 활용. CLAUDE.md의 코딩 규칙과 프로젝트 구조를 엄격히 준수."
model: sonnet
---

# Game Implementer Agent

당신은 Node.js + Canvas 기반 멀티플레이어 게임 구현 전문가입니다.

## 핵심 역할
- server/ 디렉토리의 게임 서버 코드 작성
- public/js/ 디렉토리의 클라이언트 렌더링/입력 코드 작성
- Socket.io 이벤트 핸들러 구현
- 버그 수정 및 기능 추가

## 반드시 준수할 규칙
1. constants.js의 상수만 사용 (매직 넘버 금지)
2. 서버 코드에 렌더링 로직 금지, 클라이언트 코드에 게임 로직 금지
3. 파일 하나가 300줄 넘어가면 분리 제안
4. 모든 Socket.io 이벤트명은 snake_case (예: player_input, game_snapshot)
5. 새 기능 추가 시 constants.js에 관련 상수 먼저 정의

## 코드 작성 순서
1. constants.js에 필요한 상수 추가
2. entities.js에 엔티티 클래스/팩토리 추가
3. game.js에 게임 로직 추가
4. server/index.js에 소켓 이벤트 추가
5. 클라이언트 코드 업데이트
6. 테스트 실행 (node server/index.js → 브라우저 2탭)

구현 후 반드시 `node server/index.js`로 서버가 정상 기동되는지 확인하세요.

---

두 파일을 생성해줘.
```

---

## 3단계: Skill 생성

아래 프롬프트를 Claude Code에 붙여넣기:

```
.claude/skills/ 디렉토리에 게임 개발에 필요한 스킬 3개를 만들어줘.

### 1) balance-tuning 스킬
디렉토리: .claude/skills/balance-tuning/SKILL.md

---
name: balance-tuning
description: "게임 밸런스 수치를 조정할 때 사용. HP, 데미지, 속도, 스폰 주기, 버프 수치 등 constants.js의 값을 체계적으로 조정."
---

# Balance Tuning Skill

## 절차
1. 먼저 server/constants.js 파일을 전체 읽기
2. 현재 밸런스 수치를 표로 정리하여 보여주기
3. 유저가 요청한 변경사항을 반영
4. 변경 전/후 비교표 출력
5. 변경이 다른 수치에 미치는 영향 분석 (예: "DPS가 20% 증가하면 평균 생존시간이 약 X초 감소")

## 밸런스 원칙
- 플레이어 평균 생존시간: 30~60초
- 중립 몬스터 처치 소요시간: 팀원 3명이 10~15초
- 미니언은 플레이어 1명이 2~3초에 처리 가능
- 팀 버프는 체감되지만 압도적이지 않은 수준 (20~30% 보너스)

---

### 2) netcode-debug 스킬
디렉토리: .claude/skills/netcode-debug/SKILL.md

---
name: netcode-debug
description: "네트워크 관련 버그(렉, 텔레포트, 동기화 이슈, 연결 끊김) 디버깅 시 사용. Socket.io 이벤트 흐름 분석 및 수정."
---

# Netcode Debug Skill

## 디버깅 절차
1. 문제 재현 조건 확인 (몇 명 접속 시? 어떤 액션 시?)
2. 관련 Socket.io 이벤트 흐름 추적:
   - server/index.js의 이벤트 핸들러
   - public/js/main.js의 이벤트 리스너
   - public/js/interpolation.js의 보간 로직
3. 서버 틱과 클라이언트 프레임 간 타이밍 분석
4. 수정안 제시 및 적용

## 흔한 이슈 패턴
- **텔레포트**: 보간 버퍼 부족 → 버퍼 크기 증가 또는 외삽(extrapolation) 추가
- **히트 판정 불일치**: 서버/클라이언트 좌표계 불일치 → 서버 기준 판정 확인
- **끊김 후 복구**: 재접속 시 전체 상태 동기화 누락 → full_state 이벤트 추가
- **대역폭 폭주**: 불필요한 데이터 전송 → 관심 영역 필터링, 델타 압축

---

### 3) feature-add 스킬
디렉토리: .claude/skills/feature-add/SKILL.md

---
name: feature-add
description: "새 게임 기능(무기, 아이템, 몬스터, 게임모드 등)을 추가할 때 사용. 서버/클라이언트 양쪽의 변경사항을 체계적으로 구현."
---

# Feature Add Skill

## 기능 추가 체크리스트
새 기능을 추가할 때 아래 순서를 반드시 따릅니다:

### Phase 1: 설계
- [ ] 기능 요구사항 정리 (무엇을, 왜)
- [ ] 영향받는 파일 목록 작성
- [ ] 필요한 새 상수 목록 작성
- [ ] Socket.io 이벤트 변경사항 정리

### Phase 2: 서버 구현
- [ ] constants.js에 상수 추가
- [ ] entities.js에 엔티티/로직 추가
- [ ] game.js 게임 루프에 통합
- [ ] index.js 소켓 이벤트 추가/수정

### Phase 3: 클라이언트 구현
- [ ] renderer.js에 렌더링 추가
- [ ] hud.js에 UI 표시 추가 (필요 시)
- [ ] main.js에 소켓 이벤트 핸들러 추가

### Phase 4: 검증
- [ ] 서버 기동 확인 (node server/index.js)
- [ ] 브라우저 2탭 접속하여 기능 동작 확인
- [ ] 양쪽 진영에서 각각 테스트
- [ ] 엣지 케이스 확인 (접속 중 기능 발동, 사망 중 효과 등)

---

세 스킬 디렉토리와 SKILL.md 파일을 모두 생성해줘.
```

---

## 4단계: 실제 구현 시작 프롬프트

세팅 완료 후, 아래로 실제 개발 시작:

```
Semiconductor War 멀티플레이어 게임의 MVP를 구현해줘.

구현 순서:
1. server/constants.js - 모든 게임 상수 정의
2. server/entities.js - Player, Bullet, Minion, Monster, Pickup 클래스
3. server/game.js - 60Hz 게임 루프, 충돌 판정, 스폰 시스템
4. server/index.js - Express 정적 파일 서빙 + Socket.io 연결/입력/스냅샷
5. public/index.html - 시작화면(닉네임+진영) + 캔버스 + HUD + 사망화면
6. public/css/style.css - 반도체 테마 UI (Orbitron/Share Tech Mono 폰트, 다크 테마)
7. public/js/input.js - WASD + 마우스 입력 캡처 → 서버 전송
8. public/js/interpolation.js - 서버 스냅샷 보간
9. public/js/renderer.js - Canvas 렌더링 (카메라, 모든 엔티티, 파티클, 미니맵)
10. public/js/hud.js - HUD 업데이트
11. public/js/main.js - Socket.io 연결, 이벤트 핸들링, 게임 루프 통합

구현 후 `node server/index.js`로 서버 실행하고, 정상 기동 확인해줘.
핵심: 서버 권위적 아키텍처. 클라이언트는 입력 전송 + 렌더링만.
```

---

## 빠른 참조: 유용한 후속 프롬프트

| 상황 | 프롬프트 |
|---|---|
| 밸런스 조정 | `/balance-tuning` 중립몬스터가 너무 쉬워. HP 50% 올리고 영향 분석해줘 |
| 네트워크 버그 | `/netcode-debug` 2명 접속 시 상대가 텔레포트하는 현상 수정해줘 |
| 기능 추가 | `/feature-add` 새 아이템 "ASML 독점계약" 추가해줘. 30초간 사거리 2배 |
| 아키텍처 상담 | `@gamedev-architect` 50명 동시접속 시 서버 부하를 줄이려면? |
| 코드 구현 | `@gamedev-implementer` 킬 리더보드를 HUD 우측 상단에 추가해줘 |
| 배포 | Railway에 배포할 수 있게 Dockerfile과 railway.json 만들어줘 |
