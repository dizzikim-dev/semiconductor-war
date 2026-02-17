# Market Data Architecture

## System Overview

```
                          ┌─────────────────────────────────────────┐
                          │          External Data Sources           │
                          │                                         │
                          │  ┌─────────┐ ┌──────────┐ ┌──────────┐│
                          │  │ Yahoo   │ │data.go.kr│ │  DART    ││
                          │  │Finance 2│ │ FSC API  │ │ OpenDART ││
                          │  └────┬────┘ └────┬─────┘ └────┬─────┘│
                          └───────┼───────────┼────────────┼───────┘
                                  │           │            │
                          ┌───────▼───────────▼────────────▼───────┐
                          │         Provider Manager                │
                          │  ┌─────────────────────────────────┐   │
                          │  │  Circuit Breaker (per provider)  │   │
                          │  │  3 failures → 5min cooldown      │   │
                          │  └─────────────────────────────────┘   │
                          │  ┌──────────┐ ┌──────────┐ ┌────────┐ │
                          │  │YahooAdapt│ │FSCAdapt  │ │DARTAdpt│ │
                          │  │.getQuotes│ │.getQuotes│ │.getNews│ │
                          │  └──────────┘ └──────────┘ └────────┘ │
                          └───────────────────┬────────────────────┘
                                              │
                          ┌───────────────────▼────────────────────┐
                          │         MarketDataService               │
                          │                                         │
                          │  ┌──────────────┐  ┌────────────────┐  │
                          │  │ Quote Cache   │  │ News Cache     │  │
                          │  │ TTL: 5min     │  │ TTL: 15min     │  │
                          │  │ In-memory Map │  │ In-memory Map  │  │
                          │  └──────┬───────┘  └───────┬────────┘  │
                          │         │                  │            │
                          │  ┌──────▼──────────────────▼────────┐  │
                          │  │         Buff Calculator           │  │
                          │  │  % change → game buff mapping     │  │
                          │  │  Cap: ±10% damage, ±5% speed      │  │
                          │  └──────────────┬───────────────────┘  │
                          └─────────────────┼──────────────────────┘
                                            │
                          ┌─────────────────▼──────────────────────┐
                          │              Game.js                    │
                          │                                         │
                          │  update() reads marketDataService       │
                          │  → applies team buff/nerf modifiers     │
                          │  → includes marketData in snapshot      │
                          │                                         │
                          │  Snapshot: { ..., marketData, buffs }   │
                          └─────────────────┬──────────────────────┘
                                            │ Socket.io broadcast
                          ┌─────────────────▼──────────────────────┐
                          │           Client (Browser)              │
                          │                                         │
                          │  main.js receives snapshot              │
                          │  → hud.js renders stock panel + buffs   │
                          │  → renderer.js shows visual effects     │
                          └────────────────────────────────────────┘
```

### REST API Layer (Admin + Debug)

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Express Routes (server/index.js or server/market/routes.js) │
  │                                                              │
  │  GET  /api/market-data         → current quotes + buffs      │
  │  GET  /api/market-data/news    → recent DART disclosures     │
  │  GET  /api/market-data/status  → provider health + cache age │
  │  POST /api/admin/event         → trigger game event (auth)   │
  │  POST /api/admin/market/refresh → force cache refresh (auth) │
  │  GET  /admin                   → admin panel HTML            │
  └──────────────────────────────────────────────────────────────┘
```

---

## Ingestion Layer

### Provider Interface (Adapter Pattern)

Every data provider implements this interface. This allows hot-swapping providers without changing any consuming code.

```javascript
// server/market/providers/base-provider.js

class BaseProvider {
  /**
   * @returns {string} Human-readable provider name
   */
  getName() { throw new Error('Not implemented'); }

  /**
   * @returns {Promise<boolean>} Whether this provider is currently configured and reachable
   */
  async isAvailable() { throw new Error('Not implemented'); }

  /**
   * @param {string[]} symbols - e.g. ['005930.KS', '000660.KS']
   * @returns {Promise<MarketQuote[]>}
   */
  async getQuotes(symbols) { throw new Error('Not implemented'); }

