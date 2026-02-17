# Market Data Integration Options

## Overview

Semiconductor War requires real-time (or near-real-time) Korean stock market data for two specific tickers:

- **Samsung Electronics** (005930.KS / KRX)
- **SK Hynix** (000660.KS / KRX)

The data drives in-game environmental buffs/nerfs based on daily stock price changes. This document evaluates all viable data sources, compares them, and provides a final recommendation.

---

## Requirements Summary

| Requirement | Detail |
|---|---|
| Tickers needed | 005930.KS (Samsung), 000660.KS (SK Hynix) |
| Data points | Current price, previous close, daily % change, volume |
| Latency tolerance | 15-minute delay is acceptable (game buffs, not trading) |
| Update frequency | Every 5 minutes during market hours |
| Budget | Free preferred, up to $30/month acceptable as upgrade |
| Tech stack | Node.js (CommonJS), no frameworks |
| Compliance | Must not imply real-time trading data; disclaimers required |
| Fallback | Must have at least one backup source |

---

## Korean-Native Data Sources

### 1. KRX Data Marketplace (data.krx.co.kr)

The Korea Exchange's official data distribution platform.

| Aspect | Detail |
|---|---|
| **Free tier** | Limited free datasets; most require paid subscription |
| **Latency** | T+1 (daily close) for free tier; real-time requires paid contract |
| **Commercial use** | Requires explicit licensing agreement with KRX |
| **Node.js support** | REST API available but documentation is Korean-only, no npm package |
| **Korean market quality** | Authoritative (it IS the exchange) |
| **Verdict** | **Not recommended.** Licensing complexity and cost for a game project are prohibitive. Free tier only provides daily close data with a day's delay. |

### 2. Korea Investment & Securities OpenAPI (KIS, 한국투자증권)

A brokerage API designed for algorithmic trading.

| Aspect | Detail |
|---|---|
| **Free tier** | Free with KIS brokerage account (Korean resident required) |
| **Latency** | Real-time for account holders |
| **Commercial use** | Terms restrict to personal trading; game use is ambiguous |
| **Node.js support** | REST + WebSocket, no official npm package, community wrappers exist |
| **Korean market quality** | Excellent -- real-time order book, quotes, charts |
| **Verdict** | **Not recommended.** Requires Korean brokerage account, KYC, and terms of service likely prohibit non-trading game use. Over-engineered for our needs. |

### 3. Naver Finance (finance.naver.com)

Korea's most popular stock information portal.

| Aspect | Detail |
|---|---|
| **Free tier** | No official API; web scraping only |
| **Latency** | Near real-time on the website (minutes) |
| **Commercial use** | No API means no terms; scraping violates Naver ToS |
| **Node.js support** | Would require cheerio/puppeteer scraping -- fragile |
| **Korean market quality** | Excellent display quality but no structured API |
| **Verdict** | **Not recommended.** Web scraping is fragile, violates ToS, and can break without notice. No structured API exists. |

### 4. Daum Finance (finance.daum.net)

Kakao's financial data portal, similar to Naver Finance.

| Aspect | Detail |
|---|---|
| **Free tier** | Has undocumented JSON endpoints (unofficial) |
| **Latency** | Near real-time |
| **Commercial use** | Unofficial endpoints; no guarantee of availability |
| **Node.js support** | Undocumented REST endpoints accessible via fetch, no npm package |
| **Korean market quality** | Good data quality |
| **Verdict** | **Not recommended.** Undocumented endpoints can change or be blocked at any time. No SLA or official support. |

### 5. data.go.kr -- FSC (Financial Services Commission) API

Korean government open data portal with official financial data APIs.

| Aspect | Detail |
|---|---|
| **Free tier** | Completely free, 1000 calls/day |
| **Latency** | Daily close only (T+0 end-of-day) |
| **Commercial use** | Government open data license -- commercial use explicitly permitted |
| **Node.js support** | REST API (XML/JSON), no npm package but straightforward fetch |
| **Korean market quality** | Official government data; limited to daily summaries |
| **Verdict** | **Recommended as fallback.** Free, legal, reliable, but only daily close data. Perfect as a secondary source when the primary is unavailable. |

---

## International Data Sources

