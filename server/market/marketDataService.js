/**
 * MarketDataService — 시장 데이터 캐시 + 폴링 오케스트레이션
 *
 * 역할:
 * - 주기적으로 ProviderManager를 통해 주가/뉴스 조회
 * - 결과를 인메모리 캐시에 저장 (TTL 기반)
 * - Game 및 REST API에서 동기적으로 최신 데이터 접근
 * - KRX 거래시간 인식 (09:00-15:30 KST)
 */

const C = require('../constants');
const BuffCalculator = require('./buff-calculator');

// KRX 거래 시간 (KST = UTC+9)
const KRX_OPEN_HOUR = 9;
const KRX_CLOSE_HOUR = 15;
const KRX_CLOSE_MINUTE = 30;

const SYMBOLS = ['005930.KS', '000660.KS']; // 삼성전자, SK하이닉스
const DART_CORP_CODES = ['00126380', '00164779']; // 삼성전자, SK하이닉스

class MarketDataService {
  /**
   * @param {ProviderManager} providerManager
   */
  constructor(providerManager) {
    this._pm = providerManager;
    this._buffCalculator = new BuffCalculator();

    // 캐시
    this._quotesCache = null;
    this._quotesTimestamp = 0;
    this._newsCache = [];
    this._newsTimestamp = 0;

    // 커스텀 뉴스 (관리자 추가)
    this._customNews = [];
    this._customNewsIdCounter = 0;

    // 폴링 타이머
    this._quoteTimer = null;
    this._newsTimer = null;

    // 설정
    this._quoteIntervalMarketOpen = C.MARKET_QUOTE_INTERVAL || 5 * 60 * 1000;   // 5분
    this._quoteIntervalMarketClosed = C.MARKET_QUOTE_INTERVAL_CLOSED || 30 * 60 * 1000; // 30분
    this._newsInterval = C.MARKET_NEWS_INTERVAL || 15 * 60 * 1000; // 15분
  }

  /**
   * 서비스 시작 — 즉시 한 번 조회 후 폴링 스케줄
   */
  async start() {
    console.log('[MarketData] Service starting...');
    await this._pollQuotes();
    await this._pollNews();
    this._scheduleQuotePoll();
    this._scheduleNewsPoll();
    console.log('[MarketData] Service started');
  }

  /**
   * 서비스 중지
   */
  stop() {
    if (this._quoteTimer) clearTimeout(this._quoteTimer);
    if (this._newsTimer) clearTimeout(this._newsTimer);
    this._quoteTimer = null;
    this._newsTimer = null;
    console.log('[MarketData] Service stopped');
  }

  // ── 공개 API ──

  /**
   * 최신 주가 데이터
   * @returns {{ samsung: MarketQuote|null, skhynix: MarketQuote|null, isMarketOpen: boolean, cacheAge: number }}
   */
  getLatestQuotes() {
    const quotes = this._quotesCache || [];
    const samsung = quotes.find(q => q.symbol === '005930.KS') || null;
    const skhynix = quotes.find(q => q.symbol === '000660.KS') || null;

    return {
      samsung,
      skhynix,
      isMarketOpen: this._isKRXOpen(),
      cacheAge: Date.now() - this._quotesTimestamp,
    };
  }

  /**
   * 삼성전자 일간 등락률
   */
  getSamsungChangePercent() {
    const data = this.getLatestQuotes();
    return data.samsung ? data.samsung.changePercent : 0;
  }

  /**
   * SK하이닉스 일간 등락률
   */
  getSKHynixChangePercent() {
    const data = this.getLatestQuotes();
    return data.skhynix ? data.skhynix.changePercent : 0;
  }

  /**
   * 팀별 일간 등락률
   * @param {'samsung'|'skhynix'} team
   */
  getTeamChangePercent(team) {
    return team === 'samsung'
      ? this.getSamsungChangePercent()
      : this.getSKHynixChangePercent();
  }

  /**
   * 최신 뉴스 목록 (커스텀 + 프로바이더 병합)
   */
  getLatestNews() {
    return [...this._customNews, ...this._newsCache];
  }

  /**
   * 최근 N개 뉴스 반환 (REST API / 스냅샷용, 커스텀 우선)
   * @param {number} [limit=20]
   * @returns {NewsItem[]}
   */
  getRecentNews(limit = 20) {
    const merged = [...this._customNews, ...this._newsCache];
    return merged.slice(0, limit);
  }

  /**
   * 프로바이더 뉴스만 반환 (관리자용)
   */
  getProviderNews() {
    return this._newsCache;
  }

  /**
   * 커스텀 뉴스 목록 반환 (관리자용)
   */
  getCustomNews() {
    return this._customNews;
  }