  /**
   * @param {string[]} corpCodes - e.g. ['00126380', '00164779']
   * @returns {Promise<NewsItem[]>}
   */
  async getNews(corpCodes) { throw new Error('Not implemented'); }
}
```

### Concrete Providers

#### YahooProvider

```
File: server/market/providers/yahoo-provider.js
Dependency: yahoo-finance2 (npm)
Method: yahoo.quote(['005930.KS', '000660.KS'])
Returns: regularMarketPrice, regularMarketPreviousClose, regularMarketChangePercent
Latency: ~500ms per call
```

#### FSCProvider

```
File: server/market/providers/fsc-provider.js
Dependency: Native fetch (Node 18+)
Endpoint: https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo
API Key: env var FSC_API_KEY
Returns: clpr (close price), vs (change), fltRt (change rate)
Note: Daily close only -- used when Yahoo is down
```

#### DARTProvider

```
File: server/market/providers/dart-provider.js
Dependency: Native fetch
Endpoint: https://opendart.fss.or.kr/api/list.json
API Key: env var DART_API_KEY
Parameters: corp_code, bgn_de (start date), page_count
Returns: Disclosure list with rcept_no, corp_name, report_nm, rcept_dt
```

#### MockProvider

```
File: server/market/providers/mock-provider.js
No external dependencies
Returns: Deterministic fake data based on time-of-day for consistent testing
Activated by: USE_MOCK_MARKET_DATA=true
Samsung mock: oscillates ±2% around 75,000 KRW
SK Hynix mock: oscillates ±2.5% around 200,000 KRW
```

### Provider Manager with Circuit Breaker

```
File: server/market/provider-manager.js
```

The provider manager wraps all providers and adds resilience.

**Circuit breaker per provider:**

| State | Behavior |
|---|---|
| CLOSED (normal) | Requests pass through to provider |
| OPEN (tripped) | Requests immediately fail; skip provider |
| HALF_OPEN (probing) | Allow 1 request through to test recovery |

**Thresholds:**
- Failure threshold: 3 consecutive failures
- Cooldown period: 5 minutes (300,000ms)
- Half-open probe: 1 request after cooldown

**Provider priority order:**
1. YahooProvider (primary)
2. FSCProvider (fallback)
3. MockProvider (emergency fallback, always available)

**Fallback logic:**
```
For getQuotes(symbols):
  1. Try YahooProvider (if circuit CLOSED or HALF_OPEN)
  2. If fail → increment Yahoo failure count; try FSCProvider
  3. If fail → increment FSC failure count; use MockProvider
  4. MockProvider never fails (in-memory deterministic)

For getNews(corpCodes):
  1. Try DARTProvider (only source for news)
  2. If fail → return empty array (news is non-critical)
```

---

## Cache Layer

```
File: server/market/cache.js
```

### Design

In-memory cache using a JavaScript `Map`. No external dependencies (no Redis).

```javascript
class MarketCache {
  constructor() {
    this.quotes = new Map();     // symbol → { data: MarketQuote, fetchedAt: timestamp }
    this.news = [];              // NewsItem[] (most recent 50)
    this.buffs = new Map();      // team → MarketBuff
    this.providerStatus = {};    // provider health summary
  }
}
```

### TTL Strategy

| Data Type | TTL | Reasoning |
|---|---|---|
| Stock quotes | 5 minutes | Balances freshness vs rate limits |
| News items | 15 minutes | Disclosures don't change frequently |
| Computed buffs | Same as quotes | Recalculated on quote refresh |
| Provider status | 1 minute | Quick feedback on provider health |

### Market Hours Awareness

Korean market hours: 09:00-15:30 KST (UTC+9), Monday-Friday.

| Time Window | Polling Interval | Behavior |
|---|---|---|
| Market open (09:00-15:30 KST, weekday) | Every 5 minutes | Active polling |
| Market closed (15:30-09:00 KST, or weekend/holiday) | Every 30 minutes | Reduced polling; show "CLOSED" badge |
| System startup | Immediate | One initial fetch regardless of time |

**Holiday handling:** A static array of KRX holidays for the current year. Updated manually or fetched from a public calendar API on server start.

### Cache Refresh Flow

```
setInterval(refreshQuotes, POLL_INTERVAL)  // 5min or 30min based on market hours
  │
  ▼
