/**
 * NaverProvider — 네이버 금융 API 래퍼
 *
 * 한국 주식(KRX) 실시간/종가 데이터 제공.
 * 무료, API 키 불필요, 높은 신뢰성.
 *
 * 엔드포인트: https://m.stock.naver.com/api/stock/{종목코드}/basic
 * - closePrice: 현재가(장중) 또는 종가(장 마감 후)
 * - fluctuationsRatio: 전일 대비 등락률 (%)
 * - marketStatus: "OPEN" | "CLOSE" | "PREMARKET" 등
 */
const BaseProvider = require('./baseProvider');

// Yahoo-style symbol → Naver 종목코드 매핑
const SYMBOL_MAP = {
  '005930.KS': '005930',  // 삼성전자
  '000660.KS': '000660',  // SK하이닉스
};

const API_BASE = 'https://m.stock.naver.com/api/stock';
const FETCH_TIMEOUT = 8000;

class NaverProvider extends BaseProvider {
  constructor() {
    super('NaverProvider');
  }

  isAvailable() {
    return true;
  }

  async getQuotes(symbols) {
    const results = await Promise.allSettled(
      symbols.map(symbol => this._fetchQuote(symbol))
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }

  async _fetchQuote(symbol) {
    const code = SYMBOL_MAP[symbol];
    if (!code) {
      console.log(`[NaverProvider] Unknown symbol: ${symbol}`);
      return null;
    }

    const url = `${API_BASE}/${code}/basic`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });

      if (!res.ok) {
        console.log(`[NaverProvider] HTTP ${res.status} for ${code}`);
        return null;
      }

      const data = await res.json();

      // closePrice는 "181,200" 형식 (쉼표 포함 문자열)
      const price = parseInt(data.closePrice.replace(/,/g, ''), 10);
      const changePercent = parseFloat(data.fluctuationsRatio);

      // 방향 반영: FALLING이면 음수인데 fluctuationsRatio에 이미 음수 부호 포함
      return {
        symbol,
        price,
        changePercent: isNaN(changePercent) ? 0 : changePercent,
        currency: 'KRW',
        timestamp: Date.now(),
        source: this._name,
      };
    } catch (err) {
      console.log(`[NaverProvider] fetch(${code}) failed: ${err.message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getNews(_corpCodes) {
    return [];
  }
}

module.exports = NaverProvider;
