// HUD 업데이트: HP, 클래스/레벨, XP, 팀스코어, 버프, 리더보드, 킬피드, 맵 이름, 존 경고, 뉴스
const HUD = (() => {
  const els = {};
  const killFeedQueue = [];
  const KILL_FEED_MAX = 5;
  let lastNewsJson = '';
  const eventBannerQueue = [];
  const EVENT_BANNER_DURATION = 5000;

  const init = () => {
    els.hud = document.getElementById('hud');
    els.timer = document.getElementById('hudTimer');
    els.score = document.getElementById('hudScore');
    els.mapName = document.getElementById('hudMapName');
    els.killFeed = document.getElementById('hudKillFeed');
    els.leaderboard = document.getElementById('hudLeaderboard');
    els.zoneWarn = document.getElementById('hudZoneWarn');
    els.stockPanel = document.getElementById('hudStockPanel');
    els.disclaimer = document.getElementById('hudDisclaimer');
    els.newsBody = document.getElementById('newsBody');
    els.eventBanner = document.getElementById('hudEventBanner');
    els.activeEventsPanel = document.getElementById('hudActiveEvents');
    els.buffPanel = document.getElementById('hudBuffPanel');
    els.bossInfo = document.getElementById('hudBossInfo');
  };

  const show = () => els.hud.classList.remove('hidden');
  const hide = () => els.hud.classList.add('hidden');

  const update = (state, myId) => {
    if (!state) return;
    const me = state.players.find(p => p.id === myId);
    if (!me) return;

    // 라운드 타이머 비활성화
    if (els.timer) els.timer.textContent = '';

    // 영토 스코어
    const samTerritory = (state.territoryScore && state.territoryScore.samsung) || 0;
    const skhTerritory = (state.territoryScore && state.territoryScore.skhynix) || 0;
    const samCells = state.cells ? state.cells.filter(c => c.ownerTeam === 'samsung' && c.state === 'owned').length : 0;
    const skhCells = state.cells ? state.cells.filter(c => c.ownerTeam === 'skhynix' && c.state === 'owned').length : 0;
    els.score.innerHTML =
      `<span style="color:#1e64ff">SAM ${samTerritory}</span>` +
      ` <span style="color:#6b7a8d;font-size:10px">[${samCells}]</span>` +
      ` : ` +
      `<span style="color:#6b7a8d;font-size:10px">[${skhCells}]</span>` +
      ` <span style="color:#ff3250">${skhTerritory} SKH</span>`;

    // 맵 이름
    if (state.mapConfig && els.mapName) {
      els.mapName.textContent = state.mapConfig.name || '';
    }

    // 킬피드
    if (state.events) {
      for (const evt of state.events) {
        if (evt.type === 'kill') {
          addKillFeed(`<span style="color:${evt.killerTeam === 'samsung' ? '#5a9bff' : '#ff6b80'}">${evt.killer}</span> → ${evt.victim}`);
        } else if (evt.type === 'monster_kill') {
          addKillFeed(`<span style="color:${evt.team === 'samsung' ? '#5a9bff' : '#ff6b80'}">${evt.team.toUpperCase()}</span> killed <span style="color:#ffd700">${evt.monsterName}</span> (${evt.buffLabel})`);
        } else if (evt.type === 'portal_use') {
          // silent
        } else if (evt.type === 'cell_kill') {
          const teamColor = evt.killerTeam === 'samsung' ? '#5a9bff' : '#ff6b80';
          addKillFeed(`Cell <span style="color:#ffd700">${evt.cellId}</span> <span style="color:${teamColor}">→</span> ${evt.victim}`);
        } else if (evt.type === 'cell_destroyed') {
          const teamColor = evt.team === 'samsung' ? '#5a9bff' : '#ff6b80';
          const teamLabel = evt.team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX';
          addKillFeed(`Cell <span style="color:#ffd700">${evt.cellId}</span> destroyed by <span style="color:${teamColor}">${teamLabel}</span>`);
        } else if (evt.type === 'cell_captured') {
          const teamColor = evt.team === 'samsung' ? '#5a9bff' : '#ff6b80';
          const teamLabel = evt.team === 'samsung' ? 'SAMSUNG' : 'SK HYNIX';
          addKillFeed(`Cell <span style="color:#ffd700">${evt.cellId}</span> captured by <span style="color:${teamColor}">${teamLabel}</span>`);
        } else if (evt.type === 'zone_activate') {
          addKillFeed(`<span style="color:#ff6b80">ZONE ${evt.zoneId}</span>: ${evt.label}`);
        } else if (evt.type === 'admin_event') {
          const label = evt.titleKo || evt.title || evt.eventType;
          addKillFeed(`<span style="color:#ffd700">EVENT</span> ${escapeHtml(label)}`);
          eventBannerQueue.push({ text: label, time: Date.now() });
        } else if (evt.type === 'hazard_warning') {
          addKillFeed('<span style="color:#ff6b00">\u26A0 PLASMA ETCH</span> incoming!');
        } else if (evt.type === 'hazard_activate') {
          addKillFeed('<span style="color:#ff2040">\u2620 PLASMA ETCH</span> zone active!');
        } else if (evt.type === 'boss_spawn') {
          addKillFeed(`<span style="color:${evt.color}">\u2605 ${escapeHtml(evt.bossName)}</span> has appeared! (${escapeHtml(evt.buffLabel)})`);
        } else if (evt.type === 'pickup_buff') {
          addKillFeed(`<span style="color:#00e5ff">\u26A1 ${escapeHtml(evt.buffLabel)}</span> acquired`);
        } else if (evt.type === 'pulse') {
          // 펄스 이펙트 트리거
          if (typeof Renderer !== 'undefined' && Renderer.addPulseEffect) {
            const pulseColor = evt.team === 'samsung' ? '#5a9bff' : '#ff6b80';
            Renderer.addPulseEffect(evt.x, evt.y, evt.radius || 140, pulseColor);
          }
        }
      }
    }
    renderKillFeed();

    // 이벤트 배너 렌더링
    renderEventBanner();

    // 활성 이벤트 패널
    renderActiveEvents(state.activeEvents);

    // 존 경고 (Wafer Ring)
    if (state.activeZoneId && !state.zoneCleansed && els.zoneWarn) {
      const zones = state.mapConfig && state.mapConfig.zones;
      if (zones) {
        const activeZone = zones.find(z => z.id === state.activeZoneId);
        if (activeZone) {
          els.zoneWarn.textContent = activeZone.label || `ZONE ${state.activeZoneId} ACTIVE`;
          els.zoneWarn.classList.remove('hidden');
        }
      }
    } else if (els.zoneWarn) {
      els.zoneWarn.classList.add('hidden');
    }

    // 보스 정보 패널
    renderBossInfo(state.bossInfo);

    // 리더보드
    renderLeaderboard(state.players, myId);

    // 버프 패널 (개인 + 팀)
    renderBuffPanel(me, state.teamBuffs);

    // 주가 패널 + 면책조항 + 뉴스 ticker
    renderStockPanel(state.marketData);
    renderDisclaimer(state.marketData);
    renderNewsTicker(state.marketData);
  };

  const addKillFeed = (html) => {
    killFeedQueue.push({ html, time: Date.now() });
    if (killFeedQueue.length > KILL_FEED_MAX) killFeedQueue.shift();
  };

  const renderKillFeed = () => {
    const now = Date.now();
    const active = killFeedQueue.filter(k => now - k.time < 4000);
    els.killFeed.innerHTML = active.map(k => `<div class="kill-entry">${k.html}</div>`).join('');
  };

  const renderBossInfo = (info) => {
    if (!els.bossInfo || !info) {
      if (els.bossInfo) els.bossInfo.classList.add('hidden');
      return;
    }
    els.bossInfo.classList.remove('hidden');
    if (info.status === 'alive') {
      const hpPct = Math.round((info.hp / info.maxHp) * 100);
      els.bossInfo.innerHTML =
        `<div class="boss-label">BOSS</div>` +
        `<div class="boss-name" style="color:${info.color}">${info.name}</div>` +
        `<div class="boss-buff">${info.buffLabel}</div>` +
        `<div class="boss-hp-bar"><div class="boss-hp-fill" style="width:${hpPct}%;background:${info.color}"></div></div>`;
    } else {
      els.bossInfo.innerHTML =
        `<div class="boss-label">NEXT BOSS</div>` +
        `<div class="boss-name" style="color:${info.nextColor}">${info.nextName}</div>` +
        `<div class="boss-buff">${info.nextBuffLabel}</div>` +
        `<div class="boss-timer">${info.respawnTimer}s</div>`;
    }
  };

  const renderLeaderboard = (players, myId) => {
    const sorted = [...players].filter(p => p.alive || (p.score || 0) > 0).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
    let html = '<div class="lb-header">LEADERBOARD</div>';
    for (const p of sorted) {
      const cls = `lb-row ${p.team}${p.id === myId ? ' self' : ''}`;
      const classTag = p.className !== 'resistor' ? ` <span style="color:#6b7a8d;font-size:9px">${p.className.charAt(0).toUpperCase()}</span>` : '';
      const score = p.score || 0;
      html += `<div class="${cls}"><span>${p.name}${classTag}</span><span>Lv${p.level} ${score}</span></div>`;
    }
    els.leaderboard.innerHTML = html;
  };

  const formatPrice = (price) => {
    if (price == null) return 'N/A';
    return Math.round(price).toLocaleString('ko-KR') + ' KRW';
  };

  const getBuffIndicator = (changePercent) => {
    if (changePercent == null) return { label: 'N/A', color: '#6b7a8d' };
    if (changePercent >= 3)  return { label: 'SURGE ▲', color: '#ffd700' };
    if (changePercent >= 1)  return { label: 'RISE ▲',  color: '#22c55e' };
    if (changePercent > -1)  return { label: 'STABLE ─', color: '#6b7a8d' };
    if (changePercent > -3)  return { label: 'DIP ▼',    color: '#f59e0b' };
    return { label: 'PLUNGE ▼', color: '#ef4444' };
  };

  const getChangeClass = (changePercent) => {
    if (changePercent == null) return 'neutral';
    if (changePercent > 0) return 'positive';
    if (changePercent < 0) return 'negative';
    return 'neutral';
  };

  const renderStockRow = (name, teamColor, data) => {
    if (!data) {
      return `<div class="stock-row">
        <span class="stock-name" style="color:${teamColor}">${name}</span>
        <span class="stock-price" style="color:#4a5568">N/A</span>
      </div>`;
    }
    const changeStr = data.changePercent != null
      ? `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`
      : 'N/A';
    const changeClass = getChangeClass(data.changePercent);
    const buff = getBuffIndicator(data.changePercent);
    return `<div class="stock-row">
      <div>
        <span class="stock-name" style="color:${teamColor}">${name}</span>
        <div class="stock-buff" style="color:${buff.color}">${buff.label}</div>
      </div>
      <div style="text-align:right">
        <div class="stock-price">${formatPrice(data.price)}</div>
        <div class="stock-change ${changeClass}">${changeStr}</div>
      </div>
    </div>`;
  };

  const formatModifier = (value) => {
    if (value === 0) return '';
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(0)}%`;
  };

  const renderBuffLine = (teamBuff) => {
    if (!teamBuff) return '';
    const { damageModifier, speedModifier } = teamBuff;
    if (damageModifier === 0 && speedModifier === 0) return '';
    const parts = [];
    if (damageModifier !== 0) {
      const color = damageModifier > 0 ? '#22c55e' : '#ef4444';
      parts.push(`<span style="color:${color}">DMG ${formatModifier(damageModifier)}</span>`);
    }
    if (speedModifier !== 0) {
      const color = speedModifier > 0 ? '#22c55e' : '#ef4444';
      parts.push(`<span style="color:${color}">SPD ${formatModifier(speedModifier)}</span>`);
    }
    return `<div class="stock-buff-detail" style="font-size:9px;opacity:0.8">${parts.join(' | ')}</div>`;
  };

  const renderStockPanel = (marketData) => {
    if (!els.stockPanel) return;
    if (!marketData) {
      els.stockPanel.innerHTML = '<div class="stock-loading">주가 데이터 로딩 중...</div>';
      return;
    }
    const badgeClass = marketData.isMarketOpen ? 'open' : 'closed';
    const badgeText = marketData.isMarketOpen ? 'OPEN' : 'CLOSED';
    const samBuff = marketData.buffs ? marketData.buffs.samsung : null;
    const skhBuff = marketData.buffs ? marketData.buffs.skhynix : null;
    els.stockPanel.innerHTML =
      `<div class="stock-header">
        <span>KRX STOCK</span>
        <span class="stock-badge ${badgeClass}">${badgeText}</span>
      </div>` +
      renderStockRow('SAM', '#1e64ff', marketData.samsung) +
      renderBuffLine(samBuff) +
      renderStockRow('SKH', '#ff3250', marketData.skhynix) +
      renderBuffLine(skhBuff);
  };

  const renderDisclaimer = (marketData) => {
    if (!els.disclaimer) return;
    if (!marketData) {
      els.disclaimer.textContent = '';
      return;
    }
    const disclaimer = marketData.disclaimer || '주가 정보는 15분 이상 지연된 데이터이며, 투자 참고용이 아닌 게임 연출 목적입니다.';
    els.disclaimer.innerHTML =
      `<div>${escapeHtml(disclaimer)}</div>` +
      `<div style="margin-top:2px">Stock data is delayed 15+ min. For game purposes only, not investment advice.</div>`;
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const renderNewsTicker = (marketData) => {
    if (!els.newsBody) return;
    const news = marketData && marketData.news;
    if (!news || news.length === 0) {
      els.newsBody.innerHTML = '<div style="color:#4a5568;text-align:center;padding:20px">뉴스 없음</div>';
      return;
    }

    const newsJson = JSON.stringify(news);
    if (newsJson === lastNewsJson) return;
    lastNewsJson = newsJson;

    const items = news.map(n => {
      const teamClass = n.team === 'samsung' ? 'samsung' : n.team === 'skhynix' ? 'skhynix' : 'neutral';
      const corp = n.corpName ? `[${escapeHtml(n.corpName)}]` : '';
      return `<div class="news-item ${teamClass}">${corp} ${escapeHtml(n.title)}</div>`;
    }).join('');

    els.newsBody.innerHTML = items;
  };

  const renderEventBanner = () => {
    if (!els.eventBanner) return;
    const now = Date.now();
    const active = eventBannerQueue.filter(b => now - b.time < EVENT_BANNER_DURATION);
    // 오래된 배너 제거
    while (eventBannerQueue.length > 0 && now - eventBannerQueue[0].time >= EVENT_BANNER_DURATION) {
      eventBannerQueue.shift();
    }
    if (active.length === 0) {
      els.eventBanner.classList.add('hidden');
      return;
    }
    const latest = active[active.length - 1];
    const elapsed = now - latest.time;
    const opacity = elapsed > EVENT_BANNER_DURATION * 0.7 ? (1 - (elapsed - EVENT_BANNER_DURATION * 0.7) / (EVENT_BANNER_DURATION * 0.3)) : 1;
    els.eventBanner.style.opacity = Math.max(0, opacity).toFixed(2);
    els.eventBanner.textContent = escapeHtml(latest.text);
    els.eventBanner.classList.remove('hidden');
  };

  const EVENT_TYPE_ICONS = {
    BOSS_SPAWN: '\u2620',
    ZONE_MODIFIER: '\u25CE',
    GLOBAL_PARAM: '\u2699',
    NEWS_TICKER: '\u2709',
  };

  // ── 개인 시한 버프 패널 ──
  const BUFF_ICONS = {
    speed_boost: '\u26A1',   // ⚡
    damage_boost: '\u2694',  // ⚔
    shield: '\u26E8',        // ⛨
    dmg: '\u2694',           // ⚔ (보스 버프)
    spd: '\u26A1',           // ⚡ (보스 버프)
    regen: '\u2764',         // ❤ (보스 버프)
    armor: '\u26E8',         // ⛨ (보스 버프)
  };

  const TEAM_BUFF_COLORS = {
    dmg: '#ff6b6b', spd: '#34d399', regen: '#60a5fa', armor: '#a78bfa',
  };

  const renderBuffPanel = (me, teamBuffs) => {
    if (!els.buffPanel) return;
    const allBuffs = [];

    // 개인 버프
    if (me && me.activeBuffs) {
      for (const b of me.activeBuffs) {
        allBuffs.push({
          type: b.type, label: b.label, color: b.color,
          remaining: b.remaining, duration: b.duration,
        });
      }
    }
    // 팀 버프
    if (me && teamBuffs && teamBuffs[me.team]) {
      for (const tb of teamBuffs[me.team]) {
        allBuffs.push({
          type: tb.buff, label: tb.label,
          color: TEAM_BUFF_COLORS[tb.buff] || '#ffd700',
          remaining: tb.remaining, duration: tb.duration,
        });
      }
    }

    if (allBuffs.length === 0) {
      els.buffPanel.classList.add('hidden');
      return;
    }

    const html = allBuffs.map(b => {
      const icon = BUFF_ICONS[b.type] || '\u26A1';
      const secLeft = Math.max(0, (b.remaining / 1000)).toFixed(1);
      const ratio = b.duration > 0 ? b.remaining / b.duration : 0;
      const barWidth = Math.round(ratio * 100);
      return `<div class="buff-item" style="border-color:${b.color}">
        <span class="buff-icon">${icon}</span>
        <div class="buff-info">
          <div class="buff-label">${escapeHtml(b.label)}</div>
          <div class="buff-timer-bar">
            <div class="buff-timer-fill" style="width:${barWidth}%;background:${b.color}"></div>
          </div>
          <div class="buff-sec" style="color:${b.color}">${secLeft}s</div>
        </div>
      </div>`;
    }).join('');

    els.buffPanel.innerHTML = html;
    els.buffPanel.classList.remove('hidden');
  };

  const renderActiveEvents = (activeEvents) => {
    if (!els.activeEventsPanel) return;
    if (!activeEvents || activeEvents.length === 0) {
      els.activeEventsPanel.classList.add('hidden');
      return;
    }
    const now = Date.now();
    const html = activeEvents.map(e => {
      const remaining = Math.max(0, Math.ceil((e.expiresAt - now) / 1000));
      const icon = EVENT_TYPE_ICONS[e.type] || '\u26A1';
      const title = escapeHtml(e.titleKo || e.title || e.type);
      return `<div class="active-event-item">${icon} ${title} <span style="color:#ffd700">${remaining}s</span></div>`;
    }).join('');
    els.activeEventsPanel.innerHTML = '<div class="ae-header">EVENTS</div>' + html;
    els.activeEventsPanel.classList.remove('hidden');
  };

  return { init, show, hide, update };
})();
