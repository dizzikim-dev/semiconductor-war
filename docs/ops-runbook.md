# Operations Runbook

## 1. Server Startup with Market Data

### Environment Variables

Create a `.env` file or set these in your deployment platform:

```bash
# ─── Required ───
PORT=3001                              # Game server port (3000 is occupied)
ADMIN_PASSWORD=your_secure_password     # Admin panel authentication

# ─── Feature Flags ───
USE_MOCK_MARKET_DATA=false             # true: use mock data only (no API calls)
ENABLE_LIVE_MARKET_BUFFS=true          # true: stock changes affect gameplay
ENABLE_NEWS_EVENTS=true                # true: DART news fetching enabled

# ─── API Keys (required for live data) ───
FSC_API_KEY=your_fsc_api_key           # data.go.kr API key
DART_API_KEY=your_dart_api_key         # DART OpenDART API key

# ─── Optional: Upgrade Provider ───
TWELVE_DATA_API_KEY=                   # If set, Twelve Data becomes primary provider
```

### Startup Commands

**Development (mock data):**
```bash
USE_MOCK_MARKET_DATA=true node server/index.js
```

**Development (live data):**
```bash
USE_MOCK_MARKET_DATA=false \
ENABLE_LIVE_MARKET_BUFFS=true \
ENABLE_NEWS_EVENTS=true \
FSC_API_KEY=your_key \
DART_API_KEY=your_key \
ADMIN_PASSWORD=devpass123 \
node server/index.js
```

**Production:**
```bash
NODE_ENV=production \
USE_MOCK_MARKET_DATA=false \
ENABLE_LIVE_MARKET_BUFFS=true \
ENABLE_NEWS_EVENTS=true \
FSC_API_KEY=your_key \
DART_API_KEY=your_key \
ADMIN_PASSWORD=strong_random_password \
node server/index.js
```

### Startup Verification Checklist

After starting the server, verify:

1. **Server listening:**
   ```
   [Server] Listening on port 3001
   [Game] Map loaded: Tri-Bus Circuit (map_tribus_circuit)
   ```

2. **Market data service initialized:**
   ```
   [MarketData] Service started
   [MarketData] Provider: yahoo-finance2 (primary)
   [MarketData] Provider: data.go.kr FSC (fallback)
   [MarketData] Provider: Mock (emergency)
   [MarketData] Feature flags: liveBuffs=true, newsEvents=true, mock=false
   ```

3. **Initial data fetch:**
   ```
   [MarketData] Initial fetch complete: Samsung 75,800 KRW (+2.16%), SK Hynix 198,500 KRW (-0.45%)
   [MarketData] Buffs calculated: samsung=RISE(dmg+5%), skhynix=STABLE(0%)
   ```

4. **REST endpoints responding:**
   ```bash
   curl http://localhost:3001/api/market-data
   # Should return JSON with quotes and buffs

   curl http://localhost:3001/api/market-data/status
   # Should return provider health status
   ```

5. **Admin panel accessible:**
   ```
   Open http://localhost:3001/admin in browser
   Login with ADMIN_PASSWORD
   ```

---

## 2. Feature Flag Configuration

### Flag Combinations and Behavior

| USE_MOCK | LIVE_BUFFS | NEWS_EVENTS | Behavior |
|---|---|---|---|
| `true` | `true` | `true` | Full features with simulated data (testing) |
| `true` | `false` | `false` | Mock data visible, no gameplay effect (UI testing) |
| `false` | `true` | `true` | Full production mode |
| `false` | `true` | `false` | Live stock buffs but no news feed |
| `false` | `false` | `true` | Stock panel + news visible, no gameplay effect |
| `false` | `false` | `false` | No market features at all (vanilla game) |

### Changing Flags at Runtime

Feature flags are read from environment variables at server startup. To change them:

1. **Restart required:** Update env vars and restart the server process
2. **No hot-reload:** There is no API to change feature flags without restart (by design -- prevents accidental state changes)

### Recommended Configuration by Stage

| Stage | Mock | Live Buffs | News | Notes |
|---|---|---|---|---|
| Local development | `true` | `true` | `true` | Full features, no API keys needed |
| Staging/QA | `false` | `true` | `true` | Live data for integration testing |
| Production (soft launch) | `false` | `false` | `true` | Show data, no gameplay effect |
| Production (full launch) | `false` | `true` | `true` | Everything enabled |
| Emergency | `true` | `false` | `false` | Safe mode, no external dependencies |

