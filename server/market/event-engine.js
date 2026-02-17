/**
 * EventEngine — 관리자 이벤트 큐, 실행, 만료, 유효성 검증
 *
 * game.js에서 매 틱마다 update(dt)를 호출.
 * _justExecuted / _justExpired 배열로 실행/만료 이벤트를 game.js에 전달.
 */
const C = require('../constants');

const MAX_HISTORY = 50;

class EventEngine {
  constructor() {
    this.activeEvents = [];
    this.eventQueue = [];
    this.eventHistory = [];
    this.cooldowns = new Map(); // type → lastQueuedAt
    this._rateWindow = [];      // timestamps of recent events

    // game.js에서 읽고 처리하는 임시 배열 (매 update 시작 시 초기화)
    this._justExecuted = [];
    this._justExpired = [];
  }

  /**
   * 이벤트 검증 + 큐에 추가
   * @returns {{ ok: boolean, error?: string, details?: string, event?: object }}
   */
  queueEvent(eventData) {
    const validation = this._validate(eventData);
    if (!validation.ok) {
      return { ok: false, error: validation.error, details: validation.details };
    }

    const type = eventData.type;
    const bounds = C.EVENT_BOUNDS[type];

    // 파라미터 클램핑
    const params = { ...eventData.params };
    if (type === 'BOSS_SPAWN') {
      params.hpMultiplier = this._clamp(params.hpMultiplier || 1, bounds.hpMultiplier.min, bounds.hpMultiplier.max);
      params.buffValueMultiplier = this._clamp(params.buffValueMultiplier || 1, bounds.buffValueMultiplier.min, bounds.buffValueMultiplier.max);
    } else if (type === 'ZONE_MODIFIER') {
      params.radius = this._clamp(params.radius || 200, bounds.radius.min, bounds.radius.max);
      params.value = this._clamp(params.value || 0.1, bounds.value.min, bounds.value.max);
    } else if (type === 'GLOBAL_PARAM') {
      params.multiplier = this._clamp(params.multiplier || 1, bounds.multiplier.min, bounds.multiplier.max);
    }

    const duration = this._clamp(
      eventData.duration || bounds.duration.min,
      bounds.duration.min,
      bounds.duration.max
    );

    const event = {
      id: this._generateId(),
      type,
      title: eventData.title || type,
      titleKo: eventData.titleKo || '',
      params,
      duration,
      status: 'queued',
      createdAt: Date.now(),
      expiresAt: null,
      _originalValue: null,
      _spawnedEntityIds: null,
    };

    this.eventQueue.push(event);
    this.cooldowns.set(type, Date.now());
    this._rateWindow.push(Date.now());

    return { ok: true, event };
  }

  /**
   * 매 틱 호출 — 큐 처리 + 만료 체크
   * 취소된 이벤트가 _justExpired에 이미 있을 수 있으므로 덮어쓰지 않고 병합
   */
  update(dt) {
    this._justExecuted = [];
    const pendingExpired = this._justExpired;
    this._justExpired = [];
    this._processQueue();
    this._checkExpiry();
    // cancelEvent()에서 추가된 만료 이벤트를 병합
    if (pendingExpired.length > 0) {
      this._justExpired.push(...pendingExpired);
    }
  }

  /**
   * 큐 → 활성 이벤트 전환
   */
  _processQueue() {
    const now = Date.now();
    const toExecute = [];

    for (let i = this.eventQueue.length - 1; i >= 0; i--) {
      const event = this.eventQueue[i];
      event.status = 'active';
      event.expiresAt = now + event.duration;
      this.activeEvents.push(event);
      toExecute.push(event);
      this.eventQueue.splice(i, 1);
    }

    this._justExecuted = toExecute;
  }

  /**
   * 만료 체크 → 만료된 이벤트 반환
   */
  _checkExpiry() {
    const now = Date.now();
    const expired = [];

    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const event = this.activeEvents[i];
      if (event.status === 'active' && now >= event.expiresAt) {
        event.status = 'expired';
        expired.push(event);
        this.activeEvents.splice(i, 1);
        this._addToHistory(event);
      }
    }