providerManager.getQuotes(['005930.KS', '000660.KS'])
  │
  ▼
cache.quotes.set(symbol, { data, fetchedAt: Date.now() })
  │
  ▼
buffCalculator.recalculate(cache.quotes)
  │
  ▼
cache.buffs.set('samsung', newSamsungBuff)
cache.buffs.set('skhynix', newSkhynixBuff)
```

---

## Buff Engine

```
File: server/market/buff-calculator.js
```

### Percentage Change to Game Buff Mapping

The buff engine converts daily stock price change into game modifiers.

| Daily % Change | Damage Modifier | Speed Modifier | Label |
|---|---|---|---|
| >= +3.0% | +10% | +5% | SURGE (급등) |
| +1.0% to +2.99% | +5% | 0% | RISE (상승) |
| -0.99% to +0.99% | 0% | 0% | STABLE (보합) |
| -1.0% to -2.99% | -5% | 0% | DIP (하락) |
| <= -3.0% | -10% | -5% | PLUNGE (급락) |

### Cap Logic

- Maximum buff: +10% damage, +5% speed
- Maximum nerf: -10% damage, -5% speed
- Stock moves beyond +/-3% are capped at the same buff level (no scaling beyond cap)
- This prevents extreme market events (circuit breakers, etc.) from making the game unplayable

### Buff Application to Existing Systems

Market buffs **stack multiplicatively** with existing game buffs (monster buffs, EUV pickups, level growth):

```javascript
// In game.js, when calculating effective damage:
const baseDamage = player.getAttackDamage();          // class + level + EUV
const monsterBuff = getTeamBuff(player.team, 'dmg');  // NVIDIA/TSMC buff
const marketBuff = marketDataService.getTeamBuff(player.team); // stock market buff

const effectiveDamage = baseDamage * (1 + monsterBuff) * (1 + marketBuff.damageModifier);
```

```javascript
// Speed modifier:
const baseSpeed = player.speed;                        // class + level
const monsterSpd = getTeamBuff(player.team, 'spd');    // Apple buff
const marketSpd = marketDataService.getTeamBuff(player.team);

const effectiveSpeed = baseSpeed * (1 + monsterSpd) * (1 + marketSpd.speedModifier);
```

### Buff Data Structure

```javascript
// MarketBuff
{
  team: 'samsung',           // 'samsung' | 'skhynix'
  symbol: '005930.KS',
  dailyChangePercent: 2.35,  // from provider
  damageModifier: 0.05,      // +5%
  speedModifier: 0.0,        // no speed change
  label: 'RISE',
  labelKo: '상승',
  updatedAt: 1708012345678   // timestamp
}
```

---

## Game Server Integration

### Snapshot Injection

The game snapshot already broadcasts to all clients at 20Hz. Market data is injected into the snapshot at a lower frequency (every 5 seconds) to avoid bandwidth waste.

```javascript
// In game.js getSnapshot()
getSnapshot() {
  const snapshot = {
    players: [...],
    bullets: [...],
    minions: [...],
    monsters: [...],
    pickups: [...],
    cells: [...],
    teamKills: this.teamKills,
    territoryScore: this.territoryScore,
    teamBuffs: this.teamBuffs,
    mapConfig: this.mapConfig,
    roundTime: this._getRoundTimeLeft(),
    events: this.events,
    // NEW: market data (included every N snapshots to save bandwidth)
    marketData: this._shouldIncludeMarketData() ? {
      quotes: marketDataService.getQuotes(),
      buffs: marketDataService.getTeamBuffs(),
      news: marketDataService.getRecentNews(5),
      marketOpen: marketDataService.isMarketOpen(),
      lastUpdated: marketDataService.getLastUpdateTime(),
      provider: marketDataService.getActiveProviderName(),
    } : undefined,
  };
  return snapshot;
}
```

### Damage/Speed Modifier Application Points

Market buffs must be applied at the same points where existing buffs are applied. These are the specific locations in `game.js`:

1. **Player auto-fire damage** (`_autoFire` method) -- when a bullet is created, its damage includes market buff
2. **Orbital hit damage** (`_updateOrbitals` method) -- when capacitor orbs deal damage
3. **Player movement** (`_updatePlayers` method) -- speed calculation includes market buff
4. **Minion damage** -- minions are NOT affected by market buffs (they are autonomous units)
5. **Cell turret damage** -- cells are NOT affected by market buffs (neutral infrastructure)

### Market Data Service Lifecycle

```javascript
// In server/index.js

