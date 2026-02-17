/**
 * DartProvider — DART OpenDART API 어댑터
 *
 * 삼성전자/SK하이닉스 공시 데이터를 DART에서 조회.
 * API 키가 없으면 graceful degradation (빈 배열 반환, 에러 없음).
 */
const BaseProvider = require('./baseProvider');

const DART_API_BASE = 'https://opendart.fss.or.kr/api';

class DartProvider extends BaseProvider {
  /**
   * @param {string} [apiKey] - DART_API_KEY 환경변수
   */
  constructor(apiKey) {
    super('dart-opendart');
    this._apiKey = apiKey || '';
  }

  isAvailable() {
    return !!this._apiKey;
  }

  /**
   * DART 공시 목록 조회
   * @param {string[]} corpCodes - ['00126380', '00164779']
   * @returns {Promise<NewsItem[]>}
   */
  async getNews(corpCodes) {
    if (!this._apiKey) return [];

    const allNews = [];
    for (const corpCode of corpCodes) {
      try {
        const bgnDe = this._getDateString(-30);
        const url = `${DART_API_BASE}/list.json?crtfc_key=${this._apiKey}&corp_code=${corpCode}&bgn_de=${bgnDe}&page_count=10`;

        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) continue;

        const data = await response.json();
        if (data.status !== '000') continue;

        const items = (data.list || []).map(item => ({
          id: `dart_${item.rcept_dt}_${corpCode}_${item.rcept_no}`,
          source: 'DART',
          corpCode,
          corpName: item.corp_name,
          title: item.report_nm,
          type: this._classifyType(item.report_nm),
          url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
          publishedAt: item.rcept_dt,
          fetchedAt: Date.now(),
          team: corpCode === '00126380' ? 'samsung' : 'skhynix',
        }));
        allNews.push(...items);
      } catch (err) {
        console.log(`[DartProvider] Error fetching ${corpCode}: ${err.message}`);
      }
    }
    return allNews.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async getQuotes(_symbols) {
    return [];
  }

  _getDateString(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  _classifyType(reportName) {
    if (reportName.includes('사업보고서') || reportName.includes('분기보고서') || reportName.includes('반기보고서')) return 'earnings';
    if (reportName.includes('임원') || reportName.includes('주주')) return 'governance';
    if (reportName.includes('공정') || reportName.includes('제재')) return 'regulation';
    return 'other';
  }
}

module.exports = DartProvider;
