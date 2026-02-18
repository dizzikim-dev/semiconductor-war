// Community Hub — 2-mode right panel (Combat / Community)
// Manages: chat, mode switching, tab bar (CHAT/NEWS), resize, unread badge
// Keeps backward-compatible `Chat` global API for Input.js and Main.js
const Chat = (() => {
  // ── State ──
  let socket = null;
  let myTeam = null;
  let mode = 'combat';           // 'combat' | 'community'
  let pinnedCommunity = false;   // user explicitly opened community mode
  let activeTab = 'chat';        // 'chat' | 'news'

  // ── DOM ──
  let hub, resizeHandle, messages, chatInput, chatSend;
  let modeToggle, modeIcon, modeLabel, unreadBadge;
  let tabBtns, chatContent, newsContent;

  // ── Messages ──
  const MAX_MSG = 120;
  let unreadCount = 0;

  // ── Resize ──
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartW = 0;
  const MIN_W = 340;
  const MAX_W = 560;
  let communityW = 440;
  const LS_WIDTH_KEY = 'hub_width';

  const TEAM_LABELS = { samsung: 'SAM', skhynix: 'SKH' };
  const TEAM_COLORS = { samsung: '#5a9bff', skhynix: '#ff6b80' };

  // ═══════════════════════════════════════
  // Init
  // ═══════════════════════════════════════
  const init = (sock, team) => {
    socket = sock;
    myTeam = team;

    hub = document.getElementById('communityHub');
    resizeHandle = document.getElementById('hubResizeHandle');
    messages = document.getElementById('hubMessages');
    chatInput = document.getElementById('hubChatInput');
    chatSend = document.getElementById('hubChatSend');
    modeToggle = document.getElementById('hubModeToggle');
    modeIcon = document.getElementById('hubModeIcon');
    modeLabel = document.getElementById('hubModeLabel');
    unreadBadge = document.getElementById('hubUnreadBadge');
    chatContent = document.getElementById('hubChatContent');
    newsContent = document.getElementById('hubNewsContent');
    tabBtns = hub ? hub.querySelectorAll('.hub-tab') : [];

    // Restore saved width
    const saved = localStorage.getItem(LS_WIDTH_KEY);
    if (saved) communityW = Math.max(MIN_W, Math.min(MAX_W, parseInt(saved, 10) || 440));

    // Events
    if (modeToggle) modeToggle.addEventListener('click', toggleMode);
    if (chatSend) chatSend.addEventListener('click', send);

    tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); send(); }
        if (e.key === 'Escape') { e.preventDefault(); setCombat(); }
        if (e.key === 'Tab') { e.preventDefault(); cycleTab(); }
      });
      chatInput.addEventListener('keyup', (e) => e.stopPropagation());
      chatInput.addEventListener('keypress', (e) => e.stopPropagation());
    }

    // Resize — 이전 리스너 정리 후 등록 (메모리 누수 방지)
    if (resizeHandle) resizeHandle.addEventListener('mousedown', onResizeStart);
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);

    // Socket — remove old listeners to prevent duplicates on re-join
    socket.off('chat:message');
    socket.off('chat:error');
    socket.off('chat:history');
    socket.off('chat:deleted');
    socket.off('chat:cleared');
    socket.on('chat:message', onMessage);
    socket.on('chat:error', () => {});
    socket.on('chat:history', onHistory);
    socket.on('chat:deleted', onDeleted);
    socket.on('chat:cleared', onCleared);

    // Show hub (PC only — mobile uses 💬 button to toggle)
    const isMobileDevice = typeof Mobile !== 'undefined' && Mobile.isMobile();
    if (hub && !isMobileDevice) hub.classList.remove('hidden');
    setCombat();
  };

  // ═══════════════════════════════════════
  // Mode Switching
  // ═══════════════════════════════════════
  const setCombat = () => {
    mode = 'combat';
    if (!hub) return;
    hub.classList.remove('hub-community');
    hub.classList.add('hub-combat');
    hub.style.width = '';
    if (modeIcon) modeIcon.innerHTML = '&#9664;';
    if (modeLabel) modeLabel.textContent = typeof I18n !== 'undefined' ? I18n.t('chat.open') : 'OPEN';
    if (chatInput) chatInput.blur();
    const c = document.getElementById('gameCanvas');
    if (c) c.focus();
  };

  const setCommunity = () => {
    mode = 'community';
    if (!hub) return;
    hub.classList.remove('hub-combat');
    hub.classList.add('hub-community');
    hub.style.width = communityW + 'px';
    if (modeIcon) modeIcon.innerHTML = '&#9654;';
    if (modeLabel) modeLabel.textContent = typeof I18n !== 'undefined' ? I18n.t('chat.close') : 'CLOSE';
    unreadCount = 0;
    if (unreadBadge) unreadBadge.classList.add('hidden');
    scrollToBottom();
  };

  const toggleMode = () => {
    if (mode === 'combat') {
      setCommunity();
      pinnedCommunity = true;
    } else {
      setCombat();
      pinnedCommunity = false;
    }
  };

  // ═══════════════════════════════════════
  // Tab Switching
  // ═══════════════════════════════════════
  const switchTab = (tab) => {
    activeTab = tab;
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (chatContent) chatContent.classList.toggle('hidden', tab !== 'chat');
    if (newsContent) newsContent.classList.toggle('hidden', tab !== 'news');
  };

  const cycleTab = () => {
    const tabs = ['chat', 'news'];
    const idx = (tabs.indexOf(activeTab) + 1) % tabs.length;
    switchTab(tabs[idx]);
  };

  // ═══════════════════════════════════════
  // Resize
  // ═══════════════════════════════════════
  const onResizeStart = (e) => {
    if (mode !== 'community') return;
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartW = hub.offsetWidth;
    hub.style.transition = 'none';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };

  const onResizeMove = (e) => {
    if (!isResizing) return;
    const delta = resizeStartX - e.clientX;
    const w = Math.max(MIN_W, Math.min(MAX_W, resizeStartW + delta));
    hub.style.width = w + 'px';
  };

  const onResizeEnd = () => {
    if (!isResizing) return;
    isResizing = false;
    hub.style.transition = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    communityW = hub.offsetWidth;
    localStorage.setItem(LS_WIDTH_KEY, String(communityW));
  };

  // ═══════════════════════════════════════
  // Chat Messages
  // ═══════════════════════════════════════
  const send = () => {
    if (!chatInput || !socket) return;
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('chat:send', { message: text });
    chatInput.value = '';
    chatInput.focus();
  };

  const onMessage = (data) => {
    appendMsg(data);
    if (mode === 'combat') {
      unreadCount++;
      if (unreadBadge) {
        unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        unreadBadge.classList.remove('hidden');
      }
    }
    // 모바일 채팅 모달 동기화
    if (typeof Mobile !== 'undefined' && Mobile.isMobile()) Mobile.syncChatModal();
  };

  const onHistory = (list) => {
    if (!messages) return;
    messages.innerHTML = '';
    list.forEach(m => appendMsg(m, true));
    scrollToBottom();
  };

  const onDeleted = ({ id }) => {
    if (!messages) return;
    const el = messages.querySelector(`[data-msg-id="${id}"]`);
    if (el) el.remove();
  };

  const onCleared = () => {
    if (!messages) return;
    messages.innerHTML = '';
  };

  const appendMsg = (data, skipScroll) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'hub-msg';
    if (data.id) div.setAttribute('data-msg-id', data.id);

    if (data.type === 'system') {
      div.classList.add('hub-msg-system');
      div.innerHTML = esc(data.message);
    } else {
      const team = data.team || '';
      const tLabel = TEAM_LABELS[team] || '';
      const tColor = TEAM_COLORS[team] || '#6b7a8d';
      const ts = fmtTime(data.ts);
      div.innerHTML =
        (ts ? `<span class="hub-ts">${ts}</span> ` : '') +
        (tLabel ? `<span class="hub-team" style="color:${tColor}">${tLabel}</span> ` : '') +
        `<span class="hub-nick" style="color:${tColor}">${esc(data.nickname || '')}</span> ` +
        `<span class="hub-text">${esc(data.message || '')}</span>`;
    }

    messages.appendChild(div);
    while (messages.children.length > MAX_MSG) messages.removeChild(messages.firstChild);
    if (!skipScroll) scrollToBottom();
  };

  const scrollToBottom = () => {
    if (messages) messages.scrollTop = messages.scrollHeight;
  };

  // ═══════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════
  const esc = (s) => {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  // ═══════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════
  const handleEnterKey = () => {
    if (mode === 'combat') {
      setCommunity();
      pinnedCommunity = true;
      setTimeout(() => chatInput && chatInput.focus(), 50);
    } else {
      if (chatInput) chatInput.focus();
    }
  };

  const handleEscKey = () => {
    if (mode === 'community') {
      setCombat();
      pinnedCommunity = false;
      return true;
    }
    return false;
  };

  const isInputFocused = () => {
    if (chatInput && document.activeElement === chatInput) return true;
    // 모바일 채팅 모달 입력 중
    const mobileInput = document.getElementById('mobileChatInput');
    if (mobileInput && document.activeElement === mobileInput) return true;
    return false;
  };
  const isOpen = () => mode === 'community';

  // Track alive state (no auto-expand on death)
  const setPlayerAlive = (playerAlive) => {
    if (!hub) return;
    // Collapse back to combat when respawning, unless user pinned it open
    if (playerAlive && !pinnedCommunity && mode === 'community') {
      setCombat();
    }
  };

  return {
    init, handleEnterKey, handleEscKey, isInputFocused, isOpen,
    setPlayerAlive, toggleMode,
    open: () => { setCommunity(); pinnedCommunity = true; },
    close: () => { setCombat(); pinnedCommunity = false; },
    toggle: toggleMode,
    get _socket() { return socket; },
  };
})();
