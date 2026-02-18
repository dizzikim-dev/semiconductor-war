// ─── 서버 ───
const SERVER_PORT = process.env.PORT || 3001;
const TICK_RATE = 60;               // 서버 물리 업데이트 Hz
const TICK_INTERVAL = 1000 / TICK_RATE;
const SNAPSHOT_RATE = 20;           // 클라이언트 브로드캐스트 Hz
const SNAPSHOT_INTERVAL = 1000 / SNAPSHOT_RATE;

// ─── 맵 (레거시 기본값 — 실제 값은 maps.js에서 로드) ───
const MAP_WIDTH = 3600;
const MAP_HEIGHT = 2400;

// ─── 진영 ───
const TEAM = {
  SAMSUNG: 'samsung',
  SKHYNIX: 'skhynix',
};
const TEAM_COLORS = {
  [TEAM.SAMSUNG]: '#1e64ff',
  [TEAM.SKHYNIX]: '#ff3250',
};

// Fab(기지) 반경 — 스폰 산포 범위
const FAB_RADIUS = 120;

// ─── 스폰 보호 존 (Spawn Protection Zone) ───
const SPAWN_ZONE_RADIUS = 150;         // 보호 존 반경 (px) — FAB_RADIUS보다 약간 큼
const SPAWN_ZONE_DAMAGE = 30;          // 적이 들어올 시 초당 데미지 (DPS)
const SPAWN_ZONE_KNOCKBACK = 300;      // 적 밀어내기 속도 (px/s)
const SPAWN_ZONE_INVULN_REFRESH = 500; // 아군 존 내 무적 시간 갱신 (ms)

// ─── 플레이어 (기본값, 클래스에 의해 오버라이드) ───
const PLAYER_RADIUS = 20;
const PLAYER_SPEED = 200;           // px/s
const PLAYER_HP = 120;
const PLAYER_RESPAWN_DELAY = 5000;  // ms

