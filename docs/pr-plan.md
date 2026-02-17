# PR Plan: Market Data Integration

## Overview

The market data integration is split into 6 pull requests, ordered by dependency. Each PR is independently deployable with feature flags, so any PR can be merged and deployed without requiring subsequent PRs to be ready.

**Dependency graph:**
```
PR1 (Infrastructure) ─────────────────────────────────────────►
        │
        ├──► PR2 (Stock Panel UI) ────────────────────────────►
        │
        ├──► PR3 (Buff Engine) ───────────────────────────────►
        │         │
        │         └──► PR5 (Admin Events) ────────────────────►
        │
        ├──► PR4 (DART News) ─────────────────────────────────►
        │         │
        │         └──► PR5 (Admin Events) ────────────────────►
        │
        └──► PR6 (Live Switch + Compliance) ──────────────────►
                    (depends on PR1-PR5 all merged)
```

---

## PR 1: Market Data Infrastructure + Mock Mode

### Objective

Establish the server-side market data foundation: adapter pattern, provider manager with circuit breaker, in-memory cache, mock provider, feature flags, and REST endpoints. No gameplay effect yet -- this PR only fetches and caches data.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `package.json` | Modified | Add `yahoo-finance2` dependency |
| `server/index.js` | Modified | Initialize MarketDataService, register API routes |
| `server/constants.js` | Modified | Add `MARKET_*` feature flag defaults (commented reference only) |

### New Files Created

