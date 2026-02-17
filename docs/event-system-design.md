# Event System Design

## Overview

The event system bridges real-world corporate news (from DART disclosures) to in-game effects. An administrator reads DART news, decides which items are interesting, and manually triggers game events. There is **no automatic triggering** -- this is a deliberate design choice to prevent inappropriate or poorly-timed events.

---

## Event Types

### 1. BOSS_SPAWN

Spawns a special Big Tech monster at a designated location. The monster type and stats can be modified to reflect the news context.

**Example trigger:** Samsung announces HBM3E mass production → Admin spawns an NVIDIA boss with boosted stats.

```javascript
{
  type: 'BOSS_SPAWN',
  params: {
    monsterType: 'NVIDIA',       // One of: NVIDIA, Apple, TSMC, Google, META
    position: { x: 1200, y: 800 }, // null = default map center
    hpMultiplier: 1.5,           // 1.0 = normal, 1.5 = 50% more HP
    buffValueMultiplier: 1.0,    // Scales the reward buff value
    customLabel: 'HBM3E Launch Special', // Optional display text
  },
  duration: 120000,              // Boss despawns after 2 minutes if not killed
}
```

**Game effect:**
- A special monster spawns at the specified position
- Announcement banner shown to all players
- Monster has scaled HP based on hpMultiplier
- Kill reward follows normal monster buff rules (last-hit team gets buff)
- If boss despawns without being killed, no buff is awarded

**Integration with existing systems:** Uses the existing `Monster` entity class from `entities.js`. The event engine calls `game.spawnEventMonster(params)` which creates a Monster instance with modified stats.

---

### 2. ZONE_MODIFIER

Applies a temporary modifier to a specific zone or area on the map. Can buff or debuff entities within the zone.

**Example trigger:** SK Hynix discloses a new NAND factory investment → Admin creates a "Yield Boost Zone" near SK Hynix base.

```javascript
{
  type: 'ZONE_MODIFIER',
  params: {
    position: { x: 600, y: 400 },   // Zone center
    radius: 200,                      // Zone radius in px
    effect: 'damage_boost',          // 'damage_boost' | 'speed_boost' | 'heal_zone' | 'slow_zone'
    value: 0.15,                      // +15% damage for players in zone
    affectsTeam: 'all',              // 'samsung' | 'skhynix' | 'all'
    visualColor: '#76b900',          // Zone visual color
    customLabel: 'Yield Boost Zone',
  },
  duration: 60000,                    // Zone lasts 60 seconds
}
```

**Game effect:**
- A visible circular zone appears on the map
- Players within the zone receive the specified modifier
- Modifier applies only while inside the zone
- Zone has a pulsing visual effect and minimap indicator
- Duration countdown shown on HUD

**Zone effect types:**

| Effect | Description | Value Range |
|---|---|---|
| `damage_boost` | Increases damage dealt | 0.05 to 0.25 (+5% to +25%) |
| `speed_boost` | Increases movement speed | 0.05 to 0.20 (+5% to +20%) |
| `heal_zone` | Heals HP per second | 1 to 5 HP/s |
| `slow_zone` | Reduces movement speed | 0.10 to 0.30 (-10% to -30%) |

**Integration with existing systems:** The Wafer Ring map already has zone mechanics (`activeZoneId`, zone timers in `game.js`). The event system creates a temporary zone using the same rendering and collision detection infrastructure, but with admin-specified parameters instead of map-driven ones.

---

### 3. GLOBAL_PARAM

Temporarily modifies a global game parameter affecting all players.

**Example trigger:** TSMC raises chip prices → Admin triggers a global damage reduction ("supply chain disruption").

```javascript
{
  type: 'GLOBAL_PARAM',
  params: {
    parameter: 'minionSpawnRate',    // Which parameter to modify
    multiplier: 2.0,                  // 2x minion spawn rate
    customLabel: 'Mass Production Wave',
  },
  duration: 90000,                    // Effect lasts 90 seconds
}
```

**Modifiable parameters:**