---

## 3. Monitoring Market Data Health

### Health Check Endpoint

```bash
curl http://localhost:3001/api/market-data/status
```

**Healthy response:**
```json
{
  "status": "healthy",
  "providers": {
    "yahoo-finance2": {
      "status": "active",
      "circuitBreaker": "CLOSED",
      "lastSuccess": "2026-02-16T05:30:00Z",
      "failureCount": 0
    },
    "data.go.kr-fsc": {
      "status": "standby",
      "circuitBreaker": "CLOSED",
      "lastSuccess": null,
      "failureCount": 0
    },
    "mock": {
      "status": "standby",
      "circuitBreaker": "N/A",
      "failureCount": 0
    }
  },
  "cache": {
    "quotesAge": 145000,
    "quotesAgeHuman": "2m 25s",
    "quotesTTL": 300000,
    "stale": false,
    "newsAge": 432000,
    "newsAgeHuman": "7m 12s",
    "newsTTL": 900000
  },
  "marketOpen": true,
  "pollInterval": 300000,
  "featureFlags": {
    "useMock": false,
    "liveBuffs": true,
    "newsEvents": true
  }
}
```

### Key Metrics to Monitor

| Metric | Where | Healthy | Warning | Critical |
|---|---|---|---|---|
| Active provider | `providers.*.status` | One provider is "active" | Primary failed, fallback active | All providers failed |
| Circuit breaker state | `providers.*.circuitBreaker` | All "CLOSED" | One is "OPEN" | Primary + fallback "OPEN" |
| Cache age (quotes) | `cache.quotesAge` | < 300,000ms (5min) | 300,000-600,000ms | > 600,000ms |
| Cache age (news) | `cache.newsAge` | < 900,000ms (15min) | 900,000-1,800,000ms | > 1,800,000ms |
| Market open | `marketOpen` | Matches actual KRX hours | N/A | Wrong state |
| Feature flags | `featureFlags` | Match intended config | N/A | Unexpected values |

### Automated Monitoring (Optional)

If deploying with uptime monitoring (e.g., UptimeRobot, Pingdom):

```
Health check URL: http://your-server:3001/api/market-data/status
Check interval: 5 minutes
Alert condition: HTTP status != 200 OR response.status != "healthy"
```

---

## 4. Common Failure Scenarios and Remediation

### Scenario 1: Yahoo Finance Down

**Symptoms:**
```
[ProviderManager] yahoo-finance2: request failed (timeout)
[ProviderManager] yahoo-finance2: failure count 3/3 — circuit OPEN
[ProviderManager] Falling back to data.go.kr-fsc
```

**Impact:** Stock data switches to daily close only (no intraday updates).

**Remediation:**
1. No immediate action needed -- fallback is automatic
2. Monitor: check if Yahoo recovers within 5 minutes (circuit half-open probe)
3. If persistent (>1 hour): check Yahoo Finance status pages / community reports
4. If permanent: set `TWELVE_DATA_API_KEY` and restart server

**Resolution log:**
```
[ProviderManager] yahoo-finance2: half-open probe succeeded — circuit CLOSED
[MarketData] Switched back to primary provider: yahoo-finance2
```

### Scenario 2: DART API Unavailable

**Symptoms:**
```
[DARTProvider] Request failed: ECONNREFUSED / 503 / timeout
[MarketData] News fetch failed — returning cached/empty news
```

**Impact:** Admin panel shows no new DART disclosures. Existing cached news remains. Game is unaffected.

**Remediation:**
1. News is non-critical. No immediate action required.
2. Check DART service status: https://opendart.fss.or.kr
3. If persistent: disable news fetching to reduce error log noise:
   ```bash
   ENABLE_NEWS_EVENTS=false  # restart server
   ```
4. Re-enable when DART is back up

### Scenario 3: Cache Becomes Stale

**Symptoms:**
```
[MarketData] WARNING: Quote cache stale (age: 1,800,000ms, TTL: 300,000ms)
[MarketData] All providers failed — serving stale cached data
```

