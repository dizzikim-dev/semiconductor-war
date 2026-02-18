// Educational Tooltips — proximity-based semiconductor knowledge popups
const Tooltips = (() => {
  // i18n 키 목록 — 실제 텍스트는 locales/ko.json, en.json의 "tooltip" 섹션
  const TOOLTIP_KEYS = [
    'portal_via', 'boss_chamber', 'power_rail_VDD', 'power_rail_VSS',
    'connector_boost',
    'obstacle_CELL', 'obstacle_TAP', 'obstacle_VIA', 'obstacle_BUF',
    'obstacle_DIE', 'obstacle_PCM',
    'mob_photon', 'mob_dopant', 'mob_alpha',
    'pickup_WAFER', 'pickup_EUV', 'pickup_TSV_BOOSTER',
    'pickup_PHOTORESIST', 'pickup_CMP_PAD',
    'cell_turret',
    'boss_NVIDIA', 'boss_Apple', 'boss_TSMC', 'boss_Google', 'boss_META',
  ];

  /** i18n을 통해 현재 로케일의 툴팁 텍스트를 가져온다 */
  const _getText = (id) => {
    if (typeof I18n !== 'undefined') {
      const val = I18n.t(`tooltip.${id}`);
      if (val !== `tooltip.${id}`) return val;
    }
    return null; // 번역 없으면 표시 안 함
  };

  /** 해당 id가 유효한 툴팁인지 */
  const _hasTooltip = (id) => TOOLTIP_KEYS.includes(id);

  const PROXIMITY = 150;           // px — show tooltip when within this range
  const COOLDOWN = 20000;          // ms — per-tooltip cooldown (20초)
  const FADE_IN = 300;             // ms
  const HOLD = 3000;               // ms
  const FADE_OUT = 500;            // ms

  const cooldowns = {};            // { tooltipId: lastShownTs }
  let activeTooltip = null;        // { id, text, x, y, phase, timer }

  const update = (state, myId, camera, canvas, ctx) => {
    if (!state || !ctx) return;
    const me = state.players.find(p => p.id === myId);
    if (!me || !me.alive) { activeTooltip = null; return; }

    // Suppress during combat
    if (me.autoTargetId) { activeTooltip = null; return; }

    const now = Date.now();

    // If active tooltip exists, progress its lifecycle
    if (activeTooltip) {
      const elapsed = now - activeTooltip.startTime;
      if (elapsed < FADE_IN) {
        activeTooltip.alpha = elapsed / FADE_IN;
      } else if (elapsed < FADE_IN + HOLD) {
        activeTooltip.alpha = 1;
      } else if (elapsed < FADE_IN + HOLD + FADE_OUT) {
        activeTooltip.alpha = 1 - (elapsed - FADE_IN - HOLD) / FADE_OUT;
      } else {
        activeTooltip = null;
        return;
      }
      _drawTooltip(ctx, camera, canvas);
      return;
    }

    // Find nearest tooltippable entity
    let best = null;
    let bestDist = PROXIMITY;

    // Obstacles
    const mc = state.mapConfig;
    if (mc && mc.obstacles) {
      for (const obs of mc.obstacles) {
        const cx = obs.x + obs.w / 2;
        const cy = obs.y + obs.h / 2;
        const d = _dist(me, cx, cy);
        if (d < bestDist) {
          const id = `obstacle_${obs.label}`;
          if (_hasTooltip(id) && !_onCooldown(id, now)) {
            bestDist = d; best = { id, x: cx, y: cy - 30 };
          }
        }
      }
    }

    // Portals
    if (mc && mc.portals) {
      for (const p of mc.portals) {
        const d = _dist(me, p.x, p.y);
        if (d < bestDist && !_onCooldown('portal_via', now)) {
          bestDist = d; best = { id: 'portal_via', x: p.x, y: p.y - 40 };
        }
      }
    }

    // Connectors
    if (mc && mc.connectors) {
      for (const c of mc.connectors) {
        const d = _dist(me, c.x, c.y);
        if (d < bestDist && !_onCooldown('connector_boost', now)) {
          bestDist = d; best = { id: 'connector_boost', x: c.x, y: c.y - 40 };
        }
      }
    }

    // Boss chamber
    if (mc && mc.boss) {
      const d = _dist(me, mc.boss.center.x, mc.boss.center.y);
      if (d < mc.boss.radius + 50 && d < bestDist && !_onCooldown('boss_chamber', now)) {
        bestDist = d; best = { id: 'boss_chamber', x: mc.boss.center.x, y: mc.boss.center.y - mc.boss.radius - 20 };
      }
    }

    // Neutral mobs
    if (state.neutralMobs) {
      for (const nm of state.neutralMobs) {
        const d = _dist(me, nm.x, nm.y);
        const id = `mob_${nm.type}`;
        if (d < bestDist && _hasTooltip(id) && !_onCooldown(id, now)) {
          bestDist = d; best = { id, x: nm.x, y: nm.y - nm.radius - 20 };
        }
      }
    }

    // Pickups
    if (state.pickups) {
      for (const pk of state.pickups) {
        const d = _dist(me, pk.x, pk.y);
        const id = `pickup_${pk.type}`;
        if (d < bestDist && _hasTooltip(id) && !_onCooldown(id, now)) {
          bestDist = d; best = { id, x: pk.x, y: pk.y - 24 };
        }
      }
    }

    // Cell turrets
    if (state.cells) {
      for (const cell of state.cells) {
        const d = _dist(me, cell.x, cell.y);
        if (d < bestDist && !_onCooldown('cell_turret', now)) {
          bestDist = d; best = { id: 'cell_turret', x: cell.x, y: cell.y - cell.radius - 24 };
        }
      }
    }

    // Boss monsters
    if (state.monsters) {
      for (const mon of state.monsters) {
        if (!mon.alive) continue;
        const d = _dist(me, mon.x, mon.y);
        const id = `boss_${mon.typeName}`;
        if (d < bestDist && _hasTooltip(id) && !_onCooldown(id, now)) {
          bestDist = d; best = { id, x: mon.x, y: mon.y - mon.radius - 24 };
        }
      }
    }

    if (best) {
      const text = _getText(best.id);
      if (!text) return; // 번역 없으면 표시 안 함
      cooldowns[best.id] = now;
      activeTooltip = {
        id: best.id,
        text,
        worldX: best.x,
        worldY: best.y,
        startTime: now,
        alpha: 0,
      };
    }
  };

  const _isMob = () => typeof Mobile !== 'undefined' && Mobile.isMobile();

  const _drawTooltip = (ctx, camera, canvas) => {
    if (!activeTooltip) return;
    const tt = activeTooltip;
    const isMob = _isMob();
    const zoom = isMob ? 0.8 : 1;

    // DPR 보정: canvas.width는 devicePixel 크기, 그리기 좌표는 CSS 픽셀
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;

    // World → screen coordinates (zoom + DPR 보정)
    const sx = (tt.worldX - camera.x) * zoom + vw / 2;
    const sy = (tt.worldY - camera.y) * zoom + vh / 2;

    // Off-screen check (CSS 픽셀 기준)
    if (sx < -100 || sx > vw + 100 || sy < -50 || sy > vh + 50) return;

    ctx.save();

    const fontSize = isMob ? 8 : 9;
    const maxW = isMob ? vw * 0.65 : vw * 0.8;
    ctx.font = `${fontSize}px Share Tech Mono`;

    // 텍스트가 maxW를 초과하면 잘라내기
    let displayText = tt.text;
    let textWidth = ctx.measureText(displayText).width;
    if (textWidth > maxW) {
      while (textWidth > maxW && displayText.length > 10) {
        displayText = displayText.slice(0, -2);
        textWidth = ctx.measureText(displayText + '...').width;
      }
      displayText += '...';
      textWidth = ctx.measureText(displayText).width;
    }

    const padX = 6, padY = 4;
    const boxW = textWidth + padX * 2;
    const boxH = fontSize + padY * 2;
    let boxX = sx - boxW / 2;
    const boxY = sy - boxH - 8;

    // 화면 밖으로 나가지 않도록 클램핑
    if (boxX < 4) boxX = 4;
    if (boxX + boxW > vw - 4) boxX = vw - 4 - boxW;

    // Background
    ctx.globalAlpha = tt.alpha * 0.75;
    ctx.fillStyle = '#0a0e17';
    ctx.beginPath();
    _roundRect(ctx, boxX, boxY, boxW, boxH, 4);
    ctx.fill();

    // Border
    ctx.globalAlpha = tt.alpha * 0.4;
    ctx.strokeStyle = '#3a8bff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    _roundRect(ctx, boxX, boxY, boxW, boxH, 4);
    ctx.stroke();

    // Text
    ctx.globalAlpha = tt.alpha * 0.9;
    ctx.fillStyle = '#c0d8ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, boxX + boxW / 2, boxY + boxH / 2);

    ctx.restore();
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

  const _dist = (me, x, y) => {
    const dx = me.x - x, dy = me.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const _onCooldown = (id, now) => {
    return cooldowns[id] && (now - cooldowns[id]) < COOLDOWN;
  };

  return { update };
})();