// ─── 클래스 시스템 ───
const CLASSES = {
  resistor: {
    name: 'RESISTOR',
    hp: 120,
    speed: 200,
    attackRange: 280,
    attackDamage: 10,
    attackCooldown: 350,    // ms
    bulletSpeed: 500,
    bulletRadius: 4,
    bulletLifetime: 1500,
    attackType: 'single',   // 'single' | 'pulse'
    cellDmgBonus: 0,        // 셀 추가 데미지 비율
    description: '기본 수동소자 — 올라운드',
  },
  capacitor: {
    name: 'CAPACITOR',
    hp: 250,
    speed: 150,
    attackRange: 140,       // 오토타겟 범위 (오비탈에는 미사용)
    attackDamage: 18,       // 오브 1회 히트 데미지 (25→18 밸런스 패치)
    attackCooldown: 0,      // 오비탈은 쿨다운 없음 (hitCooldown으로 제어)
    bulletSpeed: 0,
    bulletRadius: 0,
    bulletLifetime: 0,
    attackType: 'orbit',    // 뱀서 스타일 오비탈 회전 공격
    orbCount: 3,            // 궤도 오브 개수
    orbRadius: 90,          // 궤도 반경 (플레이어 중심에서 거리)
    orbSpeed: 2.8,          // 회전 속도 (rad/s)
    orbSize: 14,            // 오브 충돌 반경
    orbHitCooldown: 700,    // 같은 대상 재히트 간격 (ms)
    cellDmgBonus: 0.25,     // 셀 추가 데미지 +25%
    // 보호막
    shieldMax: 80,          // 최대 보호막
    shieldRechargeDelay: 5000, // 보호막 소진 후 재충전 대기 (ms)
    shieldRechargeRate: 20, // 초당 보호막 회복량
    evolvesFrom: 'resistor',
    description: '에너지 축적 후 방출 — 근접 탱커 (오비탈 공격 + 보호막)',
  },
  repeater: {
    name: 'REPEATER',
    hp: 110,
    speed: 260,
    attackRange: 280,       // 셀 터렛(320) 미만으로 하향
    attackDamage: 7,
    attackCooldown: 150,
    bulletSpeed: 700,
    bulletRadius: 3,
    bulletLifetime: 1800,
    attackType: 'single',
    cellDmgBonus: 0,
    evolvesFrom: 'resistor',
    description: '신호 재생성/중계 — 원거리 기동',
  },
  inductor: {
    name: 'INDUCTOR',
    hp: 280,
    speed: 130,
    attackRange: 160,
    attackDamage: 17,       // 22→17 너프 (-22.7%) — DPS 과강 조정
    attackCooldown: 0,
    bulletSpeed: 0,
    bulletRadius: 0,
    bulletLifetime: 0,
    attackType: 'orbit',
    orbCount: 4,            // 4 orbs (up from 3)
    orbRadius: 110,         // wider orbit
    orbSpeed: 2.2,          // slightly slower rotation
    orbSize: 16,            // bigger orbs
    orbHitCooldown: 750,    // 600→750 너프 (+25%) — 재히트 간격 증가
    cellDmgBonus: 0.30,
    // Magnetic pull: enemies in range are pulled toward player
    magneticPull: true,
    magneticRange: 150,     // 180→150 너프 — 인력 범위 축소
    magneticForce: 24,      // 32→24 너프 (-25%) — 도주 가능성 대폭 증가
    // Flux Charge: 전투 중 축적 → 과부하 버스트
    fluxMaxCharge: 10,          // 최대 플럭스 스택
    fluxGainOnHit: 1,           // 오브 적중 시 +1
    fluxGainOnDamaged: 2,       // 피격 시 +2
    fluxGainPerSec: 0.5,        // 이동 중 초당 +0.5
    fluxBurstDuration: 2.5,     // 버스트 지속 시간(초)
    fluxBurstHitCd: 450,        // 버스트 중 orbHitCooldown (750→450)
    fluxBurstCooldown: 5.0,     // 버스트 후 재충전 대기(초)
    // Coil Arc: 오브 2개가 적 근처에 모이면 전기 아크 틱 데미지
    coilArcRange: 130,          // 오브↔적 거리 기준
    coilArcDps: 12,             // 초당 아크 데미지
    coilArcTickInterval: 250,   // 아크 틱 간격(ms)
    shieldMax: 60,
    shieldRechargeDelay: 6000,
    shieldRechargeRate: 15,
    evolvesFrom: 'capacitor',
    description: '자기장 조작 — 광역 탱커 (4궤도 + 자기 인력 + 플럭스 버스트 + 코일 아크)',
  },
  transformer: {
    name: 'TRANSFORMER',
    hp: 300,
    speed: 140,
    attackRange: 140,
    attackDamage: 15,       // CAPACITOR(18)보다 약간 낮음 (오라로 보상)
    attackCooldown: 0,
    bulletSpeed: 0,
    bulletRadius: 0,
    bulletLifetime: 0,
    attackType: 'orbit',
    orbCount: 3,            // CAPACITOR와 동일 (기본기 유지, 2→3 복원)
    orbRadius: 80,
    orbSpeed: 3.0,
    orbSize: 12,
    orbHitCooldown: 700,    // CAPACITOR와 동일 (800→700 복원)
    cellDmgBonus: 0.15,
    // Support aura: allies within range get buffs (stepDown 모드에서만 활성)
    aura: true,
    auraRange: 200,
    auraDmgBoost: 0.15,    // +15% damage to nearby allies
    auraRegen: 1.5,         // 2.5→1.5 너프 (-40%) — 자가힐 과강 조정
    // Voltage Mode Swap (나르 스타일 자동 변신)
    voltageMax: 100,            // 최대 전압 게이지
    voltageGainOnHit: 8,        // 오브 적중 시 +8
    voltageGainOnDamaged: 5,    // 피격 시 +5
    voltageGainOnAuraHeal: 3,   // 오라 힐 tick당 +3
    voltageDecayRate: 2,        // 비전투 시 초당 감소
    voltageDecayDelay: 4.0,     // 마지막 전투 후 감소 시작 딜레이(초)
    stepUpDuration: 6.0,        // 승압 모드 지속(초)
    stepUpCooldown: 8.0,        // 승압→강압 복귀 후 전압 축적 쿨다운(초)
    stepUpDamage: 24,           // 승압 모드 공격력 (15→24, +60%)
    stepUpHitCd: 450,           // 승압 모드 orbHitCooldown (700→450)
    stepUpShieldMax: 50,        // 승압 모드 보호막 상한 (100→50)
    stepUpOrbSpeed: 4.0,        // 승압 모드 오브 속도 (3.0→4.0)
    shieldMax: 100,
    shieldRechargeDelay: 4000,
    shieldRechargeRate: 25,
    evolvesFrom: 'capacitor',
    description: '에너지 변환 — 서포터/딜러 전환 (오라 + 전압 변신)',
  },
  oscillator: {
    name: 'OSCILLATOR',
    hp: 130,
    speed: 240,
    attackRange: 280,       // REPEATER와 동일
    attackDamage: 7,        // REPEATER와 동일 (기본기 유지)
    attackCooldown: 200,    // 160→200 너프 — 확산탄 DPS 하향
    bulletSpeed: 700,       // REPEATER와 동일
    bulletRadius: 3,
    bulletLifetime: 1500,
    attackType: 'single',   // REPEATER와 동일 (기본기 유지)
    // Tier 3 추가 요소: 확산탄 (스트라이커즈 1945 패턴)
    multiShot: 3,           // 매 발 3발 동시 발사 (메인 + 좌우 확산)
    spreadAngle: 0.25,      // 0.15→0.25 확산 각도 증가 (rad, ±14.3°) — 밀집 명중률 감소
    cellDmgBonus: 0.10,
    evolvesFrom: 'repeater',
    description: '파동 간섭 — 확산 딜러 (REPEATER 연사 + 3방향 확산탄)',
  },
  amplifier: {
    name: 'AMPLIFIER',
    hp: 130,                // 100→130 버프 — 스나이퍼 생존력 향상
    speed: 200,
    attackRange: 400,       // 350→400 버프 — 스나이퍼 사거리 강화
    attackDamage: 7,        // REPEATER와 동일 (기본기 유지)
    attackCooldown: 200,    // REPEATER(150)보다 약간 느림
    bulletSpeed: 800,
    bulletRadius: 4,
    bulletLifetime: 2000,
    attackType: 'single',   // REPEATER와 동일 (기본기 유지)
    // Tier 3 추가 요소: 증폭탄 (스트라이커즈 1945 패턴)
    ampedEvery: 4,          // 4발째마다 증폭탄 발사
    ampedDmgMultiplier: 3.0, // 증폭탄 = 3배 데미지 (21)
    ampedBulletRadius: 6,   // 증폭탄 시각 크기 (큰 탄환)
    cellDmgBonus: 0.10,
    evolvesFrom: 'repeater',
    description: '신호 증폭 — 스나이퍼 (REPEATER 연사 + 주기적 증폭탄)',
  },
};

