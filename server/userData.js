/**
 * UserDataStore — UUID 기반 유저 데이터 영속화
 * data/users.json에 JSON 파일로 저장 (chat.js와 동일 패턴)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');
const SAVE_DEBOUNCE_MS = 2000;
const MAX_SESSIONS_PER_USER = 50;
const MAX_NICKNAMES_PER_USER = 20;

class UserDataStore {
  constructor() {
    this._users = {};          // { [uuid]: userData }
    this._activeSessions = new Map(); // socketId → { uuid, startedAt, nickname, team, mapId }
    this._saveTimer = null;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this._users = JSON.parse(raw);
        console.log(`[UserData] Loaded ${Object.keys(this._users).length} users from disk`);
      }
    } catch (err) {
      console.error('[UserData] Failed to load:', err.message);
      this._users = {};
    }
  }

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
      fs.writeFileSync(DATA_FILE, JSON.stringify(this._users, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserData] Failed to save:', err.message);
    }
  }

  /**
   * 플레이어 접속 시 호출
   * @param {string} socketId
   * @param {string} uuid — 클라이언트 제공 UUID (없으면 server_{socketId})
   * @param {string} nickname
   * @param {string} team
   * @param {string} mapId
   */
  onPlayerJoin(socketId, uuid, nickname, team, mapId) {
    const now = Date.now();

    // 유저 레코드 생성 또는 업데이트
    if (!this._users[uuid]) {
      this._users[uuid] = {
        uuid,
        nicknames: [],
        lastNickname: null,
        lastTeam: null,
        visitCount: 0,
        totalPlaytimeMs: 0,
        totalKills: 0,
        totalDeaths: 0,
        totalScore: 0,
        firstSeen: now,
        lastSeen: now,
        sessions: [],
      };
    }

    const user = this._users[uuid];
    user.lastSeen = now;
    user.lastNickname = nickname;
    user.lastTeam = team;
    user.visitCount += 1;

    // 닉네임 추가 (중복 제거, 최대 20개)
    if (!user.nicknames.includes(nickname)) {
      user.nicknames.push(nickname);
      if (user.nicknames.length > MAX_NICKNAMES_PER_USER) {
        user.nicknames = user.nicknames.slice(-MAX_NICKNAMES_PER_USER);
      }
    }

    // 활성 세션 등록
    this._activeSessions.set(socketId, {
      uuid,
      startedAt: now,
      nickname,
      team,
      mapId,
    });

    this._scheduleSave();
  }

  /**
   * 플레이어 퇴장 시 호출
   * @param {string} socketId
   * @param {{ kills: number, deaths: number, score: number, level: number, className: string }} stats
   */
  onPlayerDisconnect(socketId, stats = {}) {
    const session = this._activeSessions.get(socketId);
    if (!session) return;

    this._activeSessions.delete(socketId);

    const user = this._users[session.uuid];
    if (!user) return;

    const now = Date.now();
    const playtimeMs = now - session.startedAt;
    const { kills = 0, deaths = 0, score = 0, level = 1, className = 'resistor' } = stats;

    // 누적 통계 업데이트
    user.totalPlaytimeMs += playtimeMs;
    user.totalKills += kills;
    user.totalDeaths += deaths;
    user.totalScore += score;
    user.lastSeen = now;

    // 세션 기록 추가 (최대 50개)
    user.sessions.push({
      joinedAt: session.startedAt,
      leftAt: now,
      playtimeMs,
      nickname: session.nickname,
      team: session.team,
      mapId: session.mapId,
      kills,
      deaths,
      score,
      level,
      className,
    });
    if (user.sessions.length > MAX_SESSIONS_PER_USER) {
      user.sessions = user.sessions.slice(-MAX_SESSIONS_PER_USER);
    }

    this._scheduleSave();
  }

  /** socketId로 UUID 조회 */
  getUuidBySocket(socketId) {
    const session = this._activeSessions.get(socketId);
    return session ? session.uuid : null;
  }

  /** 전체 유저 목록 (세션 제외한 요약) */
  getAllUsers() {
    return Object.values(this._users).map(u => ({
      uuid: u.uuid,
      nicknames: u.nicknames,
      lastNickname: u.lastNickname,
      lastTeam: u.lastTeam,
      visitCount: u.visitCount,
      totalPlaytimeMs: u.totalPlaytimeMs,
      totalKills: u.totalKills,
      totalDeaths: u.totalDeaths,
      totalScore: u.totalScore,
      firstSeen: u.firstSeen,
      lastSeen: u.lastSeen,
    }));
  }

  /** 단일 유저 상세 (세션 포함) */
  getUser(uuid) {
    return this._users[uuid] || null;
  }

  /** 닉네임 검색 */
  searchUsers(query) {
    if (!query) return this.getAllUsers();
    const q = query.toLowerCase();
    return this.getAllUsers().filter(u =>
      u.nicknames.some(n => n.toLowerCase().includes(q)) ||
      u.uuid.toLowerCase().includes(q)
    );
  }

  /** 전체 통계 */
  getStats() {
    const users = Object.values(this._users);
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todayActive = users.filter(u => u.lastSeen >= todayMs).length;
    const totalSessions = users.reduce((sum, u) => sum + u.sessions.length, 0);
    const totalPlaytime = users.reduce((sum, u) => sum + u.totalPlaytimeMs, 0);
    const avgPlaytime = users.length > 0 ? totalPlaytime / users.length : 0;
    const onlineNow = this._activeSessions.size;

    return {
      totalUsers: users.length,
      todayActive,
      totalSessions,
      avgPlaytimeMs: Math.round(avgPlaytime),
      onlineNow,
    };
  }
}

module.exports = UserDataStore;
