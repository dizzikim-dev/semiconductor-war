const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const C = require('./constants');
const Game = require('./game');
const { isValidMapId, getMapList, DEFAULT_MAP_ID } = require('./maps');
const { createMarketDataService } = require('./market');
const createAdminRouter = require('./admin/routes');
const ChatService = require('./chat');
const UserDataStore = require('./userData');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── 시장 데이터 서비스 ──
const marketDataService = createMarketDataService();
marketDataService.start();

// ── 채팅 서비스 ──
const chatService = new ChatService();

// ── 유저 데이터 서비스 ──
const userDataStore = new UserDataStore();

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── REST: 맵 목록 (로비에서 사용) ──
app.get('/api/maps', (req, res) => {
  res.json(getMapList());
});

// ── Compliance 헤더 미들웨어 ──
app.use('/api/market-data', (req, res, next) => {
  res.set('X-Data-Delay', '15min+');
  res.set('X-Data-Purpose', 'game-entertainment');
  res.set('X-Not-Investment-Advice', 'true');
  next();
});

// ── REST: 시장 데이터 ──
app.get('/api/market-data', (req, res) => {
  const quotes = marketDataService.getLatestQuotes();
  const news = marketDataService.getLatestNews();
  res.json({
    quotes,
    news,
    disclaimer: '주가 정보는 15분 이상 지연된 데이터이며, 투자 참고용이 아닌 게임 연출 목적입니다.',
  });
});

// ── REST: 뉴스 데이터 ──
app.get('/api/market-data/news', (req, res) => {
  const news = marketDataService.getRecentNews(20);
  res.json({
    news,
    disclaimer: '공시 정보는 15분 이상 지연된 데이터이며, 투자 참고용이 아닌 게임 연출 목적입니다.',
  });
});

// ── 게임 접근 헬퍼 (Admin 라우트에서 사용) ──
const getGame = () => game;
const resetGame = (mapId) => {
  game = new Game(mapId);
  game.setMarketDataService(marketDataService);
  botIdCounter = 0;
  console.log(`[Server] Map changed to: ${mapId} (via admin)`);
};

// ── REST: Admin 라우트 (이벤트 시스템 + 시장 상태) ──
app.use('/api/admin', createAdminRouter(
  () => game ? game.eventEngine : null,
  marketDataService,
  { io, getGame, resetGame, chatService, userDataStore }
));

// ── Admin 패널 페이지 ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ── 게임 인스턴스 (맵별) ──
// 현재는 단일 인스턴스; 첫 번째 참가자의 맵 선택을 따른다
let game = null;
let botIdCounter = 0;

const ensureGame = (mapId) => {
  if (!game) {
    const validId = isValidMapId(mapId) ? mapId : DEFAULT_MAP_ID;
    game = new Game(validId);
    console.log(`[Server] Game created with map: ${validId}`);
  }
  return game;
};

// ── 봇 보충 (팀 밸런싱: 양 팀 총원 동일, 봇 최소 2) ──
const BOT_MIN = C.BOT_COUNT_PER_TEAM; // 2
const ensureBots = () => {
  if (!game) return;
  const all = [...game.players.values()];
  const realSam = all.filter(p => p.team === C.TEAM.SAMSUNG && !p.isBot).length;
  const realSkh = all.filter(p => p.team === C.TEAM.SKHYNIX && !p.isBot).length;

  // 양 팀 총원 = max(삼성실제+봇최소, 하이닉스실제+봇최소)
  const teamTotal = Math.max(realSam + BOT_MIN, realSkh + BOT_MIN);
  const neededMap = {
    [C.TEAM.SAMSUNG]: Math.max(BOT_MIN, teamTotal - realSam),
    [C.TEAM.SKHYNIX]: Math.max(BOT_MIN, teamTotal - realSkh),
  };

  for (const team of [C.TEAM.SAMSUNG, C.TEAM.SKHYNIX]) {
    const bots = all.filter(p => p.team === team && p.isBot);
    const needed = neededMap[team];

    while (bots.length > needed) {
      const bot = bots.pop();
      game.removePlayer(bot.id);
    }
    while (bots.length < needed) {
      const botId = `bot_${++botIdCounter}`;
      const names = ['Chip', 'Wafer', 'Die', 'Fab', 'Litho', 'EUV', 'DRAM', 'NAND'];
      const name = `[BOT] ${names[Math.floor(Math.random() * names.length)]}`;
      const bot = game.addPlayer(botId, name, team);
      bot.isBot = true;
      bots.push(bot);
    }
  }
};