// ─── 레벨링 / 진화 ───
const EVOLVE_LEVEL = 2;             // Tier 2 진화 레벨 (resistor → capacitor/repeater)
const EVOLVE_LEVEL_2 = 5;           // Tier 3 진화 레벨 (cap → ind/trans, rep → osc/amp)
const MAX_LEVEL = 20;
const XP_PER_LEVEL = 20;           // 레벨업 필요 XP = level * XP_PER_LEVEL
const XP_REWARD = {
  playerKill: 50,
  minionKill: 5,                   // 10→5 너프 — 2마리=Tier2 극단적 불균형 수정
  cellDestroy: 30,
  cellCapture: 20,
  monsterKill: 60,                 // 40→60 — 보스 라스트히트 보상 강화
  assist: 25,                      // 어시스트 XP (데미지 기여 보상)
  revenge: 30,                     // 복수 킬 보너스 XP
  bossAssist: 20,                  // 보스 어시스트 XP
};

// ─── 어시스트 / 복수 시스템 ───
const ASSIST_THRESHOLD = 0.20;       // 최대 HP의 20% 이상 데미지 기여 시 어시스트 인정
const DAMAGE_TRACKER_EXPIRE = 15000; // 데미지 기록 유효 시간 (15초)
const LEVEL_GROWTH = {
  hp: 0.08,                         // 레벨당 HP +8%
  damage: 0.05,                     // 레벨당 데미지 +5%
  speed: 0.01,                      // 레벨당 속도 +1%
};
const XP_LOSS_ON_DEATH = 0.25;     // 사망 시 현재 레벨 XP의 25% 손실