| Parameter | Description | Multiplier Range |
|---|---|---|
| `minionSpawnRate` | Minion spawn interval divisor | 0.5x to 3.0x |
| `minionSpawnCount` | Minions per spawn wave | 1x to 2x |
| `pickupSpawnRate` | Item pickup spawn interval divisor | 0.5x to 3.0x |
| `monsterHpScale` | Neutral monster HP multiplier | 0.5x to 2.0x |
| `respawnDelay` | Player respawn timer multiplier | 0.5x to 2.0x |
| `cellCaptureSpeed` | Cell capture time divisor | 0.5x to 2.0x |

**Game effect:**
- The specified constant is temporarily modified
- Announcement banner with parameter name and effect
- All players see a global effect indicator on HUD
- Original value restored when event expires

**Safety bounds:** Each parameter has hardcoded min/max multiplier limits. The admin cannot set values outside these bounds even through the API.

---

### 4. NEWS_TICKER

Displays a scrolling news headline to all players. Pure cosmetic -- no gameplay effect.

**Example trigger:** Any interesting DART disclosure the admin wants to share.

```javascript
{
  type: 'NEWS_TICKER',
  params: {
    headline: 'Samsung Electronics reports Q4 operating profit up 30%',
    headlineKo: '삼성전자 4분기 영업이익 30% 증가',
    sourceUrl: 'https://dart.fss.or.kr/...',
    importance: 'high',              // 'low' | 'medium' | 'high'
    team: 'samsung',                 // Which team this news relates to (for color coding)
  },
  duration: 30000,                   // Ticker displays for 30 seconds
}
```

**Game effect:**
- Scrolling ticker appears at the bottom of the screen
- Text color matches the related team color
- High importance items have a brief flash/highlight animation
- No gameplay impact whatsoever

---

## Event Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ TRIGGER  │───►│ VALIDATE │───►│  QUEUE   │───►│ EXECUTE  │───►│ EXPIRE   │───►│ CLEANUP  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Stage 1: TRIGGER

**Who:** Admin only (via REST API or admin panel)
**How:** `POST /api/admin/event` with event type, params, and duration
**Validation at this stage:** Auth check (Bearer token matches ADMIN_PASSWORD)

### Stage 2: VALIDATE

**Server-side validation rules:**

1. **Type check:** Event type must be one of the four defined types
2. **Param validation:** Required params present and within allowed ranges
3. **Conflict check:** Cannot trigger an event that conflicts with an active event of the same type
4. **Cooldown check:** Minimum 30 seconds between events of the same type
5. **Rate limit:** Maximum 5 events per 10 minutes (prevents spam)
6. **Duration bounds:** Minimum 10 seconds, maximum 5 minutes

```javascript
// Validation error response
{
  error: 'VALIDATION_FAILED',
  details: [
    { field: 'params.hpMultiplier', message: 'Must be between 0.5 and 3.0' },
    { field: 'type', message: 'Event of type BOSS_SPAWN is already active' },
  ]
}
```

### Stage 3: QUEUE

Events are queued for the next game tick. This ensures events are processed synchronously within the game loop, preventing race conditions.

```javascript
// In MarketDataService or EventEngine
eventQueue.push({
  ...validatedEvent,
  id: generateEventId(),
  status: 'queued',
  queuedAt: Date.now(),
});
```

### Stage 4: EXECUTE

On the next game tick, the game loop processes the event queue:

```javascript
// In game.js update(dt)
_processEventQueue() {
  while (this.eventQueue.length > 0) {
    const event = this.eventQueue.shift();
    switch (event.type) {
      case 'BOSS_SPAWN':
        this._executeBossSpawn(event);
        break;
      case 'ZONE_MODIFIER':
        this._executeZoneModifier(event);
        break;
      case 'GLOBAL_PARAM':
        this._executeGlobalParam(event);
        break;
      case 'NEWS_TICKER':
        this._executeNewsTicker(event);
        break;
    }
    event.status = 'active';
    event.executedAt = Date.now();
    event.expiresAt = Date.now() + event.duration;
    this.activeEvents.push(event);
  }
}
```

