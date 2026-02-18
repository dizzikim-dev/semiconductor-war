// 클라이언트 진입점: Socket.io 연결, 맵 선택, 진화 선택, 이벤트 핸들링, 게임 루프
(() => {
  // ── UUID 생성/복원 ──
  const STORAGE_UUID = 'semiconwar_uuid';
  const STORAGE_NICK = 'semiconwar_lastNickname';
  const STORAGE_TEAM = 'semiconwar_lastTeam';

  function getOrCreateUUID() {
    try {
      let uuid = localStorage.getItem(STORAGE_UUID);
      if (uuid) return uuid;
      uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(STORAGE_UUID, uuid);
      return uuid;
    } catch (e) {
      return 'anon_' + Math.random().toString(36).slice(2, 10);
    }
  }

  const playerUUID = getOrCreateUUID();
  // ── Stats Tracking ──
  const STORAGE_STATS = 'semiconwar_stats';

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      return raw ? JSON.parse(raw) : {
        totalKills: 0, totalDeaths: 0, totalPlayTime: 0,
        bestKillStreak: 0, gamesPlayed: 0,
        bossKills: 0, cellsCaptured: 0,
        highestLevel: 0, totalXpEarned: 0,
      };
    } catch {
      return {
        totalKills: 0, totalDeaths: 0, totalPlayTime: 0,
        bestKillStreak: 0, gamesPlayed: 0,
        bossKills: 0, cellsCaptured: 0,
        highestLevel: 0, totalXpEarned: 0
      };
    }
  }

  function saveStats(stats) {
    try { localStorage.setItem(STORAGE_STATS, JSON.stringify(stats)); } catch {}
  }

  function renderStatsDisplay() {
    const el = document.getElementById('playerStatsDisplay');
    if (!el) return;
    const s = playerStats;
    const hours = Math.floor(s.totalPlayTime / 3600);
    const mins = Math.floor((s.totalPlayTime % 3600) / 60);
    const _t = typeof I18n !== 'undefined' ? I18n.t.bind(I18n) : (k) => k;
    el.innerHTML = `
      <div class="stat-item"><span class="stat-value">${s.totalKills}</span><span class="stat-label">${_t('stats.totalKills')}</span></div>
      <div class="stat-item"><span class="stat-value">${s.bestKillStreak}</span><span class="stat-label">${_t('stats.bestStreak')}</span></div>
      <div class="stat-item"><span class="stat-value">Lv.${s.highestLevel}</span><span class="stat-label">${_t('stats.highestLevel')}</span></div>
      <div class="stat-item"><span class="stat-value">${hours}h ${mins}m</span><span class="stat-label">${_t('stats.playTime')}</span></div>
      <div class="stat-item"><span class="stat-value">${s.gamesPlayed}</span><span class="stat-label">${_t('stats.gamesPlayed')}</span></div>
    `;
  }

  const playerStats = loadStats();
  let sessionKills = 0;
  let sessionStartTime = null;
  let statsSaveTimer = 0;

  // ── Q-1: 킬 스트릭 시스템 ──
  const KILL_STREAK_WINDOW = 8000; // 8초 이내 연속 킬
  const killTimestamps = [];
  const STREAK_LABELS = [
    null,           // 0
    null,           // 1 (단일 킬)
    'DOUBLE KILL',  // 2
    'TRIPLE KILL',  // 3
    'QUADRA KILL',  // 4
    'PENTA KILL',   // 5
  ];

  // ── Q-5: 복수 시스템 (클라이언트) ──
  let revengeTargetId = null;
  let revengeTargetName = null;

  // ── i18n 초기화 ──
  I18n.init().then(() => {
    I18n.translateDOM();
    renderStatsDisplay();
    _updateLangFlags();
  });

  // 언어 전환 버튼 (국기 2개)
  const langFlagBtns = document.querySelectorAll('.lang-flag-btn');
  const _updateLangFlags = () => {
    const cur = I18n.getLocale();
    langFlagBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === cur);
    });
  };
  langFlagBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.lang === I18n.getLocale()) return;
      await I18n.setLocale(btn.dataset.lang);
      I18n.translateDOM();
      renderStatsDisplay();
      _updateLangFlags();
    });
  });

  // 언어 변경 시 DOM 갱신
  I18n.onChange(() => {
    I18n.translateDOM();
    _updateLangFlags();
  });

  // Render stats on page load
  renderStatsDisplay();


  // ── 가이드 셀 점령 일러스트 ──
  function _drawGuideCellIllust(team) {
    const cvs = document.getElementById('guideCellCanvas');
    if (!cvs) return;
    // CSS가 결정한 크기를 읽어서 고해상도 캔버스 생성
    const w = cvs.offsetWidth || 90;
    const h = cvs.offsetHeight || 64;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = w * dpr;
    cvs.height = h * dpr;
    const c = cvs.getContext('2d');
    c.scale(dpr, dpr);

    // 스케일 팩터 (기준: 64px 높이)
    const s = h / 64;
    const neutralColor = '#6b7a8d';
    const teamColor = team === 'skhynix' ? '#ff3250' : '#1e64ff';
    const midY = h * 0.42;

    // 커패시터 심볼 그리기 헬퍼
    function drawCap(cx, cy, color, glow) {
      const r = 14 * s, plateH = r * 1.6, plateGap = r * 0.45, plateW = 2.5 * s;
      c.save();
      c.translate(cx, cy);
      c.globalAlpha = 0.5;
      c.strokeStyle = color;
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.moveTo(-r, 0); c.lineTo(-plateGap / 2, 0);
      c.moveTo(plateGap / 2, 0); c.lineTo(r, 0);
      c.stroke();
      c.globalAlpha = 0.8;
      c.fillStyle = color;
      c.fillRect(-plateGap / 2 - plateW, -plateH / 2, plateW, plateH);
      c.fillRect(plateGap / 2, -plateH / 2, plateW, plateH);
      c.globalAlpha = 0.9;
      c.strokeStyle = '#ffffff';
      c.lineWidth = s;
      c.strokeRect(-plateGap / 2 - plateW, -plateH / 2, plateW, plateH);
      c.strokeRect(plateGap / 2, -plateH / 2, plateW, plateH);
      if (glow) {
        const glowH = plateH * 0.6;
        c.globalAlpha = 0.4;
        c.fillStyle = color;
        c.fillRect(-plateGap / 2 + 1, -glowH / 2, plateGap - 2, glowH);
        c.globalAlpha = 0.15;
        c.shadowColor = color;
        c.shadowBlur = 8 * s;
        c.beginPath();
        c.arc(0, 0, r + 4 * s, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.shadowBlur = 0;
      }
      c.globalAlpha = 0.4;
      c.font = `${8 * s}px Share Tech Mono`;
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.fillText('+', -plateGap / 2 - plateW - 6 * s, 3 * s);
      c.fillText('−', plateGap / 2 + plateW + 6 * s, 3 * s);
      c.restore();
    }

    const leftX = w * 0.25, rightX = w * 0.75;
    // 좌: neutral
    drawCap(leftX, midY, neutralColor, false);
    c.globalAlpha = 0.6;
    c.fillStyle = '#8899aa';
    c.font = `${8 * s}px Share Tech Mono`;
    c.textAlign = 'center';
    c.fillText('neutral', leftX, midY + 26 * s);

    // 화살표
    const arrowL = w * 0.42, arrowR = w * 0.58;
    c.globalAlpha = 0.7;
    c.strokeStyle = '#ffd700';
    c.lineWidth = 1.5 * s;
    c.beginPath();
    c.moveTo(arrowL, midY);
    c.lineTo(arrowR, midY);
    c.stroke();
    c.fillStyle = '#ffd700';
    c.beginPath();
    c.moveTo(arrowR, midY);
    c.lineTo(arrowR - 5 * s, midY - 4 * s);
    c.lineTo(arrowR - 5 * s, midY + 4 * s);
    c.closePath();
    c.fill();

    // 우: owned (팀색)
    drawCap(rightX, midY, teamColor, true);
    c.globalAlpha = 0.8;
    c.fillStyle = teamColor;
    c.font = `${8 * s}px Share Tech Mono`;
    c.textAlign = 'center';
    c.fillText('owned', rightX, midY + 26 * s);
  }

  const socket = io();
  let myId = null;
  let myTeam = null;
  let acceptedMapId = null;
  let joined = false;
  let alive = true;
  let lastState = null;
  let evolveReady = false;
  let cachedMapConfig = null; // 서버에서 1회 수신 → 스냅샷에 머지
  // (spectate 기능 제거됨 — 피드백 #9)

  // 소켓 연결 시 홈 화면용 일일 랭킹 요청
  socket.on('connect', () => {
    socket.emit('get_daily_records');
  });

  // DOM
  const startScreen = document.getElementById('startScreen');
  const deathScreen = document.getElementById('deathScreen');
  const deathInfo = document.getElementById('deathInfo');
  const respawnBtn = document.getElementById('respawnBtn');
  const homeBtn = document.getElementById('homeBtn');
  const canvas = document.getElementById('gameCanvas');
  const nameInput = document.getElementById('nameInput');
  const playBtn = document.getElementById('playBtn');
  const teamBtns = document.querySelectorAll('.team-btn');
  const evolveOverlay = document.getElementById('evolveOverlay');
  let selectedTeam = 'samsung';
  const selectedMapId = 'map_tribus_circuit';
  let myClass = 'resistor';

  // ── 진화 오버레이 업데이트 (Tier 2 vs Tier 3) ──
  function updateEvolveOverlay(className, level) {
    const tier2Btns = document.querySelectorAll('.tier2');
    const tier3CapBtns = document.querySelectorAll('.tier3-cap');
    const tier3RepBtns = document.querySelectorAll('.tier3-rep');
    const subtitle = document.getElementById('evolveSubtitle');

    if (className === 'resistor' && level >= 2) {
      // Tier 2 진화: resistor → capacitor/repeater
      tier2Btns.forEach(btn => btn.classList.remove('hidden'));
      tier3CapBtns.forEach(btn => btn.classList.add('hidden'));
      tier3RepBtns.forEach(btn => btn.classList.add('hidden'));
      if (subtitle) subtitle.textContent = I18n.t('evolve.selectClass');
    } else if (className === 'capacitor' && level >= 5) {
      // Tier 3 진화: capacitor → inductor/transformer
      tier2Btns.forEach(btn => btn.classList.add('hidden'));
      tier3CapBtns.forEach(btn => btn.classList.remove('hidden'));
      tier3RepBtns.forEach(btn => btn.classList.add('hidden'));
      if (subtitle) subtitle.textContent = I18n.t('evolve.selectTier3');
    } else if (className === 'repeater' && level >= 5) {
      // Tier 3 진화: repeater → oscillator/amplifier
      tier2Btns.forEach(btn => btn.classList.add('hidden'));
      tier3CapBtns.forEach(btn => btn.classList.add('hidden'));
      tier3RepBtns.forEach(btn => btn.classList.remove('hidden'));
      if (subtitle) subtitle.textContent = I18n.t('evolve.selectTier3');
    }
  }

  // ── 마지막 닉네임/팀 자동 복원 ──
  try {
    const savedNick = localStorage.getItem(STORAGE_NICK);
    const savedTeam = localStorage.getItem(STORAGE_TEAM);
    if (savedNick && nameInput) nameInput.value = savedNick;
    if (savedTeam && (savedTeam === 'samsung' || savedTeam === 'skhynix')) {
      selectedTeam = savedTeam;
      teamBtns.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.team === savedTeam);
      });
    }
  } catch (e) { /* localStorage unavailable */ }

  // ── 진영 선택 ──
  teamBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      teamBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTeam = btn.dataset.team;
    });
  });

  // 키보드 단축키
  window.addEventListener('keydown', (e) => {
    if (joined) {
      // 채팅 입력 중이면 게임 키바인드 무시
      if (Chat.isInputFocused()) return;

      // Enter: 채팅 열기/포커스
      if (e.key === 'Enter') {
        e.preventDefault();
        Chat.handleEnterKey();
        return;
      }
      // ESC: 채팅 닫기
      if (e.key === 'Escape') {
        if (Chat.handleEscKey()) return;
      }
      // 게임 중: E키로 진화 오버레이 토글
      if (e.code === 'KeyE' && evolveReady && evolveOverlay) {
        evolveOverlay.classList.toggle('hidden');
      }
    }
  });

  // ── 진화 선택 ──
  ['capacitor','repeater','inductor','transformer','oscillator','amplifier'].forEach(cls => {
    const btn = document.getElementById('evolve' + cls.charAt(0).toUpperCase() + cls.slice(1));
    if (btn) btn.addEventListener('click', () => {
      socket.emit('player_evolve', { className: cls });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  });

  // ── 플레이 ──
  playBtn.addEventListener('click', joinGame);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinGame();
  });

  function joinGame() {
    const name = nameInput.value.trim() || `Player${Math.floor(Math.random() * 999)}`;
    console.log('[Client] Joining with mapId:', selectedMapId);
    socket.emit('player_join', { name, team: selectedTeam, mapId: selectedMapId, uuid: playerUUID });

    // 닉네임/팀 localStorage 저장
    try {
      localStorage.setItem(STORAGE_NICK, name);
      localStorage.setItem(STORAGE_TEAM, selectedTeam);
    } catch (e) { /* localStorage unavailable */ }
  }

  // ── 서버 응답: 참가 완료 ──
  socket.on('player_joined', ({ id, team, mapId }) => {
    myId = id;
    myTeam = team;
    acceptedMapId = mapId;
    joined = true;
    alive = true;
    evolveReady = false;
    console.log('[Client] Joined. roomAcceptedMapId:', acceptedMapId);

    // Stats: increment games played
    playerStats.gamesPlayed++;
    sessionStartTime = Date.now();
    sessionKills = 0;
    saveStats(playerStats);

    startScreen.classList.add('hidden');
    deathScreen.classList.add('hidden');
    if (evolveOverlay) evolveOverlay.classList.add('hidden');
    Renderer.init(canvas);
    Input.init(canvas);
    Input.setPingCallback((type) => socket.emit('player_ping', { type }));
    HUD.init();
    HUD.show();
    Chat.init(socket, myTeam);
    if (typeof Sound !== 'undefined') {
      Sound.init();
      Sound.playBGM('battle');
    }
    if (typeof Mobile !== 'undefined') {
      Mobile.init();
      initMobileButtons();
    }
    requestAnimationFrame(gameLoop);

    // 게임 시작 가이드 오버레이 표시
    const guideOverlay = document.getElementById('gameGuideOverlay');
    if (guideOverlay) {
      guideOverlay.classList.remove('hidden');
      // 셀 점령 일러스트 캔버스 그리기
      _drawGuideCellIllust(selectedTeam);
      const dismissGuide = () => {
        if (guideOverlay.classList.contains('hidden')) return;
        guideOverlay.classList.add('fade-out');
        setTimeout(() => {
          guideOverlay.classList.add('hidden');
          guideOverlay.classList.remove('fade-out');
        }, 300);
        document.removeEventListener('keydown', dismissGuide);
      };
      const startBtn = document.getElementById('guideStartBtn');
      if (startBtn) startBtn.addEventListener('click', dismissGuide);
      document.addEventListener('keydown', dismissGuide);
    }
  });

  // ── 맵 설정 수신 (접속 시 1회) ──
  socket.on('map_config', (config) => {
    cachedMapConfig = config;
    console.log('[Client] Map config received:', config.name);
  });

  // ── 맵 변경 알림 ──
  socket.on('map_changed', ({ mapId }) => {
    acceptedMapId = mapId;
    cachedMapConfig = null; // 맵 변경 시 캐시 무효화
    console.log('[Client] Map changed by server:', mapId);
  });

  // ── 진화 완료 ──
  socket.on('evolved', ({ className, level }) => {
    evolveReady = false;
    if (evolveOverlay) evolveOverlay.classList.add('hidden');
    if (typeof Sound !== 'undefined') Sound.play('evolve');
    console.log(`[Client] Evolved to ${className} (Lv.${level})`);
  });

  // ── 일일 최고기록 수신 (피드백 #10) ──
  socket.on('daily_records', (records) => {
    const deathPanel = document.getElementById('dailyRecordsPanel');
    const deathList = document.getElementById('dailyRecordsList');
    const lobbyPanel = document.getElementById('lobbyRecordsPanel');
    const lobbyList = document.getElementById('lobbyRecordsList');

    if (!records || records.length === 0) {
      if (deathPanel) deathPanel.classList.add('hidden');
      if (lobbyPanel) lobbyPanel.classList.add('hidden');
      return;
    }
    const rows = records.map(r => {
      const teamColor = r.team === 'samsung' ? '#5a9bff' : '#ff6b80';
      return `<div class="daily-record-row">
        <span style="color:#ffd700;width:20px">#${r.rank}</span>
        <span style="color:${teamColor};flex:1">${r.name}</span>
        <span style="color:#6b7a8d;font-size:10px">${(r.className || '').charAt(0).toUpperCase()}</span>
        <span style="color:#e0e6ed;width:50px;text-align:right">${r.score}</span>
        <span style="color:#ff6b6b;width:30px;text-align:right">${r.kills}K</span>
      </div>`;
    }).join('');

    // 사망 화면 패널
    if (deathList) { deathList.innerHTML = rows; deathPanel.classList.remove('hidden'); }
    // 홈 화면 패널
    if (lobbyList) { lobbyList.innerHTML = rows; lobbyPanel.classList.remove('hidden'); }
  });

  // 리스폰
  respawnBtn.addEventListener('click', () => {
    socket.emit('player_respawn');
    deathScreen.classList.add('hidden');
    alive = true;
    // 리스폰 처리
  });

  // 홈으로 돌아가기
  homeBtn.addEventListener('click', () => {
    socket.disconnect();
    deathScreen.classList.add('hidden');
    HUD.hide();
    joined = false;
    alive = true;
    myId = null;
    evolveReady = false;
    startScreen.classList.remove('hidden');
    renderStatsDisplay();
    if (typeof Sound !== 'undefined') Sound.stopBGM();
    socket.connect();
  });


  // ── 스냅샷 수신 ──
  let lastProcessedEvents = 0;
  socket.on('game_snapshot', (snapshot) => {
    // 캐시된 맵 설정 머지 (서버에서 매 프레임 전송 중단)
    if (cachedMapConfig && !snapshot.mapConfig) {
      snapshot.mapConfig = cachedMapConfig;
    }
    Interpolation.pushSnapshot(snapshot);
    lastState = snapshot;

    // 모바일 스냅샷 전달 (모달 렌더링용)
    if (typeof Mobile !== 'undefined' && Mobile.isMobile()) {
      Mobile.setSnapshot(snapshot);
    }

    if (joined && myId) {
      const me = snapshot.players.find(p => p.id === myId);
      if (me && !me.alive && alive) {
        alive = false;
        Chat.setPlayerAlive(false);
        showDeathScreen(me);
        if (typeof Sound !== 'undefined') Sound.play('death');
        playerStats.totalDeaths++;
        playerStats.bestKillStreak = Math.max(playerStats.bestKillStreak, sessionKills);
        sessionKills = 0;
        killTimestamps.length = 0; // 스트릭 리셋
        saveStats(playerStats);
        // Q-5: 복수 대상 저장 + 렌더러에 전달
        if (me.revengeTargetId) {
          revengeTargetId = me.revengeTargetId;
          revengeTargetName = me.lastKilledBy ? me.lastKilledBy.name : null;
        } else {
          revengeTargetId = null;
          revengeTargetName = null;
        }
        Renderer.setRevengeTarget(revengeTargetId);
      } else if (me && !me.alive && !alive) {
        // 사망 중 최신 스냅샷으로 점수 갱신 (투사체 후속 킬 반영)
        const curScore = me.score || 0;
        if (deathInfo) {
          const totalKills = playerStats.totalKills || 0;
          deathInfo.innerHTML = `<span style="color:#ffd700">${I18n.t('stats.kills')}: ${totalKills}</span> | <span style="color:#60a5fa">${I18n.t('stats.score')}: ${curScore}</span>`;
        }
      } else if (me && me.alive && !alive) {
        alive = true;
        Chat.setPlayerAlive(true);
        deathScreen.classList.add('hidden');
        if (typeof Sound !== 'undefined') Sound.play('respawn');

        // 리스폰 후 진화 가능 상태면 리마인더 강조 (깜빡임)
        if (me.evolveReady) {
          const reminder = document.getElementById('evolveReminder');
          if (reminder) {
            reminder.classList.add('evolve-blink');
            setTimeout(() => reminder.classList.remove('evolve-blink'), 5000);
          }
        }
      }

      // 진화 가능 상태 추적
      if (me && me.evolveReady && !evolveReady) {
        evolveReady = true;
        myClass = me.className;
        updateEvolveOverlay(me.className, me.level);
        if (evolveOverlay) evolveOverlay.classList.remove('hidden');
        if (typeof Mobile !== 'undefined') Mobile.showEvolveButton(true);
      } else if (me && !me.evolveReady) {
        evolveReady = false;
        if (me) myClass = me.className;
        if (typeof Mobile !== 'undefined') Mobile.showEvolveButton(false);
      }

      // Task 3: 진화 알림 (레벨 2+ resistor 또는 레벨 5+ capacitor/repeater)
      const evolveReminder = document.getElementById('evolveReminder');
      if (evolveReminder) {
        const evolveOverlayHidden = evolveOverlay && evolveOverlay.classList.contains('hidden');
        const tier2Ready = me && me.level >= 2 && me.className === 'resistor';
        const tier3Ready = me && me.level >= 5 && (me.className === 'capacitor' || me.className === 'repeater');
        const isMob = typeof Mobile !== 'undefined' && Mobile.isMobile();
        if ((tier2Ready || tier3Ready) && evolveOverlayHidden) {
          const keyHint = isMob ? '⚡' : 'E';
          if (tier3Ready) {
            evolveReminder.textContent = I18n.t('hud.evolveReminderTier3', { key: keyHint });
          } else {
            evolveReminder.textContent = I18n.t('hud.evolveReminderTier2', { key: keyHint });
          }
          evolveReminder.classList.remove('hidden');
        } else {
          evolveReminder.classList.add('hidden');
        }
      }

      // Task 7: 플로팅 텍스트 (킬/XP/레벨업/픽업 피드백)
      if (snapshot.events && Renderer.addFloatingText && me) {
        for (const evt of snapshot.events) {
          // 킬 이벤트 (내가 킬러인 경우)
          if (evt.type === 'kill' && evt.killer === me.name) {
            Renderer.addFloatingText('+50 XP', me.x, me.y - 30, '#ffd700');
            if (typeof Sound !== 'undefined') Sound.play('kill');
            playerStats.totalKills++;
            sessionKills++;
            saveStats(playerStats);

            // Q-1: 킬 스트릭 판정
            const now = Date.now();
            killTimestamps.push(now);
            // 윈도우 밖 제거
            while (killTimestamps.length > 0 && now - killTimestamps[0] > KILL_STREAK_WINDOW) {
              killTimestamps.shift();
            }
            const streak = killTimestamps.length;
            if (streak >= 2) {
              const label = streak <= 5 ? STREAK_LABELS[streak] : I18n.t('streak.legendary');
              const colors = ['', '', '#ff9900', '#ff4400', '#ff00cc', '#ff00ff'];
              const color = streak <= 5 ? colors[streak] : '#ff00ff';
              Renderer.addFloatingText(label, me.x, me.y - 55, color);
              if (typeof Sound !== 'undefined') Sound.play('kill'); // 추가 효과음
            }
          }
          // Q-5: 복수 킬 이벤트
          if (evt.type === 'revenge' && evt.killer === me.name) {
            Renderer.addFloatingText(I18n.t('game.revenge'), me.x, me.y - 70, '#ff2200');
            revengeTargetId = null;
            revengeTargetName = null;
            Renderer.setRevengeTarget(null);
          }
          // 어시스트 이벤트 (내가 기여한 경우)
          if (evt.type === 'assist' && evt.playerId === myId) {
            Renderer.addFloatingText(I18n.t('game.assist'), me.x, me.y - 45, '#87ceeb');
          }
          // 몬스터 킬 이벤트
          if (evt.type === 'monster_kill' && evt.team === me.team) {
            Renderer.addFloatingText(I18n.t('game.bossKill'), me.x, me.y - 35, '#ffd700');
            if (typeof Sound !== 'undefined') Sound.play('bossSpawn');
            playerStats.bossKills++;
            saveStats(playerStats);
            // Q-4: 보스 킬 화면 테두리 글로우
            Renderer.triggerScreenGlow(me.team === 'samsung' ? '#1e64ff' : '#ff3250', 2000);
          }
          // 셀 점령 이벤트
          if (evt.type === 'cell_captured' && evt.team === me.team) {
            if (typeof Sound !== 'undefined') Sound.play('cellCapture');
            playerStats.cellsCaptured++;
            saveStats(playerStats);
          }
          // 픽업 이벤트 (나의 픽업)
          if (evt.type === 'pickup_buff' && evt.playerId === myId) {
            const label = evt.buffLabel || 'BUFF';
            Renderer.addFloatingText(`⚡ ${label}`, me.x, me.y - 30, '#00e5ff');
            if (typeof Sound !== 'undefined') Sound.play('pickup');
          }
        }
      }

      // 레벨업 감지 (이전 레벨과 비교)
      if (me && lastMyLevel !== undefined && me.level > lastMyLevel) {
        if (Renderer.addFloatingText) {
          Renderer.addFloatingText(I18n.t('game.levelUp'), me.x, me.y - 40, '#00ff88');
        }
        if (typeof Sound !== 'undefined') Sound.play('levelup');
      }
      if (me) {
        lastMyLevel = me.level;
        playerStats.highestLevel = Math.max(playerStats.highestLevel, me.level);
      }

      // HP 변화 감지
      if (me && lastMyHp !== undefined && me.alive) {
        const diff = me.hp - lastMyHp;
        if (diff >= 20 && Renderer.addFloatingText) {
          Renderer.addFloatingText(`+${Math.round(diff)} HP`, me.x, me.y - 25, '#00ff88');
        }
        if (diff <= -10 && typeof Sound !== 'undefined') {
          Sound.play('hit');
        }
      }
      if (me) lastMyHp = me.hp;
    }
  });

  let lastMyLevel;
  let lastMyHp;

  // 사망 화면
  function showDeathScreen(me) {
    deathScreen.classList.remove('hidden');
    if (evolveOverlay) evolveOverlay.classList.add('hidden');

    // 누적 킬 + 현재 점수 표시 (피드백 #9)
    const totalKills = playerStats.totalKills || 0;
    const curScore = me.score || 0;
    deathInfo.innerHTML = `<span style="color:#ffd700">${I18n.t('stats.kills')}: ${totalKills}</span> | <span style="color:#60a5fa">${I18n.t('stats.score')}: ${curScore}</span>`;

    // 사망 원인 표시
    const killerEl = document.getElementById('deathKiller');
    if (killerEl && me.lastKilledBy) {
      const kb = me.lastKilledBy;
      const isMob = typeof Mobile !== 'undefined' && Mobile.isMobile();
      const killerText = isMob
        ? I18n.t('death.killedByMobile', { name: kb.name })
        : I18n.t('death.killedBy', { name: kb.name, class: kb.className.toUpperCase() });
      killerEl.innerHTML = killerText;
      if (kb.id) {
        killerEl.innerHTML += `<br><span style="color:#ff4444;font-size:${isMob ? '11' : '12'}px">${I18n.t('death.revengeHint')}</span>`;
      }
    } else if (killerEl) {
      killerEl.textContent = '';
    }

    // 일일 최고기록 요청 (피드백 #10)
    socket.emit('get_daily_records');

    // 리스폰 버튼: 처음부터 회색으로 표시, 5초 후 활성화 (피드백 #9)
    respawnBtn.disabled = true;
    respawnBtn.classList.add('respawn-disabled');
    respawnBtn.classList.remove('hidden');

    let countdown = 5;
    respawnBtn.textContent = I18n.t('death.respawnTimer', { count: countdown });
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        respawnBtn.textContent = I18n.t('death.respawn');
        respawnBtn.disabled = false;
        respawnBtn.classList.remove('respawn-disabled');
      } else {
        respawnBtn.textContent = I18n.t('death.respawnTimer', { count: countdown });
      }
    }, 1000);
  }

  // ── 게임 루프 (60 FPS 캡) ──
  const INPUT_SEND_RATE = 50;
  let lastInputSend = 0;
  const TARGET_FRAME_MS = 1000 / 60;
  let lastFrameTime = 0;

  function gameLoop(timestamp) {
    if (!joined) return;

    // 60 FPS 캡 — 120Hz 디스플레이에서 불필요한 렌더링 방지
    if (timestamp - lastFrameTime < TARGET_FRAME_MS * 0.9) {
      requestAnimationFrame(gameLoop);
      return;
    }
    lastFrameTime = timestamp;

    const state = Interpolation.getInterpolatedState();
    if (state) {
      Renderer.render(state, myId);
      HUD.update(state, myId);
    }

    if (timestamp - lastInputSend >= INPUT_SEND_RATE) {
      const input = Input.getInput();
      if (input) socket.emit('player_input', input);
      lastInputSend = timestamp;
    }

    // Periodic stats save (every 30s)
    statsSaveTimer += 16.67; // Approx frame time
    if (statsSaveTimer >= 30000) {
      playerStats.totalPlayTime += 30;
      saveStats(playerStats);
      statsSaveTimer = 0;
    }

    requestAnimationFrame(gameLoop);
  }

  // ── 모바일 버튼 핸들러 ──
  function initMobileButtons() {
    if (!Mobile.isMobile()) return;

    // 로비 컨트롤 힌트 변경
    const hint = document.getElementById('controlsHint');
    if (hint) hint.textContent = I18n.t('start.controlsHintMobile');

    // 진화 버튼
    const btnEvolve = document.getElementById('btnMobileEvolve');
    if (btnEvolve) {
      btnEvolve.addEventListener('click', (e) => {
        e.preventDefault();
        if (evolveReady && evolveOverlay) {
          evolveOverlay.classList.toggle('hidden');
        }
      });
    }
  }
})();