**Impact:** Stock panel shows "STALE" badge. Buffs still apply based on last known data.

**Remediation:**
1. Check provider status: `curl http://localhost:3001/api/market-data/status`
2. Force refresh via admin API:
   ```bash
   curl -X POST http://localhost:3001/api/admin/market/refresh \
     -H "Authorization: Bearer YOUR_ADMIN_PASSWORD"
   ```
3. If all providers are failing, switch to mock:
   ```bash
   USE_MOCK_MARKET_DATA=true  # restart server
   ```

### Scenario 4: Wrong Data Displayed

**Symptoms:** Player reports stock price is clearly wrong (e.g., Samsung showing $75 instead of 75,000 KRW).

**Remediation:**
1. **Immediately switch to mock:** `USE_MOCK_MARKET_DATA=true` + restart
2. Check raw API response:
   ```bash
   curl http://localhost:3001/api/market-data
   ```
3. Check if provider changed response format
4. Fix adapter parsing, test, deploy

### Scenario 5: Admin Password Compromised

**Symptoms:** Unauthorized events being triggered, or suspicion of password leak.

**Remediation:**
1. Change `ADMIN_PASSWORD` environment variable immediately
2. Restart server
3. Check recent event history: `GET /api/admin/events`
4. Cancel any suspicious active events
5. Review server logs for unauthorized access patterns

### Scenario 6: High Memory Usage

**Symptoms:** Server process memory growing steadily.

**Potential cause:** News cache or event history not being pruned.

**Remediation:**
1. Check news cache size: how many items are cached
2. Check event history size: should be capped at 50
3. Restart server (in-memory caches are cleared)
4. If persistent: review cache eviction logic in `cache.js`

---

## 5. Admin Panel Usage Guide

### Accessing the Admin Panel

1. Navigate to `http://your-server:3001/admin`
2. Enter the `ADMIN_PASSWORD` in the login field
3. Password is stored in browser sessionStorage (cleared when tab closes)

### Admin Panel Sections

#### Market Status Section

Displays:
- Current Samsung and SK Hynix prices
- Daily change percentage
- Active buffs (damage %, speed %)
- Buff tier label (SURGE / RISE / STABLE / DIP / PLUNGE)
- Active provider name
- Cache age
- Market open/closed status

**Actions:**
- "Refresh Now" button: Forces an immediate cache refresh

#### DART News Feed Section

Displays:
- Recent disclosures for Samsung and SK Hynix from DART
- Each item shows: company name, disclosure title, date
- "Trigger Event" button next to each news item

**Actions:**
- Click "Trigger Event" to pre-fill the event creation form with context from that news item

#### Create Event Section

Form fields:
- **Type:** Dropdown (BOSS_SPAWN / ZONE_MODIFIER / GLOBAL_PARAM / NEWS_TICKER)
- **Parameters:** Dynamic fields based on selected type
- **Duration:** Seconds (bounded by type-specific min/max)
- **Label:** Custom display text

**Actions:**
- "Submit Event" button: Triggers the event after validation

#### Active Events Section

Displays:
- Currently active events with type, label, and time remaining
- Each event has a "Cancel" button

**Actions:**
- "Cancel" button: Immediately expires the event and reverts its effects

#### Recent Events Section

Displays:
- Last 10 expired/cancelled events
- Shows trigger time, duration, and final status

---

## 6. Triggering Game Events Step by Step

### Triggering a BOSS_SPAWN

1. Open admin panel
2. (Optional) Read a DART news item that warrants a boss spawn
3. In "Create Event," select type: `BOSS_SPAWN`
4. Choose monster type (NVIDIA / Apple / TSMC / Google / META)
5. Set HP multiplier (1.0 = normal, 1.5 = 50% harder, max 3.0)
6. Set duration in seconds (default: 120, max: 300)
7. Add a custom label (e.g., "HBM3E Launch Boss")
8. Click "Submit Event"
9. Verify: boss appears on your game screen; announcement banner shows

### Triggering a ZONE_MODIFIER

1. Open admin panel
2. Select type: `ZONE_MODIFIER`
3. Set position (x, y coordinates -- reference the map layout)
4. Set radius (100-400 px)
5. Choose effect: damage_boost / speed_boost / heal_zone / slow_zone
6. Set value (0.05 to 0.25 for percentage effects, 1-5 for heal zone HP/s)
7. Choose affected team: all / samsung / skhynix
8. Set duration (15-180 seconds)
9. Click "Submit Event"
10. Verify: zone appears on map; players in zone see modifier

