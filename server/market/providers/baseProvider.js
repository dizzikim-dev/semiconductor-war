/**
 * BaseProvider — 모든 시장 데이터 제공자의 인터페이스
 *
 * 새 제공자 추가 시 이 클래스를 상속하고 모든 메서드를 구현한다.
 * 반환 스키마를 반드시 준수할 것.
 */
class BaseProvider {
  constructor(name) {
    this._name = name;
  }

  getName() {
    return this._name;
  }

  /**
   * 제공자가 현재 사용 가능한지 여부
   * (API 키 설정 여부, 네트워크 상태 등)
   */
  isAvailable() {
    return false;
  }

  /**
   * 주가 조회
   * @param {string[]} symbols - 종목 코드 배열 (예: ['005930.KS', '000660.KS'])
   * @returns {Promise<MarketQuote[]>}
   *
   * MarketQuote = {
   *   symbol: string,        // '005930.KS'
   *   price: number,         // 현재가 (KRW)
   *   changePercent: number, // 일간 등락률 (-3.5 = -3.5%)
   *   currency: string,      // 'KRW'
   *   timestamp: number,     // Unix ms
   *   source: string,        // provider name
   * }
   */
  async getQuotes(_symbols) {
    throw new Error(`${this._name}: getQuotes() not implemented`);
  }

  /**
   * 뉴스/공시 조회
   * @param {string[]} corpCodes - 기업 코드 배열 (DART 코드)
   * @returns {Promise<NewsItem[]>}
   *
   * NewsItem = {
   *   title: string,
   *   date: string,          // 'YYYY-MM-DD'
   *   type: string,          // 'earnings' | 'disclosure' | 'news'
   *   corpName: string,
   *   url: string,
   *   source: string,
   * }
   */
  async getNews(_corpCodes) {
    throw new Error(`${this._name}: getNews() not implemented`);
  }
}

module.exports = BaseProvider;