### Stage 5: EXPIRE

Each tick, the game loop checks active events for expiration:

```javascript
_checkEventExpiry() {
  const now = Date.now();
  for (const event of this.activeEvents) {
    if (now >= event.expiresAt && event.status === 'active') {
      event.status = 'expired';
      this._revertEvent(event);
    }
  }
}
```

**Revert behavior by type:**

| Type | Revert Action |
|---|---|
| BOSS_SPAWN | Despawn monster if still alive (no kill credit) |
| ZONE_MODIFIER | Remove zone; modifiers immediately stop |
| GLOBAL_PARAM | Restore original parameter value |
| NEWS_TICKER | Remove ticker from display |

### Stage 6: CLEANUP

Expired events are moved to a recent events history (last 50 events kept for admin review), then removed from the active events array.

---

## Admin Workflow

### Typical Flow

```
1. Admin opens admin panel (/admin)
   ↓
2. Admin views DART news feed
   - Shows recent disclosures for Samsung and SK Hynix
   - Each item shows: title, date, type, company
   ↓
3. Admin reads a disclosure and decides it warrants a game event
   - Example: "삼성전자 분기보고서 (2025.12)" → good earnings
   ↓
4. Admin clicks "Trigger Event" next to the news item
   ↓
5. Event creation form pre-fills with:
   - Source: linked news item ID
   - Suggested type: BOSS_SPAWN (for earnings) or NEWS_TICKER (for minor news)
   - Default params based on type
   ↓
6. Admin adjusts parameters if needed
   - Changes boss type, duration, multipliers
   ↓
7. Admin clicks "Submit"
   ↓
8. Server validates and queues the event
   ↓
9. Admin sees event appear in "Active Events" list
   ↓
10. Admin can cancel the event early if needed
```

### Admin Panel UI Sections

```
┌──────────────────────────────────────────────────────────┐
│  Semiconductor War - Admin Panel                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Market Status ─────────────────────────────────────┐ │
│  │ Samsung: 75,800 KRW (+2.16%) [RISE] Buff: DMG +5%  │ │
│  │ SK Hynix: 198,500 KRW (-0.45%) [STABLE] Buff: 0%   │ │
│  │ Provider: yahoo-finance2 | Cache: 2m ago | OPEN     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ DART News Feed ────────────────────────────────────┐ │
│  │ [삼성전자] 분기보고서 (2025.12)    2026-02-14  [▶]  │ │
│  │ [SK하이닉스] 주요사항보고서         2026-02-13  [▶]  │ │
│  │ [삼성전자] 임원등의변동             2026-02-12  [▶]  │ │
│  │                                      [▶] = Trigger  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Create Event ──────────────────────────────────────┐ │
│  │ Type: [BOSS_SPAWN ▼]                                │ │
│  │ Monster: [NVIDIA ▼]  HP Multi: [1.5]               │ │
│  │ Duration: [120] seconds                             │ │
│  │ Label: [HBM3E Earnings Special]                     │ │
│  │                              [Submit Event]         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Active Events ─────────────────────────────────────┐ │
│  │ (none currently active)                             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Recent Events (last 10) ──────────────────────────┐ │
│  │ BOSS_SPAWN [NVIDIA] 14:23 → expired 14:25          │ │
│  │ NEWS_TICKER [Samsung Q4] 13:10 → expired 13:10     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Event Effects on Game State

### Effect Application Architecture

```javascript
// server/market/event-engine.js

class EventEngine {
  constructor(game) {
    this.game = game;
    this.activeEvents = [];
    this.eventQueue = [];
    this.eventHistory = [];       // last 50
    this.cooldowns = new Map();   // type → lastTriggeredAt
  }

  /**
   * Called by game.js on every tick
   */
  update(dt) {
    this._processQueue();
    this._updateActiveEvents(dt);
    this._checkExpiry();
  }

  /**
   * Returns active modifiers for a given category
   */
  getActiveModifiers(category) {
    // category: 'damage' | 'speed' | 'minionSpawnRate' | etc.
    // Returns combined modifier from all active events
  }

