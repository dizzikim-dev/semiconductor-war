# Risk and Compliance

## Purpose

This document establishes the legal and compliance framework for integrating real-world Korean stock market data into the Semiconductor War game. It covers legal classification, regulatory considerations, data licensing, player-facing disclaimers, and incident response procedures.

---

## 1. Legal Classification

### This is Entertainment Software, NOT Gambling

Semiconductor War is a free-to-play multiplayer browser game. The integration of stock market data serves as an environmental game mechanic (team buffs/nerfs) -- it does not create a gambling product.

**Definitive characteristics that exclude gambling classification:**

| Gambling Element | Present in Our Game? | Explanation |
|---|---|---|
| Wagering of money or value | **No** | Players do not stake money, tokens, or any item of value |
| Cash-out mechanism | **No** | No way to convert in-game status to real money |
| Exchangeable points/tokens | **No** | No virtual currency, no marketplace, no NFTs |
| Pay-to-play | **No** | Game is completely free, no IAP, no premium features |
| Prediction/betting on outcomes | **No** | Players cannot bet on stock prices or game outcomes |
| Random reward with real value | **No** | No loot boxes, no drops with monetary value |

### Explicit Prohibitions

The following features must NEVER be added to the game:

1. **No wagering system** -- Players cannot bet on which team wins, which stock goes up, or any game outcome
2. **No cash-out** -- No mechanism to convert in-game kills, scores, or currency to real money
3. **No exchangeable virtual currency** -- No coins, tokens, gems, or any unit that could be traded or sold
4. **No paid advantage** -- No microtransactions, no "premium" features that interact with market data
5. **No prediction markets** -- No feature where players guess stock direction for rewards
6. **No real-money tournaments** -- No prize pools funded by entry fees
7. **No data resale** -- Market data displayed in the game cannot be exported, scraped, or redistributed

These prohibitions are architectural -- they are not just policy but must be enforced by the absence of supporting code.

---

## 2. Stock Data Display Rules

### Delayed Data Only

The game exclusively uses **delayed stock market data**:
- yahoo-finance2: approximately 15-minute delay
- data.go.kr FSC: daily closing prices (end-of-day)
- No real-time KRX data is used at any point

This is a deliberate architectural choice with both legal and practical benefits:
- Avoids KRX real-time data licensing requirements
- Makes clear this is not a trading tool
- 15-minute delay is sufficient for a game buff mechanic that recalculates every 5 minutes

### Display Requirements

Every screen showing stock data must include:

1. **Delay indicator**: Badge or text showing "15min delayed" or "Daily close"
2. **Data source attribution**: Name of the data provider (e.g., "Data: Yahoo Finance")
3. **Disclaimer text**: Visible at all times when stock panel is shown
4. **"Not investment advice" notice**: Unambiguous statement

### Data Freshness Indicators

| Data State | Badge | Color |
|---|---|---|
| Live (within TTL) | `LIVE (15min delayed)` | Green |
| Stale (past TTL) | `STALE` | Yellow |
| Market closed | `CLOSED` | Gray |
| Mock/Simulated | `SIMULATED` | Orange |
| Error/Unavailable | `UNAVAILABLE` | Red |

---

## 3. KRX Data Licensing Considerations

### Real-Time Data (We Do NOT Use This)

Displaying real-time KRX market data commercially requires a licensing agreement with **KRX Information Service Co., Ltd.** (한국거래소 정보서비스). This involves:
- Formal application and contract
- Monthly licensing fees (varies by use case)
- Compliance audits
- Mandatory display of KRX attribution

**We avoid this entirely by using only delayed/daily data from third-party aggregators.**

### Delayed Data via Third Parties

Using delayed data from Yahoo Finance or government open data (data.go.kr) does not require a direct KRX license because:
- Yahoo Finance has its own data redistribution agreements
- data.go.kr data is published under the Korean Government Open Data License (공공데이터 이용정책), which permits commercial use with attribution

### Attribution Requirements