// ─── 오토 타겟팅 ───
const AUTO_TARGET_INTERVAL = 200;   // ms — 타겟 재평가 간격
const AUTO_TARGET_PRIORITY = ['player', 'monster', 'cell', 'minion']; // 우선순위

// ─── 총알 ───
const BULLET_SPEED = 600;           // px/s
const BULLET_RADIUS = 5;
const BULLET_LIFETIME = 2000;       // ms

// ─── 미니언 ───
const MINION_SPAWN_INTERVAL = 8000; // ms
const MINION_SPAWN_COUNT = 3;
const MINION_HP = 30;
const MINION_SPEED = 80;            // px/s
const MINION_DAMAGE = 5;
const MINION_ATTACK_RANGE = 30;     // px
const MINION_ATTACK_COOLDOWN = 1000;// ms
const MINION_RADIUS = 12;

// ─── 중립 보스 (빅테크) ───
const BOSS_RESPAWN_DELAY = 30000;     // ms — 보스 사망 후 다음 보스까지 대기
const BOSS_WANDER_RADIUS = 140;       // 보스가 중심에서 배회하는 최대 거리
const BOSS_MOVE_SPEED = 40;           // px/s — 보스 이동 속도
const BOSS_BULLET_SPEED = 300;        // px/s — 보스 발사체 속도
const BOSS_BULLET_RADIUS = 6;
const BOSS_BULLET_LIFETIME = 2500;    // ms
const BOSS_DRONE_SPEED = 100;         // px/s — 드론 추적 속도
const BOSS_DRONE_HP = 30;
const BOSS_DRONE_RADIUS = 10;
const BOSS_DRONE_DAMAGE = 8;
const BOSS_DRONE_LIFETIME = 6000;     // ms
const BOSS_PULSE_RADIUS = 200;       // 펄스 AoE 반경

const MONSTER_HP = 500;
const MONSTER_RADIUS = 35;
const MONSTER_BUFF_DURATION = 30000;  // ms

// diep.io 스타일 공격 패턴:
// spray   — 부채꼴 3발 산탄  (NVIDIA)
// sniper  — 단발 고속 고데미지 (Apple)
// drone   — 추적 드론 생성    (TSMC)
// pulse   — AoE 충격파 링     (Google)
// twin    — 평행 2연발        (META)
const MONSTER_TYPES = [
  { name: 'NVIDIA',  buff: 'dmg',   value: 0.30, color: '#76b900', label: 'DMG +30%',
    attackStyle: 'spray',  attackDamage: 12, attackCooldown: 1800, bulletCount: 3, spreadAngle: 0.4, hp: 500 },
  { name: 'Apple',   buff: 'spd',   value: 0.25, color: '#a2aaad', label: 'SPD +25%',
    attackStyle: 'sniper', attackDamage: 30, attackCooldown: 2500, bulletSpeed: 500, hp: 400 },
  { name: 'TSMC',    buff: 'dmg',   value: 0.30, color: '#ff8c42', label: 'DMG +30%',
    attackStyle: 'drone',  attackDamage: 0,  attackCooldown: 3000, droneCount: 2, maxDrones: 4, hp: 600 },
  { name: 'Google',  buff: 'regen', value: 2,    color: '#9d4edd', label: 'HP REGEN',
    attackStyle: 'pulse',  attackDamage: 20, attackCooldown: 3500, pulseRadius: BOSS_PULSE_RADIUS, hp: 550 },
  { name: 'META',    buff: 'armor', value: 0.20, color: '#06d6d0', label: 'ARMOR +20%',
    attackStyle: 'twin',   attackDamage: 10, attackCooldown: 1200, hp: 450 },
];

