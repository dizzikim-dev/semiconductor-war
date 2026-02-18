# Semiconductor War - 피드백 종합 개선 계획

> 작성일: 2026-02-17
> 최종 수정: 2026-02-18
> 상태: Phase 1~4 전체 완료

---

## 피드백 목록 및 진행 상태

| # | 피드백 요약 | Phase | 상태 |
|---|------------|-------|------|
| 1 | 보스 색상이 팩션 색상과 혼동 | Phase 1 | [x] 완료 |
| 2 | 셀 점령 메커니즘 이해 부족 (튜토리얼) | Phase 3 | [x] 완료 |
| 3 | 단계별 네비게이션 시스템 부재 | Phase 3 | [x] 완료 |
| 4 | 다국어(한/영) 지원 필요 | Phase 4 | [x] 완료 |
| 5 | 아이템/VIA/미니언 시각적 구분 부족 | Phase 3 | [x] 완료 |
| 6 | 리스폰 지역 안전지대 인식 부족 | Phase 1 | [x] 완료 |
| 7 | 모바일 버전 그래픽 깨짐 | Phase 1 | [x] 완료 (DPR+줌) |
| 8 | 장시간 플레이 시 렉 증가 | Phase 2 | [x] 완료 (클라이언트측) |
| 9 | 사망 화면 개선 | Phase 1 | [x] 완료 |
| 10 | 일일 최고기록 시스템 | Phase 3 | [x] 완료 |

---

## Phase 1 — 즉시 수정 (Quick Wins)

### 1-1. 보스 색상 변경 (피드백 #1)

**문제:** 보스 3종(TSMC, Google, META)의 색상이 팩션 색상(삼성 파랑, SK 빨강)과 유사하여 혼동

**변경 내역:**
| 보스 | 변경 전 | 변경 후 | 비고 |
|------|---------|---------|------|
| TSMC | `#c4001a` (적색) | `#ff8c42` (오렌지) | SK Hynix 적색과 혼동 방지 |
| Google | `#4285f4` (청색) | `#9d4edd` (퍼플) | Samsung 청색과 혼동 방지 |
| META | `#0668e1` (남색) | `#06d6d0` (시안) | Samsung 청색과 혼동 방지 |
| Alpha Particle | `#e74c3c` (적색) | `#ffb703` (앰버) | SK Hynix 적색과 유사 방지 |

**수정 파일:** `server/constants.js`
**상태:** [x] 완료 (2026-02-17)

---

### 1-2. 리스폰 존 시각 강화 (피드백 #6)

**문제:** 보호 존 경계선(alpha 0.12)과 경고 텍스트(alpha 0.3, 7px)가 너무 희미

**변경 내역:**
- 대시 링 alpha 0.12 → 0.35 + 펄스 애니메이션
- 경고 텍스트 alpha 0.3/7px → 0.7/10px
- 12개 삼각형 방패 스파이크 추가 (보호 느낌 강화)

**수정 파일:** `public/js/renderer.js` (drawSpawnAreas)
**상태:** [x] 완료 (2026-02-17)

---

### 1-3. 사망 화면 개선 (피드백 #9)

**문제:**
- HOME 버튼이 먼저 보여 실수로 클릭
- 관전 기능 불필요
- 리스폰 버튼이 5초 후 갑자기 나타남
- K/D 대신 누적킬+현재점수가 더 동기부여됨

**변경 내역:**
- 관전(spectate) 기능 제거
- 리스폰 버튼: 처음부터 회색으로 표시, "5초 뒤 살아납니다" → 활성화
- HOME 버튼 하단 배치 (작게)
- K/D → 누적 킬 + 현재 점수 표시

**수정 파일:** `public/index.html`, `public/js/main.js`, `public/css/style.css`
**상태:** [x] 완료 (2026-02-17)

---

### 1-4. 모바일 DPR 스케일링 + 줌 완화 (피드백 #7)

**문제:** Canvas가 devicePixelRatio 미적용 → 고해상도 기기 블러, MOBILE_ZOOM 0.65 과도

**변경 내역:**
- Canvas 크기에 devicePixelRatio 곱셈 적용
- MOBILE_ZOOM 0.65 → 0.8

