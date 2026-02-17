# Admin Battle Test Mode Design

**Date**: 2026-02-17
**Status**: Approved
**Type**: Feature Addition

## Overview

admin.html에 1v1 전투 시뮬레이터를 추가하여, 플레이어 캐릭터/보스/중립몹/셀터렛/미니언의 전투를 프리뷰하고 DPS/TTK를 측정할 수 있게 한다.

## Design Decisions

- **클라이언트 전용**: 서버에 sandbox 인스턴스를 만들지 않고, constants.js 값을 API로 fetch하여 클라이언트에서 시뮬레이션
- **밸런스 자동 반영**: `/api/admin/balance-data` 엔드포인트에서 서버 constants.js 값을 JSON으로 반환. 밸런스 수정 → 서버 재시작 → 자동 반영
- **1v1 전투 테스트**: 내 캐릭터 1개 vs 상대 봇 1개를 선택하여 전투 시뮬레이션

## Architecture

### New API Endpoint

```
GET /api/admin/balance-data
Response: {
  classes: { resistor, capacitor, repeater, inductor, transformer, oscillator, amplifier },
  monsterTypes: [ NVIDIA, Apple, TSMC, Google, META ],
  neutralMobTypes: [ photon, dopant, alpha_particle ],
  cellBalance: { maxHp, attackDamage, attackRange, ... },
  minionStats: { hp, damage, speed, range, ... },
  levelScaling: { hpPerLevel, dmgPerLevel, spdPerLevel },
  combatConstants: { orbHitCooldown, shieldRecharge, ... }
}
```

### UI Layout (admin.html new card)

```
┌─────────────────────────────────────────────────────┐
│  BATTLE TEST MODE                                    │
├──────────────────┬──────────────────────────────────┤
│  [Setup Panel]    │  [Battle Canvas 900x450]          │
│                   │                                   │
│  ── Player ──     │   [Player]  ←→  [Enemy]          │
│  Class: [select]  │   HP bars + shield + damage       │
│  Level: [1-20]    │   Attack effects (bullets/orbs)   │
│                   │   Distance indicator               │
│  ── Enemy ──      │                                   │
│  Type: [select]   │                                   │
│  Level: [1-20]    │  [START] [RESET] [PAUSE]          │
│                   │                                   │
│  ── Results ──    │  ── Stats Panel ──                │
│  DPS: 28.5        │  Player DPS | Enemy DPS           │
│  TTK: 4.2s        │  Time Elapsed | Distance          │
│  Winner: Enemy    │                                   │
└──────────────────┴──────────────────────────────────┘
```

### Selectable Entities

**Player (left)**:
- 7 classes: resistor, capacitor, repeater, inductor, transformer, oscillator, amplifier
- Level 1-20 slider (affects HP/DMG/SPD via level scaling)

**Enemy (right)**:
- Category dropdown:
  - Player Classes (7) — with level slider
  - Bosses (5): NVIDIA, Apple, TSMC, Google, META
  - Neutral Mobs (3): Photon, Dopant, Alpha Particle
  - Cell Turret
  - Minion

### Simulation Logic

Client-side simplified combat simulation:
1. **Auto-attack**: entities auto-target each other (no player input)
2. **Attack types**:
   - `single`: projectile (travel time based on distance/speed)
   - `orbit`: orbital orbs with hit cooldown per target
   - `burst`: 3-round burst with delay
   - `spray/sniper/drone/pulse/twin`: boss patterns
3. **Damage chain**: Capacitor shield → Photoresist buff → HP
4. **Level scaling**: HP × (1 + 0.08 × (level-1)), DMG × (1 + 0.05 × (level-1)), SPD × (1 + 0.01 × (level-1))
5. **Measurements**: Real-time DPS, TTK, winner, remaining HP%

### Visual Style

- Same dark theme as existing preview canvas (#0d1117 background)
- Entity shapes from existing Attack Pattern Preview code
- HP bars (green→red gradient), shield bar (blue), damage numbers
- Attack effects: bullets, orbitals, pulse rings, drones
- Distance line between entities with px label

## Files Changed

1. `server/admin/routes.js` — Add `GET /api/admin/balance-data`
2. `public/admin.html` — New "Battle Test Mode" card with canvas + controls + simulation JS

## No Server Game Logic Changes

All simulation runs client-side. Server only exposes read-only balance data API.