// ─── 아이템 픽업 ───
const PICKUP_SPAWN_INTERVAL = 10000; // ms
const PICKUP_MAX = 10;
const PICKUP_RADIUS = 14;
const PICKUP_TYPES = {
  WAFER: { name: 'Wafer', heal: 30, color: '#c0c0c0' },
  EUV:   { name: 'EUV',   xpGain: 3, color: '#ffd700' },
  TSV_BOOSTER: { name: 'TSV Booster', spdBoost: 0.20, duration: 8000, color: '#00e5ff' },
  PHOTORESIST: { name: 'Photoresist', shieldAmount: 40, duration: 10000, color: '#9b59b6' },
  CMP_PAD:     { name: 'CMP Pad', regenRate: 3, duration: 8000, color: '#e67e22' },
};
const TSV_SPEED_CAP = 1.30;         // TSV 버프 포함 최대 이동속도 배율 (기본 대비)

// ─── 중립 몹 (Wafer Mobs) ───
const NEUTRAL_MOB_TYPES = {
  photon: {
    name: 'Photon', shape: 'triangle', color: '#e8d44d',
    hp: 10, xpReward: 3, radius: 8,
    behavior: 'passive', fleeSpeed: 120, fleeDuration: 2000,
    maxCount: 40, respawnDelay: 15000,
  },
  dopant: {
    name: 'Dopant', shape: 'square', color: '#7d5ba6',
    hp: 40, xpReward: 12, radius: 10,
    behavior: 'defensive', attackDamage: 10, attackRange: 30, attackCooldown: 1200,
    maxCount: 20, respawnDelay: 25000,
  },
  alpha: {
    name: 'Alpha Particle', shape: 'pentagon', color: '#ffb703',
    hp: 120, xpReward: 35, radius: 14,
    behavior: 'defensive', attackDamage: 15, attackRange: 150, attackCooldown: 1500,
    maxCount: 6, respawnDelay: 45000,
  },
};
const NEUTRAL_MOB_SPAWN_INTERVAL = 5000; // 스폰 체크 간격 (ms)

// ─── 봇 ───
const BOT_COUNT_PER_TEAM = 2;       // 플레이어가 부족할 때 보충
const BOT_AIM_JITTER = 0.15;        // 봇 조준 흔들림 (rad)
const BOT_REACTION_TIME = 300;      // ms

// ─── 셀 터렛 (Cell Domination) ───
const CELL_MAX_HP = 1200;
const CELL_RADIUS = 24;              // 터렛 본체 반경 (충돌/렌더링)
const CELL_ATTACK_RANGE = 320;       // 자동공격 사거리 (px)
const CELL_ATTACK_DAMAGE = 45;       // 발사 데미지 (55→45 REPEATER 보호)
const CELL_ATTACK_COOLDOWN = 900;    // 발사 간격 (ms)
const CELL_CAPTURE_RADIUS = 180;     // 점령 존 반경 (px)
const CELL_CAPTURE_TIME = 4000;      // 점령 시작까지 대기 시간 (ms)
const CELL_REBUILD_TIME = 3000;      // 재건 완료 시간 (ms)
const CELL_REBUILD_HP_RATIO = 0.6;   // 재건 후 HP 비율
const CELL_WARMUP_TIME = 1000;       // 점령 직후 공격 대기 (ms)
const CELL_SHIELD_TIME = 2000;       // 점령 직후 무적 시간 (ms)
const CELL_BACKDOOR_REDUCTION = 0.2; // 아군 미니언 없을 때 피해 감소율
const CELL_SCORE_PER_SEC = 1;        // 초당 영토 점수 (셀당)
const CELL_FRIENDLY_MINION_RANGE = 300; // 백도어 판정용 아군 미니언 탐색 범위