const MarketDataService = require('./market/market-data-service');
const marketDataService = new MarketDataService({
  useMock: process.env.USE_MOCK_MARKET_DATA === 'true',
  enableLiveBuffs: process.env.ENABLE_LIVE_MARKET_BUFFS === 'true',
  enableNewsEvents: process.env.ENABLE_NEWS_EVENTS === 'true',
  fscApiKey: process.env.FSC_API_KEY,
  dartApiKey: process.env.DART_API_KEY,
});

// Start polling
await marketDataService.start();

// Pass to Game instance
const game = new Game(mapId);
game.setMarketDataService(marketDataService);

// On shutdown
process.on('SIGTERM', () => {
  marketDataService.stop();
  process.exit(0);
});
```

---

## Admin Tooling

### REST Endpoints

All admin endpoints require `Authorization: Bearer <ADMIN_PASSWORD>` header, where `ADMIN_PASSWORD` is from the environment variable.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/market-data` | Public: current quotes + active buffs |
| `GET` | `/api/market-data/news` | Public: recent DART disclosures |
| `GET` | `/api/market-data/status` | Public: provider health + cache freshness |
| `POST` | `/api/admin/market/refresh` | Auth: force cache refresh now |
| `POST` | `/api/admin/event` | Auth: trigger a game event |
| `GET` | `/api/admin/events` | Auth: list active + recent events |
| `DELETE` | `/api/admin/event/:id` | Auth: cancel an active event |

### Admin Panel

```
File: public/admin.html (simple standalone HTML page)
```

A minimal single-page admin panel using vanilla HTML/CSS/JS:
- Stock data overview (current prices, change %, active buffs)
- Provider health dashboard (which provider is active, circuit breaker states)
- DART news feed with "Trigger Event" button per item
- Event creation form (type, parameters, duration)
- Active events list with cancel buttons
- Login via password field (stored in sessionStorage)

---

## UI Data Flow

### Client-Side Rendering

```
Snapshot (via Socket.io)
  │
  ▼
main.js: stores marketData in gameState
  │
  ├─► hud.js: renderStockPanel(marketData)
  │     - Samsung price + change% + buff indicator
  │     - SK Hynix price + change% + buff indicator
  │     - Market status badge (OPEN/CLOSED)
  │     - Active buff effects (damage ±X%, speed ±X%)
  │     - Disclaimer text
  │     - Data source + last updated time
  │
  ├─► hud.js: renderNewsTicker(marketData.news)
  │     - Scrolling ticker at bottom of screen
  │     - DART disclosure headlines
  │
  └─► renderer.js: renderBuffEffects(buffs)
        - Team color intensity shift based on buff/nerf
        - Subtle particle effect on buffed team's players
        - UI glow on player HP bar when buffed/nerfed
```

---

## Data Schemas

### MarketQuote

```javascript
{
  symbol: '005930.KS',               // KRX ticker with Yahoo suffix
  name: 'Samsung Electronics',       // English name
  nameKo: '삼성전자',                  // Korean name
  price: 75800,                      // Current/last price (KRW)
  previousClose: 74200,              // Previous day close (KRW)
  change: 1600,                      // Absolute change (KRW)
  changePercent: 2.16,               // Daily % change
  volume: 12345678,                  // Trading volume
  marketOpen: true,                  // Whether market is currently open
  currency: 'KRW',                   // Always KRW
  fetchedAt: 1708012345678,          // When this data was fetched
  provider: 'yahoo-finance2',        // Which provider supplied this data
  delayed: true,                     // Always true (we never use real-time)
}
```

### NewsItem

