/**
 * MockProvider — 결정론적(deterministic) 가짜 시장 데이터
 *
 * 개발/테스트 환경에서 외부 API 없이 동작.
 * seed 기반으로 매번 동일한 값을 반환하거나,
 * 시간 기반 사인파로 가격이 서서히 변동하는 모드 지원.
 */
const BaseProvider = require('./baseProvider');

// 기본 시드 데이터 — 2026-02-16 기준 근사치
const BASE_PRICES = {
  '005930.KS': 181600,  // 삼성전자 (KRW)
  '000660.KS': 882000,  // SK하이닉스 (KRW)
};

const MOCK_NEWS = [
  {
    id: 'mock_news_1',
    title: '삼성전자, 세계 최초 HBM4 양산 출하',
    date: '2026-02-12',
    type: 'disclosure',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-hbm4-mass',
    team: 'samsung',
  },
  {
    id: 'mock_news_2',
    title: 'SK하이닉스, HBM4 양산 2월 확정',
    date: '2026-02-10',
    type: 'disclosure',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-hbm4-feb',
    team: 'skhynix',
  },
  {
    id: 'mock_news_3',
    title: '엔비디아, 삼성에 HBM4 조기출하 긴급요청',
    date: '2026-02-10',
    type: 'news',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/nvidia-samsung-urgent',
    team: 'samsung',
  },
  {
    id: 'mock_news_4',
    title: 'SK하이닉스, 루빈향 HBM4 점유율 70%',
    date: '2026-02-08',
    type: 'news',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-rubin-70',
    team: 'skhynix',
  },
  {
    id: 'mock_news_5',
    title: '삼성전자, 시가총액 1000조 돌파',
    date: '2026-02-04',
    type: 'disclosure',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-1000t-cap',
    team: 'samsung',
  },
  {
    id: 'mock_news_6',
    title: 'SK하이닉스, 영업이익률 58% 신기록',
    date: '2026-01-30',
    type: 'disclosure',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-58-margin',
    team: 'skhynix',
  },
  {
    id: 'mock_news_7',
    title: '삼성 파운드리, 2나노 수율 50% 돌파',
    date: '2026-01-16',
    type: 'disclosure',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-2nm-yield',
    team: 'samsung',
  },
  {
    id: 'mock_news_8',
    title: 'SK하이닉스, 청주 패키징팹 19조 투자',
    date: '2026-01-13',
    type: 'disclosure',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-cheongju-19t',
    team: 'skhynix',
  },
  {
    id: 'mock_news_9',
    title: '삼성, 테슬라 AI5칩 2나노 양산 계약',
    date: '2026-01-20',
    type: 'news',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-tesla-ai5',
    team: 'samsung',
  },
  {
    id: 'mock_news_10',
    title: 'SK하이닉스, 2026 영업익 80조 전망',
    date: '2026-01-25',
    type: 'news',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-80t-forecast',
    team: 'skhynix',
  },
  {
    id: 'mock_news_11',
    title: '삼성전자, HBM4 11.7Gbps 속도 달성',
    date: '2026-02-11',
    type: 'disclosure',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-hbm4-speed',
    team: 'samsung',
  },
  {
    id: 'mock_news_12',
    title: 'SK하이닉스, M15X 페이즈4 조기완공',
    date: '2026-02-05',
    type: 'disclosure',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/skhynix-m15x-phase4',
    team: 'skhynix',
  },
  {
    id: 'mock_news_13',
    title: '삼성, 차세대 zHBM 로드맵 공개',
    date: '2026-02-11',
    type: 'disclosure',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-zhbm-roadmap',
    team: 'samsung',
  },
  {
    id: 'mock_news_14',
    title: '양사 합산 영업이익 200조 시대 전망',
    date: '2026-01-20',
    type: 'news',
    corpName: 'SK하이닉스',
    url: 'https://dart.fss.or.kr/mock/samsung-skhynix-200t',
    team: 'skhynix',
  },
  {
    id: 'mock_news_15',
    title: '삼성, 애플과 차세대 이미지센서 공동개발',
    date: '2026-01-08',
    type: 'news',
    corpName: '삼성전자',
    url: 'https://dart.fss.or.kr/mock/samsung-apple-sensor',
    team: 'samsung',
  },
];

class MockProvider extends BaseProvider {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.static=false] - true면 고정값, false면 시간 기반 변동
   * @param {number}  [opts.volatility=0.02] - 변동 폭 (0.02 = ±2%)
   */
  constructor(opts = {}) {
    super('MockProvider');
    this._static = opts.static || false;
    this._volatility = opts.volatility ?? 0.02;
  }

  isAvailable() {
    return true; // 항상 사용 가능
  }

  async getQuotes(symbols) {
    const now = Date.now();
    return symbols.map(symbol => {
      const base = BASE_PRICES[symbol] || 50000;
      let price = base;
      let changePercent = 0;

      if (!this._static) {
        // 시간 기반 사인파 변동: ~10분 주기
        const cycle = Math.sin(now / (600_000) * Math.PI * 2);
        const noise = Math.sin(now / (137_000) * Math.PI * 2) * 0.3; // 불규칙성
        changePercent = (cycle + noise) * this._volatility * 100;
        price = Math.round(base * (1 + changePercent / 100));
      }

      return {
        symbol,
        price,
        changePercent: Math.round(changePercent * 100) / 100, // 소수점 2자리
        currency: 'KRW',
        timestamp: now,
        source: this._name,
      };
    });
  }

  async getNews(_corpCodes) {
    return MOCK_NEWS.map(item => ({
      ...item,
      source: this._name,
    }));
  }
}

module.exports = MockProvider;