// ── 셀 오버히트 (Overheat) ──
const CELL_OVERHEAT_CHARGE_RATE = 0.12;    // 초당 게이지 충전량 (적 사거리 내)
const CELL_OVERHEAT_DECAY_RATE = 0.08;     // 초당 게이지 냉각량 (적 없을 때)
const CELL_OVERHEAT_THRESHOLD = 0.6;       // 이 이상이면 공속 증가 시작
const CELL_OVERHEAT_MIN_COOLDOWN = 400;    // 오버히트 최대 시 최소 쿨다운 (ms)
const CELL_OVERHEAT_IDLE_DELAY = 3.0;      // 적 사라진 후 냉각 시작까지 대기 (초)

// ─── 플라즈마 해저드 존 (Plasma Etch Hazard) ───
const HAZARD_ZONE = {
  WARN_DURATION: 1200,       // 경고 표시 시간 (ms) — 텔레그래프
  ACTIVE_DURATION: 6000,     // 활성 데미지 시간 (ms)
  RADIUS: 160,               // 해저드 존 반경 (px)
  DAMAGE_PER_SEC: 18,        // 초당 데미지 (6초 내 최대 108 = RESISTOR HP 90%)
  SLOW_FACTOR: 0.15,         // 존 내 이동속도 감소율 (15%)
  SPAWN_INTERVAL: 25000,     // 자동 스폰 주기 (ms)
  SPAWN_COOLDOWN: 8000,      // 같은 지점 재스폰 쿨다운 (ms)
  MAX_ACTIVE: 2,             // 동시 최대 활성 해저드 수
  COLOR_WARN: '#ff6b00',     // 경고 색상 (주황)
  COLOR_ACTIVE: '#ff2040',   // 활성 색상 (적색)
};

// ─── 시장 데이터 (Market Data) ───
// 환경변수 오버라이드 지원: 'true'/'false' 문자열 → boolean
const envBool = (key, fallback) => {
  const v = process.env[key];
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
};

const MARKET_FLAGS = {
  USE_MOCK_MARKET_DATA: envBool('USE_MOCK_MARKET_DATA', false),
  ENABLE_LIVE_MARKET_BUFFS: envBool('ENABLE_LIVE_MARKET_BUFFS', false),
  ENABLE_NEWS_EVENTS: envBool('ENABLE_NEWS_EVENTS', false),
  ENABLE_LIVE_MARKET_PANEL: envBool('ENABLE_LIVE_MARKET_PANEL', true),
};

// ─── 기능 플래그 (Feature Flags) ───
const FEATURE_FLAGS = {
  ENABLE_HAZARD_ZONES: envBool('ENABLE_HAZARD_ZONES', true),
  ENABLE_SPEED_PICKUP: envBool('ENABLE_SPEED_PICKUP', true),
  ENABLE_BUFF_ICONS: envBool('ENABLE_BUFF_ICONS', true),
};

// MARKET_REFRESH_INTERVAL_SEC: 환경변수로 폴링 주기 변경 (초 단위, 기본 300 = 5분)
const MARKET_REFRESH_INTERVAL_SEC = parseInt(process.env.MARKET_REFRESH_INTERVAL_SEC, 10) || 300;
const MARKET_QUOTE_INTERVAL = MARKET_REFRESH_INTERVAL_SEC * 1000;
const MARKET_QUOTE_INTERVAL_CLOSED = 30 * 60 * 1000; // 장외 주가 폴링 간격 (30분)
const MARKET_NEWS_INTERVAL = 15 * 60 * 1000;          // 뉴스 폴링 간격 (15분)