### Triggering a GLOBAL_PARAM

1. Open admin panel
2. Select type: `GLOBAL_PARAM`
3. Choose parameter: minionSpawnRate / pickupSpawnRate / monsterHpScale / respawnDelay / cellCaptureSpeed
4. Set multiplier (0.5 to 3.0; >1 = faster/more, <1 = slower/less)
5. Set duration (15-300 seconds)
6. Click "Submit Event"
7. Verify: announcement banner shows; check game behavior (e.g., more minions spawning)

### Triggering a NEWS_TICKER

1. Open admin panel
2. Click "Trigger Event" next to a DART news item, OR manually create:
3. Select type: `NEWS_TICKER`
4. Enter headline (English)
5. Enter headlineKo (Korean)
6. Set importance: low / medium / high
7. Select related team: samsung / skhynix
8. Set duration (10-60 seconds)
9. Click "Submit Event"
10. Verify: scrolling ticker appears at bottom of game screen

---

## 7. Emergency: Disabling Live Market Data

### Quick Disable (No Restart)

If the admin API supports a kill switch (future enhancement):
```bash
curl -X POST http://localhost:3001/api/admin/market/disable \
  -H "Authorization: Bearer YOUR_ADMIN_PASSWORD"
```

### Standard Disable (Restart Required)

1. Set environment variables:
   ```bash
   USE_MOCK_MARKET_DATA=true
   ENABLE_LIVE_MARKET_BUFFS=false
   ENABLE_NEWS_EVENTS=false
   ```

2. Restart the server:
   ```bash
   # If using PM2:
   pm2 restart semiconductor-war

   # If using systemd:
   sudo systemctl restart semiconductor-war

   # If running directly:
   # Kill current process and restart with new env vars
   ```

3. Verify:
   ```bash
   curl http://localhost:3001/api/market-data/status
   # Should show: useMock=true, liveBuffs=false, newsEvents=false
   ```

4. In-game verification:
   - Stock panel shows "SIMULATED" badge (if mock) or disappears (if disabled)
   - No buffs applied to either team
   - No news ticker

### Recovery (Re-enabling)

1. Verify the root cause has been resolved
2. Set environment variables back to production values
3. Restart server
4. Monitor `/api/market-data/status` for 10 minutes
5. Verify data is flowing correctly before announcing recovery

---

## 8. Log Messages to Watch For

### Normal Operation

```
[MarketData] Service started                        # Startup
[MarketData] Initial fetch complete: ...            # First data pull
[MarketData] Quote refresh: Samsung 75,800 ...      # Periodic refresh
[MarketData] Buffs: samsung=RISE, skhynix=STABLE    # Buff recalculation
[MarketData] News refresh: 3 new items              # DART fetch
[EventEngine] Event queued: BOSS_SPAWN (evt_...)    # Admin triggered event
[EventEngine] Event executed: BOSS_SPAWN            # Event started
[EventEngine] Event expired: BOSS_SPAWN (evt_...)   # Event ended
```

### Warning Signs

```
[ProviderManager] yahoo-finance2: request failed    # Single failure (may recover)
[MarketData] WARNING: Quote cache stale             # Data getting old
[MarketData] WARNING: Market hours detection may be wrong  # Timezone issue
[EventEngine] Event validation failed: ...          # Admin submitted bad params
[Admin] Failed auth attempt from IP: ...            # Wrong password
```

### Critical Issues

```
[ProviderManager] yahoo-finance2: circuit OPEN          # Primary provider down
[ProviderManager] data.go.kr-fsc: circuit OPEN          # Fallback also down
[MarketData] CRITICAL: All providers failed             # No data source available
[MarketData] CRITICAL: Cache stale > 30 minutes         # Very old data
[EventEngine] ERROR: Event execution failed: ...        # Event system error
[Admin] Multiple failed auth attempts (5+) from IP: ... # Possible attack
```

### Log Level Guidance