### 6. yahoo-finance2 (npm)

Community-maintained npm package wrapping Yahoo Finance v2 API.

| Aspect | Detail |
|---|---|
| **Free tier** | Free, no API key required |
| **Latency** | ~15-minute delay for KRX stocks |
| **Rate limits** | Unofficial but generous (~2000 requests/hour observed) |
| **Commercial use** | Yahoo Finance data is for personal use per ToS; game display of delayed data with disclaimers is low risk |
| **Node.js support** | Excellent -- `npm install yahoo-finance2`, well-maintained, TypeScript types |
| **Korean market quality** | Good -- supports .KS suffix for KRX tickers, daily + intraday |
| **Stability risk** | Yahoo has broken unofficial APIs before (2017, 2021); could happen again |
| **Verdict** | **Recommended as primary.** Best DX, zero cost, adequate latency. Risk of breakage is mitigated by having a fallback provider. |

### 7. Alpha Vantage

Popular free-tier financial data API.

| Aspect | Detail |
|---|---|
| **Free tier** | 25 requests/day (was 500, reduced in 2024) |
| **Latency** | 15-minute delay |
| **Commercial use** | Free tier is for personal/educational use; commercial requires paid plan ($49.99/mo) |
| **Node.js support** | REST API + community npm packages (alphavantage) |
| **Korean market quality** | KRX coverage exists but is inconsistent; some tickers return empty data |
| **Verdict** | **Not recommended.** Free tier rate limit (25/day) is too low for 5-minute polling. Korean market coverage is unreliable. |

### 8. Twelve Data

Professional-grade market data API.

| Aspect | Detail |
|---|---|
| **Free tier** | 800 requests/day, 8 requests/minute |
| **Paid tier** | $29/month for 10,000 requests/day |
| **Latency** | 15-minute delay on free; real-time on paid |
| **Commercial use** | Permitted on all tiers with attribution |
| **Node.js support** | REST + WebSocket, official npm package (twelvedata) |
| **Korean market quality** | Solid KRX coverage, explicit support for 005930.KS and 000660.KS |
| **Verdict** | **Recommended as paid upgrade path.** If yahoo-finance2 breaks permanently, Twelve Data at $29/month is the best professional alternative. |

### 9. Finnhub

Real-time market data API focused on US markets.

| Aspect | Detail |
|---|---|
| **Free tier** | 60 API calls/minute |
| **Latency** | Real-time for US; international varies |
| **Commercial use** | Free tier allows non-commercial; commercial requires paid |
| **Node.js support** | REST + WebSocket, official npm package |
| **Korean market quality** | Poor -- KRX coverage is limited and often returns "symbol not found" |
| **Verdict** | **Not recommended.** Korean market coverage is inadequate. |

### 10. Polygon.io

High-quality financial data platform.

| Aspect | Detail |
|---|---|
| **Free tier** | 5 API calls/minute, US stocks only on free tier |
| **Paid tier** | $99/month for international markets |
| **Latency** | Real-time on paid |
| **Commercial use** | Permitted on paid plans |
| **Node.js support** | Excellent REST API, official npm package |
| **Korean market quality** | No KRX coverage on free tier; available on $99/month plan |
| **Verdict** | **Not recommended.** Too expensive for our use case and no free-tier Korean data. |

---

## Comparison Table

| Provider | Free Tier | KRX Quality | Latency | Node.js DX | Commercial OK | Risk Level | Recommendation |
|---|---|---|---|---|---|---|---|
| **yahoo-finance2** | Unlimited | Good | 15min | Excellent (npm) | Low risk* | Medium (unofficial) | **PRIMARY** |
| **data.go.kr FSC** | 1000/day | Official | Daily close | Fair (REST) | Yes (gov open data) | Low | **FALLBACK** |
| **Twelve Data** | 800/day | Solid | 15min | Good (npm) | Yes | Low | **UPGRADE PATH** |
| Alpha Vantage | 25/day | Inconsistent | 15min | Good | No (free) | High | Not recommended |
| Finnhub | 60/min | Poor | Varies | Good | No (free) | High | Not recommended |
| Polygon.io | US only | N/A free | Real-time | Excellent | Yes (paid) | Low | Too expensive |
| KRX Data | Limited | Authoritative | T+1 | Poor | Requires license | Medium | Not practical |
| KIS OpenAPI | Free (acct) | Excellent | Real-time | Fair | Unclear | Medium | Not practical |
| Naver Finance | Scraping | Excellent | Real-time | Poor | No | Very high | Not recommended |
| Daum Finance | Unofficial | Good | Real-time | Fair | No | Very high | Not recommended |