// 버프 엔진 — 일간 등락률 → 팀 버프/너프 매핑
const MARKET_BUFF_TIERS = [
  { minChange: 3,    dmgMod: 0.10, spdMod: 0.05 },  // +3% 이상 → DMG+10%, SPD+5%
  { minChange: 1,    dmgMod: 0.05, spdMod: 0 },      // +1~3%   → DMG+5%
  { minChange: -1,   dmgMod: 0,    spdMod: 0 },      // ±1%     → 효과 없음 (데드존)
  { minChange: -3,   dmgMod: -0.05, spdMod: 0 },     // -1~-3%  → DMG-5%
  { minChange: -Infinity, dmgMod: -0.10, spdMod: -0.05 }, // -3% 이하 → DMG-10%, SPD-5%
];
const MARKET_BUFF_CAP_DMG = 0.10;   // 최대 데미지 버프/너프 ±10%
const MARKET_BUFF_CAP_SPD = 0.05;   // 최대 속도 버프/너프 ±5%

// ─── KRX 공휴일 (2026) ───
const KRX_HOLIDAYS_2026 = [
  '2026-01-01', // 신정
  '2026-01-29', '2026-01-30', '2026-01-31', // 설날
  '2026-03-01', // 삼일절
  '2026-05-05', // 어린이날
  '2026-05-24', // 부처님오신날
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석
  '2026-10-03', // 개천절
  '2026-10-09', // 한글날
  '2026-12-25', // 크리스마스
];

// ─── 채팅 (Chat) ───
const CHAT_MAX_LENGTH = 120;           // 메시지 최대 길이
const CHAT_RATE_LIMIT_MS = 1500;       // 메시지 전송 간격 제한 (ms)
const CHAT_HISTORY_MAX = 50;           // 서버 보관 최근 메시지 수 (새 접속자 sync용)
const CHAT_PROFANITY_LIST = [
  '시발', '씨발', '병신', 'ㅅㅂ', 'ㅂㅅ', 'fuck', 'shit', 'damn', 'bitch', 'ass',
];

// 관리자 인증
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'semiconwar2026';

// ─── 이벤트 시스템 ───
const EVENT_TYPES = ['BOSS_SPAWN', 'ZONE_MODIFIER', 'GLOBAL_PARAM', 'NEWS_TICKER'];

const EVENT_BOUNDS = {
  BOSS_SPAWN: {
    hpMultiplier: { min: 0.5, max: 3.0 },
    buffValueMultiplier: { min: 0.5, max: 2.0 },
    duration: { min: 30000, max: 300000 },
  },
  ZONE_MODIFIER: {
    radius: { min: 100, max: 400 },
    value: { min: 0.05, max: 0.25 },
    duration: { min: 15000, max: 180000 },
  },
  GLOBAL_PARAM: {
    multiplier: { min: 0.5, max: 3.0 },
    duration: { min: 15000, max: 300000 },
  },
  NEWS_TICKER: {
    duration: { min: 10000, max: 60000 },
  },
};

const EVENT_COOLDOWNS = {
  BOSS_SPAWN: 120000,
  ZONE_MODIFIER: 60000,
  GLOBAL_PARAM: 90000,
  NEWS_TICKER: 10000,
};

const EVENT_MAX_ACTIVE = {
  BOSS_SPAWN: 1,
  ZONE_MODIFIER: 2,
  GLOBAL_PARAM: 1,
  NEWS_TICKER: 3,
  total: 3,
};

const EVENT_RATE_LIMIT = { maxEvents: 5, windowMs: 10 * 60 * 1000 };

const MODIFIABLE_PARAMS = [
  'minionSpawnRate', 'minionSpawnCount', 'pickupSpawnRate',
  'monsterHpScale', 'respawnDelay', 'cellCaptureSpeed',
];

