# Content Expansion Design — Neutral Mobs, Map Scale, Tooltips, Pickups

**Date**: 2026-02-16
**Status**: Approved

---

## Problem Statement

The 2400x1600 map is too small for its feature density. There are zero neutral PvE entities outside the boss. Between boss fights and PvP encounters, players have nothing to do. The semiconductor theme is decorative only — labels exist but teach nothing. Only 3 pickup types limit strategic variety.

## Design Summary

Three parallel workstreams:
1. **PR-A**: Map expansion (3600x2400) + neutral mobs (3 tiers)
2. **PR-B**: Educational tooltips for semiconductor-themed entities
3. **PR-C**: 2 new pickup types (Photoresist shield, CMP Pad regen)

---

## PR-A: Map Expansion + Neutral Mobs

### Map Scale Change

Expand from 2400x1600 to **3600x2400** (1.5x each dimension, 2.25x area).

All existing coordinates in maps.js must be proportionally scaled:
- Multiply all x-coordinates by 1.5
- Multiply all y-coordinates by 1.5
- Scale obstacle dimensions, radii, zone boundaries proportionally

### Neutral Mobs ("Wafer Mobs")

Three tiers of ambient PvE content scattered across the map:

| Mob | Shape | Color | HP | XP | Count | Behavior | Concept |
|-----|-------|-------|----|----|-------|----------|---------|
| **Photon** | Triangle | `#e8d44d` yellow | 10 | 3 | 30-40 | Stationary, flee-on-hit (speed 120, 2s) | Photons in EUV lithography |
| **Dopant** | Square | `#7d5ba6` purple | 40 | 12 | 15-20 | Stationary, fight back (10 dmg, melee) | Dopant atoms in ion implantation |
| **Alpha Particle** | Pentagon | `#e74c3c` red | 120 | 35 | 4-6 | Stationary near contested zones, fight back (15 dmg, 150px range) | Alpha particles cause soft errors |

#### Spawn Rules
- Photons: spawn in clusters of 3-5 everywhere except spawn areas and boss chamber
- Dopants: spawn individually in mid-map areas (between lanes, near cells)
- Alpha Particles: spawn near contested cells and boss area, rare
- Respawn: when mob dies, respawn timer = 15s (Photon), 25s (Dopant), 45s (Alpha)
- Maximum counts enforced server-side
- Don't spawn inside obstacles — collision check on spawn

#### Entity Class: `NeutralMob`
```
class NeutralMob {
  id, type, x, y, hp, maxHp, radius, xpReward
  behavior: 'passive' | 'defensive'
  fleeTimer, fleeDx, fleeDy
  attackCooldown, attackDamage, attackRange
  respawnTimer (managed by Game, not entity)
  alive
}
```

#### Server Logic
- `_spawnNeutralMobs()`: called periodically, maintains population counts
- `_updateNeutralMobs(dt)`: flee logic, fight-back for defensive types
- Collision: bullets and orbitals damage neutral mobs (reuse existing collision logic)
- XP granted to killing player

#### Client Rendering
- Photon: small yellow triangle (radius 8), gentle pulse glow
- Dopant: purple square (radius 10), static
- Alpha: red pentagon (radius 14), ominous pulse

### Constants
```js
const NEUTRAL_MOB_TYPES = {
  photon: { name: 'Photon', shape: 'triangle', color: '#e8d44d', hp: 10, xpReward: 3, radius: 8,
            behavior: 'passive', fleeSpeed: 120, fleeDuration: 2000, maxCount: 40, respawnDelay: 15000 },
  dopant: { name: 'Dopant', shape: 'square', color: '#7d5ba6', hp: 40, xpReward: 12, radius: 10,
            behavior: 'defensive', attackDamage: 10, attackRange: 30, attackCooldown: 1200,
            maxCount: 20, respawnDelay: 25000 },
  alpha:  { name: 'Alpha Particle', shape: 'pentagon', color: '#e74c3c', hp: 120, xpReward: 35, radius: 14,
            behavior: 'defensive', attackDamage: 15, attackRange: 150, attackCooldown: 1500,
            maxCount: 6, respawnDelay: 45000 },
};
const NEUTRAL_MOB_SPAWN_INTERVAL = 5000; // check every 5s
```

---

## PR-B: Educational Tooltips

### Design
- Client-only feature — no server changes
- Proximity-based: show tooltip when player is within 150px of entity
- Suppressed during combat (player has autoTarget)
- Each tooltip shown once per 60 seconds (cooldown per tooltip ID)
- Fade in over 0.3s, hold 3s, fade out 0.5s
- Position: above entity, offset to avoid HP bar overlap
- Style: small font (9px Share Tech Mono), semi-transparent background

### Tooltip Data

