/**
 * Admin REST 라우트
 * POST /api/admin/event — 이벤트 생성
 * GET  /api/admin/events — 활성 + 최근 이벤트 조회
 * DELETE /api/admin/event/:id — 이벤트 취소
 */
const express = require('express');
const C = require('../constants');
const adminAuth = require('./auth');

/**
 * @param {Function} getEventEngine — () => EventEngine|null (게임 미시작 시 null)
 * @param {object} marketDataService
 * @param {{ io: Server, getGame: Function, resetGame: Function, chatService: ChatService }} [opts]
 */
function createAdminRouter(getEventEngine, marketDataService, opts = {}) {
  const { io, getGame, resetGame, chatService, userDataStore } = opts;
  const router = express.Router();
  router.use(express.json());
  router.use(adminAuth);

  // POST /api/admin/event — 이벤트 생성
  router.post('/event', (req, res) => {
    const engine = getEventEngine();
    if (!engine) {
      return res.status(503).json({ error: 'Game not running' });
    }
    const result = engine.queueEvent(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: result.error, details: result.details });
    }
    res.json({ ok: true, event: result.event });
  });

  // GET /api/admin/events — 활성 + 최근 이벤트
  router.get('/events', (req, res) => {
    const engine = getEventEngine();
    if (!engine) {
      return res.json({ active: [], recent: [] });
    }
    res.json({
      active: engine.getActiveEvents(),
      recent: engine.getHistory(20),
    });
  });

  // DELETE /api/admin/event/:id — 이벤트 취소
  router.delete('/event/:id', (req, res) => {
    const engine = getEventEngine();
    if (!engine) {
      return res.status(503).json({ error: 'Game not running' });
    }
    const result = engine.cancelEvent(req.params.id);
    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // GET /api/admin/market-status — 시장 데이터 상태 (기존 index.js에서 이동)
  router.get('/market-status', (req, res) => {
    if (!marketDataService) {
      return res.json({ error: 'MarketDataService not available' });
    }
    const status = marketDataService.getStatus();

    // Reshape providerStatus for admin UI
    const rawProviders = status.providerStatus || {};
    const providers = Object.entries(rawProviders).map(([name, info]) => ({
      name,
      healthy: info.available && !info.circuitOpen,
      failures: info.failures,
      circuitOpen: info.circuitOpen,
    }));
    const activeProvider = providers.find(p => p.healthy);
    status.providerStatus = {
      providers,
      activeProvider: activeProvider ? activeProvider.name : null,
    };

    // Feature flags for compliance panel
    status.featureFlags = {
      USE_MOCK_MARKET_DATA: C.MARKET_FLAGS.USE_MOCK_MARKET_DATA,
      ENABLE_LIVE_MARKET_BUFFS: C.MARKET_FLAGS.ENABLE_LIVE_MARKET_BUFFS,
      ENABLE_NEWS_EVENTS: C.MARKET_FLAGS.ENABLE_NEWS_EVENTS,
    };

    res.json(status);
  });

  // ── 게임 상태 ──

  // GET /api/admin/game-status — 현재 게임 상태
  router.get('/game-status', (req, res) => {
    const game = getGame ? getGame() : null;
    if (!game) {
      return res.json({ running: false, mapId: null, players: 0, bots: 0 });
    }
    const players = [...game.players.values()];
    const realCount = players.filter(p => !p.isBot).length;
    const botCount = players.filter(p => p.isBot).length;
    res.json({
      running: true,
      mapId: game.mapId,
      players: realCount,
      bots: botCount,
    });
  });

  // POST /api/admin/change-map — 맵 변경 (게임 리셋)
  router.post('/change-map', (req, res) => {
    const { mapId } = req.body || {};
    if (!mapId) {
      return res.status(400).json({ error: 'mapId required' });
    }
    const { isValidMapId } = require('../maps');
    if (!isValidMapId(mapId)) {
      return res.status(400).json({ error: 'Invalid mapId' });
    }
    if (!resetGame) {
      return res.status(503).json({ error: 'resetGame not available' });
    }
    resetGame(mapId);
    if (io) io.emit('map_changed', { mapId });
    res.json({ ok: true, mapId });
  });

  // ── 뉴스 관리 ──

  // GET /api/admin/news — 커스텀 + 프로바이더 뉴스 목록
  router.get('/news', (req, res) => {
    if (!marketDataService) {
      return res.json({ custom: [], provider: [] });
    }
    res.json({
      custom: marketDataService.getCustomNews(),
      provider: marketDataService.getProviderNews(),
    });
  });

  // POST /api/admin/news — 커스텀 뉴스 추가
  router.post('/news', (req, res) => {
    if (!marketDataService) {
      return res.status(503).json({ error: 'MarketDataService not available' });
    }
    const { title, corpName, team, type } = req.body || {};
    if (!title || !corpName || !team) {
      return res.status(400).json({ error: 'title, corpName, team are required' });
    }
    const result = marketDataService.addNews({ title, corpName, team, type });
    res.json(result);
  });

  // DELETE /api/admin/news/:id — 커스텀 뉴스 삭제
  router.delete('/news/:id', (req, res) => {
    if (!marketDataService) {
      return res.status(503).json({ error: 'MarketDataService not available' });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid news id' });
    }
    const result = marketDataService.deleteNews(id);
    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // ── 채팅 관리 ──

  // GET /api/admin/chat — 전체 채팅 히스토리
  router.get('/chat', (req, res) => {
    if (!chatService) {
      return res.json({ messages: [], total: 0 });
    }
    const messages = chatService.getAllMessages();
    res.json({ messages, total: messages.length });
  });

  // DELETE /api/admin/chat/:id — 채팅 메시지 삭제
  router.delete('/chat/:id', (req, res) => {
    if (!chatService) {
      return res.status(503).json({ error: 'ChatService not available' });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid message id' });
    }
    const result = chatService.deleteMessage(id);
    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }
    // 클라이언트에게 삭제된 메시지 알림
    if (io) io.emit('chat:deleted', { id });
    res.json({ ok: true });
  });

  // DELETE /api/admin/chat — 전체 채팅 초기화
  router.delete('/chat', (req, res) => {
    if (!chatService) {
      return res.status(503).json({ error: 'ChatService not available' });
    }
    chatService.clearAll();
    if (io) io.emit('chat:cleared');
    res.json({ ok: true });
  });

  // ── 유저 관리 ──

  // GET /api/admin/users — 유저 목록 (검색, 정렬, 페이지네이션)
  router.get('/users', (req, res) => {
    if (!userDataStore) {
      return res.json({ users: [], total: 0, page: 1, totalPages: 0 });
    }

    const q = req.query.q || '';
    const sort = req.query.sort || 'lastSeen';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    let users = q ? userDataStore.searchUsers(q) : userDataStore.getAllUsers();

    // 정렬
    const sortFns = {
      lastSeen: (a, b) => b.lastSeen - a.lastSeen,
      visitCount: (a, b) => b.visitCount - a.visitCount,
      totalScore: (a, b) => b.totalScore - a.totalScore,
      totalPlaytimeMs: (a, b) => b.totalPlaytimeMs - a.totalPlaytimeMs,
      firstSeen: (a, b) => b.firstSeen - a.firstSeen,
    };
    if (sortFns[sort]) users.sort(sortFns[sort]);

    const total = users.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    users = users.slice(offset, offset + limit);

    res.json({ users, total, page, totalPages });
  });

  // GET /api/admin/users/:uuid — 단일 유저 상세
  router.get('/users/:uuid', (req, res) => {
    if (!userDataStore) {
      return res.status(503).json({ error: 'UserDataStore not available' });
    }
    const user = userDataStore.getUser(req.params.uuid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });

  // GET /api/admin/users-stats — 전체 유저 통계
  router.get('/users-stats', (req, res) => {
    if (!userDataStore) {
      return res.json({ totalUsers: 0, todayActive: 0, totalSessions: 0, avgPlaytimeMs: 0, onlineNow: 0 });
    }
    res.json(userDataStore.getStats());
  });

  return router;
}

module.exports = createAdminRouter;
