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
    el.innerHTML = `
      <div class="stat-item"><span class="stat-value">${s.totalKills}</span><span class="stat-label">누적 킬</span></div>
      <div class="stat-item"><span class="stat-value">${s.bestKillStreak}</span><span class="stat-label">최고 연속킬</span></div>
      <div class="stat-item"><span class="stat-value">Lv.${s.highestLevel}</span><span class="stat-label">최고 레벨</span></div>
      <div class="stat-item"><span class="stat-value">${hours}h ${mins}m</span><span class="stat-label">플레이</span></div>
      <div class="stat-item"><span class="stat-value">${s.gamesPlayed}</span><span class="stat-label">게임</span></div>
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

  // Render stats on page load
  renderStatsDisplay();


  const socket = io();
  let myId = null;
  let myTeam = null;
  let acceptedMapId = null;
  let joined = false;
  let alive = true;
  let lastState = null;
  let evolveReady = false;
  let spectateTarget = null;  // player ID being spectated
  let spectateIndex = 0;      // index in alive teammates list

  // DOM
  const startScreen = document.getElementById('startScreen');
  const deathScreen = document.getElementById('deathScreen');
  const deathInfo = document.getElementById('deathInfo');
  const deathTimer = document.getElementById('deathTimer');
  const respawnBtn = document.getElementById('respawnBtn');
  const homeBtn = document.getElementById('homeBtn');
  const roundEndScreen = document.getElementById('roundEndScreen');
  const roundResult = document.getElementById('roundResult');
  const roundStats = document.getElementById('roundStats');
  const continueBtn = document.getElementById('continueBtn');
  const canvas = document.getElementById('gameCanvas');
  const nameInput = document.getElementById('nameInput');
  const playBtn = document.getElementById('playBtn');
  const teamBtns = document.querySelectorAll('.team-btn');
  const evolveOverlay = document.getElementById('evolveOverlay');
  const evolveCapacitor = document.getElementById('evolveCapacitor');
  const evolveRepeater = document.getElementById('evolveRepeater');
  const evolveInductor = document.getElementById('evolveInductor');
  const evolveTransformer = document.getElementById('evolveTransformer');
  const evolveOscillator = document.getElementById('evolveOscillator');
  const evolveAmplifier = document.getElementById('evolveAmplifier');
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
      if (subtitle) subtitle.textContent = '클래스를 선택하세요';
    } else if (className === 'capacitor' && level >= 5) {
      // Tier 3 진화: capacitor → inductor/transformer
      tier2Btns.forEach(btn => btn.classList.add('hidden'));
      tier3CapBtns.forEach(btn => btn.classList.remove('hidden'));
      tier3RepBtns.forEach(btn => btn.classList.add('hidden'));
      if (subtitle) subtitle.textContent = '2차 진화를 선택하세요';
    } else if (className === 'repeater' && level >= 5) {
      // Tier 3 진화: repeater → oscillator/amplifier
      tier2Btns.forEach(btn => btn.classList.add('hidden'));
      tier3CapBtns.forEach(btn => btn.classList.add('hidden'));
      tier3RepBtns.forEach(btn => btn.classList.remove('hidden'));
      if (subtitle) subtitle.textContent = '2차 진화를 선택하세요';
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
  if (evolveCapacitor) {
    evolveCapacitor.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'capacitor' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }
  if (evolveRepeater) {
    evolveRepeater.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'repeater' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }
  if (evolveInductor) {
    evolveInductor.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'inductor' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }
  if (evolveTransformer) {
    evolveTransformer.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'transformer' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }
  if (evolveOscillator) {
    evolveOscillator.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'oscillator' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }
  if (evolveAmplifier) {
    evolveAmplifier.addEventListener('click', () => {
      socket.emit('player_evolve', { className: 'amplifier' });
      if (evolveOverlay) evolveOverlay.classList.add('hidden');
    });
  }

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

  // ── 맵 변경 알림 ──
  socket.on('map_changed', ({ mapId }) => {
    acceptedMapId = mapId;
    console.log('[Client] Map changed by server:', mapId);
  });

  // ── 진화 완료 ──
  socket.on('evolved', ({ className, level }) => {
    evolveReady = false;
    if (evolveOverlay) evolveOverlay.classList.add('hidden');
    if (typeof Sound !== 'undefined') Sound.play('evolve');
    console.log(`[Client] Evolved to ${className} (Lv.${level})`);
  });

  // 리스폰
  respawnBtn.addEventListener('click', () => {
    socket.emit('player_respawn');
    deathScreen.classList.add('hidden');
    alive = true;
    spectateTarget = null;  // 리스폰 시 관전 종료
  });

  // 관전 대상 전환 (클릭 또는 스페이스바)
  function cycleSpectateTarget() {
    if (alive || !lastState) return;
    const teammates = lastState.players.filter(p => p.team === myTeam && p.alive && p.id !== myId);
    if (teammates.length > 0) {
      spectateIndex = (spectateIndex + 1) % teammates.length;
      spectateTarget = teammates[spectateIndex].id;
      updateSpectateInfo(teammates[spectateIndex]);
    }
  }

  window.addEventListener('click', (e) => {
    // 버튼 클릭은 무시
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    cycleSpectateTarget();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !alive && !Chat.isInputFocused()) {
      e.preventDefault();
      cycleSpectateTarget();
    }
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

  // 라운드 종료 후 계속
  continueBtn.addEventListener('click', () => {
    roundEndScreen.classList.add('hidden');
  });

  // ── 스냅샷 수신 ──
  let lastProcessedEvents = 0;
  socket.on('game_snapshot', (snapshot) => {
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
          const keyHint = isMob ? '⚡ 버튼' : 'E키';
          if (tier3Ready) {
            evolveReminder.textContent = `⚡ ${keyHint}를 눌러 2차 진화!`;
          } else {
            evolveReminder.textContent = `⚡ ${keyHint}를 눌러 진화!`;
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
              const label = streak <= 5 ? STREAK_LABELS[streak] : 'LEGENDARY';
              const colors = ['', '', '#ff9900', '#ff4400', '#ff00cc', '#ff00ff'];
              const color = streak <= 5 ? colors[streak] : '#ff00ff';
              Renderer.addFloatingText(label, me.x, me.y - 55, color);
              if (typeof Sound !== 'undefined') Sound.play('kill'); // 추가 효과음
            }
          }
          // Q-5: 복수 킬 이벤트
          if (evt.type === 'revenge' && evt.killer === me.name) {
            Renderer.addFloatingText('REVENGE! +30 XP', me.x, me.y - 70, '#ff2200');
            revengeTargetId = null;
            revengeTargetName = null;
            Renderer.setRevengeTarget(null);
          }
          // 어시스트 이벤트 (내가 기여한 경우)
          if (evt.type === 'assist' && evt.playerId === myId) {
            Renderer.addFloatingText('ASSIST +25 XP', me.x, me.y - 45, '#87ceeb');
          }
          // 몬스터 킬 이벤트
          if (evt.type === 'monster_kill' && evt.team === me.team) {
            Renderer.addFloatingText('BOSS KILL!', me.x, me.y - 35, '#ffd700');
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
          Renderer.addFloatingText('LEVEL UP!', me.x, me.y - 40, '#00ff88');
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
    deathInfo.textContent = `K: ${me.kills} / D: ${me.deaths}`;

    // Task 4: 사망 원인 표시
    const killerEl = document.getElementById('deathKiller');
    if (killerEl && me.lastKilledBy) {
      const kb = me.lastKilledBy;
      const isMob = typeof Mobile !== 'undefined' && Mobile.isMobile();
      const killerText = isMob
        ? `☠ ${kb.name}`
        : `☠ ${kb.name} (${kb.className.toUpperCase()})에게 처치됨`;
      killerEl.innerHTML = killerText;
      // Q-5: 플레이어에게 죽은 경우 복수 안내 표시
      if (kb.id) {
        killerEl.innerHTML += `<br><span style="color:#ff4444;font-size:${isMob ? '11' : '12'}px">⚔ 복수 시 보너스 XP!</span>`;
      }
    } else if (killerEl) {
      killerEl.textContent = '';
    }

    // 관전 모드 활성화
    if (lastState) {
      const teammates = lastState.players.filter(p => p.team === myTeam && p.alive && p.id !== myId);
      if (teammates.length > 0) {
        spectateIndex = 0;
        spectateTarget = teammates[0].id;
        updateSpectateInfo(teammates[0]);
      } else {
        spectateTarget = null;
        updateSpectateInfo(null);
      }
    }

    respawnBtn.classList.add('hidden');

    let countdown = 5;
    deathTimer.textContent = `리스폰까지 ${countdown}초...`;
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        deathTimer.textContent = '';
        respawnBtn.classList.remove('hidden');
      } else {
        deathTimer.textContent = `리스폰까지 ${countdown}초...`;
      }
    }, 1000);
  }

  function updateSpectateInfo(target) {
    const el = document.getElementById('spectateInfo');
    if (!el) return;
    if (target) {
      const isMob = typeof Mobile !== 'undefined' && Mobile.isMobile();
      if (isMob) {
        el.textContent = `👁 ${target.name} — 탭하여 전환`;
      } else {
        el.textContent = `👁 관전: ${target.name} (${target.className.toUpperCase()}) — 클릭으로 전환`;
      }
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  // ── 게임 루프 ──
  const INPUT_SEND_RATE = 50;
  let lastInputSend = 0;

  function gameLoop(timestamp) {
    if (!joined) return;

    const state = Interpolation.getInterpolatedState();
    if (state) {
      // 관전 모드: 죽었고 타겟이 있으면 해당 타겟의 시점으로 카메라 이동
      let renderTargetId = myId;
      if (!alive && spectateTarget && state) {
        const target = state.players.find(p => p.id === spectateTarget);
        if (target && target.alive) {
          renderTargetId = spectateTarget;
        } else {
          // 관전 대상이 죽었으면 다음 팀원으로 자동 전환
          const teammates = state.players.filter(p => p.team === myTeam && p.alive && p.id !== myId);
          if (teammates.length > 0) {
            spectateIndex = 0;
            spectateTarget = teammates[0].id;
            renderTargetId = spectateTarget;
            updateSpectateInfo(teammates[0]);
          } else {
            spectateTarget = null;
            renderTargetId = myId;
            updateSpectateInfo(null);
          }
        }
      }
      Renderer.render(state, renderTargetId);
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

    // 라운드 종료 체크
    if (lastState) {
      const remaining = lastState.roundDuration - lastState.roundElapsed;
      if (remaining <= 0 && remaining > -3000 && !roundEndShown) {
        showRoundEnd(lastState);
      }
      if (remaining > 10000) {
        roundEndShown = false;
      }
    }

    requestAnimationFrame(gameLoop);
  }

  let roundEndShown = false;

  function showRoundEnd(state) {
    if (roundEndShown) return;
    roundEndShown = true;

    const samScore = (state.territoryScore && state.territoryScore.samsung) || 0;
    const skhScore = (state.territoryScore && state.territoryScore.skhynix) || 0;
    const samKills = state.teamKills.samsung || 0;
    const skhKills = state.teamKills.skhynix || 0;
    const samCaptures = (state.teamCaptures && state.teamCaptures.samsung) || 0;
    const skhCaptures = (state.teamCaptures && state.teamCaptures.skhynix) || 0;

    let resultText, resultColor;
    if (samScore > skhScore) {
      resultText = 'SAMSUNG WINS!';
      resultColor = '#1e64ff';
    } else if (skhScore > samScore) {
      resultText = 'SK HYNIX WINS!';
      resultColor = '#ff3250';
    } else if (samCaptures > skhCaptures) {
      resultText = 'SAMSUNG WINS! (tiebreak: captures)';
      resultColor = '#1e64ff';
    } else if (skhCaptures > samCaptures) {
      resultText = 'SK HYNIX WINS! (tiebreak: captures)';
      resultColor = '#ff3250';
    } else if (samKills > skhKills) {
      resultText = 'SAMSUNG WINS! (tiebreak: kills)';
      resultColor = '#1e64ff';
    } else if (skhKills > samKills) {
      resultText = 'SK HYNIX WINS! (tiebreak: kills)';
      resultColor = '#ff3250';
    } else {
      resultText = 'DRAW!';
      resultColor = '#ffd700';
    }

    roundResult.textContent = resultText;
    roundResult.style.color = resultColor;
    roundStats.innerHTML = `
      <div style="margin-bottom:8px;font-size:14px;color:#ffd700">TERRITORY SCORE</div>
      <div><span style="color:#1e64ff">SAMSUNG</span>: ${samScore} pts | ${samCaptures} captures | ${samKills} kills</div>
      <div><span style="color:#ff3250">SK HYNIX</span>: ${skhScore} pts | ${skhCaptures} captures | ${skhKills} kills</div>
    `;
    roundEndScreen.classList.remove('hidden');
  }

  // ── 모바일 버튼 핸들러 ──
  function initMobileButtons() {
    if (!Mobile.isMobile()) return;

    // 로비 컨트롤 힌트 변경
    const hint = document.getElementById('controlsHint');
    if (hint) hint.textContent = '터치 이동 · 자동 전투 · 상단 아이콘 탭';

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
