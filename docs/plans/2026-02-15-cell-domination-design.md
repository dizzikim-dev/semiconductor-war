# Cell Domination Mode — Design Document

## Overview
Add capture-able Cell Turret entities to both maps. Cells have ownership (neutral/samsung/skhynix), auto-attack enemies in range, and can be destroyed then converted by the opposing team. Territory score from owned cells is the primary win condition.

## Win Condition
- Primary: `territoryScore` (accumulates per second per owned cell)
- Tiebreaker 1: total captures
- Tiebreaker 2: total player kills

## Cell States
```
NEUTRAL → (take damage) → DESTROYED → (uncontested presence) → REBUILDING → OWNED
OWNED   → (take damage) → DESTROYED → (enemy captures) → REBUILDING → OWNED (new team)
```

## Balance Constants (in constants.js)
| Constant | Value | Purpose |
|---|---|---|
| CELL_MAX_HP | 1200 | Cell total health |
| CELL_ATTACK_RANGE | 320 | Auto-attack range (px) |
| CELL_ATTACK_DAMAGE | 55 | Damage per shot |
| CELL_ATTACK_COOLDOWN | 900 | ms between shots |
| CELL_CAPTURE_RADIUS | 180 | Capture presence zone |
| CELL_CAPTURE_TIME | 4000 | ms to start rebuild |
| CELL_REBUILD_TIME | 3000 | ms to complete conversion |
| CELL_REBUILD_HP_RATIO | 0.6 | HP fraction after rebuild |
| CELL_WARMUP_TIME | 1000 | ms before new cell fires |
| CELL_SHIELD_TIME | 2000 | Invulnerability after conversion |
| CELL_BACKDOOR_REDUCTION | 0.2 | Damage reduction without friendly minions nearby |
| CELL_SCORE_PER_SEC | 1 | Territory points per sec per cell |

## Entity: CellTurret
Properties: id, x, y, ownerTeam, state (neutral/owned/destroyed/rebuilding), hp, maxHp, captureProgress, rebuildProgress, currentTargetId, warmupTimer, shieldTimer, attackCooldown, laneOrSector

## Map Placement

### Tri-Bus Circuit (9 cells)
- Each lane: samsung-side (x~420), center contested (x~1200), hynix-side (x~1980)
- Side cells start owned, center cells start neutral

### Wafer Ring Arena (8 cells)
- 2 near Samsung arc (owned samsung)
- 2 near Hynix arc (owned skhynix)
- 4 in ring contested sectors (neutral)

## Server Logic
- `_updateCells(dt, now)`: targeting, firing, capture, rebuild, score tick
- Bullets vs cells: merged into `_checkBulletCollisions`
- Cell fires bullets at closest enemy in range (player priority > minion)
- Backdoor protection: if no friendly minion within 300px, cell takes 20% reduced damage

## Client Rendering
- Hexagonal base with team color ring
- HP bar + state label + capture/rebuild progress arc
- Minimap dots for cell ownership
- HUD: territory score replaces kill score as primary display

## Snapshot Extension
- `cells[]` array with serialized cell data
- `territoryScore` object per team
