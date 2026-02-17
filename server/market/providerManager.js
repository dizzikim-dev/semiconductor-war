/**
 * ProviderManager — 데이터 제공자 장애 대응 + 서킷 브레이커
 *
 * 주 제공자 실패 시 자동으로 대체 제공자로 전환.
 * 3회 연속 실패 → 5분간 해당 제공자 건너뜀.
 */

const CIRCUIT_BREAKER_THRESHOLD = 3;   // 연속 실패 횟수
const CIRCUIT_BREAKER_COOLDOWN = 5 * 60 * 1000; // 5분 (ms)

class ProviderManager {
  /**
   * @param {BaseProvider[]} quoteProviders  - 주가 제공자 (우선순위 순)
   * @param {BaseProvider[]} newsProviders   - 뉴스 제공자 (우선순위 순)
   */
  constructor(quoteProviders = [], newsProviders = []) {
    this._quoteProviders = quoteProviders;
    this._newsProviders = newsProviders;
    // 서킷 브레이커 상태: { providerName: { failures, openUntil } }
    this._circuitState = {};
  }

  _getCircuit(name) {
    if (!this._circuitState[name]) {
      this._circuitState[name] = { failures: 0, openUntil: 0 };
    }
    return this._circuitState[name];
  }

  _isOpen(name) {
    const circuit = this._getCircuit(name);
    if (circuit.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      if (Date.now() < circuit.openUntil) return true;
      // 쿨다운 만료 → 반개방 상태 (한 번 시도 허용)
      circuit.failures = 0;
    }
    return false;
  }

  _recordSuccess(name) {
    const circuit = this._getCircuit(name);
    circuit.failures = 0;
    circuit.openUntil = 0;
  }

  _recordFailure(name) {
    const circuit = this._getCircuit(name);
    circuit.failures++;
    if (circuit.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuit.openUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
      console.log(`[Market] Circuit OPEN for ${name} — skipping for 5min`);
    }
  }

  /**
   * 주가 조회 (장애 대응 포함)
   * @param {string[]} symbols
   * @returns {Promise<MarketQuote[]>}
   */
  async getQuotes(symbols) {
    for (const provider of this._quoteProviders) {
      const name = provider.getName();
      if (!provider.isAvailable() || this._isOpen(name)) continue;

      try {
        const quotes = await provider.getQuotes(symbols);
        if (quotes && quotes.length > 0) {
          this._recordSuccess(name);
          return quotes;
        }
        this._recordFailure(name);
      } catch (err) {
        console.log(`[Market] ${name} getQuotes failed: ${err.message}`);
        this._recordFailure(name);
      }
    }

    console.log('[Market] All quote providers failed');
    return [];
  }

  /**
   * 뉴스 조회 (장애 대응 포함)
   * @param {string[]} corpCodes
   * @returns {Promise<NewsItem[]>}
   */
  async getNews(corpCodes) {
    for (const provider of this._newsProviders) {
      const name = provider.getName();
      if (!provider.isAvailable() || this._isOpen(name)) continue;

      try {
        const news = await provider.getNews(corpCodes);
        this._recordSuccess(name);
        return news || [];
      } catch (err) {
        console.log(`[Market] ${name} getNews failed: ${err.message}`);
        this._recordFailure(name);
      }
    }

    console.log('[Market] All news providers failed');
    return [];
  }

  /**
   * 제공자 상태 요약 (관리자 패널용)
   */
  getStatus() {
    const status = {};
    const all = [...this._quoteProviders, ...this._newsProviders];
    const seen = new Set();
    for (const p of all) {
      const name = p.getName();
      if (seen.has(name)) continue;
      seen.add(name);
      const circuit = this._getCircuit(name);
      status[name] = {
        available: p.isAvailable(),
        failures: circuit.failures,
        circuitOpen: this._isOpen(name),
        openUntil: circuit.openUntil || null,
      };
    }
    return status;
  }
}

module.exports = ProviderManager;
