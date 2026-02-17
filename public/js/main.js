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

  const socket = io();
  let myId = null;
  let myTeam = null;
  let acceptedMapId = null;
  let joined = false;
  let alive = true;
  let lastState = null;
  let evolveReady = false;

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

  let selectedTeam = 'samsung';
  const selectedMapId = 'map_tribus_circuit';

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

    startScreen.classList.add('hidden');
    deathScreen.classList.add('hidden');
    if (evolveOverlay) evolveOverlay.classList.add('hidden');
    Renderer.init(canvas);
    Input.init(canvas);
    HUD.init();
    HUD.show();
    Chat.init(socket, myTeam);
    if (typeof Mobile !== 'undefined') {
      Mobile.init();
      initMobileButtons();
    }
    requestAnimationFrame(gameLoop);
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
    console.log(`[Client] Evolved to ${className} (Lv.${level})`);
  });

  // 리스폰
  respawnBtn.addEventListener('click', () => {
    socket.emit('player_respawn');
    deathScreen.classList.add('hidden');
    alive = true;
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
    socket.connect();
  });

  // 라운드 종료 후 계속
  continueBtn.addEventListener('click', () => {
    roundEndScreen.classList.add('hidden');
  });

  // ── 스냅샷 수신 ──
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
      } else if (me && me.alive && !alive) {
        alive = true;
        Chat.setPlayerAlive(true);
        deathScreen.classList.add('hidden');
      }

      // 진화 가능 상태 추적
      if (me && me.evolveReady && !evolveReady) {
        evolveReady = true;
        if (evolveOverlay) evolveOverlay.classList.remove('hidden');
        if (typeof Mobile !== 'undefined') Mobile.showEvolveButton(true);
      } else if (me && !me.evolveReady) {
        evolveReady = false;
        if (typeof Mobile !== 'undefined') Mobile.showEvolveButton(false);
      }
    }
  });

  // 사망 화면
  function showDeathScreen(me) {
    deathScreen.classList.remove('hidden');
    if (evolveOverlay) evolveOverlay.classList.add('hidden');
    deathInfo.textContent = `K: ${me.kills} / D: ${me.deaths}`;
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

  // ── 게임 루프 ──
  const INPUT_SEND_RATE = 50;
  let lastInputSend = 0;

  function gameLoop(timestamp) {
    if (!joined) return;

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
