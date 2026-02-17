/**
 * ChatService — 서버 권위적 채팅
 *
 * 역할:
 * - 메시지 검증 (길이, XSS, 금칙어)
 * - 속도 제한 (per-socket)
 * - 시스템 메시지 생성
 * - 히스토리 파일 저장 (서버 재시작 후에도 유지)
 */

const C = require('./constants');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');

class ChatService {
  constructor() {
    this._history = [];
    this._idCounter = 0;
    this._lastSendTime = new Map();         // socketId → timestamp
    this._profanityRegex = this._buildProfanityRegex();
    this._loadHistory();
  }

  /**
   * 플레이어 메시지 처리
   * @param {string} socketId
   * @param {string} rawMessage
   * @param {{ name: string, team: string }} player
   * @returns {{ ok: boolean, error?: string, msg?: object }}
   */
  processMessage(socketId, rawMessage, player) {
    // 1. 빈 메시지
    if (!rawMessage || typeof rawMessage !== 'string') {
      return { ok: false, error: '빈 메시지입니다.' };
    }

    // 2. 길이 제한
    const trimmed = rawMessage.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: '빈 메시지입니다.' };
    }
    if (trimmed.length > C.CHAT_MAX_LENGTH) {
      return { ok: false, error: `메시지가 너무 깁니다 (최대 ${C.CHAT_MAX_LENGTH}자).` };
    }

    // 3. 속도 제한
    const now = Date.now();
    const lastTime = this._lastSendTime.get(socketId) || 0;
    if (now - lastTime < C.CHAT_RATE_LIMIT_MS) {
      const wait = Math.ceil((C.CHAT_RATE_LIMIT_MS - (now - lastTime)) / 1000 * 10) / 10;
      return { ok: false, error: `너무 빠릅니다. ${wait}초 후 다시 시도하세요.` };
    }

    // 4. XSS 방지 — HTML 이스케이프
    const sanitized = this._escapeHtml(trimmed);

    // 5. 금칙어 필터
    const filtered = this._filterProfanity(sanitized);

    // 6. 메시지 생성
    this._lastSendTime.set(socketId, now);

    const msg = {
      id: ++this._idCounter,
      type: 'player',
      team: player.team,
      nickname: player.name,
      message: filtered,
      ts: now,
    };

    this._addToHistory(msg);
    return { ok: true, msg };
  }

  /**
   * 시스템 메시지 생성 (킬, 셀 점령 등)
   * @param {string} text
   * @returns {object}
   */
  createSystemMessage(text) {
    const msg = {
      id: ++this._idCounter,
      type: 'system',
      team: null,
      nickname: null,
      message: text,
      ts: Date.now(),
    };
    this._addToHistory(msg);
    return msg;
  }

  /**
   * 최근 히스토리 반환 (새 접속자 sync)
   * @returns {object[]}
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * 외부에서 생성된 메시지를 히스토리에 저장 (봇 채팅 등)
   * @param {object} msg — { id, type, team, nickname, message, ts }
   */
  storeMessage(msg) {
    this._addToHistory(msg);
  }

  /**
   * 플레이어 연결 해제 시 rate limit 정리
   * @param {string} socketId
   */
  removePlayer(socketId) {
    this._lastSendTime.delete(socketId);
  }

  // ── 관리자 API ──

  /**
   * 전체 히스토리 반환 (관리자용, 최신순)
   */
  getAllMessages() {
    return [...this._history].reverse();
  }

  /**
   * 메시지 삭제
   * @param {number} id
   * @returns {{ ok: boolean, error?: string }}
   */
  deleteMessage(id) {
    const idx = this._history.findIndex(m => m.id === id);
    if (idx === -1) return { ok: false, error: 'Message not found' };
    this._history.splice(idx, 1);
    this._saveHistory();
    return { ok: true };
  }

  /**
   * 전체 히스토리 초기화
   */
  clearAll() {
    this._history = [];
    this._saveHistory();
    return { ok: true };
  }

  // ── 내부 ──

  _addToHistory(msg) {
    this._history.push(msg);
    // 메모리 상한: 최근 500개만 유지
    if (this._history.length > 500) {
      this._history = this._history.slice(-500);
    }
    this._scheduleSave();
  }

  /**
   * 파일에서 히스토리 복원
   */
  _loadHistory() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        const data = JSON.parse(raw);
        this._history = Array.isArray(data) ? data : [];
        // idCounter를 마지막 id 기준으로 복원
        const maxId = this._history.reduce((max, m) => Math.max(max, m.id || 0), 0);
        this._idCounter = maxId;
        console.log(`[Chat] Loaded ${this._history.length} messages from file`);
      }
    } catch (err) {
      console.log(`[Chat] Failed to load history: ${err.message}`);
      this._history = [];
    }
  }

  /**
   * 히스토리를 파일에 저장 (debounce: 2초)
   */
  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._saveHistory();
    }, 2000);
  }

  _saveHistory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this._history), 'utf8');
    } catch (err) {
      console.log(`[Chat] Failed to save history: ${err.message}`);
    }
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _buildProfanityRegex() {
    if (!C.CHAT_PROFANITY_LIST || C.CHAT_PROFANITY_LIST.length === 0) return null;
    const escaped = C.CHAT_PROFANITY_LIST.map(
      w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`(${escaped.join('|')})`, 'gi');
  }

  _filterProfanity(str) {
    if (!this._profanityRegex) return str;
    return str.replace(this._profanityRegex, (match) => '*'.repeat(match.length));
  }
}

module.exports = ChatService;
