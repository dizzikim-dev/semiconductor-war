# Circuit Visual Redesign — 반도체 회로도 스타일 맵 비주얼

## 목표
맵의 모든 시각 요소를 실제 회로도 기호로 교체하여 '반도체'스러운 룩앤필 구현.
충돌 영역(hitbox)은 기존 사각형 유지, 비주얼만 변경.

## 변경 대상

### 1. 장애물 (drawObstacles) — 라벨별 고유 기호
- CELL → MOSFET 트랜지스터 (Gate 막대 + S/D 핀 + 화살표)
- TAP → 접지 기호 (세로선 + 3단 점감 수평선)
- VIA (obstacle) → 적층 Via (겹친 사각형 + 중앙 원 + 해칭)
- BUF → 버퍼 게이트 (삼각형 ▷ + 입출력선)
- DIE → 다이오드 (삼각형 + cathode 바)
- PCM → 저항 (지그재그선)

### 2. Cell Turret (drawCells) — 커패시터 기호
- 두 평행판(세로 막대) + 충전 에너지 글로우
- 팀 색상 판, 파괴 시 금간 모양

### 3. Portal (drawPortals) — Via hole 강화
- 동심원 + 내부 십자 해칭 + 레이어 번호

### 4. Connector (drawConnectors) — 전류원 기호
- 원 안에 화살표 (방향 = 부스트 방향)

### 5. 배경: Tri-Bus — 회로 기판 패턴
- 격자 교차점에 솔더 패드 원
- Power rail에 전원 기호, Clock spine에 구형파

### 6. 배경: Wafer Ring — 웨이퍼 다이 강화
- Die 셀 내부 미세 회로 패턴
- Scribe line 강화, flat notch 강화

### 7. Spawn Area — IC 패키지 기호
- 직사각형 본체 + 양쪽 핀 돌출
