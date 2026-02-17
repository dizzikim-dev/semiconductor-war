# Live Service Operations Design
> 2026-02-17

## 목적
Semiconductor War를 실제 서버(Render)에 배포하고, 유저 피드백을 받으며 지속적으로 패치/개선하기 위한 에이전트/스킬/규칙 체계 설계.

## 설계 결정

### 배포 플랫폼: Render
- **선택 이유**: 무료 티어, WebSocket 지원, Node.js 네이티브, 자동 배포
- **대안 검토**: Railway(유사), Fly.io(글로벌 엣지), 직접 VPS(과도한 관리 부담)
- **제한사항**: Free tier 15분 슬립, 512MB RAM, 동접 50명 제한

### 피드백 시스템: 이중 리뷰어
- **비관적 리뷰어(critic-pessimist)**: 문제 탐색 전문, opus 모델 (깊은 분석)
- **낙관적 리뷰어(critic-optimist)**: 성장 가능성 전문, sonnet 모델 (빠른 아이디어)
- **종합**: game-review 스킬이 두 에이전트를 순차 호출하여 균형 잡힌 리포트 생성
- **분석 소스**: 코드 정적 분석 + 밸런스 시뮬레이션 + 유저 피드백 + 플레이 로그

### 패치 관리: 자동 패치노트
- git diff 기반 변경사항 자동 분류 (NEW/BALANCE/FIX/IMPROVE/VISUAL/SYSTEM)
- Semantic Versioning (MAJOR.MINOR.PATCH)
- 한국어 패치노트 (유저향) + 영문 CHANGELOG (개발자향)
- 버전 태깅은 유저 승인 후 수행

## 생성된 파일

### 에이전트 (5개, 신규)
| 파일 | 역할 |
|------|------|
| `.claude/agents/critic-pessimist.md` | 비관적 리뷰어 |
| `.claude/agents/critic-optimist.md` | 낙관적 리뷰어 |
| `.claude/agents/deploy-manager.md` | Render 배포 관리 |
| `.claude/agents/patch-manager.md` | 패치/버전 관리 |
| `.claude/agents/project-doctor.md` | 프로젝트 건강 진단 |

### 스킬 (4개, 신규)
| 파일 | 용도 |
|------|------|
| `.claude/skills/game-review/SKILL.md` | 종합 게임 리뷰 |
| `.claude/skills/deploy-render/SKILL.md` | Render 배포 절차 |
| `.claude/skills/patch-notes/SKILL.md` | 패치노트 자동생성 |
| `.claude/skills/project-health/SKILL.md` | 프로젝트 건강 진단 |

### 규칙 (3개, 신규)
| 파일 | 내용 |
|------|------|
| `.claude/rules/git-conventions.md` | 커밋/브랜치/태그 규칙 |
| `.claude/rules/deployment-safety.md` | 배포 안전 규칙 |
| `.claude/rules/live-service-ops.md` | 라이브 운영 규칙 |

### 기타
| 파일 | 내용 |
|------|------|
| `CHANGELOG.md` | Keep-a-Changelog 형식 |
| `docs/patch-notes/` | 패치노트 저장 디렉토리 |
| `docs/reviews/` | 게임 리뷰 리포트 저장 |
| `docs/health/` | 프로젝트 건강 리포트 저장 |

## 워크플로우

```
[코드 변경] → game-review(비관+낙관) → patch-notes → deploy-render → 모니터링
                     ↑                                                    │
                     └──── 유저 피드백 / 플레이 데이터 / project-health ←──┘
```

## 운영 원칙
- 정기 패치: 주 1회 (금요일)
- 핫픽스: P0 즉시, P1 당일, P2 다음 패치
- 밸런스 변경: 단일 수치 최대 ±25%, 반드시 사유 기록
- 새 기능 + 밸런스 변경 분리 패치 권장