| Source | Attribution Needed |
|---|---|
| yahoo-finance2 | "Market data provided by Yahoo Finance" |
| data.go.kr FSC | "Data from Korea Financial Services Commission via data.go.kr (공공데이터포털)" |
| DART OpenDART | "Disclosure data from Financial Supervisory Service DART (금융감독원 전자공시시스템)" |

---

## 4. Capital Markets Act (자본시장과 금융투자업에 관한 법률)

### Relevance Assessment

The Capital Markets Act (자본시장법) regulates:
- Financial investment products (금융투자상품) -- Article 3
- Investment advisory business (투자자문업) -- Article 6
- Securities information providers -- various articles

### Why We Are NOT Regulated Under This Act

1. **Not a financial product**: The game does not involve investment of capital with expectation of profit (Article 3 definition). Stock data is an environmental game mechanic, not a financial product.

2. **Not investment advisory**: We do not provide analysis, recommendations, or opinions about stock values. We display raw delayed prices with a game-context interpretation (buffs/nerfs). There is no "buy Samsung" or "sell SK Hynix" signal.

3. **Not a securities information service**: We do not aggregate, analyze, or redistribute market data as a primary service. The data is incidental to the game.

4. **Free service**: Even if a regulator were to classify the data display as information provision, the lack of any fee structure significantly reduces regulatory interest.

### Precautionary Measures

Despite the low risk, we take these precautions:
- Never use language like "investment advice" or "stock recommendation"
- Never display price targets, analyst ratings, or forward-looking statements
- Always label data as delayed and for entertainment
- Never suggest correlation between stock performance and investment decisions
- Maintain clear separation between game mechanics and financial interpretation

---

## 5. Player-Facing Disclaimers

### Korean Disclaimer (required on stock panel)

```
면책 조항

본 게임에 표시되는 주식 데이터는 15분 이상 지연된 정보이며,
투자 자문이나 투자 권유를 목적으로 하지 않습니다.
표시된 가격 정보는 오락 목적으로만 사용되며,
실제 투자 판단의 근거로 사용해서는 안 됩니다.
주식 데이터 제공: Yahoo Finance / 금융위원회 (data.go.kr)
공시 데이터 제공: 금융감독원 전자공시시스템(DART)

본 게임은 도박이 아니며, 실제 금전 거래가 이루어지지 않습니다.
```

### English Disclaimer (required on stock panel)

```
DISCLAIMER

Stock data displayed in this game is delayed by 15 minutes or more
and is NOT intended as investment advice or solicitation.
Displayed prices are for entertainment purposes only
and should NOT be used as a basis for investment decisions.
Market data: Yahoo Finance / Korea FSC (data.go.kr)
Disclosure data: Financial Supervisory Service DART

This game is NOT gambling. No real money is exchanged.
```

### Disclaimer Placement

| Location | Visibility | Content |
|---|---|---|
| Stock panel (in-game HUD) | Always visible when panel shown | Abbreviated: "15min delayed. Not investment advice. Entertainment only." |
| Game start screen | Shown once on entry | Full disclaimer (Korean + English) |
| Admin panel | Always visible | "Data for game administration only. Not for trading." |
| `/api/market-data` response | HTTP header + JSON field | `X-Disclaimer: Delayed data for entertainment only` + `disclaimer` field |
| `public/index.html` footer | Always visible | Full disclaimer text |

---

## 6. Data Source Licensing Risk Assessment

### yahoo-finance2

| Risk Factor | Assessment |
|---|---|
| **ToS compliance** | Yahoo Finance ToS restricts to "personal, non-commercial use." Our use is borderline -- a free game displaying delayed data. **Medium risk.** |
| **Mitigation** | (1) We display delayed data with attribution. (2) We have fallback providers if Yahoo blocks us. (3) The game is free with no revenue. (4) Many open-source projects use yahoo-finance2 commercially without enforcement. |
| **Worst case** | Yahoo blocks API access or sends C&D. We switch to Twelve Data ($29/month). |
| **Overall** | Acceptable risk. Yahoo has not enforced ToS against similar game/educational uses. |

### data.go.kr (FSC API)

