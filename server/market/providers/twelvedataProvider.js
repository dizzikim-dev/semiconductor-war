/**
 * TwelveDataProvider — Twelve Data API adapter
 *
 * KRX 종목(삼성전자, SK하이닉스)의 주가를 Twelve Data REST API로 조회한다.
 * TWELVE_DATA_API_KEY 환경변수가 설정되어야 활성화된다.
 *
 * Twelve Data free tier: 8 requests/min, 800/day
 * https://twelvedata.com/docs
 */

const BaseProvider = require('./baseProvider');

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

// Yahoo-style → Twelve Data KRX symbol
const SYMBOL_MAP = {
  '005930.KS': '005930:KRX',  // 삼성전자
  '000660.KS': '000660:KRX',  // SK하이닉스
};

class TwelveDataProvider extends BaseProvider {
  constructor(apiKey) {
    super('twelvedata');
    this._apiKey = apiKey || '';
  }

  isAvailable() {
    return !!this._apiKey;
  }

  async getQuotes(symbols) {
    if (!this._apiKey) return [];

    const tdSymbols = symbols.map(s => SYMBOL_MAP[s] || s).join(',');
    const url = `${TWELVE_DATA_BASE}/quote?symbol=${tdSymbols}&apikey=${this._apiKey}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];

      const data = await response.json();
      // Handle single vs multiple symbol response
      const quotes = Array.isArray(data) ? data : [data];

      return quotes.map(q => {
        if (!q || q.status === 'error') return null;
        // Map back to Yahoo-style symbol
        const origSymbol = Object.keys(SYMBOL_MAP).find(k => SYMBOL_MAP[k] === q.symbol) || q.symbol;
        return {
          symbol: origSymbol,
          price: parseFloat(q.close) || 0,
          changePercent: parseFloat(q.percent_change) || 0,
          previousClose: parseFloat(q.previous_close) || 0,
          currency: 'KRW',
          timestamp: q.datetime ? new Date(q.datetime).getTime() : Date.now(),
          source: 'twelvedata',
        };
      }).filter(q => q && q.price > 0);
    } catch (err) {
      console.log(`[TwelveDataProvider] Error: ${err.message}`);
      return [];
    }
  }

  async getNews(_corpCodes) {
    // Twelve Data does not provide DART-like Korean disclosure news
    return [];
  }
}

module.exports = TwelveDataProvider;