```js
const TOOLTIP_DATA = {
  // Map elements
  portal_via: 'Via: connects metal layers in a chip, just like this portal connects lanes',
  boss_chamber: 'Clock Root Buffer: distributes timing signals across the entire chip',
  power_rail_VDD: 'VDD: positive supply voltage rail powering all logic gates',
  power_rail_VSS: 'VSS: ground rail completing the circuit for all cells',
  connector_boost: 'Scribe Line: test channels between die sites on a wafer',
  obstacle_CELL: 'Standard Cell: pre-designed logic block — the LEGO brick of chip design',
  obstacle_TAP: 'Substrate Tap: connects transistor substrate to power/ground',
  obstacle_VIA: 'Via Stack: vertical metal connections between routing layers',
  obstacle_BUF: 'Buffer: amplifies weak signals to drive long wires',
  obstacle_DIE: 'Die: individual chip cut from a silicon wafer',
  obstacle_PCM: 'PCM: Process Control Monitor for testing manufacturing quality',
  // Neutral mobs
  mob_photon: 'Photon: EUV light particles etch circuit patterns at 13.5nm wavelength',
  mob_dopant: 'Dopant: atoms implanted into silicon to control conductivity',
  mob_alpha: 'Alpha Particle: cosmic rays that can flip bits in memory chips',
  // Pickups
  pickup_WAFER: 'Wafer: 300mm silicon disc — foundation of every chip',
  pickup_EUV: 'EUV Lithography: $150M machines that print circuits with extreme UV light',
  pickup_TSV_BOOSTER: 'TSV: Through-Silicon Via — vertical connections in 3D stacked chips',
  pickup_PHOTORESIST: 'Photoresist: light-sensitive coating that defines circuit patterns',
  pickup_CMP_PAD: 'CMP: Chemical-Mechanical Polishing — planarizes wafer surfaces',
  // Cell turrets
  cell_turret: 'Cell Turret: capture these to control territory — like dominating fab capacity',
  // Boss
  boss_NVIDIA: 'NVIDIA: GPU giant whose AI chips consume vast quantities of HBM memory',
  boss_Apple: 'Apple: designs custom ARM chips (M-series) pushing fab process limits',
  boss_TSMC: 'TSMC: world\'s largest foundry, manufactures chips for Apple/NVIDIA/AMD',
  boss_Google: 'Google: develops TPU AI accelerators requiring advanced packaging',
  boss_META: 'META: building custom AI inference chips for social media workloads',
};
```

### Implementation
- New module: `public/js/tooltips.js` (IIFE pattern, loaded before renderer)
- Called from `Renderer.render()` after drawing entities
- Checks proximity to nearest entity → selects tooltip → manages cooldown → renders

---

## PR-C: New Pickups

### Photoresist (Damage Shield)
- Color: `#9b59b6` (purple)
- Effect: grants 40 HP damage shield for 10 seconds (uses player buff system)
- Shield absorbs damage before HP (but AFTER Capacitor's own shield)
- Doesn't stack: refresh timer on re-pickup
- Spawn weight: 10%

### CMP Pad (Regen)
- Color: `#e67e22` (orange)
- Effect: +3 HP/s regeneration for 8 seconds (uses player buff system)
- Doesn't stack: refresh timer on re-pickup
- Spawn weight: 10%

### Updated Spawn Distribution
- Wafer: 30% (was 40%)
- EUV: 35% (was 45%)
- TSV Booster: 10% (was 15%)
- Photoresist: 12.5%
- CMP Pad: 12.5%

### Constants Addition
```js
PICKUP_TYPES: {
  WAFER: { name: 'Wafer', heal: 30, color: '#c0c0c0' },
  EUV: { name: 'EUV', xpGain: 3, color: '#ffd700' },
  TSV_BOOSTER: { name: 'TSV Booster', spdBoost: 0.20, duration: 8000, color: '#00e5ff' },
  PHOTORESIST: { name: 'Photoresist', shieldAmount: 40, duration: 10000, color: '#9b59b6' },
  CMP_PAD: { name: 'CMP Pad', regenRate: 3, duration: 8000, color: '#e67e22' },
}
```

---

## Files Affected

### PR-A (Map + Mobs)
| File | Change |
|------|--------|
| `server/constants.js` | NEUTRAL_MOB_TYPES, spawn constants, MAP_WIDTH/HEIGHT defaults |
| `server/entities.js` | New `NeutralMob` class |
| `server/game.js` | `_spawnNeutralMobs()`, `_updateNeutralMobs()`, collision integration, snapshot inclusion |
| `server/maps.js` | Scale all coordinates 1.5x for both maps |
| `public/js/renderer.js` | `drawNeutralMobs()` — triangle/square/pentagon shapes |

### PR-B (Tooltips)
| File | Change |
|------|--------|
| `public/js/tooltips.js` | NEW — tooltip IIFE module |
| `public/js/renderer.js` | Call tooltip render after entity drawing |
| `public/index.html` | Include tooltips.js script |

### PR-C (Pickups)
| File | Change |
|------|--------|
| `server/constants.js` | Add PHOTORESIST, CMP_PAD to PICKUP_TYPES |
| `server/game.js` | Handlers in `_checkPickupCollisions()`, regen in `_updatePlayerBuffs()` |
| `public/js/renderer.js` | New pickup shapes for Photoresist (hexagon) and CMP (circle) |

---

## Parallelization

All three PRs can be worked on independently:
- PR-A touches map geometry + entities + game loop
- PR-B is client-only (new module)
- PR-C extends existing pickup system

No conflicts between them.