| Risk Factor | Assessment |
|---|---|
| **License compliance** | Government open data license explicitly permits commercial use with attribution. **Low risk.** |
| **Mitigation** | Include attribution as specified. Follow API rate limits. |
| **Worst case** | API is deprecated or restructured. We adjust the FSC adapter. |
| **Overall** | Very low risk. Government data is the safest option. |

### DART OpenDART

| Risk Factor | Assessment |
|---|---|
| **License compliance** | DART provides an official API for public access to disclosure data. Free to use with API key. **Low risk.** |
| **Mitigation** | Attribution included. Rate limits followed. Only display public disclosure titles, not full filing content. |
| **Worst case** | API key revoked. News feature stops. Game continues without news. |
| **Overall** | Very low risk. This is explicitly public data published for broad consumption. |

### Twelve Data (upgrade path)

| Risk Factor | Assessment |
|---|---|
| **License compliance** | Paid plan explicitly permits commercial use. Attribution required. **Very low risk.** |
| **Mitigation** | Attribution included. Commercial license covers our use case. |
| **Worst case** | Service outage. We fall back to yahoo-finance2 or FSC. |
| **Overall** | Lowest risk of all options. Paid commercial license is clear. |

### Combined Risk Matrix

| Provider | Legal Risk | Availability Risk | Cost Risk | Overall |
|---|---|---|---|---|
| yahoo-finance2 | Medium | Medium | None (free) | **Acceptable** |
| data.go.kr FSC | Very Low | Low | None (free) | **Excellent** |
| DART OpenDART | Very Low | Low | None (free) | **Excellent** |
| Twelve Data | Very Low | Low | Low ($29/mo) | **Excellent** |

---

## 7. Compliance Checklist by PR

### PR 1: Market Data Infrastructure

- [ ] Feature flags default to OFF (all features disabled by default)
- [ ] Mock provider is available and functional
- [ ] No live API calls when `USE_MOCK_MARKET_DATA=true`
- [ ] API responses include disclaimer header
- [ ] No real-time data endpoints (all data is delayed)
- [ ] Provider names stored for attribution

### PR 2: Stock Panel UI

- [ ] Disclaimer text visible on stock panel (Korean + English abbreviated version)
- [ ] Full disclaimer on start screen
- [ ] Delay badge always shown ("15min delayed" / "Daily close" / "CLOSED")
- [ ] Data source attribution visible
- [ ] No buy/sell language or investment terminology
- [ ] No price charts or technical analysis displays
- [ ] Color coding uses team colors, not "green=good, red=bad" finance convention

### PR 3: Buff Engine + Game Integration

- [ ] Buff cap enforced (+-10% damage, +-5% speed)
- [ ] Feature flag `ENABLE_LIVE_MARKET_BUFFS` controls buff application
- [ ] Buffs cannot create unplayable conditions (caps ensure this)
- [ ] No correlation language ("buy Samsung stock to boost your team")
- [ ] Buff display uses game terminology, not financial terminology

### PR 4: DART News Integration

- [ ] Only display disclosure titles, not full filing content
- [ ] DART attribution included in news display
- [ ] News items link to official DART page (not reproduced content)
- [ ] `ENABLE_NEWS_EVENTS` flag controls DART fetching
- [ ] No editorial commentary added to news items
- [ ] No sentiment analysis or opinion labeling of news

### PR 5: Admin Event System

- [ ] Admin authentication required (env-var password)
- [ ] No automatic event triggering (admin-only)
- [ ] Event parameters have safety bounds
- [ ] Admin actions are logged
- [ ] Admin panel includes "for game administration only" notice
- [ ] Events cannot reference investment advice or recommendations

### PR 6: Live Provider Switch + Compliance

- [ ] All disclaimers in final form (Korean + English)
- [ ] All data source attributions present
- [ ] Full disclaimer on index.html footer
- [ ] API compliance headers set
- [ ] `.env.example` documents all required variables
- [ ] KRX holiday calendar loaded
- [ ] No real-time data at any point in the data pipeline
- [ ] Twelve Data attribution included when that provider is active
- [ ] Final review: no gambling-adjacent features exist

---

## 8. Incident Response

### Scenario: Regulator Inquiry

