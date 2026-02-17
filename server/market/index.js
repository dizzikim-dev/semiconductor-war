/**
 * Market Data Module — 진입점
 *
 * 피처 플래그에 따라 적절한 제공자를 조립하고
 * MarketDataService 인스턴스를 생성/반환한다.
 */

const C = require('../constants');
const ProviderManager = require('./providerManager');
const MarketDataService = require('./marketDataService');
const MockProvider = require('./providers/mockProvider');
const NaverProvider = require('./providers/naverProvider');
const YahooProvider = require('./providers/yahooProvider');
const TwelveDataProvider = require('./providers/twelvedataProvider');
const DartProvider = require('./providers/dartProvider');

/**
 * MarketDataService 인스턴스를 생성하고 시작한다.
 * @returns {MarketDataService}
 */
function createMarketDataService() {
  const quoteProviders = [];
  const newsProviders = [];

  console.log(`[Market] Flags: MOCK=${C.MARKET_FLAGS.USE_MOCK_MARKET_DATA} BUFFS=${C.MARKET_FLAGS.ENABLE_LIVE_MARKET_BUFFS} PANEL=${C.MARKET_FLAGS.ENABLE_LIVE_MARKET_PANEL} REFRESH=${C.MARKET_REFRESH_INTERVAL_SEC}s`);

  if (C.MARKET_FLAGS.USE_MOCK_MARKET_DATA) {
    // 목 모드: MockProvider만 사용
    const mock = new MockProvider({ static: false, volatility: 0.02 });
    quoteProviders.push(mock);
    newsProviders.push(mock);
    console.log('[Market] Using MockProvider (USE_MOCK_MARKET_DATA=true)');
  } else {
    // 라이브 모드: Naver (최우선) → TwelveData → Yahoo → Mock (최종 폴백)
    const naver = new NaverProvider();
    const twelveData = new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY);
    const yahoo = new YahooProvider();
    const mockFallback = new MockProvider({ static: true });

    quoteProviders.push(naver); // Naver: 무료, API키 불필요, 안정적
    if (twelveData.isAvailable()) {
      quoteProviders.push(twelveData);
    }
    quoteProviders.push(yahoo);
    quoteProviders.push(mockFallback); // 최종 폴백

    const chain = ['Naver', twelveData.isAvailable() ? 'TwelveData' : null, 'Yahoo', 'Mock'].filter(Boolean).join(' → ');
    console.log(`[Market] Live mode: ${chain}`);

    // 뉴스: DART (주) → Mock (폴백)
    const dart = new DartProvider(process.env.DART_API_KEY);
    if (dart.isAvailable()) {
      newsProviders.push(dart);
      console.log('[Market] DartProvider registered for news');
    }
    newsProviders.push(mockFallback);
  }

  const pm = new ProviderManager(quoteProviders, newsProviders);
  return new MarketDataService(pm);
}

module.exports = { createMarketDataService };