// ── Socket.io 연결 ──
io.on('connection', (socket) => {
  console.log(`[접속] ${socket.id}`);

  socket.on('player_join', ({ name, team, mapId, uuid }) => {
    if (!name || !Object.values(C.TEAM).includes(team)) return;

    const requestedMap = mapId || DEFAULT_MAP_ID;
    const g = ensureGame(requestedMap);

    // MarketDataService 주입
    if (g && !g._marketDataService) {
      g.setMarketDataService(marketDataService);
    }

    // 맵 불일치 시 서버 맵을 따름
    const acceptedMapId = g.mapId;
    if (requestedMap !== acceptedMapId) {
      console.log(`[맵 변경] 요청: ${requestedMap} → 서버 맵: ${acceptedMapId}`);
    }

    const player = g.addPlayer(socket.id, name.slice(0, 16), team);
    socket.emit('player_joined', { id: player.id, team: player.team, mapId: acceptedMapId });

    // UUID 기반 유저 데이터 추적
    const playerUuid = (typeof uuid === 'string' && uuid.length > 0) ? uuid : `server_${socket.id}`;
    userDataStore.onPlayerJoin(socket.id, playerUuid, name.slice(0, 16), team, acceptedMapId);

    // 채팅 히스토리 전송
    const history = chatService.getHistory();
    if (history.length > 0) {
      socket.emit('chat:history', history);
    }

    ensureBots();
    console.log(`[참가] ${name} → ${team} (map: ${acceptedMapId})`);
  });

  socket.on('player_input', (input) => {
    if (game) game.handleInput(socket.id, input);
  });

  socket.on('player_evolve', ({ className }) => {
    if (!game) return;
    const ok = game.handleEvolve(socket.id, className);
    if (ok) {
      const player = game.players.get(socket.id);
      socket.emit('evolved', { className: player.className, level: player.level });
      console.log(`[진화] ${player.name} → ${player.className.toUpperCase()}`);
    }
  });

  socket.on('player_respawn', () => {
    if (!game) return;
    const player = game.players.get(socket.id);
    if (player && !player.alive && player.respawnTimer <= 0) {
      player.respawn();
    }
  });

  // 맵 변경 요청 (모든 플레이어가 퇴장 후 새 맵으로)
  socket.on('change_map', ({ mapId, password }) => {
    if (!isValidMapId(mapId)) return;
    // 관리자 인증 필요
    if (password !== C.ADMIN_PASSWORD) {
      socket.emit('chat:error', { reason: 'Unauthorized: admin password required' });
      return;
    }
    // 게임 리셋
    game = new Game(mapId);
    game.setMarketDataService(marketDataService);
    botIdCounter = 0;
    console.log(`[Server] Map changed to: ${mapId} (by admin)`);
    io.emit('map_changed', { mapId });
  });

  // ── 채팅 ──
  socket.on('chat:send', (data) => {
    if (!data || !game) return;
    const player = game.players.get(socket.id);
    if (!player || player.isBot) return;
    const { message } = data;

    const result = chatService.processMessage(socket.id, message, player);
    if (result.ok) {
      io.emit('chat:message', result.msg);
    } else {
      socket.emit('chat:error', { reason: result.error });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[퇴장] ${socket.id}`);
    chatService.removePlayer(socket.id);

    // 유저 데이터: 퇴장 시 통계 캡처
    if (game) {
      const player = game.players.get(socket.id);
      const stats = player ? {
        kills: player.kills || 0,
        deaths: player.deaths || 0,
        score: player.score || 0,
        level: player.level || 1,
        className: player.className || 'resistor',
      } : {};
      userDataStore.onPlayerDisconnect(socket.id, stats);

      game.removePlayer(socket.id);
      ensureBots();
      // 모든 실제 플레이어가 나가면 게임 리셋
      const realPlayers = [...game.players.values()].filter(p => !p.isBot);
      if (realPlayers.length === 0) {
        game = null;
        console.log('[Server] All players left, game reset');
      }
    } else {
      userDataStore.onPlayerDisconnect(socket.id, {});
    }
  });
});

// ── 게임 루프 (60Hz) ──
let lastTick = Date.now();
setInterval(() => {
  if (!game) return;
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  game.updateBots();
  game.update(dt);
}, C.TICK_INTERVAL);

// ── 스냅샷 브로드캐스트 (20Hz) ──
setInterval(() => {
  if (!game) return;
  const snapshot = game.getSnapshot();

  // 게임 이벤트 → 채팅 시스템 메시지
  if (snapshot.events) {
    for (const evt of snapshot.events) {
      let sysMsg = null;
      if (evt.type === 'monster_kill') {
        sysMsg = `${evt.team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX'} killed ${evt.monsterName} (${evt.buffLabel})`;
      } else if (evt.type === 'cell_captured') {
        const teamLabel = evt.team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX';
        sysMsg = `Cell ${evt.cellId} captured by ${teamLabel}`;
      } else if (evt.type === 'cell_destroyed') {
        const teamLabel = evt.team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX';
        sysMsg = `Cell ${evt.cellId} destroyed by ${teamLabel}`;
      } else if (evt.type === 'admin_event') {
        sysMsg = evt.titleKo || evt.title || evt.eventType;
      }
      if (sysMsg) {
        const msg = chatService.createSystemMessage(sysMsg);
        io.emit('chat:message', msg);
      }
    }
  }

  // 시장 데이터를 스냅샷에 주입 (1초에 1번만 갱신 — 20Hz 매 틱마다 새 객체 불필요)
  if (C.MARKET_FLAGS.ENABLE_LIVE_MARKET_PANEL) {
    if (!game._lastMarketInject || Date.now() - game._lastMarketInject > 1000) {
      const quotes = marketDataService.getLatestQuotes();
      game._cachedMarketSnapshot = {
        samsung: quotes.samsung
          ? { price: quotes.samsung.price, changePercent: quotes.samsung.changePercent }
          : null,
        skhynix: quotes.skhynix
          ? { price: quotes.skhynix.price, changePercent: quotes.skhynix.changePercent }
          : null,
        isMarketOpen: quotes.isMarketOpen,
        buffs: marketDataService.getTeamBuffs(),
        news: marketDataService.getRecentNews(20),
        disclaimer: '주가 정보는 15분 이상 지연된 데이터이며, 게임 연출 목적입니다.',
      };
      game._lastMarketInject = Date.now();
    }
  }
  snapshot.marketData = game._cachedMarketSnapshot || null;

  io.emit('game_snapshot', snapshot);
}, C.SNAPSHOT_INTERVAL);

// ── 프로세스 에러 핸들링 (서버 크래시 방지) ──
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

// ── 서버 시작 ──
server.listen(C.SERVER_PORT, () => {
  console.log(`\n🎮 Semiconductor War 서버 가동`);
  console.log(`   http://localhost:${C.SERVER_PORT}`);
  console.log(`   Tick: ${C.TICK_RATE}Hz | Snapshot: ${C.SNAPSHOT_RATE}Hz`);
  console.log(`   Default map: ${DEFAULT_MAP_ID}\n`);
});