    this._justExpired = expired;
  }

  /**
   * 활성 이벤트 취소
   */
  cancelEvent(eventId) {
    const idx = this.activeEvents.findIndex(e => e.id === eventId);
    if (idx === -1) {
      return { ok: false, error: 'Event not found or not active' };
    }
    const event = this.activeEvents[idx];
    event.status = 'cancelled';
    this.activeEvents.splice(idx, 1);
    this._addToHistory(event);

    // game.js에서 revert 처리를 위해 expired 목록에 추가
    this._justExpired.push(event);

    return { ok: true };
  }

  /**
   * 클라이언트 스냅샷용 데이터 (최소화)
   */
  getSnapshotData() {
    return this.activeEvents
      .filter(e => e.status === 'active')
      .map(e => ({
        id: e.id,
        type: e.type,
        title: e.title,
        titleKo: e.titleKo,
        params: e.params,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
      }));
  }

  /**
   * 관리자 패널용 히스토리
   */
  getHistory(limit = 20) {
    return this.eventHistory.slice(0, limit);
  }

  /**
   * 활성 이벤트 목록
   */
  getActiveEvents() {
    return this.activeEvents.filter(e => e.status === 'active');
  }

  /**
   * 전체 리셋 (라운드 초기화 시)
   */
  reset() {
    this.activeEvents = [];
    this.eventQueue = [];
    this.cooldowns.clear();
    this._rateWindow = [];
    this._justExecuted = [];
    this._justExpired = [];
  }

  // ── 유효성 검증 ──

  _validate(eventData) {
    // 타입 체크
    if (!eventData.type || !C.EVENT_TYPES.includes(eventData.type)) {
      return { ok: false, error: 'Invalid event type', details: `Must be one of: ${C.EVENT_TYPES.join(', ')}` };
    }

    const type = eventData.type;

    // 필수 파라미터 체크
    if (!eventData.params) {
      return { ok: false, error: 'Missing params' };
    }

    if (type === 'BOSS_SPAWN' && !eventData.params.monsterType) {
      return { ok: false, error: 'BOSS_SPAWN requires params.monsterType' };
    }
    if (type === 'ZONE_MODIFIER' && !eventData.params.position) {
      return { ok: false, error: 'ZONE_MODIFIER requires params.position' };
    }
    if (type === 'ZONE_MODIFIER' && !eventData.params.effect) {
      return { ok: false, error: 'ZONE_MODIFIER requires params.effect' };
    }
    if (type === 'GLOBAL_PARAM' && !eventData.params.parameter) {
      return { ok: false, error: 'GLOBAL_PARAM requires params.parameter' };
    }
    if (type === 'GLOBAL_PARAM' && !C.MODIFIABLE_PARAMS.includes(eventData.params.parameter)) {
      return { ok: false, error: 'Invalid parameter', details: `Must be one of: ${C.MODIFIABLE_PARAMS.join(', ')}` };
    }

    // 쿨다운 체크
    const lastQueued = this.cooldowns.get(type);
    if (lastQueued) {
      const elapsed = Date.now() - lastQueued;
      const cooldown = C.EVENT_COOLDOWNS[type] || 0;
      if (elapsed < cooldown) {
        const remaining = Math.ceil((cooldown - elapsed) / 1000);
        return { ok: false, error: 'Cooldown active', details: `Wait ${remaining}s` };
      }
    }

    // 레이트 리밋 체크
    const now = Date.now();
    this._rateWindow = this._rateWindow.filter(t => now - t < C.EVENT_RATE_LIMIT.windowMs);
    if (this._rateWindow.length >= C.EVENT_RATE_LIMIT.maxEvents) {
      return { ok: false, error: 'Rate limit exceeded', details: `Max ${C.EVENT_RATE_LIMIT.maxEvents} events per ${C.EVENT_RATE_LIMIT.windowMs / 60000}min` };
    }

    // 활성 제한 체크 — 타입별
    const activeOfType = this.activeEvents.filter(e => e.type === type && e.status === 'active').length;
    const maxOfType = C.EVENT_MAX_ACTIVE[type] || 1;
    if (activeOfType >= maxOfType) {
      return { ok: false, error: 'Active limit reached', details: `Max ${maxOfType} active ${type} events` };
    }

    // 활성 제한 체크 — 전체
    const totalActive = this.activeEvents.filter(e => e.status === 'active').length;
    if (totalActive >= C.EVENT_MAX_ACTIVE.total) {
      return { ok: false, error: 'Total active limit reached', details: `Max ${C.EVENT_MAX_ACTIVE.total} total active events` };
    }

    return { ok: true };
  }

  _addToHistory(event) {
    this.eventHistory.unshift({
      id: event.id,
      type: event.type,
      title: event.title,
      status: event.status,
      createdAt: event.createdAt,
      expiresAt: event.expiresAt,
      endedAt: Date.now(),
    });
    if (this.eventHistory.length > MAX_HISTORY) {
      this.eventHistory.pop();
    }
  }

  _generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }
}

module.exports = EventEngine;