| Log Prefix | Severity | Action Required |
|---|---|---|
| `[MarketData]` (no prefix) | Info | None -- normal operation |
| `[MarketData] WARNING:` | Warning | Monitor; may self-resolve |
| `[MarketData] CRITICAL:` | Critical | Investigate immediately |
| `[ProviderManager] circuit OPEN` | Warning | Monitor; check provider status |
| `[Admin] Failed auth` | Warning | Check for unauthorized access |
| `[EventEngine] ERROR:` | Error | Review event system logic |

---

## 9. Performance Considerations

### Polling Intervals

| Data Type | Market Open | Market Closed | Justification |
|---|---|---|---|
| Stock quotes | 5 minutes | 30 minutes | Balance freshness vs API limits |
| DART news | 15 minutes | 60 minutes | Disclosures are infrequent |
| Provider health | 1 minute | 5 minutes | Quick detection of issues |

### Memory Usage

| Component | Expected Size | Max Size |
|---|---|---|
| Quote cache (2 symbols) | ~2 KB | ~5 KB |
| News cache (50 items) | ~50 KB | ~100 KB |
| Buff cache (2 teams) | ~1 KB | ~2 KB |
| Event history (50 events) | ~25 KB | ~50 KB |
| Provider state | ~1 KB | ~2 KB |
| **Total market data footprint** | **~80 KB** | **~160 KB** |

The market data system adds negligible memory overhead. The game's entity state (players, bullets, minions, cells) dominates memory usage.

### Network Usage

| Operation | Frequency | Approx. Size | Monthly Total |
|---|---|---|---|
| Yahoo quote fetch | 288/day (5min intervals, 24hrs) | ~2 KB/call | ~17 MB |
| FSC quote fetch | 0 (standby) | ~3 KB/call | 0 |
| DART news fetch | 96/day (15min intervals, 24hrs) | ~10 KB/call | ~29 MB |
| Snapshot broadcast (market portion) | 12/min (every 5s) | ~500 bytes | ~260 MB |

The snapshot broadcast is the largest cost, but at 500 bytes per market data inclusion (every 5 seconds) across all connected clients, this is minimal compared to the existing game state broadcast at 20Hz.

### CPU Impact

The market data system runs on timers (setInterval) and performs minimal computation:
- Quote parsing: <1ms per fetch
- Buff calculation: <0.1ms (simple threshold comparison)
- Cache operations: <0.1ms (Map get/set)

No measurable impact on the 60Hz game loop.

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] All environment variables set in deployment platform
- [ ] `ADMIN_PASSWORD` is a strong random string (minimum 16 characters)
- [ ] `FSC_API_KEY` tested: make a manual API call to verify it works
- [ ] `DART_API_KEY` tested: make a manual API call to verify it works
- [ ] `npm install` completed (yahoo-finance2 installed)
- [ ] Node.js version >= 18 (required for native fetch)
- [ ] Port 3001 is available and properly forwarded/proxied

### Deploy Steps

1. Push code to deployment platform
2. Verify environment variables are set
3. Start server
4. Check startup logs for errors
5. Hit `/api/market-data/status` -- verify "healthy"
6. Hit `/api/market-data` -- verify quote data returns
7. Open game in browser -- verify stock panel appears
8. Login to admin panel -- verify it loads
9. Play a test round -- verify buffs are applied
10. Trigger a test NEWS_TICKER event -- verify it appears

### Post-Deployment Monitoring (First Hour)

- [ ] Check `/api/market-data/status` every 10 minutes
- [ ] Verify at least one successful quote refresh cycle (5 minutes)
- [ ] Verify provider circuit breakers remain CLOSED
- [ ] Check server memory usage (should not grow significantly)
- [ ] Play a full 5-minute game round with market data active
- [ ] Verify disclaimers are visible and correctly formatted
- [ ] Test admin panel event triggering (use NEWS_TICKER for low-impact test)

### Rollback Procedure

If anything goes wrong post-deployment:

**Level 1 (Soft):** Disable market features via env vars, restart
```bash
USE_MOCK_MARKET_DATA=true
ENABLE_LIVE_MARKET_BUFFS=false
ENABLE_NEWS_EVENTS=false
```

**Level 2 (Hard):** Revert to previous deployment (git revert or platform rollback)

**Level 3 (Nuclear):** Remove all market data code references from `server/index.js` and redeploy. Game returns to pure vanilla state.
