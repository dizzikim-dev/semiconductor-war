// ── 일일 최고기록 시스템 (KST 기준) ──
// 파일 영속화: data/daily-records.json (서버 재시작 시에도 유지)
const fs = require('fs');
const path = require('path');

// Render Persistent Disk: PERSISTENT_DATA_DIR 환경변수로 마운트 경로 지정
// 로컬 개발: 미설정 시 프로젝트 루트의 data/ 사용
const DATA_DIR = process.env.PERSISTENT_DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'daily-records.json');
const SAVE_DEBOUNCE_MS = 3000;
const MAX_RECORDS = 50;

class DailyRecords {
  constructor() {
    this._records = [];   // { uuid, name, team, score, kills, className, timestamp }
    this._dateKey = this._getKSTDateKey();
    this._saveTimer = null;
    this._load();
  }

  /** KST 날짜 키 (YYYY-MM-DD) */
  _getKSTDateKey() {
    const now = new Date();
    // KST = UTC + 9
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  /** 디스크에서 로드 */
  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data.dateKey && data.records) {
          this._dateKey = data.dateKey;
          this._records = data.records;
          // 날짜 변경 체크
          this._checkDateRollover();
          console.log(`[DailyRecords] Loaded ${this._records.length} records from disk (${this._dateKey})`);
        }
      }
    } catch (err) {
      console.error('[DailyRecords] Failed to load:', err.message);
      this._records = [];
    }
  }

  /** 디스크에 저장 (debounced) */
  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, SAVE_DEBOUNCE_MS);
  }

  _save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = { dateKey: this._dateKey, records: this._records };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DailyRecords] Failed to save:', err.message);
    }
  }

  /** 날짜 변경 시 리셋 */
  _checkDateRollover() {
    const today = this._getKSTDateKey();
    if (today !== this._dateKey) {
      this._records = [];
      this._dateKey = today;
      this._scheduleSave();
    }
  }

  /** 플레이어 사망/퇴장/주기적 기록 등록 */
  submit(name, team, score, kills, className, uuid) {
    this._checkDateRollover();
    if (!name || score <= 0) return;

    // uuid가 있으면 uuid로 구분, 없으면 name fallback (하위 호환)
    const key = uuid || name;
    const existing = this._records.find(r => (r.uuid || r.name) === key);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.kills = kills;
        existing.team = team;
        existing.name = name; // 닉네임 변경 반영
        existing.className = className;
        existing.timestamp = Date.now();
        if (uuid) existing.uuid = uuid;
        this._scheduleSave();
      }
    } else {
      const record = { name, team, score, kills, className, timestamp: Date.now() };
      if (uuid) record.uuid = uuid;
      this._records.push(record);
      this._scheduleSave();
    }

    // 점수 기준 내림차순 정렬, 상위 MAX_RECORDS개만 유지
    this._records.sort((a, b) => b.score - a.score);
    if (this._records.length > MAX_RECORDS) {
      this._records = this._records.slice(0, MAX_RECORDS);
    }
  }

  /** TOP N 조회 (기본 50) */
  getTop(limit = MAX_RECORDS) {
    this._checkDateRollover();
    const n = Math.min(limit, this._records.length);
    return this._records.slice(0, n).map((r, i) => ({
      rank: i + 1,
      name: r.name,
      team: r.team,
      score: r.score,
      kills: r.kills,
      className: r.className,
    }));
  }

  /** 하위 호환: getTop10() */
  getTop10() {
    return this.getTop(10);
  }
}

module.exports = DailyRecords;