```javascript
{
  id: 'dart_20260215_00126380_001',  // Unique ID
  source: 'DART',                    // Data source
  corpCode: '00126380',              // DART corp code
  corpName: '삼성전자',               // Company name
  title: '분기보고서 (2025.12)',       // Disclosure title
  titleEn: 'Quarterly Report (2025.12)', // English title (if available)
  type: 'earnings',                  // 'earnings' | 'governance' | 'regulation' | 'other'
  url: 'https://dart.fss.or.kr/...',  // Link to full filing
  publishedAt: '2026-02-14T09:30:00+09:00', // Publication timestamp
  fetchedAt: 1708012345678,          // When we fetched this
  team: 'samsung',                   // Which team this affects
}
```

### MarketBuff

```javascript
{
  team: 'samsung',                   // 'samsung' | 'skhynix'
  symbol: '005930.KS',              // Source ticker
  dailyChangePercent: 2.16,         // Raw % change
  damageModifier: 0.05,             // Applied modifier (-0.10 to +0.10)
  speedModifier: 0.0,               // Applied modifier (-0.05 to +0.05)
  tier: 'RISE',                     // 'SURGE' | 'RISE' | 'STABLE' | 'DIP' | 'PLUNGE'
  tierKo: '상승',                    // Korean label
  active: true,                     // Whether buffs are being applied
  updatedAt: 1708012345678,         // Last calculation time
  expiresAt: null,                  // null = until next recalculation
}
```

### GameEvent

```javascript
{
  id: 'evt_1708012345678_abc',       // Unique event ID
  type: 'BOSS_SPAWN',               // Event type enum
  title: 'TSMC Earnings Beat!',     // Display title
  titleKo: 'TSMC 어닝 서프라이즈!',   // Korean title
  description: 'TSMC reports record HBM revenue', // Detail
  sourceNewsId: 'dart_20260215_...',  // Linked news item (optional)
  params: {                          // Type-specific parameters
    monsterType: 'TSMC',
    position: { x: 1200, y: 800 },
    hpMultiplier: 1.5,
  },
  triggeredBy: 'admin',             // Always 'admin' (no auto-trigger)
  triggeredAt: 1708012345678,       // When admin triggered this
  expiresAt: 1708012645678,         // When event effects end
  status: 'active',                 // 'queued' | 'active' | 'expired' | 'cancelled'
}
```

---

## Error Handling and Fallback Strategy

### Error Categories

| Category | Example | Response |
|---|---|---|
| **Network timeout** | Yahoo API takes >10s | Trip circuit breaker; try next provider |
| **API error (4xx)** | Invalid API key, rate limited | Log error; trip circuit breaker |
| **API error (5xx)** | Provider server down | Trip circuit breaker; try next provider |
| **Parse error** | Unexpected response format | Log + trip; return cached data if available |
| **All providers down** | Yahoo + FSC both failing | Fall back to MockProvider |
| **Cache stale** | No refresh in >30 minutes | Continue serving stale data with `stale: true` flag |

### Fallback Cascade

```
[YahooProvider] ──fail──► [FSCProvider] ──fail──► [MockProvider] ──always works──► cached result
       │                        │                        │
       ▼                        ▼                        ▼
  Circuit breaker          Circuit breaker          No circuit breaker
  (3 fails → 5min)        (3 fails → 5min)         (always available)
```

### Graceful Degradation Levels

| Level | Condition | Game Behavior |
|---|---|---|
| **Full** | Live data flowing | Stock panel + buffs active |
| **Stale** | Cache >30min old | Stock panel shows "STALE" badge; buffs still apply from cached data |
| **Fallback** | Only FSC daily data | Stock panel shows daily close; buffs based on yesterday's close |
| **Mock** | All providers down | Stock panel shows simulated data with "SIMULATED" badge; buffs from mock |
| **Disabled** | `ENABLE_LIVE_MARKET_BUFFS=false` | Stock panel visible but all buffs are 0%; pure cosmetic |

---

## Feature Flags and Configuration

### Environment Variables