| File | Description |
|---|---|
| `server/market/market-data-service.js` | Main orchestration class |
| `server/market/market-constants.js` | All market-related constants |
| `server/market/cache.js` | In-memory cache with TTL |
| `server/market/provider-manager.js` | Circuit breaker + provider fallback |
| `server/market/providers/base-provider.js` | Abstract provider interface |
| `server/market/providers/yahoo-provider.js` | yahoo-finance2 adapter |
| `server/market/providers/fsc-provider.js` | data.go.kr FSC adapter |
| `server/market/providers/mock-provider.js` | Deterministic mock data |
| `server/market/routes.js` | Express routes for /api/market-data/* |

### Tests Required

- [ ] Server starts with `USE_MOCK_MARKET_DATA=true` and serves mock data on `/api/market-data`
- [ ] Server starts with no env vars set (all features disabled) -- no errors, no market data
- [ ] Mock provider returns deterministic data for both tickers
- [ ] Circuit breaker trips after 3 simulated failures and recovers after cooldown
- [ ] Cache TTL works: data older than 5 minutes triggers a refresh
- [ ] `/api/market-data` returns proper JSON with MarketQuote schema
- [ ] `/api/market-data/status` shows provider health
- [ ] Feature flag `USE_MOCK_MARKET_DATA` switches between mock and live providers
- [ ] No impact on existing game functionality when market service is disabled

### Rollback Plan

Set `USE_MOCK_MARKET_DATA=false` and `ENABLE_LIVE_MARKET_BUFFS=false` in environment. The MarketDataService initializes but does nothing. Alternatively, revert the `server/index.js` changes (3-4 lines) to completely remove market service initialization.

### Definition of Done

- MarketDataService starts, polls, and caches mock data
- All three REST endpoints return valid JSON
- Feature flags control behavior as documented
- No console errors on startup or during polling
- Existing game tests still pass (open two browser tabs, play a round)

### Dependencies

None. This is the foundation PR.

### Estimated Complexity

**Large (L)** -- 9 new files, adapter pattern, circuit breaker logic, cache management, REST endpoints.

---

## PR 2: Stock Panel UI

### Objective

Add a stock data panel to the client-side HUD showing Samsung and SK Hynix prices, daily change percentage, market status, and required disclaimers. Display only -- no gameplay effect.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `public/js/main.js` | Modified | Store `marketData` from snapshot in game state |
| `public/js/hud.js` | Modified | Add `renderStockPanel()` and `renderDisclaimer()` functions |
| `public/css/style.css` | Modified | Add stock panel styling |
| `public/index.html` | Modified | Add stock panel container div and disclaimer div |

### New Files Created

None. All changes are additions to existing files.

### Tests Required

- [ ] Stock panel appears on screen during gameplay (top-right corner)
- [ ] Samsung price, change %, and buff indicator display correctly
- [ ] SK Hynix price, change %, and buff indicator display correctly
- [ ] "OPEN" badge shows during KRX market hours
- [ ] "CLOSED" badge shows outside KRX market hours
- [ ] Disclaimer text visible in both Korean and English
- [ ] Panel updates when new snapshot arrives with marketData
- [ ] Panel gracefully handles missing marketData (shows "Loading..." or "N/A")
- [ ] Panel does not overlap with existing HUD elements (HP, kills, minimap)
- [ ] Panel is readable at different browser window sizes (min 1024x768)
- [ ] Mock mode data displays correctly in the panel

### Rollback Plan

Remove the stock panel container div from `index.html` and comment out the `renderStockPanel()` call in `hud.js`. Panel disappears with no side effects.

### Definition of Done

- Stock panel renders with correct data from server snapshot
- Disclaimer is always visible when panel is visible
- Visual design is clean and does not obstruct gameplay
- Panel handles all data states (loading, live, stale, closed, mock)

### Dependencies

**PR 1** must be merged (provides `marketData` in snapshot and mock data).

### Estimated Complexity

**Small (S)** -- UI additions to existing files, CSS styling, no new logic.

---

## PR 3: Buff Engine + Game Integration

### Objective

Implement the buff calculator that converts stock price changes into game modifiers (damage, speed) and integrate it into the game loop so that market data actually affects gameplay.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `server/game.js` | Modified | Read market buffs, apply to damage/speed calculations in `_autoFire`, `_updateOrbitals`, `_updatePlayers` |
| `server/market/market-data-service.js` | Modified | Add `getTeamBuffs()`, `getTeamBuff(team)` methods |
| `public/js/hud.js` | Modified | Show active buff/nerf indicators per team |
| `public/js/renderer.js` | Modified | Add subtle visual effect on buffed/nerfed players |

### New Files Created

| File | Description |
|---|---|
| `server/market/buff-calculator.js` | % change to game buff conversion logic |

### Tests Required

- [ ] +3% Samsung stock → Samsung team gets +10% damage, +5% speed
- [ ] +1.5% Samsung stock → Samsung team gets +5% damage, no speed change
- [ ] -0.5% Samsung stock → Samsung team gets no buff/nerf (dead zone)
- [ ] -2% SK Hynix stock → SK Hynix team gets -5% damage, no speed change
- [ ] -4% SK Hynix stock → SK Hynix team gets -10% damage, -5% speed (capped)
- [ ] Buffs stack correctly with existing monster buffs (multiplicative)
- [ ] Buffs stack correctly with EUV pickups (multiplicative)
- [ ] Buffs stack correctly with level growth
- [ ] `ENABLE_LIVE_MARKET_BUFFS=false` → all modifiers are 0% regardless of stock data
- [ ] Buff changes are reflected in real-time when market data updates
- [ ] Minions are NOT affected by market buffs
- [ ] Cell turrets are NOT affected by market buffs
- [ ] HUD shows buff/nerf indicators correctly
- [ ] Player visual effects match buff state

### Rollback Plan

Set `ENABLE_LIVE_MARKET_BUFFS=false`. All market buff modifiers return 0. Game plays as if market data doesn't exist. No code revert needed.

### Definition of Done

- Buff calculator correctly maps all 5 tiers (SURGE/RISE/STABLE/DIP/PLUNGE)
- Game damage and speed calculations include market modifiers
- Buffs are capped at +-10% damage, +-5% speed
- Feature flag cleanly disables all buffs
- Visual and HUD feedback shows buff state to players

### Dependencies

**PR 1** must be merged (provides MarketDataService with cached quotes).

### Estimated Complexity

**Medium (M)** -- 1 new file, modifications to game.js damage/speed paths (sensitive code), buff stacking logic.

---

## PR 4: DART News Integration

### Objective

Add the DART OpenDART provider to fetch corporate disclosures for Samsung and SK Hynix, cache them, display in the admin panel, and show recent headlines via a news ticker on the client.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `server/market/market-data-service.js` | Modified | Add news fetching loop, `getRecentNews()` method |
| `server/market/cache.js` | Modified | Add news caching with 15-minute TTL |
| `server/market/provider-manager.js` | Modified | Register DARTProvider, handle news-specific fallback |
| `server/market/routes.js` | Modified | Add `GET /api/market-data/news` endpoint |
| `public/js/hud.js` | Modified | Add scrolling news ticker renderer |
| `public/css/style.css` | Modified | Add news ticker styling |

### New Files Created

| File | Description |
|---|---|
| `server/market/providers/dart-provider.js` | DART OpenDART API adapter |

### Tests Required

- [ ] DART provider fetches disclosures for Samsung (corp code 00126380)
- [ ] DART provider fetches disclosures for SK Hynix (corp code 00164779)
- [ ] News items are cached and served from cache within TTL
- [ ] `/api/market-data/news` returns array of NewsItem objects
- [ ] `ENABLE_NEWS_EVENTS=false` → no DART fetching, empty news array
- [ ] News ticker scrolls across bottom of game screen
- [ ] Ticker handles Korean text correctly (encoding, display)
- [ ] DART API key missing → graceful degradation (empty news, no error)
- [ ] DART API failure → circuit breaker trips, returns empty array

### Rollback Plan

Set `ENABLE_NEWS_EVENTS=false`. No DART API calls are made. News ticker shows nothing. No code revert needed.

### Definition of Done

- DART provider fetches and parses disclosures correctly
- News items cached and available via REST API
- News ticker displays on client with proper styling
- Feature flag cleanly disables all news functionality
- No API calls when feature is disabled

### Dependencies

**PR 1** must be merged (provides provider-manager and cache infrastructure).

### Estimated Complexity

**Medium (M)** -- 1 new provider file, moderate modifications to existing market files, client-side ticker implementation.

---

## PR 5: Admin Event System

### Objective

Build the event engine that allows admins to trigger game events (boss spawns, zone modifiers, global parameter changes, news tickers) based on DART news or at their discretion. Includes the admin panel web page and authentication.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `server/game.js` | Modified | Add event queue processing, event zone logic, global modifier application |
| `server/index.js` | Modified | Register admin routes, serve admin.html |
| `server/market/market-data-service.js` | Modified | Expose event engine to game.js |
| `public/js/main.js` | Modified | Handle `activeEvents` from snapshot |
| `public/js/hud.js` | Modified | Render event banners, active event indicators |
| `public/js/renderer.js` | Modified | Render event zones on map, boss indicators on minimap |
| `public/css/style.css` | Modified | Event banner and indicator styling |

### New Files Created

| File | Description |
|---|---|
| `server/market/event-engine.js` | Event lifecycle management (queue, execute, expire, cleanup) |
| `server/admin/routes.js` | Admin REST endpoints (POST /api/admin/event, etc.) |
| `server/admin/auth.js` | ADMIN_PASSWORD env-var authentication middleware |
| `public/admin.html` | Admin panel single-page HTML (vanilla JS) |

### Tests Required

- [ ] Admin login with correct ADMIN_PASSWORD succeeds
- [ ] Admin login with wrong password returns 401
- [ ] BOSS_SPAWN event creates a monster with scaled HP
- [ ] BOSS_SPAWN monster despawns when event expires
- [ ] ZONE_MODIFIER creates a visible zone with correct effect
- [ ] Zone modifier applies to players inside the zone
- [ ] Zone modifier stops when player leaves zone
- [ ] GLOBAL_PARAM modifies minion spawn rate correctly
- [ ] GLOBAL_PARAM reverts to original value on expiry
- [ ] NEWS_TICKER displays headline on all clients
- [ ] Event cooldown prevents rapid re-triggering
- [ ] Max active events limit is enforced
- [ ] Event cancellation works (admin can cancel active event)
- [ ] Event validation rejects out-of-bounds parameters
- [ ] Admin panel displays current market status
- [ ] Admin panel shows DART news feed
- [ ] Admin panel shows active and recent events
- [ ] All event types render correctly on client (banner, minimap, HUD)

### Rollback Plan

1. Quick: Set `ENABLE_NEWS_EVENTS=false` to disable DART feed in admin panel
2. Medium: Remove admin routes from `server/index.js` (2-3 lines)
3. Full: Revert `game.js` event processing changes (event queue, zone logic)

### Definition of Done

- All 4 event types work end-to-end (admin triggers → game processes → client displays)
- Event lifecycle is complete (trigger → validate → queue → execute → expire → cleanup)
- Admin panel is functional and authenticated
- Safety bounds prevent abuse (rate limits, cooldowns, value caps)
- Events integrate cleanly with existing monster/zone systems

### Dependencies

**PR 1** must be merged (market data service infrastructure).
**PR 3** should be merged (buff engine, for consistent modifier application patterns).
**PR 4** should be merged (DART news, for admin panel news feed).

### Estimated Complexity

**Large (L)** -- 4 new files, significant game.js modifications, admin panel UI, auth system, event lifecycle management.

---

## PR 6: Live Provider Switch + Compliance Finalization

### Objective

Switch from mock to live yahoo-finance2 provider as default, add the Twelve Data upgrade path provider, finalize all disclaimers and compliance elements, and ensure production readiness.

### Changed Files

| File | Change Type | Description |
|---|---|---|
| `server/market/market-data-service.js` | Modified | Default to live providers when API keys present |
| `server/market/provider-manager.js` | Modified | Register TwelveDataProvider when API key present |
| `server/market/market-constants.js` | Modified | Finalize KRX holiday list, production polling intervals |
| `server/market/routes.js` | Modified | Add compliance headers to API responses |
| `public/js/hud.js` | Modified | Finalize disclaimer rendering, add data source attribution |
| `public/css/style.css` | Modified | Final disclaimer styling |
| `public/index.html` | Modified | Add footer disclaimer, terms link |
| `public/admin.html` | Modified | Add provider switch controls, compliance status panel |
| `.env.example` | Modified | Document all environment variables |

### New Files Created

| File | Description |
|---|---|
| `server/market/providers/twelvedata-provider.js` | Twelve Data API adapter (upgrade path) |

### Tests Required

- [ ] Default startup with no env vars → mock mode, no errors
- [ ] Startup with `USE_MOCK_MARKET_DATA=false` → yahoo-finance2 fetches live data
- [ ] Yahoo provider returns valid quotes for 005930.KS and 000660.KS
- [ ] Yahoo failure → automatic fallback to FSC provider
- [ ] FSC failure → automatic fallback to mock provider
- [ ] `TWELVE_DATA_API_KEY` set → TwelveDataProvider becomes primary
- [ ] Twelve Data returns valid quotes for both tickers
- [ ] All disclaimers visible in Korean and English
- [ ] API responses include compliance headers
- [ ] KRX holiday calendar correctly identifies upcoming holidays
- [ ] Market hours detection works for KST timezone
- [ ] Full game round with live data: connect → play → market data visible → buffs applied → round end
- [ ] Server runs stable for 30+ minutes with live data without memory leaks or provider errors
- [ ] Admin panel provider status shows correct active provider

### Rollback Plan

Set `USE_MOCK_MARKET_DATA=true` to immediately switch back to mock data. All live provider code is bypassed. This is a one-env-var rollback.

### Definition of Done

- Live yahoo-finance2 data flowing and displaying correctly
- Twelve Data provider registered and functional (when API key provided)
- All disclaimers in place (Korean + English)
- Compliance checklist fully satisfied (see `docs/risk-and-compliance.md`)
- Production environment variables documented
- 30-minute stability test passed

### Dependencies

**PR 1-5** must all be merged. This is the final PR that ties everything together for production.

### Estimated Complexity

**Medium (M)** -- 1 new provider file, modifications across many files but each change is small, focus is on finalization and testing rather than new logic.

---

## Summary Table

| PR | Title | Size | Dependencies | Key Deliverable |
|---|---|---|---|---|
| **PR 1** | Market Data Infrastructure + Mock Mode | L | None | Server-side data pipeline with mock |
| **PR 2** | Stock Panel UI | S | PR 1 | Client HUD shows stock prices |
| **PR 3** | Buff Engine + Game Integration | M | PR 1 | Stock changes affect gameplay |
| **PR 4** | DART News Integration | M | PR 1 | Corporate disclosure feed |
| **PR 5** | Admin Event System | L | PR 1, PR 3, PR 4 | Admin-triggered game events |
| **PR 6** | Live Provider Switch + Compliance | M | PR 1-5 | Production-ready live data |

### Recommended Merge Order

```
Week 1: PR 1 (foundation)
Week 1: PR 2 + PR 3 + PR 4 (parallel, all depend only on PR 1)
Week 2: PR 5 (depends on PR 3 + PR 4)
Week 2: PR 6 (final integration + compliance)
```

Total estimated effort: 2 weeks with focused development.