**수정 파일:** `public/js/renderer.js` (resize, MOBILE_ZOOM)
**상태:** [x] 완료 (2026-02-17)

---

## Phase 2 — 성능 최적화 (피드백 #8)

### 2-1. 이벤트 리스너 누수 수정

**문제:** chat.js의 window.addEventListener('mousemove') cleanup 없음, socket 이벤트 중복 등록 위험

**변경 내역:**
- chat.js: removeEventListener 추가
- main.js: socket.off() 추가 (재연결 대비)

**수정 파일:** `public/js/chat.js`, `public/js/main.js`
**상태:** [x] 완료 (2026-02-17) — chat.js removeEventListener 추가

---

### 2-2. HUD innerHTML 최적화

**문제:** hud.js에서 매 프레임 innerHTML 호출 → 분당 36,000 DOM reflow

**변경 내역:**
- 변경 감지 후에만 DOM 업데이트 (diff 체크)
- 킬피드, 리더보드, 점수, 버프 등 변경 시에만 재렌더링

**수정 파일:** `public/js/hud.js`
**상태:** [x] 완료 (2026-02-17) — _lastXxxHtml 캐시 도입

---

### 2-3. 클라이언트 FPS 캡 + 보간 버퍼 정리

**변경 내역:**
- 60 FPS 캡 적용 (TARGET_FRAME_MS)
- interpolation.js pendingEvents 배열 100개 캡
- renderer.js 파티클/플로팅텍스트 in-place 정리 (splice → writeIdx 패턴)

**수정 파일:** `public/js/main.js`, `public/js/interpolation.js`, `public/js/renderer.js`
**상태:** [x] 완료 (2026-02-17)

---

### 2-4. Render 호스팅 플랜 검토

**현황:** `render.yaml: plan: free` (512MB RAM, CPU 제한)
**권장:** `plan: starter` 이상 ($7/월, 더 많은 RAM/CPU)
**상태:** [ ] 대기 (사용자 결정 필요)

---

## Phase 3 — UX 개선

### 3-1. 셀 캡처 튜토리얼 시각화 (피드백 #2)

**변경 내역:**
- 게임 가이드에 셀 캡처 4단계 시퀀스 텍스트 추가
- "공격→파괴→범위 진입→점령→재건" 흐름 명시
- 4단계 넘버 뱃지 + 골드 좌측 보더 스타일

**수정 파일:** `public/index.html`, `public/css/style.css`
**상태:** [x] 완료 (2026-02-17)

---

### 3-2. 캡처 범위 진입 피드백 강화 (피드백 #2)

**변경 내역:**
- 캡처 진행 중: 범위 원 alpha 0.08 → 0.18 + 펄스 효과
- "CAPTURING X/Ys" 진행 피드백 텍스트 표시
- "REBUILDING X/Ys" 재건 피드백 텍스트 표시
- 점선 테두리 두께 1 → 2, alpha 0.2 → 0.5 (진행 시)

**수정 파일:** `public/js/renderer.js` (drawCells)
**상태:** [x] 완료 (2026-02-18)

---

### 3-3. 단계별 네비게이션 시스템 (피드백 #3)

**변경 내역:**
- 5단계 게임 상태 판별 (EARLY/MID/CONTEST/BOSS/PUSH)
- HUD 우상단 OBJECTIVE 패널 (현재 단계 + 목표 + 힌트)
- DOM 캐시로 성능 최적화 (_lastObjectiveHtml)

**수정 파일:** `public/js/hud.js` (renderObjective 함수), `public/css/style.css`
**상태:** [x] 완료 (2026-02-18)

---

### 3-4. 아이템/VIA/미니언 시각 분리 (피드백 #5)

**변경 내역:**
- 아이템(Pickup): 타입별 차별화 (PHOTORESIST=육각형, CMP_PAD=원, 기본=다이아몬드) — 이전 세션 완료
- VIA 포탈: 펄스 글로우 + 쿨다운 아크 타이머 + 크로스해칭 패턴 — 이전 세션 완료
- 미니언: 기본 사각형 → 회전 다이아몬드 + 팀 글로우 + HP 바

