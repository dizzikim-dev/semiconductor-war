// ── 일일 최고기록 시스템 (KST 기준) ──
// 메모리 내 저장, 서버 재시작 시 리셋
class DailyRecords {
  constructor() {
    this._records = [];   // { name, team, score, kills, className, timestamp }
    this._dateKey = this._getKSTDateKey();
  }

  /** KST 날짜 키 (YYYY-MM-DD) */
  _getKSTDateKey() {
    const now = new Date();
    // KST = UTC + 9
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  /** 날짜 변경 시 리셋 */
  _checkDateRollover() {
    const today = this._getKSTDateKey();
    if (today !== this._dateKey) {
      this._records = [];
      this._dateKey = today;
    }
  }

  /** 플레이어 사망/퇴장 시 기록 등록 */
  submit(name, team, score, kills, className) {
    this._checkDateRollover();
    if (!name || score <= 0) return;

    // 동일 닉네임의 기존 기록보다 높으면 교체
    const existing = this._records.find(r => r.name === name);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.kills = kills;
        existing.team = team;
        existing.className = className;
        existing.timestamp = Date.now();
      }
    } else {
      this._records.push({ name, team, score, kills, className, timestamp: Date.now() });
    }

    // 점수 기준 내림차순 정렬, 상위 10개만 유지
    this._records.sort((a, b) => b.score - a.score);
    if (this._records.length > 10) {
      this._records = this._records.slice(0, 10);
    }
  }

  /** TOP 10 조회 */
  getTop10() {
    this._checkDateRollover();
    return this._records.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      team: r.team,
      score: r.score,
      kills: r.kills,
      className: r.className,
    }));
  }
}

module.exports = DailyRecords;