If a Korean regulator (FSC, FSS, or other body) contacts us about the stock data display:

**Immediate actions:**
1. **Do NOT ignore the inquiry.** Respond within the requested timeframe.
2. **Disable live market data immediately:** Set `ENABLE_LIVE_MARKET_BUFFS=false` and `ENABLE_NEWS_EVENTS=false`
3. **Preserve logs:** Save server logs, admin action history, and current configuration
4. **Do NOT delete any code or data**

**Response preparation:**
1. Prepare a written explanation covering:
   - The game is free entertainment software with no monetization
   - Stock data is delayed (15+ minutes) and sourced from third-party aggregators
   - No investment advice is provided
   - No gambling mechanics exist
   - No real money is exchanged
   - Market data is used as an environmental game mechanic (like weather in a racing game)
2. Include this compliance document as supporting material
3. Include screenshots showing disclaimers
4. Consult with a Korean attorney specializing in fintech/securities law if the inquiry is formal

**Escalation path:**
- Informal inquiry → Respond with written explanation
- Formal notice → Engage Korean securities law attorney
- Cease and desist → Immediately disable all market data features; engage attorney
- Fine or penalty → Engage attorney; comply with lawful orders

### Scenario: Yahoo Finance Blocks Access

**Immediate actions:**
1. System automatically falls back to FSC provider (circuit breaker)
2. Monitor logs for `[ProviderManager] Yahoo circuit OPEN` messages
3. No immediate action needed -- fallback is automatic

**If block is permanent:**
1. Evaluate whether it is a temporary outage or intentional block
2. If intentional: activate Twelve Data provider (`TWELVE_DATA_API_KEY`)
3. Update attribution text from "Yahoo Finance" to "Twelve Data"
4. Consider removing yahoo-finance2 dependency from package.json

### Scenario: Data Display Error (Wrong Price)

**Immediate actions:**
1. Set `USE_MOCK_MARKET_DATA=true` to switch to deterministic mock data
2. Investigate: check `/api/market-data/status` for provider errors
3. Check if the error is from the provider (upstream) or our parsing (downstream)

**Root cause analysis:**
- Provider returned unexpected format → Update adapter parsing
- Cache served extremely stale data → Check cache TTL logic
- Currency/exchange rate confusion → Ensure KRW-only display

---

## 9. Architecture Guardrails

These architectural decisions enforce compliance by design, making violations structurally difficult:

### Feature Flags (Defense in Depth)

```
USE_MOCK_MARKET_DATA=true      → No live API calls at all
ENABLE_LIVE_MARKET_BUFFS=false → Data visible but zero gameplay effect
ENABLE_NEWS_EVENTS=false       → No DART fetching, no news display
```

Any single flag can independently disable the corresponding feature. In an emergency, setting all three to their "off" values immediately returns the game to its pre-market-data state.

### Admin-Only Events (No Automation)

News events are never automatically triggered. A human administrator must:
1. Read the DART disclosure
2. Decide it warrants a game event
3. Select event type and parameters
4. Submit through authenticated admin panel

This prevents scenarios where an algorithmic system creates inappropriate game events from misinterpreted news (e.g., a layoff announcement triggering a "boss spawn celebration").

### Buff Caps (Gameplay Safety)

Market buffs are hard-capped at +-10% damage and +-5% speed. Even if a stock drops 30% (theoretical maximum in a single day on KRX with circuit breakers), the game buff remains at -10% damage and -5% speed. This prevents extreme market events from ruining the game experience.

### No Persistent State (Privacy by Design)

The market data system has no database, no user tracking, and no persistent storage:
- Quotes are cached in-memory with 5-minute TTL
- News items are cached in-memory with 15-minute TTL
- No player behavior is correlated with market data
- Server restart clears all cached data

### Delayed Data Architecture

The system is architecturally incapable of displaying real-time data:
- yahoo-finance2 returns delayed quotes by design
- data.go.kr returns daily close by design
- No WebSocket connections to real-time market feeds
- No order book, no bid/ask, no tick-by-tick data
- The `MarketQuote` schema includes `delayed: true` field, always set to `true`
