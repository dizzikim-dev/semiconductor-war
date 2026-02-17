/**
 * YahooProvider — yahoo-finance2 래퍼
 *
 * 15분 지연 한국 주식 데이터 제공.
 * 무료, API 키 불필요, .KS 접미사로 KOSPI 종목 접근.
 *
 * yahoo-finance2 v2.x는 ESM 전용 + class 기반이므로
 * dynamic import() + new YF() 패턴을 사용한다.
 */
const BaseProvider = require('./baseProvider');

let yahooFinance = null;
let loadAttempted = false;
let loadPromise = null;

async function loadYahooFinance() {
  if (loadAttempted) return yahooFinance;
  loadAttempted = true;
  try {
    const mod = await import('yahoo-finance2');
    const YF = mod.default;
    // v2.14+: class must be instantiated with new
    if (typeof YF === 'function' && /class/i.test(YF.toString().slice(0, 30))) {
      yahooFinance = new YF();
    } else {
      yahooFinance = YF;
    }
    // 서베이 알림 억제
    if (yahooFinance.suppressNotices) {
      yahooFinance.suppressNotices(['yahooSurvey']);
    }
    console.log('[YahooProvider] yahoo-finance2 loaded successfully');
  } catch (err) {
    console.log(`[YahooProvider] yahoo-finance2 not available: ${err.message}`);
  }
  return yahooFinance;
}

// 모듈 로드 시 백그라운드에서 시도
loadPromise = loadYahooFinance();

class YahooProvider extends BaseProvider {
  constructor() {
    super('YahooProvider');
  }

  isAvailable() {
    return yahooFinance !== null;
  }

  async getQuotes(symbols) {
    // 아직 로딩 중이면 기다림
    if (!loadAttempted) await loadPromise;
    if (!yahooFinance) throw new Error('yahoo-finance2 not available');

    const results = await Promise.allSettled(
      symbols.map(symbol =>
        yahooFinance.quote(symbol).catch(err => {
          console.log(`[YahooProvider] quote(${symbol}) failed: ${err.message}`);
          return null;
        })
      )
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => {
        const q = r.value;
        return {
          symbol: q.symbol,
          price: q.regularMarketPrice || 0,
          changePercent: q.regularMarketChangePercent || 0,
          currency: q.currency || 'KRW',
          timestamp: Date.now(),
          source: this._name,
        };
      });
  }

  async getNews(_corpCodes) {
    return [];
  }
}

module.exports = YahooProvider;