  /**
   * Returns active events for snapshot
   */
  getSnapshotData() {
    return this.activeEvents.map(e => ({
      id: e.id,
      type: e.type,
      title: e.title,
      titleKo: e.titleKo,
      params: e.params,
      expiresAt: e.expiresAt,
      status: e.status,
    }));
  }
}
```

### How Each Event Type Modifies Game State

**BOSS_SPAWN:**
```javascript
_executeBossSpawn(event) {
  const monsterType = C.MONSTER_TYPES.find(m => m.name === event.params.monsterType);
  const pos = event.params.position || this._getMapCenter();
  const monster = new Monster(monsterType, pos.x, pos.y);
  monster.hp *= event.params.hpMultiplier;
  monster.maxHp = monster.hp;
  monster.isEventBoss = true;
  monster.eventId = event.id;
  this.monsters.push(monster);
  this._broadcastAnnouncement(event);
}
```

**ZONE_MODIFIER:**
```javascript
_executeZoneModifier(event) {
  const zone = {
    id: event.id,
    x: event.params.position.x,
    y: event.params.position.y,
    radius: event.params.radius,
    effect: event.params.effect,
    value: event.params.value,
    affectsTeam: event.params.affectsTeam,
    color: event.params.visualColor,
    label: event.params.customLabel,
  };
  this.eventZones.push(zone);
  // Checked in _updatePlayers: if player inside zone, apply modifier
}
```

**GLOBAL_PARAM:**
```javascript
_executeGlobalParam(event) {
  const param = event.params.parameter;
  event._originalValue = this.globalModifiers[param] || 1.0;
  this.globalModifiers[param] = event.params.multiplier;
  // Global modifiers checked in relevant game methods:
  // - minionSpawnRate → _spawnMinions()
  // - pickupSpawnRate → _spawnPickups()
  // - etc.
}

