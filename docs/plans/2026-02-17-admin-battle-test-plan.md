# Admin Battle Test Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 1v1 battle simulator to admin.html that fetches live balance data from the server and simulates combat between any two entities with real-time DPS/TTK measurement.

**Architecture:** Client-only simulation powered by a single new REST endpoint (`GET /api/admin/balance-data`) that returns all balance constants as JSON. The admin page fetches this data, then runs a Canvas-based combat simulation locally — no server game logic changes needed.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Express REST API, existing admin.html styling

---

### Task 1: Add balance-data API endpoint

**Files:**
- Modify: `server/admin/routes.js` (add route before `return router;` at ~line 262)

**Step 1: Add the endpoint**

Add this route inside `createAdminRouter()`, before the `return router;` line:

```js
  // GET /api/admin/balance-data — 밸런스 데이터 (테스트 모드용)
  router.get('/balance-data', (req, res) => {
    res.json({
      classes: C.CLASSES,
      levelGrowth: C.LEVEL_GROWTH,
      maxLevel: C.MAX_LEVEL,
      monsterTypes: C.MONSTER_TYPES,
      monsterRadius: C.MONSTER_RADIUS,
      bossBulletSpeed: C.BOSS_BULLET_SPEED,
      bossBulletRadius: C.BOSS_BULLET_RADIUS,
      bossBulletLifetime: C.BOSS_BULLET_LIFETIME,
      bossDroneSpeed: C.BOSS_DRONE_SPEED,
      bossDroneHp: C.BOSS_DRONE_HP,
      bossDroneRadius: C.BOSS_DRONE_RADIUS,
      bossDroneDamage: C.BOSS_DRONE_DAMAGE,
      bossDroneLifetime: C.BOSS_DRONE_LIFETIME,
      bossPulseRadius: C.BOSS_PULSE_RADIUS,
      neutralMobTypes: C.NEUTRAL_MOB_TYPES,
      cellBalance: {
        maxHp: C.CELL_MAX_HP,
        radius: C.CELL_RADIUS,
        attackRange: C.CELL_ATTACK_RANGE,
        attackDamage: C.CELL_ATTACK_DAMAGE,
        attackCooldown: C.CELL_ATTACK_COOLDOWN,
        overheatChargeRate: C.CELL_OVERHEAT_CHARGE_RATE,
        overheatDecayRate: C.CELL_OVERHEAT_DECAY_RATE,
        overheatThreshold: C.CELL_OVERHEAT_THRESHOLD,
        overheatMinCooldown: C.CELL_OVERHEAT_MIN_COOLDOWN,
      },
      minionStats: {
        hp: C.MINION_HP,
        speed: C.MINION_SPEED,
        damage: C.MINION_DAMAGE,
        attackRange: C.MINION_ATTACK_RANGE,
        attackCooldown: C.MINION_ATTACK_COOLDOWN,
        radius: C.MINION_RADIUS,
      },
      playerRadius: C.PLAYER_RADIUS,
    });
  });
```

**Step 2: Verify**

Run: `node server/index.js` then `curl -H 'X-Admin-Password: semiconwar2026' http://localhost:3001/api/admin/balance-data | head -c 200`

Expected: JSON with `classes`, `monsterTypes`, `neutralMobTypes` keys

**Step 3: Commit**

```bash
git add server/admin/routes.js
git commit -m "feat: add balance-data API endpoint for admin test mode"
```

---

### Task 2: Add Battle Test Mode HTML/CSS to admin.html

**Files:**
- Modify: `public/admin.html`

**Step 1: Add CSS styles**

Add inside `<style>` block (before closing `</style>`), the battle test mode styles.

**Step 2: Add HTML card**

Add new card inside `.grid` div, after the Attack Pattern Preview card (before `</div><!-- grid end -->`).

The card contains:
- Setup panel (left): player class select, player level slider, enemy category select, enemy type select, enemy level slider
- Battle canvas (right): 900x450 canvas
- Control buttons: START, PAUSE, RESET
- Results panel: DPS, TTK, Winner, HP remaining

**Step 3: Commit**

```bash
git add public/admin.html
git commit -m "ui: add battle test mode card layout to admin panel"
```

---

### Task 3: Implement battle simulation engine (JS in admin.html)

**Files:**
- Modify: `public/admin.html` (add `<script>` logic)

This is the core simulation engine. It must:

1. **Fetch balance data** on page load via `GET /api/admin/balance-data`
2. **Create entity factory** that builds entity objects from balance data:
   - Player class entity (with level scaling: hp × (1 + 0.08 × (level-1)), dmg × (1 + 0.05 × (level-1)))
   - Boss entity (from MONSTER_TYPES)
   - Neutral mob entity (from NEUTRAL_MOB_TYPES)
   - Cell turret entity
   - Minion entity
3. **Simulation loop** (60fps requestAnimationFrame):
   - Auto-attack: each entity fires at the other based on attackType
   - `single`: spawn bullet, travel at bulletSpeed, hit on collision
   - `orbit`: orbs rotate, deal damage on proximity (orbHitCooldown between hits)
   - `burst`: fire burstCount bullets with burstDelay between shots
   - `spray/sniper/drone/pulse/twin`: boss attack patterns
   - Damage → shield first (if capacitor/inductor/transformer) → HP
   - Track: totalDamageDealt, elapsedTime, alive status
4. **Measurements**:
   - DPS = totalDamageDealt / elapsedTime
   - TTK = time when opponent HP reaches 0
   - Winner = last alive
   - Remaining HP%
5. **Controls**: START begins simulation, PAUSE/RESUME toggles, RESET clears

Key functions to implement:
- `fetchBalanceData()` — GET /api/admin/balance-data
- `createEntity(type, config, level)` — factory
- `startBattle()` — init entities at positions, start loop
- `battleFrame(now)` — per-frame update + render
- `updateEntity(entity, target, dt)` — attack logic per entity type
- `applyDamage(target, dmg)` — shield → HP chain
- `spawnBullet(owner, target)` — projectile creation
- `renderEntity(ctx, entity)` — draw entity + HP bar + shield
- `renderBullets(ctx)` — draw projectiles
- `renderStats(ctx)` — DPS/TTK overlay

**Step 4: Commit**

```bash
git add public/admin.html
git commit -m "feat: implement battle simulation engine in admin test mode"
```

---

### Task 4: Verify end-to-end and final polish

**Step 1: Start server and test**

1. `node server/index.js`
2. Open `http://localhost:3001/admin.html`
3. Login with admin password
4. Scroll to "Battle Test Mode" card
5. Select Capacitor (Lv 5) vs NVIDIA boss → START → verify orbitals + boss spray work
6. Select Amplifier (Lv 10) vs Repeater (Lv 10) → START → verify distance dmg scaling
7. Select Resistor (Lv 1) vs Cell Turret → verify turret fires back
8. Check DPS/TTK numbers make sense

**Step 2: Commit final**

```bash
git add public/admin.html server/admin/routes.js
git commit -m "feat: admin battle test mode — 1v1 combat simulator with live balance data"
```