module.exports = {
  SERVER_PORT, TICK_RATE, TICK_INTERVAL, SNAPSHOT_RATE, SNAPSHOT_INTERVAL,
  MAP_WIDTH, MAP_HEIGHT,
  TEAM, TEAM_COLORS, FAB_RADIUS,
  SPAWN_ZONE_RADIUS, SPAWN_ZONE_DAMAGE, SPAWN_ZONE_KNOCKBACK, SPAWN_ZONE_INVULN_REFRESH,
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP, PLAYER_RESPAWN_DELAY,
  CLASSES, EVOLVE_LEVEL, EVOLVE_LEVEL_2, MAX_LEVEL, XP_PER_LEVEL, XP_REWARD, LEVEL_GROWTH, XP_LOSS_ON_DEATH,
  ASSIST_THRESHOLD, DAMAGE_TRACKER_EXPIRE,
  AUTO_TARGET_INTERVAL, AUTO_TARGET_PRIORITY,
  BULLET_SPEED: 500, BULLET_RADIUS: 4, BULLET_LIFETIME: 1500,
  MINION_SPAWN_INTERVAL, MINION_SPAWN_COUNT, MINION_HP, MINION_SPEED,
  MINION_DAMAGE, MINION_ATTACK_RANGE, MINION_ATTACK_COOLDOWN, MINION_RADIUS,
  BOSS_RESPAWN_DELAY, BOSS_WANDER_RADIUS, BOSS_MOVE_SPEED,
  BOSS_BULLET_SPEED, BOSS_BULLET_RADIUS, BOSS_BULLET_LIFETIME,
  BOSS_DRONE_SPEED, BOSS_DRONE_HP, BOSS_DRONE_RADIUS, BOSS_DRONE_DAMAGE, BOSS_DRONE_LIFETIME,
  BOSS_PULSE_RADIUS,
  MONSTER_HP, MONSTER_RADIUS, MONSTER_TYPES, MONSTER_BUFF_DURATION,
  PICKUP_SPAWN_INTERVAL, PICKUP_MAX, PICKUP_RADIUS, PICKUP_TYPES, TSV_SPEED_CAP,
  NEUTRAL_MOB_TYPES, NEUTRAL_MOB_SPAWN_INTERVAL,
  BOT_COUNT_PER_TEAM, BOT_AIM_JITTER, BOT_REACTION_TIME,
  CELL_MAX_HP, CELL_RADIUS, CELL_ATTACK_RANGE, CELL_ATTACK_DAMAGE, CELL_ATTACK_COOLDOWN,
  CELL_CAPTURE_RADIUS, CELL_CAPTURE_TIME, CELL_REBUILD_TIME, CELL_REBUILD_HP_RATIO,
  CELL_WARMUP_TIME, CELL_SHIELD_TIME, CELL_BACKDOOR_REDUCTION, CELL_SCORE_PER_SEC,
  CELL_FRIENDLY_MINION_RANGE,
  CELL_OVERHEAT_CHARGE_RATE, CELL_OVERHEAT_DECAY_RATE, CELL_OVERHEAT_THRESHOLD,
  CELL_OVERHEAT_MIN_COOLDOWN, CELL_OVERHEAT_IDLE_DELAY,
  HAZARD_ZONE,
  // Feature Flags
  FEATURE_FLAGS,
  // Market Data
  MARKET_FLAGS, MARKET_REFRESH_INTERVAL_SEC,
  MARKET_QUOTE_INTERVAL, MARKET_QUOTE_INTERVAL_CLOSED, MARKET_NEWS_INTERVAL,
  MARKET_BUFF_TIERS, MARKET_BUFF_CAP_DMG, MARKET_BUFF_CAP_SPD,
  KRX_HOLIDAYS_2026,
  ADMIN_PASSWORD,
  // Chat
  CHAT_MAX_LENGTH, CHAT_RATE_LIMIT_MS, CHAT_HISTORY_MAX, CHAT_PROFANITY_LIST,
  // Event System
  EVENT_TYPES, EVENT_BOUNDS, EVENT_COOLDOWNS, EVENT_MAX_ACTIVE,
  EVENT_RATE_LIMIT, MODIFIABLE_PARAMS,
};