*yahoo-finance2 ToS risk is mitigated by: delayed data only, no trading, clear disclaimers, game entertainment context.

---

## News and Disclosure Sources

### DART OpenDART API (dart.fss.or.kr)

Korea's official electronic disclosure system, operated by the Financial Supervisory Service (FSS).

| Aspect | Detail |
|---|---|
| **Free tier** | Free with API key registration (10,000 calls/day) |
| **Coverage** | All KOSPI/KOSDAQ company filings, disclosures, earnings |
| **Latency** | Filings appear within minutes of publication |
| **Node.js support** | REST API (JSON/XML), no npm package but clean endpoints |
| **Content** | Disclosure title, date, type (earnings/governance/regulation), PDF link |
| **Verdict** | **Recommended for news.** Official, free, comprehensive, and legal. Perfect for triggering game events from real corporate announcements. |

Corp codes needed:
- Samsung Electronics: `00126380`
- SK Hynix: `00164779`

### KOTRA (Korea Trade-Investment Promotion Agency)

| Aspect | Detail |
|---|---|
| **Coverage** | Trade news, industry reports |
| **Verdict** | Not relevant -- focused on trade policy, not company-specific disclosures. |

### Company IR Pages

Samsung and SK Hynix both maintain investor relations pages with press releases.

| Aspect | Detail |
|---|---|
| **Coverage** | Official press releases, earnings presentations |
| **Verdict** | No API available; would require web scraping. Not recommended as a data source. |

---

## Regulatory Considerations

### Displaying Korean Stock Prices in a Game

1. **Not a securities service**: The game does not provide investment advice, facilitate trading, or constitute a securities information service under Korean law. It is entertainment software that references publicly available market data.

2. **Delayed data only**: Using 15-minute delayed data (yahoo-finance2) or daily close data (data.go.kr) avoids any implication of providing real-time market data, which would require licensing from KRX.

3. **No gambling nexus**: There is no real-money wagering, no cash-out mechanism, and no exchangeable points. Stock data affects game balance only (buffs/nerfs), not monetary outcomes for players.

4. **Disclaimers required**: All stock data displays must include:
   - Explicit "delayed data" notice
   - "Not investment advice" disclaimer
   - "For entertainment purposes only" statement
   - Provided in both Korean and English

5. **KRX real-time data licensing**: Displaying real-time KRX prices commercially requires a licensing agreement with KRX Information Service. By using only delayed/daily data, we avoid this requirement entirely.

6. **Capital Markets Act (자본시장법)**: Article 2 defines "financial investment products" -- our game does not fall under this definition as there is no investment of capital with an expectation of profit. The stock data is used purely as an environmental game mechanic.

---

## Final Recommendation

### Primary Stack

```
Primary Data:    yahoo-finance2 (npm, free, 15-min delayed)
Fallback Data:   data.go.kr FSC API (free, daily close)
News/Disclosures: DART OpenDART API (free, official filings)
Upgrade Path:    Twelve Data ($29/month) if yahoo-finance2 breaks permanently
```

### Reasoning

1. **yahoo-finance2** provides the best developer experience with zero cost. The 15-minute delay is perfectly acceptable for a game mechanic. The unofficial nature is mitigated by having a fallback.

2. **data.go.kr FSC** provides government-guaranteed daily data. Even if Yahoo breaks, the game can still function with daily close prices. This is our "always available" baseline.

3. **DART OpenDART** is the only legitimate, free, structured source for Korean corporate disclosures. It provides the raw material for admin-triggered game events.

4. **Twelve Data** is the designated upgrade if Yahoo becomes permanently unavailable. At $29/month, it provides official API support and SLA guarantees.

### Architecture Implication

The adapter pattern with a provider manager allows swapping between these sources without changing game logic. See `docs/market-data-architecture.md` for implementation details.