**수정 파일:** `public/js/renderer.js` (drawPickups, drawMinions, drawPortals)
**상태:** [x] 완료 (2026-02-18) — 미니언 회전 다이아몬드 추가

---

### 3-5. 일일 최고기록 시스템 (피드백 #10)

**변경 내역:**
- 서버 모듈 `server/dailyRecords.js` 신규 생성
  - KST 00:00 기준 자동 리셋
  - 닉네임별 최고 점수 갱신 방식 (중복 방지)
  - TOP 10 내림차순 정렬
- 사망 시 `get_daily_records` 소켓 이벤트로 기록 요청
- 사망 화면에 "TODAY'S TOP PLAYERS" 랭킹 표시
- 퇴장/리스폰 시 자동 기록 제출

**수정 파일:** 신규 `server/dailyRecords.js`, `server/index.js`, `public/js/main.js`
**상태:** [x] 완료 (2026-02-18)

---

## Phase 4 — 인프라

### 4-1. i18n 시스템 구축 (피드백 #4)

**변경 내역:**
- `public/js/i18n.js` 로컬라이제이션 엔진 신규 생성
  - 브라우저 언어 자동 감지 (ko/en)
  - localStorage 기반 언어 설정 저장
  - `I18n.t(key, params)` — dot notation 키 조회 + 파라미터 치환
  - `data-i18n`, `data-i18n-placeholder`, `data-i18n-html` DOM 속성 지원
  - `I18n.toggle()` — ko ↔ en 전환
  - `I18n.onChange(fn)` — 변경 이벤트 구독
- `public/locales/ko.json`, `en.json` — 129개 번역 키 (15개 카테고리)
- index.html — 40개 data-i18n 속성 적용
- main.js — 사망화면, 리스폰 카운트다운, 진화 텍스트, 킬스트릭, 스탯 표시, 모바일 힌트
- hud.js — 리더보드, 보스, 주가 패널, 면책조항, 뉴스, 킬피드, 네비게이션 목표
- renderer.js — 셀 상태, 스폰존, 캡처/재건 피드백, 플라즈마 해저드
- chat.js — 모드 토글 라벨
- mobile.js — 모달 타이틀, 주가/뉴스/채팅 플레이스홀더
- 시작화면 언어 토글 버튼 (EN/한) 추가

**수정 파일:** 신규 `public/js/i18n.js`, `public/locales/ko.json`, `public/locales/en.json`, `public/index.html`, `public/js/main.js`, `public/js/hud.js`, `public/js/renderer.js`, `public/js/chat.js`, `public/js/mobile.js`, `public/css/style.css`
**상태:** [x] 완료 (2026-02-18)

---

## 추가 발견 사항

| # | 발견 사항 | 심각도 | Phase | 상태 |
|---|----------|--------|-------|------|
| A | score 필드 미사용 (entities.js에 선언만, game.js에서 증가 안 함) | 중간 | Phase 1 | [ ] 대기 |
| B | socket.off() 누락 (main.js:259-382) | 높음 | Phase 2 | [x] 완료 |
| C | 모바일 채팅 모달 매번 재렌더링 | 중간 | Phase 2 | [ ] 대기 |
| D | Alpha Particle 색상 SK Hynix와 유사 | 낮음 | Phase 1 | [x] 완료 |

---

## 변경 이력

| 날짜 | 항목 | 변경 내용 |
|------|------|----------|
| 2026-02-17 | 초안 작성 | 피드백 10건 + 추가 발견 4건 종합 계획 수립 |
| 2026-02-17 | Phase 1 완료 | 보스색상, 리스폰존, 사망화면, 모바일DPR |
| 2026-02-17 | Phase 2 완료 | 이벤트리스너, HUD최적화, FPS캡, 버퍼정리 |
| 2026-02-17 | Phase 3 일부 | 튜토리얼 강화, VIA/아이템 시각 분리 |
| 2026-02-18 | Phase 3 완료 | 네비게이션, 미니언 시각, 캡처 피드백, 일일기록 |
| 2026-02-18 | Phase 4 완료 | i18n 시스템 (129키, ko/en), 언어 토글 버튼, DOM 일괄 번역 |
