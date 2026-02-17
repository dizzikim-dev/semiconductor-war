# Market Data Integration — Design Document

**Date:** 2026-02-16
**Status:** Approved
**Author:** Claude (Principal Engineer)

---

## 1. Goal

Integrate real-world Korean stock market data (Samsung 005930.KS, SK Hynix 000660.KS) and corporate news/disclosures into Semiconductor War as environmental game modifiers — team buffs/nerfs, event triggers, and a live stock panel UI.

## 2. Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary stock provider | yahoo-finance2 (npm) | Free, confirmed .KS support, 15-min delay is fine for game |
| Fallback stock provider | data.go.kr FSC API | Free, officially licensed, daily close only |
| News/disclosure source | DART OpenDART API | Official Korean disclosure system, free API |
| Upgrade path | Twelve Data ($29/mo) | If yahoo breaks permanently |
| Buff cap | ±10% damage, ±5% speed | Noticeable but not game-breaking |
| Admin auth | Env-var password | Simple, good enough for phase 1 |
| Market closed behavior | Show last close + CLOSED badge, buffs still apply | Consistent experience regardless of time |
| News → events | Admin-only trigger | Safest; no automated gameplay changes from news |
| Data latency | 15-min+ delayed | Avoids KRX vendor licensing requirements |

## 3. Architecture

### Provider Adapter Pattern
```
BaseProvider (interface)
  ├── MockProvider      — deterministic mock (default dev/test)
  ├── YahooProvider     — yahoo-finance2 wrapper
  ├── DataGoKrProvider  — FSC API (fallback, daily close)
  └── DartProvider      — DART news/disclosures
```

### Data Flow
```
[Providers] → ProviderManager (circuit breaker) → MarketDataService (cache + polling)
                                                  ↓
                                     Game.js reads cached data
                                                  ↓
                                BuffEngine applies team modifiers (PR-3)
                                                  ↓
                              Snapshot includes marketData + buffs
                                                  ↓
                                Client HUD renders stock panel
```

### Circuit Breaker
- 3 consecutive failures → provider skipped for 5 minutes
- After cooldown: half-open state (1 probe request)
- MockProvider: no circuit breaker (always available)

### Cache Strategy
- Stock quotes: 5min TTL during KRX hours, 30min outside
- News: 15min TTL
- In-memory Map (no Redis needed)

## 4. Buff Engine (PR-3)

| Daily Change | Damage Mod | Speed Mod | Tier |
|---|---|---|---|
| >= +3% | +10% | +5% | SURGE |
| +1% to +3% | +5% | 0% | RISE |
| -1% to +1% | 0% | 0% | STABLE |
| -1% to -3% | -5% | 0% | DIP |
| <= -3% | -10% | -5% | PLUNGE |

Caps: ±10% damage, ±5% speed. Stacks multiplicatively with existing buffs.

## 5. Event System (PR-5)

Event types: BOSS_SPAWN, ZONE_MODIFIER, GLOBAL_PARAM, NEWS_TICKER
- Max 1 active gameplay event
- 120s cooldown between events
- Admin approval required for all gameplay-affecting events
- NEWS_TICKER is display-only, can auto-trigger

## 6. Compliance

- NOT gambling. No wagering, no cash-out, no exchangeable points.
- Stock data 15min+ delayed only.
- Disclaimer: "주가 정보는 15분 이상 지연된 데이터이며, 투자 참고용이 아닌 게임 연출 목적입니다."
- Feature-flagged: USE_MOCK_MARKET_DATA (default true), ENABLE_LIVE_MARKET_BUFFS (default false), ENABLE_NEWS_EVENTS (default false)

## 7. Feature Flags

| Flag | Default | Effect |
|---|---|---|
| USE_MOCK_MARKET_DATA | true | Use deterministic mock data |
| ENABLE_LIVE_MARKET_BUFFS | false | Apply stock-based buffs to gameplay |
| ENABLE_NEWS_EVENTS | false | Enable DART polling + admin events |

## 8. PR Delivery Sequence

1. **PR-1:** Market Data Infrastructure + Mock Mode
2. **PR-2:** Stock Panel UI
3. **PR-3:** Buff Engine + Game Integration
4. **PR-4:** DART News Integration
5. **PR-5:** Admin Event System
6. **PR-6:** Live Provider Switch + Compliance Finalization

## 9. Open Risks

1. yahoo-finance2 may break if Yahoo changes site structure (mitigation: Twelve Data upgrade path)
2. KRX data licensing if we accidentally show real-time data (mitigation: always 15min+ delayed + disclaimers)
3. Buff balance may need tuning after playtesting (mitigation: constants.js tuning, feature flags)
4. DART API may change format (mitigation: adapter pattern isolates changes)