_revertGlobalParam(event) {
  const param = event.params.parameter;
  this.globalModifiers[param] = event._originalValue;
}
```

**NEWS_TICKER:**
```javascript
_executeNewsTicker(event) {
  // No game state change; just broadcast to clients
  this.activeNewsTickers.push({
    id: event.id,
    headline: event.params.headline,
    headlineKo: event.params.headlineKo,
    importance: event.params.importance,
    team: event.params.team,
    expiresAt: event.expiresAt,
  });
}
```

---

## Event Display on Client

### Announcement Banner

When an event is triggered, all clients display a full-width banner:

```
Position: Top center of screen
Duration: 5 seconds (fade in 0.3s, hold 4.4s, fade out 0.3s)
Style: Semi-transparent dark background, white text, team-colored accent
Content: Event title + brief description
```

### Minimap Indicators

| Event Type | Minimap Indicator |
|---|---|
| BOSS_SPAWN | Pulsing circle at boss location, monster type color |
| ZONE_MODIFIER | Semi-transparent circle showing zone area and color |
| GLOBAL_PARAM | Small icon in minimap corner (wrench icon) |
| NEWS_TICKER | No minimap indicator |

### HUD Elements

```
Active Event Panel (right side of screen, below kill feed):
┌─────────────────────────┐
│ ⚡ BOSS: NVIDIA (1:45)  │  ← countdown timer
│ 🔵 ZONE: Yield Boost    │
│ 📰 Samsung Q4 Earnings  │
└─────────────────────────┘
```

### Sound Cues

| Event Type | Sound |
|---|---|
| BOSS_SPAWN | Deep horn/siren (1 second) |
| ZONE_MODIFIER | Soft chime (0.5 seconds) |
| GLOBAL_PARAM | Mechanical click (0.3 seconds) |
| NEWS_TICKER | Subtle notification ping (0.2 seconds) |

Note: Sound implementation uses Web Audio API with short generated tones (no audio files needed for MVP). Can be enhanced with actual sound files later.

---

## Event Balancing Rules

### Simultaneous Event Limits

| Rule | Value | Reasoning |
|---|---|---|
| Max active BOSS_SPAWN events | 1 | Multiple bosses would overwhelm the small map |
| Max active ZONE_MODIFIER events | 2 | Too many zones create confusion |
| Max active GLOBAL_PARAM events | 1 | Multiple global modifiers are hard to reason about |
| Max active NEWS_TICKER events | 3 | Tickers are cosmetic, more is fine |
| Max total active events | 3 | Overall cap to prevent chaos |

### Cooldown Between Events

| Event Type | Minimum Cooldown |
|---|---|
| BOSS_SPAWN | 120 seconds (2 minutes) |
| ZONE_MODIFIER | 60 seconds (1 minute) |
| GLOBAL_PARAM | 90 seconds (1.5 minutes) |
| NEWS_TICKER | 10 seconds |

### Value Bounds (Safety Caps)

All event parameters have hardcoded min/max bounds that cannot be exceeded:

```javascript
const EVENT_BOUNDS = {
  BOSS_SPAWN: {
    hpMultiplier: { min: 0.5, max: 3.0 },
    buffValueMultiplier: { min: 0.5, max: 2.0 },
    duration: { min: 30000, max: 300000 },     // 30s to 5min
  },
  ZONE_MODIFIER: {
    radius: { min: 100, max: 400 },
    value: { min: 0.05, max: 0.25 },
    duration: { min: 15000, max: 180000 },     // 15s to 3min
  },
  GLOBAL_PARAM: {
    multiplier: { min: 0.5, max: 3.0 },
    duration: { min: 15000, max: 300000 },     // 15s to 5min
  },
  NEWS_TICKER: {
    duration: { min: 10000, max: 60000 },      // 10s to 1min
  },
};
```

---

## Event Schema (Complete)

```javascript
// Event as stored in the event engine
{
  // Identity
  id: 'evt_1708012345678_a1b2',         // Unique ID (timestamp + random suffix)
  type: 'BOSS_SPAWN',                    // Event type enum

  // Display
  title: 'HBM3E Mass Production!',       // English title
  titleKo: 'HBM3E 양산 개시!',           // Korean title
  description: 'Samsung begins HBM3E mass production', // English detail

  // Source
  sourceNewsId: 'dart_20260215_00126380_001', // Linked DART news item (optional)
  triggeredBy: 'admin',                  // Always 'admin'

  // Parameters (type-specific, see each type above)
  params: { ... },

  // Timing
  duration: 120000,                      // Requested duration (ms)
  triggeredAt: 1708012345678,            // Admin trigger time
  queuedAt: 1708012345680,              // When added to queue
  executedAt: 1708012345700,            // When game loop processed it
  expiresAt: 1708012465700,             // When effects end

  // State
  status: 'active',                      // 'queued' | 'active' | 'expired' | 'cancelled'

  // Internal (not sent to client)
  _originalValue: null,                  // For GLOBAL_PARAM revert
  _spawnedEntityIds: [],                 // For cleanup on expiry/cancel
}
```

---

## Integration Points with Existing Systems

### Monster System (entities.js)

BOSS_SPAWN events create Monster instances using the existing class. Additions needed:
- `monster.isEventBoss` flag (boolean)
- `monster.eventId` reference (string)
- Modified HP via hpMultiplier (applied after construction)
- Event boss does not count toward normal monster spawn timer

### Zone System (game.js)

ZONE_MODIFIER events create temporary zones. The Wafer Ring map already has zone infrastructure:
- `this.activeZoneId`, zone timers, zone effects
- Event zones use a parallel array `this.eventZones[]` to avoid conflicting with map-driven zones
- Same collision detection logic (`_isInZone` check) extended to include event zones

### Minion System (game.js)

GLOBAL_PARAM events with `minionSpawnRate` modify `_spawnMinions()`:
- `const effectiveInterval = C.MINION_SPAWN_INTERVAL / (this.globalModifiers.minionSpawnRate || 1.0);`
- Similar pattern for other spawn-related parameters

### Snapshot (game.js)

Active events are included in the game snapshot for client rendering:
```javascript
// Added to getSnapshot()
activeEvents: this.eventEngine.getSnapshotData(),
```
