// Canvas 렌더링: 카메라, 맵별 엔티티, 파티클, 미니맵
const Renderer = (() => {
  let canvas, ctx;
  let camera = { x: 0, y: 0 };
  let currentMapConfig = null;

  const TEAM_COLORS = { samsung: '#1e64ff', skhynix: '#ff3250' };
  const TEAM_COLORS_LIGHT = { samsung: '#5a9bff', skhynix: '#ff6b80' };

  // 클래스별 색상 (보조 컬러)
  const CLASS_ACCENT = {
    resistor: '#a0aec0',
    capacitor: '#fbbf24',
    repeater: '#34d399',
  };

  const particles = [];
  const pulseEffects = [];

  // 데미지 고스트 HP 추적 (플레이어별)
  const ghostHpMap = {};          // { playerId: { ghost: number, lastHp: number } }
  const GHOST_DECAY_SPEED = 60;   // HP/s — 고스트 바가 줄어드는 속도
  const GHOST_HOLD_MS = 400;      // 데미지 후 빨간 바가 유지되는 시간
  const ghostHoldTimers = {};     // { playerId: ms remaining }
  let lastRenderTs = 0;
  let renderDt = 0;               // 초 단위

  const init = (canvasEl) => {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  };

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const getCamera = () => camera;

  let currentMarketData = null;

  // 모바일 줌 (0.65 = 더 멀리서 봄)
  const _isMobileDevice = () => typeof Mobile !== 'undefined' && Mobile.isMobile();
  const MOBILE_ZOOM = 0.65;

  const render = (state, myId) => {
    if (!state) return;
    const now = performance.now();
    renderDt = lastRenderTs ? Math.min((now - lastRenderTs) / 1000, 0.1) : 1 / 60;
    lastRenderTs = now;
    currentMapConfig = state.mapConfig;
    currentMarketData = state.marketData || null;
    const mapW = currentMapConfig ? currentMapConfig.world.width : 2400;
    const mapH = currentMapConfig ? currentMapConfig.world.height : 1600;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const me = state.players.find(p => p.id === myId);
    if (me) { camera.x = me.x; camera.y = me.y; }

    const zoom = _isMobileDevice() ? MOBILE_ZOOM : 1;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);

    drawGrid(mapW, mapH);

    // 맵별 렌더링
    if (currentMapConfig) {
      if (currentMapConfig.id === 'map_tribus_circuit') {
        drawTriBusMap(currentMapConfig, mapW, mapH);
      } else if (currentMapConfig.id === 'map_wafer_ring') {
        drawWaferRingMap(currentMapConfig, state);
      }
      drawObstacles(currentMapConfig.obstacles);
      drawPortals(currentMapConfig.portals, currentMapConfig.portalRadius);
      if (currentMapConfig.connectors) drawConnectors(currentMapConfig.connectors, currentMapConfig);
    }

    drawSpawnAreas(currentMapConfig);
    if (state.eventZones) drawEventZones(state.eventZones);
    if (state.hazardZones && state.hazardZones.length > 0) drawHazardZones(state.hazardZones);
    if (state.cells) drawCells(state.cells, myId);
    drawPickups(state.pickups);
    if (state.neutralMobs) drawNeutralMobs(state.neutralMobs);
    drawMinions(state.minions);
    drawMonsters(state.monsters);
    if (state.bossBullets) drawBossBullets(state.bossBullets);
    if (state.bossDrones) drawBossDrones(state.bossDrones);
    drawBullets(state.bullets);
    drawPulseEffects();
    drawPlayers(state.players, myId, state.teamBuffs);
    drawMapBorder(mapW, mapH);

    ctx.restore();

    updateAndDrawParticles();
    drawMinimap(state, myId, mapW, mapH);

    // Educational tooltips (screen-space, after restore)
    if (typeof Tooltips !== 'undefined') {
      Tooltips.update(state, myId, camera, canvas, ctx);
    }
  };

  // ═══════════════════════════════════════════
  // MAP 1: TRI-BUS CIRCUIT
  // ═══════════════════════════════════════════
  const drawTriBusMap = (mc, mapW, mapH) => {
    // ── 회로 기판 배경 패턴: 솔더 패드 + 트레이스 라인 ──
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 0.5;
    const padStep = 100;
    for (let gx = 0; gx <= mapW; gx += padStep) {
      for (let gy = 0; gy <= mapH; gy += padStep) {
        // 노드 점 (솔더 패드)
        ctx.fillStyle = SCHEMATIC_COLOR;
        ctx.beginPath();
        ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 불규칙 트레이스 라인 (일부만)
        if ((gx + gy) % 300 === 0) {
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + padStep * 0.6, gy);
          ctx.stroke();
        }
        if ((gx + gy) % 500 === 0) {
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy + padStep * 0.4);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Power rails (VDD/VSS) — 전원 기호 포함
    if (mc.decorations && mc.decorations.powerRails) {
      for (const rail of mc.decorations.powerRails) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = rail.color;
        ctx.fillRect(0, rail.y - 8, mapW, 16);

        // 전원 기호 (VDD: 위 화살표 / VSS: 접지)
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = rail.color;
        ctx.lineWidth = 2;
        if (rail.label === 'VDD') {
          // VDD 기호: 위쪽 화살표 + 수평선
          for (let sx = 80; sx < mapW; sx += 400) {
            ctx.beginPath();
            ctx.moveTo(sx, rail.y + 6); ctx.lineTo(sx, rail.y - 6);
            ctx.moveTo(sx - 8, rail.y - 2); ctx.lineTo(sx, rail.y - 8); ctx.lineTo(sx + 8, rail.y - 2);
            ctx.stroke();
          }
        } else {
          // VSS 접지 기호: 3단 점감선
          for (let sx = 80; sx < mapW; sx += 400) {
            ctx.beginPath();
            ctx.moveTo(sx, rail.y - 6); ctx.lineTo(sx, rail.y);
            ctx.moveTo(sx - 10, rail.y); ctx.lineTo(sx + 10, rail.y);
            ctx.moveTo(sx - 6, rail.y + 4); ctx.lineTo(sx + 6, rail.y + 4);
            ctx.moveTo(sx - 2, rail.y + 8); ctx.lineTo(sx + 2, rail.y + 8);
            ctx.stroke();
          }
        }

        ctx.globalAlpha = 0.45;
        ctx.font = '10px Share Tech Mono';
        ctx.fillStyle = rail.color;
        ctx.textAlign = 'left';
        ctx.fillText(rail.label, 10, rail.y + 4);
        ctx.restore();
      }
    }

    // Clock spine — 구형파(square wave) 데코 포함
    if (mc.decorations && mc.decorations.clockSpine) {
      const cs = mc.decorations.clockSpine;
      ctx.save();
      // 메인 클럭 라인
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = cs.color;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(cs.x, cs.y1);
      ctx.lineTo(cs.x, cs.y2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 구형파 패턴 (클럭 시그널 시각화)
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = cs.color;
      ctx.lineWidth = 1.5;
      const waveX = cs.x + 12;
      const amp = 8, period = 40;
      ctx.beginPath();
      for (let wy = cs.y1 + 30; wy < cs.y2 - 30; wy += period) {
        ctx.moveTo(waveX, wy);
        ctx.lineTo(waveX, wy + amp);        // down
        ctx.lineTo(waveX + amp, wy + amp);   // right
        ctx.lineTo(waveX + amp, wy);          // up
        ctx.lineTo(waveX + amp * 2, wy);      // right
        ctx.lineTo(waveX + amp * 2, wy + amp);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.font = '9px Share Tech Mono';
      ctx.fillStyle = cs.color;
      ctx.textAlign = 'center';
      ctx.fillText('CLK SPINE', cs.x, cs.y1 - 4);
      ctx.restore();
    }

    // 3 lanes (bus routing channels) — 메탈 레이어 느낌 강화
    if (mc.lanes) {
      for (const lane of mc.lanes) {
        ctx.save();
        const y1 = lane.centerY - lane.halfWidth;
        const y2 = lane.centerY + lane.halfWidth;

        // Lane background
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = '#3a8bff';
        ctx.fillRect(0, y1, mapW, lane.halfWidth * 2);

        // Lane border (routing channel, 이중선)
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = '#3a8bff';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y1); ctx.lineTo(mapW, y1);
        ctx.moveTo(0, y2); ctx.lineTo(mapW, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 메탈 트레이스 데코 (레인 내부 수평 실선들)
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = '#3a8bff';
        ctx.lineWidth = 0.5;
        for (let ty = y1 + 15; ty < y2; ty += 30) {
          ctx.beginPath();
          ctx.moveTo(0, ty); ctx.lineTo(mapW, ty);
          ctx.stroke();
        }

        // Lane label
        ctx.globalAlpha = 0.25;
        ctx.font = '10px Share Tech Mono';
        ctx.fillStyle = '#3a8bff';
        ctx.textAlign = 'right';
        ctx.fillText(`BUS:${lane.id.toUpperCase()}`, mapW - 10, lane.centerY + 4);
        ctx.restore();
      }
    }

    // Boss chamber — 회로 기호 느낌 강화 (Op-Amp 삼각형 + 원)
    if (mc.boss) {
      ctx.save();
      const bx = mc.boss.center.x, by = mc.boss.center.y, br = mc.boss.radius;
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 내부 Op-Amp 삼각형 데코
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      const triSize = br * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx - triSize, by - triSize * 0.8);
      ctx.lineTo(bx + triSize, by);
      ctx.lineTo(bx - triSize, by + triSize * 0.8);
      ctx.closePath();
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.font = '11px Orbitron';
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText('CLOCK ROOT BUFFER', bx, by - br - 8);
      ctx.restore();
    }
  };

  // ═══════════════════════════════════════════
  // MAP 2: WAFER RING ARENA
  // ═══════════════════════════════════════════
  const drawWaferRingMap = (mc, state) => {
    const arena = mc.arena;
    if (!arena) return;
    const cx = arena.center.x;
    const cy = arena.center.y;

    // Wafer edge — 이중 원(wafer rim 느낌)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#c0c0c0';
    ctx.beginPath();
    ctx.arc(cx, cy, arena.mainRadius, 0, Math.PI * 2);
    ctx.fill();
    // 외곽 이중선
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, arena.mainRadius - 6, 0, Math.PI * 2);
    ctx.stroke();

    // Wafer flat notch (강화: V자형 노치)
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#0a0e17';
    ctx.beginPath();
    const notchW = 25, notchD = 18;
    ctx.moveTo(cx - notchW, cy - arena.mainRadius);
    ctx.lineTo(cx, cy - arena.mainRadius + notchD);
    ctx.lineTo(cx + notchW, cy - arena.mainRadius);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Outer ring event zone sectors
    if (mc.zones) {
      for (const zone of mc.zones) {
        const isActive = state.activeZoneId === zone.id && !state.zoneCleansed;
        ctx.save();
        ctx.globalAlpha = isActive ? 0.15 : 0.03;
        ctx.fillStyle = isActive ? '#ff3250' : '#4a5568';
        ctx.beginPath();
        ctx.arc(cx, cy, arena.outerRingOuter, zone.angleStart, zone.angleEnd);
        ctx.arc(cx, cy, arena.outerRingInner, zone.angleEnd, zone.angleStart, true);
        ctx.closePath();
        ctx.fill();

        if (isActive) {
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = '#ff3250';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Sector label
        ctx.globalAlpha = 0.25;
        const midAngle = (zone.angleStart + zone.angleEnd) / 2;
        const labelR = (arena.outerRingInner + arena.outerRingOuter) / 2;
        ctx.font = '8px Share Tech Mono';
        ctx.fillStyle = isActive ? '#ff6b80' : '#4a5568';
        ctx.textAlign = 'center';
        ctx.fillText(zone.id, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);
        ctx.restore();
      }
    }

    // Inner combat zone
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, arena.innerCombatRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Die grid pattern (강화: 내부 미세 회로 트레이스 + scribe line) ──
    ctx.save();
    const gridStep = 80;
    for (let gx = cx - arena.mainRadius; gx <= cx + arena.mainRadius; gx += gridStep) {
      for (let gy = cy - arena.mainRadius; gy <= cy + arena.mainRadius; gy += gridStep) {
        const dist = Math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2);
        if (dist < arena.mainRadius - 20) {
          // Die 셀 테두리 (scribe line)
          ctx.globalAlpha = 0.06;
          ctx.strokeStyle = '#6b7a8d';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(gx, gy, gridStep, gridStep);

          // 내부 미세 회로 트레이스 (die 안의 IC 패턴)
          ctx.globalAlpha = 0.025;
          ctx.strokeStyle = SCHEMATIC_COLOR;
          ctx.lineWidth = 0.5;
          const seed = (gx * 7 + gy * 13) % 17;
          // 수평 트레이스
          if (seed > 3) {
            ctx.beginPath();
            ctx.moveTo(gx + 8, gy + gridStep * 0.3);
            ctx.lineTo(gx + gridStep * 0.6, gy + gridStep * 0.3);
            ctx.stroke();
          }
          // 수직 트레이스
          if (seed > 7) {
            ctx.beginPath();
            ctx.moveTo(gx + gridStep * 0.7, gy + 8);
            ctx.lineTo(gx + gridStep * 0.7, gy + gridStep * 0.5);
            ctx.stroke();
          }
          // L자 트레이스
          if (seed > 11) {
            ctx.beginPath();
            ctx.moveTo(gx + gridStep * 0.2, gy + gridStep * 0.7);
            ctx.lineTo(gx + gridStep * 0.5, gy + gridStep * 0.7);
            ctx.lineTo(gx + gridStep * 0.5, gy + gridStep * 0.9);
            ctx.stroke();
          }
          // 패드 점
          if (seed > 5) {
            ctx.fillStyle = SCHEMATIC_COLOR;
            ctx.globalAlpha = 0.03;
            ctx.beginPath();
            ctx.arc(gx + gridStep * 0.5, gy + gridStep * 0.5, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();

    // Boss chamber — 저항 기호 데코
    if (mc.boss) {
      ctx.save();
      const bx = mc.boss.center.x, by = mc.boss.center.y, br = mc.boss.radius;
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // PCM 저항 지그재그 데코 (내부)
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const zigW = 12, zigH = 15;
      let zx = bx - 36;
      ctx.moveTo(zx, by);
      for (let i = 0; i < 5; i++) {
        const dir = i % 2 === 0 ? -1 : 1;
        ctx.lineTo(zx + zigW / 2, by + dir * zigH);
        ctx.lineTo(zx + zigW, by);
        zx += zigW;
      }
      ctx.stroke();

      ctx.globalAlpha = 0.3;
      ctx.font = '10px Orbitron';
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText('PCM TEST CORE', bx, by - br - 6);
      ctx.restore();
    }
  };

  // ═══════════════════════════════════════════
  // SHARED DRAW FUNCTIONS
  // ═══════════════════════════════════════════

  // 기판 그리드 — 얇은 트레이스 + 교차점 패드
  const drawGrid = (mapW, mapH) => {
    const gridSize = 100;
    // 기본 그리드선 (얇은 트레이스)
    ctx.strokeStyle = '#0f1a28';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= mapW; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapH); ctx.stroke();
    }
    for (let y = 0; y <= mapH; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapW, y); ctx.stroke();
    }
    // 교차점 솔더 패드 (200px 간격)
    ctx.fillStyle = '#1a2a3e';
    for (let x = 0; x <= mapW; x += 200) {
      for (let y = 0; y <= mapH; y += 200) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const drawMapBorder = (mapW, mapH) => {
    // 이중선 보더 (PCB 에지 느낌)
    ctx.strokeStyle = '#2a3a4e';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, mapW, mapH);
    ctx.strokeStyle = '#1a2a3e';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, mapW - 8, mapH - 8);
  };

  // 스폰 영역 — IC 패키지 기호
  const drawSpawnAreas = (mc) => {
    if (!mc || !mc.teamSpawns) return;
    for (const [team, pos] of Object.entries(mc.teamSpawns)) {
      const color = TEAM_COLORS[team];
      const chipW = 160, chipH = 90;
      const pinLen = 14, pinW = 4, pinGap = 18;
      ctx.save();
      ctx.translate(pos.x, pos.y);

      // IC 본체 배경 글로우
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 120, 0, Math.PI * 2);
      ctx.fill();

      // IC 칩 본체 (직사각형)
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(-chipW / 2, -chipH / 2, chipW, chipH);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-chipW / 2, -chipH / 2, chipW, chipH);

      // IC 노치 (좌상단 반원)
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(-chipW / 2, -chipH / 2, 6, 0, Math.PI / 2);
      ctx.stroke();

      // 핀 (양쪽으로 돌출)
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      const pinCount = Math.floor(chipW / pinGap) - 1;
      for (let i = 0; i < pinCount; i++) {
        const px = -chipW / 2 + pinGap + i * pinGap;
        // 상단 핀
        ctx.fillRect(px - pinW / 2, -chipH / 2 - pinLen, pinW, pinLen);
        // 하단 핀
        ctx.fillRect(px - pinW / 2, chipH / 2, pinW, pinLen);
      }
      // 좌우 핀
      const sidePinCount = Math.floor(chipH / pinGap) - 1;
      for (let i = 0; i < sidePinCount; i++) {
        const py = -chipH / 2 + pinGap + i * pinGap;
        // 좌측 핀
        ctx.fillRect(-chipW / 2 - pinLen, py - pinW / 2, pinLen, pinW);
        // 우측 핀
        ctx.fillRect(chipW / 2, py - pinW / 2, pinLen, pinW);
      }

      // 내부 텍스트 (칩 라벨)
      ctx.globalAlpha = 0.6;
      ctx.font = '11px Orbitron';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      const label = team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX';
      ctx.fillText(label, 0, -4);
      ctx.globalAlpha = 0.4;
      ctx.font = '8px Share Tech Mono';
      ctx.fillText('FAB SPAWN', 0, 10);

      // 다이 마크 (1번 핀 표시)
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-chipW / 2 + 12, -chipH / 2 + 12, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  };

  // ═══════════════════════════════════════════
  // OBSTACLES — 회로 기호 스타일
  // ═══════════════════════════════════════════
  const SCHEMATIC_COLOR = '#3a5f8a';
  const SCHEMATIC_GLOW  = '#4a7aad';
  const SCHEMATIC_DIM   = '#1e3450';
  const SCHEMATIC_BG    = 'rgba(10, 14, 23, 0.6)';

  // MOSFET 트랜지스터 (CELL 라벨)
  const _drawMosfet = (cx, cy, w, h) => {
    const scaleX = w / 90, scaleY = h / 150;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, scaleY);
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 2 / Math.min(scaleX, scaleY);
    ctx.globalAlpha = 0.7;

    // Gate 세로 막대
    ctx.beginPath();
    ctx.moveTo(-20, -40); ctx.lineTo(-20, 40);
    ctx.stroke();
    // Gate 입력선
    ctx.beginPath();
    ctx.moveTo(-38, 0); ctx.lineTo(-20, 0);
    ctx.stroke();

    // Channel (점선)
    ctx.beginPath();
    ctx.moveTo(-10, -35); ctx.lineTo(-10, -12);
    ctx.moveTo(-10, -8);  ctx.lineTo(-10, 8);
    ctx.moveTo(-10, 12);  ctx.lineTo(-10, 35);
    ctx.stroke();

    // Source 핀
    ctx.beginPath();
    ctx.moveTo(-10, -28); ctx.lineTo(25, -28);
    ctx.moveTo(25, -28);  ctx.lineTo(25, -50);
    ctx.stroke();
    // Drain 핀
    ctx.beginPath();
    ctx.moveTo(-10, 28); ctx.lineTo(25, 28);
    ctx.moveTo(25, 28);  ctx.lineTo(25, 50);
    ctx.stroke();
    // Body 핀 + 화살표 (N-ch)
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(12, 0);
    ctx.stroke();
    // 화살표
    ctx.beginPath();
    ctx.moveTo(4, -5); ctx.lineTo(12, 0); ctx.lineTo(4, 5);
    ctx.stroke();

    // S/D 라벨
    ctx.globalAlpha = 0.35;
    ctx.font = `${7 / Math.min(scaleX, scaleY)}px Share Tech Mono`;
    ctx.fillStyle = SCHEMATIC_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('S', 30, -48);
    ctx.fillText('D', 30, 55);
    ctx.fillText('G', -38, -8);

    ctx.restore();
  };

  // 접지 기호 (TAP 라벨)
  const _drawGround = (cx, cy, w, h) => {
    const scale = Math.min(w, h) / 100;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 2.5 / scale;
    ctx.globalAlpha = 0.7;

    // 세로선
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(0, 5);
    ctx.stroke();
    // 3단 점감 수평선
    const lines = [
      { y: 5,  halfW: 28 },
      { y: 14, halfW: 18 },
      { y: 23, halfW: 8  },
    ];
    for (const l of lines) {
      ctx.beginPath();
      ctx.moveTo(-l.halfW, l.y); ctx.lineTo(l.halfW, l.y);
      ctx.stroke();
    }
    // 라벨
    ctx.globalAlpha = 0.35;
    ctx.font = `${8 / scale}px Share Tech Mono`;
    ctx.fillStyle = SCHEMATIC_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('GND', 0, -36);
    ctx.restore();
  };

  // 적층 Via (VIA 장애물 라벨)
  const _drawStackedVia = (cx, cy, w, h) => {
    const scale = Math.min(w, h) / 80;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 1.5 / scale;

    // 하층 사각형
    ctx.strokeRect(-18, -12, 36, 30);
    // 상층 사각형 (어긋남)
    ctx.strokeRect(-12, -18, 36, 30);
    // 중앙 원 (via hole)
    ctx.beginPath();
    ctx.arc(3, 3, 8, 0, Math.PI * 2);
    ctx.stroke();
    // 대각선 해칭
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(-12, -18); ctx.lineTo(24, 12);
    ctx.moveTo(-6, -18);  ctx.lineTo(24, 6);
    ctx.stroke();
    // 라벨
    ctx.globalAlpha = 0.35;
    ctx.font = `${7 / scale}px Share Tech Mono`;
    ctx.fillStyle = SCHEMATIC_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('VIA', 3, 28);
    ctx.restore();
  };

  // 버퍼 게이트 (BUF 라벨)
  const _drawBuffer = (cx, cy, w, h) => {
    const scale = Math.min(w, h) / 45;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 2 / scale;
    ctx.globalAlpha = 0.7;

    // 삼각형 ▷
    ctx.beginPath();
    ctx.moveTo(-14, -14); ctx.lineTo(14, 0); ctx.lineTo(-14, 14);
    ctx.closePath();
    ctx.stroke();
    // 입력선
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-14, 0);
    ctx.stroke();
    // 출력선
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(22, 0);
    ctx.stroke();

    ctx.restore();
  };

  // 다이오드 (DIE 라벨)
  const _drawDiode = (cx, cy, w, h) => {
    const scale = Math.min(w, h) / 70;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 2 / scale;
    ctx.globalAlpha = 0.7;

    // 삼각형 (anode →)
    ctx.beginPath();
    ctx.moveTo(-14, -16); ctx.lineTo(14, 0); ctx.lineTo(-14, 16);
    ctx.closePath();
    ctx.stroke();
    // Cathode 바
    ctx.beginPath();
    ctx.moveTo(14, -16); ctx.lineTo(14, 16);
    ctx.stroke();
    // 리드선
    ctx.beginPath();
    ctx.moveTo(-28, 0); ctx.lineTo(-14, 0);
    ctx.moveTo(14, 0);  ctx.lineTo(28, 0);
    ctx.stroke();
    // A/K 라벨
    ctx.globalAlpha = 0.3;
    ctx.font = `${7 / scale}px Share Tech Mono`;
    ctx.fillStyle = SCHEMATIC_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('A', -28, -8);
    ctx.fillText('K', 28, -8);
    ctx.restore();
  };

  // 저항 지그재그 (PCM 라벨)
  const _drawResistor = (cx, cy, w, h) => {
    const scale = Math.min(w, h) / 50;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = SCHEMATIC_COLOR;
    ctx.lineWidth = 2 / scale;
    ctx.globalAlpha = 0.7;

    // 리드선 좌
    ctx.beginPath();
    ctx.moveTo(-28, 0); ctx.lineTo(-18, 0);
    // 지그재그
    const zigW = 6, zigH = 10, segs = 5;
    let x = -18;
    for (let i = 0; i < segs; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      ctx.lineTo(x + zigW / 2, dir * zigH);
      ctx.lineTo(x + zigW, 0);
      x += zigW;
    }
    // 리드선 우
    ctx.lineTo(28, 0);
    ctx.stroke();
    // Ω 라벨
    ctx.globalAlpha = 0.3;
    ctx.font = `${8 / scale}px Share Tech Mono`;
    ctx.fillStyle = SCHEMATIC_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('Ω', 0, -14);
    ctx.restore();
  };

  const _drawObstacleSymbol = {
    CELL: _drawMosfet,
    TAP:  _drawGround,
    VIA:  _drawStackedVia,
    BUF:  _drawBuffer,
    DIE:  _drawDiode,
    PCM:  _drawResistor,
  };

  const drawObstacles = (obstacles) => {
    if (!obstacles) return;
    for (const obs of obstacles) {
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;

      ctx.save();
      // 반투명 hitbox 영역 (어두운 배경)
      ctx.fillStyle = SCHEMATIC_BG;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      // 얇은 테두리
      ctx.strokeStyle = SCHEMATIC_DIM;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.globalAlpha = 1;

      // 라벨별 회로 기호
      const drawFn = _drawObstacleSymbol[obs.label];
      if (drawFn) {
        drawFn(cx, cy, obs.w, obs.h);
      } else {
        // fallback: 라벨 텍스트
        ctx.globalAlpha = 0.4;
        ctx.font = '8px Share Tech Mono';
        ctx.fillStyle = '#6b7a8d';
        ctx.textAlign = 'center';
        ctx.fillText(obs.label || '?', cx, cy + 3);
      }
      ctx.restore();
    }
  };

  // 포탈 — Via hole (회로 기호 스타일)
  const drawPortals = (portals, portalRadius) => {
    if (!portals || portals.length === 0) return;
    const r = portalRadius || 28;
    for (const p of portals) {
      ctx.save();
      // 외부 글로우 (층간 연결 에너지)
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
      ctx.fill();

      // 외부 원 (metal layer 1)
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#0a0e17';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.7;
      ctx.stroke();

      // 내부 원 (via hole)
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      // 십자 해칭 (via contact pattern)
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1;
      const hr = r * 0.45;
      ctx.beginPath();
      ctx.moveTo(p.x - hr, p.y); ctx.lineTo(p.x + hr, p.y);
      ctx.moveTo(p.x, p.y - hr); ctx.lineTo(p.x, p.y + hr);
      // 대각선
      const dr = hr * 0.7;
      ctx.moveTo(p.x - dr, p.y - dr); ctx.lineTo(p.x + dr, p.y + dr);
      ctx.moveTo(p.x + dr, p.y - dr); ctx.lineTo(p.x - dr, p.y + dr);
      ctx.stroke();

      // 중앙 점 (contact)
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // 레이어 라벨
      ctx.globalAlpha = 0.45;
      ctx.font = '7px Share Tech Mono';
      ctx.fillStyle = '#00ffcc';
      ctx.textAlign = 'center';
      ctx.fillText('M1↔M2', p.x, p.y - r - 6);
      ctx.fillText('VIA', p.x, p.y + r + 10);
      ctx.restore();
    }
  };

  // 커넥터 — 전류원 기호 (Wafer Ring)
  const drawConnectors = (connectors, mc) => {
    const r = mc.connectorRadius || 40;
    for (const conn of connectors) {
      ctx.save();
      // 외부 글로우
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(conn.x, conn.y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 외부 원 (전류원 심볼)
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#0a0e17';
      ctx.beginPath();
      ctx.arc(conn.x, conn.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 내부 화살표 (전류 방향 = 부스트 방향)
      const angle = conn.angle || 0;
      const arrowLen = r * 0.55;
      ctx.save();
      ctx.translate(conn.x, conn.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2.5;
      // 화살표 축
      ctx.beginPath();
      ctx.moveTo(-arrowLen, 0); ctx.lineTo(arrowLen, 0);
      ctx.stroke();
      // 화살표 머리
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.moveTo(arrowLen, 0);
      ctx.lineTo(arrowLen - 8, -5);
      ctx.lineTo(arrowLen - 8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // I (전류) 라벨
      ctx.globalAlpha = 0.4;
      ctx.font = '9px Share Tech Mono';
      ctx.fillStyle = '#00ff88';
      ctx.textAlign = 'center';
      ctx.fillText('I', conn.x, conn.y - r - 5);
      ctx.fillText('BOOST', conn.x, conn.y + r + 12);
      ctx.restore();
    }
  };

  // ═══════════════════════════════════════════
  // CELL TURRETS (셀 도미네이션)
  // ═══════════════════════════════════════════
  const CELL_COLORS = {
    neutral: '#6b7a8d',
    samsung: '#1e64ff',
    skhynix: '#ff3250',
    destroyed: '#3a3a3a',
    rebuilding: '#ffd700',
  };

  // 서버에서 전달받은 셀 밸런스 값 (기본값은 fallback)
  const getCellBalance = () => {
    const cb = currentMapConfig && currentMapConfig.cellBalance;
    return {
      attackRange: (cb && cb.attackRange) || 320,
      captureRadius: (cb && cb.captureRadius) || 180,
      captureTime: (cb && cb.captureTime) || 4000,
      rebuildTime: (cb && cb.rebuildTime) || 3000,
    };
  };

  const drawCells = (cells, myId) => {
    const bal = getCellBalance();
    for (const cell of cells) {
      ctx.save();
      ctx.translate(cell.x, cell.y);

      const isDestroyed = cell.state === 'destroyed';
      const isRebuilding = cell.state === 'rebuilding';
      const teamColor = isDestroyed ? CELL_COLORS.destroyed
        : isRebuilding ? CELL_COLORS.rebuilding
        : CELL_COLORS[cell.ownerTeam] || CELL_COLORS.neutral;

      // 공격 범위 표시 (owned 상태이고 카메라 가까울 때)
      if (cell.state === 'owned' && cell.ownerTeam !== 'neutral') {
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.arc(0, 0, bal.attackRange, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── 오버히트 원형 게이지 ──
      const oh = cell.overheat || 0;
      if (oh > 0.01 && !isDestroyed) {
        const ohRadius = cell.radius + 14;
        const ohAngle = Math.PI * 2 * oh;

        // 배경 링 (어두운 트랙)
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#ff2040';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, ohRadius, 0, Math.PI * 2);
        ctx.stroke();

        // 게이지 아크 (12시 방향부터 시계방향)
        const ohColor = oh < 0.6 ? '#f59e0b' : oh < 0.85 ? '#ff6b00' : '#ff2040';
        ctx.globalAlpha = 0.6 + 0.3 * oh;
        ctx.strokeStyle = ohColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, ohRadius, -Math.PI / 2, -Math.PI / 2 + ohAngle);
        ctx.stroke();

        // 오버히트 활성 시 외곽 글로우 펄스
        if (oh >= 0.6) {
          const pulse = 0.15 + 0.12 * Math.sin(Date.now() / 180);
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#ff2040';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(0, 0, ohRadius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // 점령 범위 (파괴/재건 상태일 때)
      if (isDestroyed || isRebuilding) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = cell.captureTeam ? CELL_COLORS[cell.captureTeam] : '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, bal.captureRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = cell.captureTeam ? CELL_COLORS[cell.captureTeam] : '#555';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 무적 표시
      if (cell.shield) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, cell.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 터렛 본체 — 커패시터 기호
      const r = cell.radius;
      const plateH = r * 1.6;  // 판 높이
      const plateGap = r * 0.45; // 두 판 사이 간격
      const plateW = 3;  // 판 두께

      // 리드선 (좌우 수평선)
      ctx.globalAlpha = isDestroyed ? 0.25 : 0.6;
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(-plateGap / 2, 0);
      ctx.moveTo(plateGap / 2, 0); ctx.lineTo(r, 0);
      ctx.stroke();

      // 좌측 판
      ctx.globalAlpha = isDestroyed ? 0.3 : 0.85;
      ctx.fillStyle = teamColor;
      ctx.fillRect(-plateGap / 2 - plateW, -plateH / 2, plateW, plateH);
      // 우측 판
      ctx.fillRect(plateGap / 2, -plateH / 2, plateW, plateH);

      // 판 외곽선
      ctx.globalAlpha = isDestroyed ? 0.4 : 1;
      ctx.strokeStyle = isDestroyed ? '#555' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-plateGap / 2 - plateW, -plateH / 2, plateW, plateH);
      ctx.strokeRect(plateGap / 2, -plateH / 2, plateW, plateH);

      // 충전 에너지 글로우 (두 판 사이, HP비례 + 오버히트 색상)
      if (!isDestroyed) {
        const hpRatio = cell.hp / cell.maxHp;
        const oh = cell.overheat || 0;
        const glowH = plateH * 0.7 * hpRatio;
        ctx.globalAlpha = 0.2 + 0.3 * hpRatio + 0.3 * oh;
        // 오버히트가 올라갈수록 주황→빨강으로 변화
        if (oh > 0.6) {
          const t = (oh - 0.6) / 0.4;
          const r255 = 255;
          const g = Math.round(140 * (1 - t) + 40 * t);
          const b = Math.round(30 * (1 - t));
          ctx.fillStyle = `rgb(${r255},${g},${b})`;
        } else {
          ctx.fillStyle = teamColor;
        }
        ctx.fillRect(-plateGap / 2 + 1, -glowH / 2, plateGap - 2, glowH);
      }

      // +/- 극성 표시
      ctx.globalAlpha = isDestroyed ? 0.2 : 0.5;
      ctx.font = '10px Share Tech Mono';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('+', -plateGap / 2 - plateW - 8, 4);
      ctx.fillText('−', plateGap / 2 + plateW + 8, 4);

      // 파괴 시 금간 표현
      if (isDestroyed) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff3250';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-plateGap / 2, -plateH * 0.3);
        ctx.lineTo(-plateGap / 2 + 4, -plateH * 0.1);
        ctx.lineTo(-plateGap / 2 - 3, plateH * 0.1);
        ctx.lineTo(-plateGap / 2 + 2, plateH * 0.3);
        ctx.stroke();
      }

      // HP 바 (파괴 상태 아닐 때)
      if (!isDestroyed) {
        const hpW = 44, hpH = 5;
        const hpRatio = cell.hp / cell.maxHp;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(-hpW / 2, -r - 16, hpW, hpH);
        ctx.fillStyle = hpRatio > 0.5 ? teamColor : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(-hpW / 2, -r - 16, hpW * hpRatio, hpH);
        ctx.strokeStyle = '#2a3a4e';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-hpW / 2, -r - 16, hpW, hpH);

        // 오버히트 게이지 바 (HP 바 아래)
        const oh = cell.overheat || 0;
        if (oh > 0.01) {
          const ohY = -r - 9;
          const ohH = 3;
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = '#0a0e17';
          ctx.fillRect(-hpW / 2, ohY, hpW, ohH);
          // 게이지 색상: 노랑 → 주황 → 빨강
          const ohColor = oh < 0.6 ? '#f59e0b' : oh < 0.85 ? '#ff6b00' : '#ff2040';
          ctx.fillStyle = ohColor;
          ctx.fillRect(-hpW / 2, ohY, hpW * oh, ohH);
          ctx.strokeStyle = '#2a3a4e';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(-hpW / 2, ohY, hpW, ohH);

          // OVERHEAT 텍스트 (threshold 이상일 때)
          if (oh >= 0.6) {
            ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 200);
            ctx.font = '7px Share Tech Mono';
            ctx.fillStyle = ohColor;
            ctx.textAlign = 'center';
            ctx.fillText('OVERHEAT', 0, ohY - 2);
          }
        }
      }

      // 점령 진행도 아크
      if (isDestroyed && cell.captureProgress > 0 && cell.captureTeam) {
        const progress = cell.captureProgress / bal.captureTime;
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = CELL_COLORS[cell.captureTeam];
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }

      // 재건 진행도 아크
      if (isRebuilding) {
        const progress = cell.rebuildProgress / bal.rebuildTime;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = CELL_COLORS[cell.captureTeam] || '#ffd700';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }

      // 상태 레이블
      ctx.globalAlpha = 0.7;
      ctx.font = '8px Share Tech Mono';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      if (isDestroyed) {
        ctx.fillText('DESTROYED', 0, r + 14);
      } else if (isRebuilding) {
        ctx.fillText('REBUILDING', 0, r + 14);
      } else if (cell.warmup) {
        ctx.fillText('WARMING UP', 0, r + 14);
      } else if ((cell.overheat || 0) >= 0.6) {
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(Date.now() / 200);
        ctx.fillStyle = '#ff2040';
        ctx.fillText('OVERHEAT', 0, r + 14);
      }

      // 셀 ID
      ctx.globalAlpha = 0.4;
      ctx.font = '7px Share Tech Mono';
      ctx.fillStyle = '#a0aec0';
      ctx.fillText(cell.id, 0, r + 22);

      ctx.restore();
    }
  };

  // 플레이어 (클래스별 형태)
  // 팀 버프 → 버프 아이콘 매핑
  const TEAM_BUFF_ICONS = {
    dmg:   { icon: 'dmg',   color: '#ff6b6b', label: 'DMG' },
    spd:   { icon: 'bolt',  color: '#34d399', label: 'SPD' },
    regen: { icon: 'regen', color: '#60a5fa', label: 'REGEN' },
    armor: { icon: 'shield', color: '#a78bfa', label: 'ARMOR' },
  };

  const drawPlayers = (players, myId, teamBuffs) => {
    for (const p of players) {
      if (!p.alive) continue;
      const color = TEAM_COLORS[p.team];
      const lightColor = TEAM_COLORS_LIGHT[p.team];
      const isMe = p.id === myId;
      const accent = CLASS_ACCENT[p.className] || '#a0aec0';

      // 오토 타겟 라인 (나 자신만)
      if (isMe && p.autoTargetId) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        // 타겟 위치는 다음 프레임에서 매칭 (간단히 방향선)
        const gunLen = 60;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(p.angle) * gunLen, p.y + Math.sin(p.angle) * gunLen);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 무적 표시
      if (p.invuln) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 클래스별 본체
      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.className === 'capacitor') {
        // 캐패시터: 팔각형 (탱커 느낌)
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 4) * i - Math.PI / 8;
          const px = Math.cos(angle) * p.radius;
          const py = Math.sin(angle) * p.radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isMe ? '#ffffff' : lightColor;
        ctx.lineWidth = isMe ? 3 : 1.5;
        ctx.stroke();

        // 내부 에너지 표시
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // 보호막 시각화
        if (p.shield > 0 && p.maxShield > 0) {
          const shieldRatio = p.shield / p.maxShield;
          ctx.globalAlpha = 0.15 + shieldRatio * 0.2;
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, p.radius + 6, 0, Math.PI * 2);
          ctx.stroke();
          // 보호막 잔량 아크
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, p.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldRatio);
          ctx.stroke();
        }

        // 오비탈 오브 그리기
        if (p.orbCount && p.orbRadius) {
          for (let i = 0; i < p.orbCount; i++) {
            const orbAngle = (p.orbAngle || 0) + (Math.PI * 2 / p.orbCount) * i;
            const oX = Math.cos(orbAngle) * p.orbRadius;
            const oY = Math.sin(orbAngle) * p.orbRadius;
            // 궤도 경로 (연한 원)
            if (i === 0) {
              ctx.globalAlpha = 0.06;
              ctx.strokeStyle = accent;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(0, 0, p.orbRadius, 0, Math.PI * 2);
              ctx.stroke();
            }
            // 오브 본체
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(oX, oY, p.orbSize || 14, 0, Math.PI * 2);
            ctx.fill();
            // 오브 코어
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(oX, oY, (p.orbSize || 14) * 0.4, 0, Math.PI * 2);
            ctx.fill();
            // 오브 글로우
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(oX, oY, (p.orbSize || 14) * 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (p.className === 'repeater') {
        // 리피터: 삼각형 (빠른 느낌)
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = p.radius;
        ctx.moveTo(r * 1.1, 0);                          // 앞쪽 꼭짓점
        ctx.lineTo(-r * 0.7, -r * 0.85);                 // 왼쪽 뒤
        ctx.lineTo(-r * 0.7, r * 0.85);                  // 오른쪽 뒤
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isMe ? '#ffffff' : lightColor;
        ctx.lineWidth = isMe ? 3 : 1.5;
        ctx.stroke();

        // 안테나 선
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 0.8, 0);
        ctx.stroke();
      } else {
        // 레지스터 (기본): 원형
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isMe ? '#ffffff' : lightColor;
        ctx.lineWidth = isMe ? 3 : 1.5;
        ctx.stroke();
      }

      // 방향 표시 (조준 각도)
      if (p.className !== 'repeater') {
        const gunLen = p.radius + 10;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = lightColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(p.angle) * gunLen, Math.sin(p.angle) * gunLen);
        ctx.stroke();
      }

      // Market buff/nerf 시각 효과 (미세한 글로우/딤)
      if (currentMarketData && currentMarketData.buffs) {
        const teamBuff = currentMarketData.buffs[p.team];
        if (teamBuff && teamBuff.damageModifier !== 0) {
          ctx.globalAlpha = Math.min(0.15, Math.abs(teamBuff.damageModifier));
          if (teamBuff.damageModifier > 0) {
            // 버프: 팀 컬러 밝은 글로우
            ctx.fillStyle = TEAM_COLORS_LIGHT[p.team] || '#ffffff';
          } else {
            // 너프: 어두운 오버레이
            ctx.fillStyle = '#1a1a2e';
          }
          ctx.beginPath();
          ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── 버프 아이콘 궤도 (개인 + 팀 통합) ──
      const allBuffs = [];
      // 개인 버프
      if (p.activeBuffs) {
        for (const b of p.activeBuffs) {
          allBuffs.push({ color: b.color, icon: b.icon, remaining: b.remaining, duration: b.duration });
        }
      }
      // 팀 버프
      if (teamBuffs && teamBuffs[p.team]) {
        for (const tb of teamBuffs[p.team]) {
          const meta = TEAM_BUFF_ICONS[tb.buff] || { icon: 'bolt', color: '#ffd700' };
          allBuffs.push({ color: meta.color, icon: meta.icon, remaining: tb.remaining, duration: tb.duration });
        }
      }
      if (allBuffs.length > 0) {
        const buffOrbitR = p.radius + 18;
        const buffTime = Date.now() / 1000;
        const iconMap = { bolt: '\u26A1', shield: '\u26E8', dmg: '\u2694', regen: '\u2764' };
        for (let bi = 0; bi < allBuffs.length; bi++) {
          const buff = allBuffs[bi];
          const buffAngle = buffTime * 1.5 + (Math.PI * 2 / allBuffs.length) * bi;
          const bx = Math.cos(buffAngle) * buffOrbitR;
          const by = Math.sin(buffAngle) * buffOrbitR;
          const ratio = buff.duration > 0 ? buff.remaining / buff.duration : 0;

          ctx.globalAlpha = 0.3;
          ctx.fillStyle = buff.color || '#00e5ff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = buff.color || '#00e5ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(bx, by, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
          ctx.stroke();

          ctx.globalAlpha = 0.9;
          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(iconMap[buff.icon] || '\u26A1', bx, by);
          ctx.textBaseline = 'alphabetic';
        }
      }

      ctx.restore();

      // HP 바 + 데미지 고스트
      const hpW = 40, hpH = 4;
      const hpX = p.x - hpW / 2, hpY = p.y - p.radius - 14;
      const hpRatio = p.hp / p.maxHp;

      // 고스트 HP 업데이트
      if (!ghostHpMap[p.id]) ghostHpMap[p.id] = { ghost: p.hp, lastHp: p.hp };
      const g = ghostHpMap[p.id];
      if (p.hp < g.lastHp) {
        // 데미지 발생 — ghost 유지, hold 타이머 시작
        g.ghost = Math.max(g.ghost, g.lastHp);
        ghostHoldTimers[p.id] = GHOST_HOLD_MS;
      } else if (p.hp > g.ghost) {
        // 힐 — ghost 즉시 동기화
        g.ghost = p.hp;
      }
      g.lastHp = p.hp;

      // hold 끝난 후 서서히 감소
      if (ghostHoldTimers[p.id] > 0) {
        ghostHoldTimers[p.id] -= renderDt * 1000;
      } else if (g.ghost > p.hp) {
        g.ghost = Math.max(p.hp, g.ghost - GHOST_DECAY_SPEED * renderDt);
      }
      const ghostRatio = g.ghost / p.maxHp;

      // 배경
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(hpX, hpY, hpW, hpH);
      // 고스트 (빨간 잔상)
      if (ghostRatio > hpRatio) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(hpX, hpY, hpW * ghostRatio, hpH);
      }
      // 현재 HP
      ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);

      // XP 바 (HP 바 바로 아래)
      if (p.xpToNext > 0) {
        const xpBarY = hpY + hpH + 1;
        const xpH = 2;
        const xpRatio = Math.min(1, p.xp / p.xpToNext);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(hpX, xpBarY, hpW, xpH);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(hpX, xpBarY, hpW * xpRatio, xpH);
      }

      // 이름
      ctx.font = '11px Share Tech Mono';
      ctx.fillStyle = isMe ? '#ffffff' : '#a0aec0';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - p.radius - 18);

      // 레벨 뱃지
      ctx.font = '9px Orbitron';
      ctx.fillStyle = accent;
      ctx.fillText(`Lv${p.level}`, p.x, p.y + p.radius + 14);

      // 클래스 이름 (봇이면 BOT 대신)
      if (p.isBot) {
        ctx.font = '8px Share Tech Mono';
        ctx.fillStyle = '#4a5568';
        ctx.fillText('BOT', p.x, p.y + p.radius + 24);
      }
    }
    // 떠난 플레이어의 고스트 데이터 정리
    const aliveIds = new Set(players.map(p => p.id));
    for (const id in ghostHpMap) {
      if (!aliveIds.has(id)) { delete ghostHpMap[id]; delete ghostHoldTimers[id]; }
    }
  };

  const drawBullets = (bullets) => {
    for (const b of bullets) {
      ctx.fillStyle = TEAM_COLORS_LIGHT[b.team] || '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawMinions = (minions) => {
    for (const m of minions) {
      if (!m.alive) continue;
      const color = TEAM_COLORS[m.team];
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-m.radius, -m.radius, m.radius * 2, m.radius * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeRect(-m.radius, -m.radius, m.radius * 2, m.radius * 2);
      ctx.restore();
    }
  };

  const drawMonsters = (monsters) => {
    const t = performance.now() / 1000;
    for (const mon of monsters) {
      if (!mon.alive) continue;
      ctx.save();
      ctx.translate(mon.x, mon.y);

      // ── 보스 바디 (공격 스타일별 형태) ──
      ctx.save();
      ctx.rotate(mon.angle || 0);
      ctx.fillStyle = mon.color;
      ctx.globalAlpha = 0.85;

      switch (mon.attackStyle) {
        case 'spray': {
          // 삼각 + 3개 포신
          ctx.beginPath();
          ctx.arc(0, 0, mon.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          for (let i = -1; i <= 1; i++) {
            ctx.save();
            ctx.rotate(i * 0.4);
            ctx.fillStyle = mon.color;
            ctx.fillRect(mon.radius * 0.3, -3, mon.radius * 0.8, 6);
            ctx.restore();
          }
          break;
        }
        case 'sniper': {
          // 긴 포신 1개 + 원
          ctx.beginPath();
          ctx.arc(0, 0, mon.radius * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = mon.color;
          ctx.fillRect(mon.radius * 0.2, -4, mon.radius * 1.2, 8);
          break;
        }
        case 'drone': {
          // 사각형 바디 (드론 공장)
          const s = mon.radius * 0.75;
          ctx.fillRect(-s, -s, s * 2, s * 2);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
          break;
        }
        case 'pulse': {
          // 원 + 펄스 링
          ctx.beginPath();
          ctx.arc(0, 0, mon.radius, 0, Math.PI * 2);
          ctx.fill();
          if (mon.pulseActive && mon.pulseCurrentRadius > 0) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = mon.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, mon.pulseCurrentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = mon.color;
            ctx.beginPath();
            ctx.arc(0, 0, mon.pulseCurrentRadius, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'twin': {
          // 원 + 2개 평행 포신
          ctx.beginPath();
          ctx.arc(0, 0, mon.radius * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = mon.color;
          ctx.fillRect(mon.radius * 0.3, -9, mon.radius * 0.7, 6);
          ctx.fillRect(mon.radius * 0.3, 3, mon.radius * 0.7, 6);
          break;
        }
        default: {
          // 기본 육각형
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = Math.cos(a) * mon.radius;
            const py = Math.sin(a) * mon.radius;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      // 테두리 글로우
      ctx.globalAlpha = 0.3 + Math.sin(t * 3) * 0.15;
      ctx.strokeStyle = mon.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, mon.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 이름 + 버프
      ctx.font = 'bold 12px Orbitron';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(mon.typeName, 0, -mon.radius - 16);

      ctx.font = '10px Share Tech Mono';
      ctx.fillStyle = mon.color;
      ctx.fillText(mon.buffLabel, 0, -mon.radius - 6);

      // HP 바
      const hpW = 50, hpH = 5;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(-hpW / 2, mon.radius + 6, hpW, hpH);
      ctx.fillStyle = mon.color;
      ctx.fillRect(-hpW / 2, mon.radius + 6, hpW * (mon.hp / mon.maxHp), hpH);
      ctx.restore();
    }
  };

  // ── 보스 발사체 ──
  const drawBossBullets = (bullets) => {
    for (const b of bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };

  // ── 보스 드론 ──
  const drawBossDrones = (drones) => {
    const t = performance.now() / 1000;
    for (const d of drones) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle || 0);
      // 삼각형 드론
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.8;
      const r = d.radius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, -r * 0.7);
      ctx.lineTo(-r * 0.7, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.4 + Math.sin(t * 6) * 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };

  const drawPickups = (pickups) => {
    for (const pk of pickups) {
      ctx.save();
      ctx.translate(pk.x, pk.y);
      const r = pk.radius;

      // 글로우
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = pk.color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = pk.color;

      if (pk.type === 'PHOTORESIST') {
        // 육각형
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (pk.type === 'CMP_PAD') {
        // 원형
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 기본 다이아몬드
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.font = '9px Share Tech Mono';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(pk.name, 0, r + 14);
      ctx.restore();
    }
  };

  // ── 중립 몹 (Photon / Dopant / Alpha Particle) ──
  const drawNeutralMobs = (mobs) => {
    const t = performance.now() / 1000;
    for (const nm of mobs) {
      ctx.save();
      ctx.translate(nm.x, nm.y);
      const r = nm.radius;
      const angle = nm.angle || 0;

      // 글로우 — 부드러운 펄스
      ctx.globalAlpha = 0.10 + Math.sin(t * 1.5 + nm.x * 0.1) * 0.04;
      ctx.fillStyle = nm.color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(angle);
      ctx.globalAlpha = nm.fleeing ? 0.4 : 0.9;

      if (nm.shape === 'triangle') {
        // ── Photon: LED (발광 다이오드) 기호 ──
        _drawMobLED(r, nm.color, t);
      } else if (nm.shape === 'square') {
        // ── Dopant: NPN BJT 트랜지스터 기호 ──
        _drawMobBJT(r, nm.color);
      } else if (nm.shape === 'pentagon') {
        // ── Alpha Particle: AC 전압원 기호 ──
        _drawMobACSource(r, nm.color, t);
      }

      ctx.rotate(-angle);

      // HP 바 (full이 아닐 때만)
      if (nm.hp < nm.maxHp) {
        const hpW = r * 3, hpH = 3;
        const ratio = nm.hp / nm.maxHp;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(-hpW / 2, -r - 12, hpW, hpH);
        ctx.fillStyle = nm.color;
        ctx.fillRect(-hpW / 2, -r - 12, hpW * ratio, hpH);
      }

      ctx.restore();
    }
  };

  // ── Photon: LED (발광 다이오드) — 다이오드 삼각형 + 빛 화살표 ──
  const _drawMobLED = (r, color, t) => {
    const s = r * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';

    // 다이오드 삼각형 (anode 방향)
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.55);
    ctx.lineTo(s * 0.4, 0);
    ctx.lineTo(-s * 0.5, s * 0.55);
    ctx.closePath();
    ctx.stroke();

    // Cathode 바 (수직선)
    ctx.beginPath();
    ctx.moveTo(s * 0.4, -s * 0.55);
    ctx.lineTo(s * 0.4, s * 0.55);
    ctx.stroke();

    // 리드선
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, 0);
    ctx.lineTo(-s * 0.5, 0);
    ctx.moveTo(s * 0.4, 0);
    ctx.lineTo(s * 0.9, 0);
    ctx.stroke();

    // 빛 방출 화살표 2개 (LED 특유)
    const glow = 0.5 + Math.sin(t * 4) * 0.3;
    ctx.globalAlpha = glow;
    ctx.lineWidth = 1.2;
    // 화살표 1 (우상향)
    ctx.beginPath();
    ctx.moveTo(s * 0.15, -s * 0.55);
    ctx.lineTo(s * 0.55, -s * 0.85);
    ctx.lineTo(s * 0.4, -s * 0.7);
    ctx.moveTo(s * 0.55, -s * 0.85);
    ctx.lineTo(s * 0.42, -s * 0.88);
    ctx.stroke();
    // 화살표 2 (우상향, 약간 아래)
    ctx.beginPath();
    ctx.moveTo(s * 0.35, -s * 0.4);
    ctx.lineTo(s * 0.75, -s * 0.7);
    ctx.lineTo(s * 0.6, -s * 0.55);
    ctx.moveTo(s * 0.75, -s * 0.7);
    ctx.lineTo(s * 0.62, -s * 0.73);
    ctx.stroke();
  };

  // ── Dopant: NPN BJT 트랜지스터 — 원 + 내부 구조 ──
  const _drawMobBJT = (r, color) => {
    const s = r * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';

    // 외곽 원
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // Base 세로 막대
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, -s * 0.4);
    ctx.lineTo(-s * 0.15, s * 0.4);
    ctx.stroke();

    // Base 입력 리드선
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, 0);
    ctx.lineTo(-s * 0.15, 0);
    ctx.stroke();

    // Collector (위쪽으로)
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, -s * 0.22);
    ctx.lineTo(s * 0.35, -s * 0.5);
    ctx.stroke();
    // Collector 외부 리드
    ctx.beginPath();
    ctx.moveTo(s * 0.35, -s * 0.5);
    ctx.lineTo(s * 0.35, -s * 0.8);
    ctx.stroke();

    // Emitter (아래로) + 화살표 (NPN 특유)
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, s * 0.22);
    ctx.lineTo(s * 0.35, s * 0.5);
    ctx.stroke();
    // Emitter 외부 리드
    ctx.beginPath();
    ctx.moveTo(s * 0.35, s * 0.5);
    ctx.lineTo(s * 0.35, s * 0.8);
    ctx.stroke();
    // Emitter 화살표 (밖으로 향하는)
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.5);
    ctx.lineTo(s * 0.35, s * 0.5);
    ctx.lineTo(s * 0.22, s * 0.38);
    ctx.stroke();

    // B/C/E 라벨
    ctx.globalAlpha = 0.45;
    ctx.font = `${r * 0.55}px Share Tech Mono`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', -s * 0.62, -s * 0.2);
    ctx.fillText('C', s * 0.55, -s * 0.65);
    ctx.fillText('E', s * 0.55, s * 0.65);
  };

  // ── Alpha: AC 전압원 — 원 + 내부 사인파 ──
  const _drawMobACSource = (r, color, t) => {
    const s = r * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // 외곽 원
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // 내부 사인파 (~)
    ctx.lineWidth = 2;
    ctx.beginPath();
    const amp = s * 0.3;
    const waveW = s * 1.0;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const px = -waveW / 2 + (waveW / steps) * i;
      const py = Math.sin((i / steps) * Math.PI * 2) * amp;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 리드선 (상하)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.85);
    ctx.lineTo(0, -s * 1.2);
    ctx.moveTo(0, s * 0.85);
    ctx.lineTo(0, s * 1.2);
    ctx.stroke();

    // +/- 라벨
    ctx.globalAlpha = 0.5;
    ctx.font = `${r * 0.65}px Share Tech Mono`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', -s * 0.55, -s * 0.45);
    ctx.fillText('−', -s * 0.55, s * 0.45);

    // 에너지 펄스 (외곽 링 애니메이션)
    const pulse = (Math.sin(t * 3) + 1) / 2;
    ctx.globalAlpha = 0.15 * (1 - pulse);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, s * (0.9 + pulse * 0.5), 0, Math.PI * 2);
    ctx.stroke();
  };

  // 파티클
  const spawnParticles = (worldX, worldY, color, count) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;
      particles.push({
        x: worldX - camera.x + canvas.width / 2,
        y: worldY - camera.y + canvas.height / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5, maxLife: 1,
        color, size: 2 + Math.random() * 3,
      });
    }
  };

  const updateAndDrawParticles = () => {
    const dt = 1 / 60;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  };

  // 이벤트 존 (Admin Event System)
  const drawEventZones = (eventZones) => {
    if (!eventZones || eventZones.length === 0) return;
    const time = Date.now() / 1000;
    for (const zone of eventZones) {
      ctx.save();
      // 배경 원 (펄싱)
      const pulse = 0.06 + Math.sin(time * 2) * 0.03;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = zone.color || '#76b900';
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();

      // 테두리
      ctx.globalAlpha = 0.35 + Math.sin(time * 3) * 0.1;
      ctx.strokeStyle = zone.color || '#76b900';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 레이블
      ctx.globalAlpha = 0.6;
      ctx.font = '10px Orbitron';
      ctx.fillStyle = zone.color || '#76b900';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label || 'EVENT ZONE', zone.x, zone.y - zone.radius - 8);

      // 효과 아이콘
      ctx.font = '18px sans-serif';
      ctx.globalAlpha = 0.4;
      const effectIcons = {
        damage_boost: '\u2694',
        speed_boost: '\u26A1',
        heal_zone: '\u2764',
        slow_zone: '\u26D4',
      };
      ctx.fillText(effectIcons[zone.effect] || '\u25CE', zone.x, zone.y + 6);

      ctx.restore();
    }
  };

  // ── Plasma Etch Hazard Zones ──
  const drawHazardZones = (hazardZones) => {
    const time = Date.now() / 1000;
    for (const hz of hazardZones) {
      ctx.save();

      if (hz.phase === 'warning') {
        // ── 경고 단계: 깜빡이는 주황 링 + 경고 텍스트 ──
        const warnProgress = 1 - (hz.timer / 1200); // 0→1
        const blink = Math.sin(time * 12) * 0.5 + 0.5; // 빠른 깜빡임

        // 외곽 경고 링 (확장 애니메이션)
        const expandR = hz.radius * (0.3 + warnProgress * 0.7);
        ctx.globalAlpha = 0.12 + blink * 0.12;
        ctx.fillStyle = '#ff6b00';
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, expandR, 0, Math.PI * 2);
        ctx.fill();

        // 대시 테두리
        ctx.globalAlpha = 0.5 + blink * 0.3;
        ctx.strokeStyle = '#ff6b00';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 경고 텍스트
        ctx.globalAlpha = 0.7 + blink * 0.3;
        ctx.font = '11px Orbitron';
        ctx.fillStyle = '#ff6b00';
        ctx.textAlign = 'center';
        ctx.fillText('\u26A0 PLASMA ETCH', hz.x, hz.y - hz.radius - 10);

        // 중앙 X 마크
        ctx.globalAlpha = 0.4 + blink * 0.3;
        ctx.strokeStyle = '#ff6b00';
        ctx.lineWidth = 2;
        const cs = 16;
        ctx.beginPath();
        ctx.moveTo(hz.x - cs, hz.y - cs); ctx.lineTo(hz.x + cs, hz.y + cs);
        ctx.moveTo(hz.x + cs, hz.y - cs); ctx.lineTo(hz.x - cs, hz.y + cs);
        ctx.stroke();

      } else if (hz.phase === 'active') {
        // ── 활성 단계: 빨간 데미지 존 + 내부 파동 ──
        const activeProgress = 1 - (hz.timer / 6000);

        // 반투명 빨간 영역
        ctx.globalAlpha = 0.12 + Math.sin(time * 4) * 0.04;
        ctx.fillStyle = '#ff2040';
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
        ctx.fill();

        // 내부 파동 링 (펄싱)
        const waveR = hz.radius * (0.3 + (time * 0.8 % 1) * 0.7);
        ctx.globalAlpha = 0.25 * (1 - (time * 0.8 % 1));
        ctx.strokeStyle = '#ff2040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, waveR, 0, Math.PI * 2);
        ctx.stroke();

        // 테두리 (실선)
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff2040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
        ctx.stroke();

        // 라벨 + 남은 시간
        ctx.globalAlpha = 0.7;
        ctx.font = '10px Orbitron';
        ctx.fillStyle = '#ff2040';
        ctx.textAlign = 'center';
        const secLeft = Math.ceil(hz.timer / 1000);
        ctx.fillText(`PLASMA ETCH  ${secLeft}s`, hz.x, hz.y - hz.radius - 8);

        // 해골 아이콘
        ctx.font = '20px sans-serif';
        ctx.globalAlpha = 0.3;
        ctx.fillText('\u2620', hz.x, hz.y + 6);
      }

      ctx.restore();
    }
  };

  // 미니맵
  const drawMinimap = (state, myId, mapW, mapH) => {
    const isMob = _isMobileDevice();
    const mmW = isMob ? 110 : 160;
    const mmH = Math.round(mmW * (mapH / mapW));
    // 모바일: 좌측 하단 구석에 딱 붙임, PC: 우하단
    const mmX = isMob ? 4 : canvas.width - mmW - 12;
    const mmY = canvas.height - mmH - (isMob ? 4 : 12);
    const scaleX = mmW / mapW, scaleY = mmH / mapH;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#2a3a4e';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);
    ctx.globalAlpha = 1;

    // 장애물
    if (currentMapConfig && currentMapConfig.obstacles) {
      ctx.fillStyle = '#1a2235';
      for (const obs of currentMapConfig.obstacles) {
        ctx.fillRect(mmX + obs.x * scaleX, mmY + obs.y * scaleY, Math.max(2, obs.w * scaleX), Math.max(2, obs.h * scaleY));
      }
    }

    // 셀 터렛
    if (state.cells) {
      for (const cell of state.cells) {
        const cx = mmX + cell.x * scaleX;
        const cy = mmY + cell.y * scaleY;
        const color = cell.state === 'destroyed' ? '#3a3a3a'
          : cell.state === 'rebuilding' ? '#ffd700'
          : cell.ownerTeam === 'neutral' ? '#6b7a8d'
          : TEAM_COLORS[cell.ownerTeam] || '#6b7a8d';
        ctx.fillStyle = color;
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx - 3, cy - 3, 6, 6);
      }
    }

    // 미니언
    for (const m of state.minions) {
      if (!m.alive) continue;
      ctx.fillStyle = TEAM_COLORS[m.team];
      ctx.fillRect(mmX + m.x * scaleX - 1, mmY + m.y * scaleY - 1, 2, 2);
    }

    // 몬스터
    for (const mon of state.monsters) {
      if (!mon.alive) continue;
      ctx.fillStyle = mon.color;
      ctx.beginPath();
      ctx.arc(mmX + mon.x * scaleX, mmY + mon.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 중립 몹
    if (state.neutralMobs) {
      ctx.globalAlpha = 0.5;
      for (const nm of state.neutralMobs) {
        ctx.fillStyle = nm.color;
        ctx.fillRect(mmX + nm.x * scaleX - 1, mmY + nm.y * scaleY - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // 이벤트 존 (미니맵)
    if (state.eventZones) {
      for (const zone of state.eventZones) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = zone.color || '#76b900';
        ctx.beginPath();
        ctx.arc(mmX + zone.x * scaleX, mmY + zone.y * scaleY, Math.max(4, zone.radius * scaleX), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 포탈
    if (currentMapConfig && currentMapConfig.portals) {
      ctx.fillStyle = '#00ffcc';
      for (const p of currentMapConfig.portals) {
        ctx.beginPath();
        ctx.arc(mmX + p.x * scaleX, mmY + p.y * scaleY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 플레이어
    for (const p of state.players) {
      if (!p.alive) continue;
      const isMe = p.id === myId;
      ctx.fillStyle = isMe ? '#ffffff' : TEAM_COLORS[p.team];
      ctx.beginPath();
      ctx.arc(mmX + p.x * scaleX, mmY + p.y * scaleY, isMe ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 뷰포트
    const vpX = mmX + (camera.x - canvas.width / 2) * scaleX;
    const vpY = mmY + (camera.y - canvas.height / 2) * scaleY;
    const vpW = canvas.width * scaleX;
    const vpH = canvas.height * scaleY;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
    ctx.restore();
  };

  // 펄스 이펙트 (캐패시터 AoE)
  const addPulseEffect = (worldX, worldY, radius, color) => {
    pulseEffects.push({
      x: worldX, y: worldY,
      maxRadius: radius, currentRadius: 0,
      color, life: 0.3, maxLife: 0.3,
    });
  };

  const drawPulseEffects = () => {
    const dt = 1 / 60;
    for (let i = pulseEffects.length - 1; i >= 0; i--) {
      const pe = pulseEffects[i];
      pe.life -= dt;
      pe.currentRadius = pe.maxRadius * (1 - pe.life / pe.maxLife);
      if (pe.life <= 0) { pulseEffects.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = (pe.life / pe.maxLife) * 0.3;
      ctx.strokeStyle = pe.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pe.x, pe.y, pe.currentRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  return { init, render, getCamera, spawnParticles, addPulseEffect };
})();