```bash
# ─── Feature Flags ───
USE_MOCK_MARKET_DATA=false        # true: skip all live providers, use MockProvider only
ENABLE_LIVE_MARKET_BUFFS=true     # true: market data affects gameplay; false: display only
ENABLE_NEWS_EVENTS=true           # true: DART news fetching enabled; false: no news

# ─── API Keys ───
FSC_API_KEY=your_fsc_api_key      # data.go.kr API key (free registration)
DART_API_KEY=your_dart_api_key    # DART OpenDART API key (free registration)

# ─── Admin ───
ADMIN_PASSWORD=your_secure_password  # Required for admin endpoints

# ─── Optional: Twelve Data (upgrade path) ───
TWELVE_DATA_API_KEY=               # If set, TwelveDataProvider is registered as primary
```

### Feature Flag Behavior Matrix

| Flag | Mock | Live Buffs | News | Behavior |
|---|---|---|---|---|
| Default (all off) | false | false | false | No market data, no buffs, no news |
| Display only | false | false | true | Stock panel + news visible, zero gameplay effect |
| Full live | false | true | true | Stock panel + buffs active + news events |
| Mock mode | true | true | true | Simulated data + buffs active (for testing) |
| Emergency off | false | false | false | Flip to this if any issues arise |

### Constants (server/market/market-constants.js)

```javascript
module.exports = {
  // Polling
  POLL_INTERVAL_OPEN: 5 * 60 * 1000,    // 5 minutes during market hours
  POLL_INTERVAL_CLOSED: 30 * 60 * 1000, // 30 minutes when market closed

  // Cache TTL
  QUOTE_CACHE_TTL: 5 * 60 * 1000,       // 5 minutes
  NEWS_CACHE_TTL: 15 * 60 * 1000,       // 15 minutes

  // Circuit breaker
  CB_FAILURE_THRESHOLD: 3,
  CB_COOLDOWN_MS: 5 * 60 * 1000,        // 5 minutes

  // Buff thresholds
  BUFF_SURGE_THRESHOLD: 3.0,            // >= +3% → SURGE
  BUFF_RISE_THRESHOLD: 1.0,             // >= +1% → RISE
  BUFF_DIP_THRESHOLD: -1.0,             // <= -1% → DIP
  BUFF_PLUNGE_THRESHOLD: -3.0,          // <= -3% → PLUNGE

  // Buff caps
  BUFF_MAX_DAMAGE: 0.10,                // ±10%
  BUFF_MAX_SPEED: 0.05,                 // ±5%

  // Market hours (KST = UTC+9)
  MARKET_OPEN_HOUR: 9,                  // 09:00 KST
  MARKET_CLOSE_HOUR: 15,               // 15:30 KST
  MARKET_CLOSE_MINUTE: 30,

  // Symbols
  SYMBOLS: {
    samsung: '005930.KS',
    skhynix: '000660.KS',
  },

  // DART corp codes
  DART_CORP_CODES: {
    samsung: '00126380',
    skhynix: '00164779',
  },

  // Snapshot injection
  MARKET_SNAPSHOT_INTERVAL: 5000,       // Include market data every 5 seconds
};
```

---

## File Structure

```
server/
├── market/
│   ├── market-data-service.js     # Main service class (orchestrates everything)
│   ├── market-constants.js        # All market-related constants
│   ├── cache.js                   # In-memory cache with TTL
│   ├── buff-calculator.js         # % change → game buff conversion
│   ├── provider-manager.js        # Circuit breaker + fallback logic
│   └── providers/
│       ├── base-provider.js       # Abstract provider interface
│       ├── yahoo-provider.js      # yahoo-finance2 adapter
│       ├── fsc-provider.js        # data.go.kr FSC adapter
│       ├── dart-provider.js       # DART OpenDART adapter
│       └── mock-provider.js       # Deterministic mock for testing
├── admin/
│   ├── routes.js                  # Admin REST endpoints
│   └── auth.js                    # Simple env-var password auth middleware
├── constants.js                   # (existing) game constants
├── entities.js                    # (existing) game entities
├── game.js                        # (modified) market buff integration points
├── index.js                       # (modified) MarketDataService init + admin routes
└── maps.js                        # (existing) map configs
```
