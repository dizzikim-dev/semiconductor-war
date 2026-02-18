// ── i18n 로컬라이제이션 엔진 ──
// 경량 다국어 지원: ko (기본) / en
const I18n = (() => {
  let _locale = 'ko';
  let _strings = {};
  const _loaded = {};
  const _listeners = [];

  /** 브라우저 언어 감지 */
  const detectLocale = () => {
    const saved = localStorage.getItem('sw_locale');
    if (saved && (saved === 'ko' || saved === 'en')) return saved;
    const nav = (navigator.language || navigator.userLanguage || 'ko').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  };

  /** 로케일 파일 로드 */
  const load = async (locale) => {
    if (_loaded[locale]) {
      _strings = _loaded[locale];
      _locale = locale;
      return;
    }
    try {
      const resp = await fetch(`/locales/${locale}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      _loaded[locale] = data;
      _strings = data;
      _locale = locale;
    } catch (e) {
      console.warn(`[i18n] Failed to load ${locale}.json, falling back to ko`, e);
      if (locale !== 'ko') await load('ko');
    }
  };

  /** 번역 키 조회 (dot notation: "death.title") */
  const t = (key, params) => {
    const parts = key.split('.');
    let val = _strings;
    for (const p of parts) {
      if (val == null) break;
      val = val[p];
    }
    if (typeof val !== 'string') return key; // fallback: 키 자체 반환
    // 파라미터 치환: {name}, {count} 등
    if (params) {
      return val.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
    }
    return val;
  };

  /** 현재 로케일 반환 */
  const getLocale = () => _locale;

  /** 로케일 변경 */
  const setLocale = async (locale) => {
    if (locale !== 'ko' && locale !== 'en') return;
    await load(locale);
    localStorage.setItem('sw_locale', locale);
    _listeners.forEach(fn => fn(_locale));
  };

  /** 로케일 토글 (ko ↔ en) */
  const toggle = async () => {
    await setLocale(_locale === 'ko' ? 'en' : 'ko');
  };

  /** 변경 이벤트 구독 */
  const onChange = (fn) => {
    _listeners.push(fn);
  };

  /** 초기화 */
  const init = async () => {
    const locale = detectLocale();
    await load(locale);
  };

  /** HTML 요소 일괄 번역 (data-i18n 속성) */
  const translateDOM = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text !== key) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = t(key);
      if (text !== key) el.placeholder = text;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const text = t(key);
      if (text !== key) el.innerHTML = text;
    });
  };

  return { init, t, getLocale, setLocale, toggle, onChange, translateDOM };
})();