  /**
   * 커스텀 뉴스 추가
   * @param {{ title: string, corpName: string, team: string, type?: string }} item
   * @returns {{ ok: boolean, news: object }}
   */
  addNews(item) {
    const news = {
      id: ++this._customNewsIdCounter,
      title: item.title,
      corpName: item.corpName || '',
      team: item.team || '',
      type: item.type || 'custom',
      createdAt: Date.now(),
      custom: true,
    };
    this._customNews.unshift(news);
    return { ok: true, news };
  }

  /**
   * 커스텀 뉴스 수정
   * @param {number} id
   * @param {object} updates
   * @returns {{ ok: boolean, news?: object, error?: string }}
   */
  updateNews(id, updates) {
    const idx = this._customNews.findIndex(n => n.id === id);
    if (idx === -1) return { ok: false, error: 'News not found' };
    Object.assign(this._customNews[idx], updates);
    return { ok: true, news: this._customNews[idx] };
  }

  /**
   * 커스텀 뉴스 삭제
   * @param {number} id
   * @returns {{ ok: boolean, error?: string }}
   */
  deleteNews(id) {
    const idx = this._customNews.findIndex(n => n.id === id);
    if (idx === -1) return { ok: false, error: 'News not found' };
    this._customNews.splice(idx, 1);
    return { ok: true };
  }

  /**
   * 양 팀의 시장 버프를 한번에 반환
   * ENABLE_LIVE_MARKET_BUFFS가 false이면 modifier는 모두 0
   * @returns {{ samsung: BuffResult, skhynix: BuffResult }}
   */
  getTeamBuffs() {
    const samChange = this.getSamsungChangePercent();
    const skhChange = this.getSKHynixChangePercent();
    const buffs = this._buffCalculator.calculateAll(samChange, skhChange);

    if (!C.MARKET_FLAGS.ENABLE_LIVE_MARKET_BUFFS) {
      buffs.samsung.damageModifier = 0;
      buffs.samsung.speedModifier = 0;
      buffs.skhynix.damageModifier = 0;
      buffs.skhynix.speedModifier = 0;
    }

    return buffs;
  }

  /**
   * 특정 팀의 시장 버프 반환
   * @param {'samsung'|'skhynix'} team
   * @returns {BuffResult}
   */
  getTeamBuff(team) {
    const buffs = this.getTeamBuffs();
    return buffs[team] || { damageModifier: 0, speedModifier: 0, tier: 'STABLE', tierKo: '보합' };
  }

  /**
   * 서비스 상태 (관리자용)
   */
  getStatus() {
    return {
      providerStatus: this._pm.getStatus(),
      quotesCache: {
        hasData: this._quotesCache !== null,
        cacheAge: Date.now() - this._quotesTimestamp,
        timestamp: this._quotesTimestamp,
      },
      newsCache: {
        count: this._newsCache.length,
        cacheAge: Date.now() - this._newsTimestamp,
        timestamp: this._newsTimestamp,
      },
      isMarketOpen: this._isKRXOpen(),
      currentPollInterval: this._isKRXOpen()
        ? this._quoteIntervalMarketOpen
        : this._quoteIntervalMarketClosed,
    };
  }

  // ── 내부 폴링 ──

  async _pollQuotes() {
    try {
      const quotes = await this._pm.getQuotes(SYMBOLS);
      if (quotes.length > 0) {
        this._quotesCache = quotes;
        this._quotesTimestamp = Date.now();
      }
    } catch (err) {
      console.log(`[MarketData] Quote poll error: ${err.message}`);
    }
  }

  async _pollNews() {
    try {
      const news = await this._pm.getNews(DART_CORP_CODES);
      if (news) {
        this._newsCache = news;
        this._newsTimestamp = Date.now();
      }
    } catch (err) {
      console.log(`[MarketData] News poll error: ${err.message}`);
    }
  }

  _scheduleQuotePoll() {
    const interval = this._isKRXOpen()
      ? this._quoteIntervalMarketOpen
      : this._quoteIntervalMarketClosed;

    this._quoteTimer = setTimeout(async () => {
      await this._pollQuotes();
      this._scheduleQuotePoll();
    }, interval);
  }

  _scheduleNewsPoll() {
    this._newsTimer = setTimeout(async () => {
      await this._pollNews();
      this._scheduleNewsPoll();
    }, this._newsInterval);
  }

  /**
   * KRX 거래시간 판별 (월~금 09:00-15:30 KST)
   */
  _isKRXOpen() {
    const now = new Date();
    // KST = UTC + 9
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;

    // KRX 공휴일 체크
    const dateStr = kst.toISOString().slice(0, 10);
    if (C.KRX_HOLIDAYS_2026 && C.KRX_HOLIDAYS_2026.includes(dateStr)) return false;

    const hour = kst.getUTCHours();
    const minute = kst.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;
    const openTime = KRX_OPEN_HOUR * 60;
    const closeTime = KRX_CLOSE_HOUR * 60 + KRX_CLOSE_MINUTE;

    return timeInMinutes >= openTime && timeInMinutes < closeTime;
  }
}

module.exports = MarketDataService;
