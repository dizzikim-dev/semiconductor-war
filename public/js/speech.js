// Monster Speech Bubbles — proximity-triggered random dialogue
const Speech = (() => {
  // ─── 보스 대사 ───
  const BOSS_LINES = {
    NVIDIA: [
      'CUDA 코어의 힘을 보여주지!',
      'GPU는 역시 우리가 최고다.',
      'Jensen이 안부를 전한다.',
      '병렬 연산으로 밀어붙여!',
      'AI 시대의 왕이 왔다.',
    ],
    Apple: [
      '디자인이 곧 성능이다.',
      'Think Different.',
      'M시리즈 칩의 위엄을 봐라.',
      '생태계를 벗어날 수 없다.',
    ],
    TSMC: [
      '파운드리의 왕이다.',
      '2nm 공정은 아무나 하나?',
      '순수 제조의 자존심!',
      '너희 칩도 결국 내가 만든다.',
      'N2 공정이 기다리고 있지.',
    ],
    Google: [
      '세상의 모든 데이터가 내 것!',
      'TPU의 힘을 느껴봐라.',
      '검색하면 다 나온다.',
      '클라우드가 곧 힘이다.',
    ],
    META: [
      '메타버스에서 다시 만나자.',
      '연결이 곧 힘이다!',
      'SNS 없는 세상을 상상해봐.',
      'Reality Labs가 미래다.',
    ],
  };

  // ─── 중립몹 대사 ───
  const MOB_LINES = {
    photon: [
      '...!',
      '빛보다 빠르게!',
      '건드리지 마...!',
    ],
    dopant: [
      '불순물이라고 무시하지 마.',
      '반도체엔 내가 필수야.',
      '이온 주입 시작한다!',
      '농도 조절이 핵심이지.',
    ],
    alpha: [
      '건드리면 후회한다.',
      '알파 입자의 에너지를 맛봐라!',
      '방사선은 무섭지 않냐?',
      '소프트 에러의 원흉이 바로 나다.',
      '이 구역의 터줏대감이다.',
    ],
  };

  const PROXIMITY = 200;           // 감지 거리 (px)
  const COOLDOWN = 45000;          // 같은 개체 쿨다운 (45s)
  const FADE_IN = 250;             // ms
  const HOLD = 2500;               // ms
  const FADE_OUT = 400;            // ms
  const TOTAL = FADE_IN + HOLD + FADE_OUT;

  // { entityKey: lastShownTs }
  const cooldowns = {};
  // 활성 말풍선 목록 (다수 동시 가능)
  let activeBubbles = [];

  // ─── 유틸 ───
  const _dist = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const _onCooldown = (key, now) => cooldowns[key] && (now - cooldowns[key]) < COOLDOWN;

  // ─── 메인 업데이트 ───
  const update = (state, myId, camera, canvas, ctx) => {
    if (!state || !ctx) return;
    const me = state.players && state.players.find(p => p.id === myId);
    if (!me || !me.alive) { activeBubbles = []; return; }

    const now = Date.now();

    // 보스 근접 체크
    if (state.monsters) {
      for (const mon of state.monsters) {
        if (!mon.alive) continue;
        const d = _dist(me.x, me.y, mon.x, mon.y);
        const key = `boss_${mon.typeName}_${mon.id || mon.typeName}`;
        if (d < PROXIMITY && !_onCooldown(key, now) && BOSS_LINES[mon.typeName]) {
          cooldowns[key] = now;
          activeBubbles.push({
            text: _pick(BOSS_LINES[mon.typeName]),
            targetType: 'boss',
            targetId: mon.id || mon.typeName,
            typeName: mon.typeName,
            startTime: now,
          });
        }
      }
    }

    // 중립몹 근접 체크
    if (state.neutralMobs) {
      for (const nm of state.neutralMobs) {
        const d = _dist(me.x, me.y, nm.x, nm.y);
        const key = `mob_${nm.type}_${nm.id}`;
        if (d < PROXIMITY && !_onCooldown(key, now) && MOB_LINES[nm.type]) {
          cooldowns[key] = now;
          activeBubbles.push({
            text: _pick(MOB_LINES[nm.type]),
            targetType: 'mob',
            targetId: nm.id,
            mobType: nm.type,
            startTime: now,
          });
        }
      }
    }

    // 만료된 버블 제거
    activeBubbles = activeBubbles.filter(b => (now - b.startTime) < TOTAL);

    // 렌더링
    if (activeBubbles.length === 0) return;
    _drawBubbles(state, ctx, camera, canvas, now);
  };

  // ─── 말풍선 렌더링 ───
  const _drawBubbles = (state, ctx, camera, canvas, now) => {
    const isMob = typeof Mobile !== 'undefined' && Mobile.isMobile();
    const zoom = isMob ? 0.8 : 1;
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;

    for (const b of activeBubbles) {
      // 대상의 현재 위치 찾기
      let wx, wy, color;
      if (b.targetType === 'boss') {
        const mon = state.monsters && state.monsters.find(
          m => (m.id || m.typeName) === b.targetId && m.alive
        );
        if (!mon) continue;
        wx = mon.x;
        wy = mon.y - (mon.radius || 30) - 18;
        color = mon.color || '#76b900';
      } else {
        const nm = state.neutralMobs && state.neutralMobs.find(m => m.id === b.targetId);
        if (!nm) continue;
        wx = nm.x;
        wy = nm.y - (nm.radius || 10) - 14;
        color = nm.color || '#e8d44d';
      }

      // 알파 계산
      const elapsed = now - b.startTime;
      let alpha;
      if (elapsed < FADE_IN) {
        alpha = elapsed / FADE_IN;
      } else if (elapsed < FADE_IN + HOLD) {
        alpha = 1;
      } else {
        alpha = 1 - (elapsed - FADE_IN - HOLD) / FADE_OUT;
      }
      if (alpha <= 0) continue;

      // 월드 → 스크린 좌표
      const sx = (wx - camera.x) * zoom + vw / 2;
      const sy = (wy - camera.y) * zoom + vh / 2;

      // 화면 밖이면 건너뛰기
      if (sx < -150 || sx > vw + 150 || sy < -50 || sy > vh + 50) continue;

      ctx.save();

      const fontSize = isMob ? 9 : 11;
      ctx.font = `bold ${fontSize}px 'Share Tech Mono', monospace`;
      const textWidth = ctx.measureText(b.text).width;
      const padX = 8, padY = 5;
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      let boxX = sx - boxW / 2;
      const boxY = sy - boxH;

      // 화면 클램핑
      if (boxX < 4) boxX = 4;
      if (boxX + boxW > vw - 4) boxX = vw - 4 - boxW;

      // 말풍선 꼬리 (삼각형)
      const tailX = sx;
      const tailY = boxY + boxH;

      // 배경
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = '#0a0e17';
      ctx.beginPath();
      _roundRect(ctx, boxX, boxY, boxW, boxH, 5);
      ctx.fill();

      // 꼬리
      ctx.beginPath();
      ctx.moveTo(tailX - 5, tailY);
      ctx.lineTo(tailX, tailY + 6);
      ctx.lineTo(tailX + 5, tailY);
      ctx.closePath();
      ctx.fill();

      // 테두리
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      _roundRect(ctx, boxX, boxY, boxW, boxH, 5);
      ctx.stroke();

      // 꼬리 테두리
      ctx.beginPath();
      ctx.moveTo(tailX - 5, tailY);
      ctx.lineTo(tailX, tailY + 6);
      ctx.lineTo(tailX + 5, tailY);
      ctx.stroke();

      // 텍스트
      ctx.globalAlpha = alpha * 0.95;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, boxX + boxW / 2, boxY + boxH / 2);

      ctx.restore();
    }
  };

  const _roundRect = (ctx, x, y, w, h, r) => {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  };

  return { update };
})();
