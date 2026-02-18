// 모바일 지원: 디바이스 감지, 가상 조이스틱, 정보 모달 팝업
const Mobile = (() => {
  let _isMobile = false;
  let _initialized = false;
  let _currentModal = null; // 'stock' | 'chat' | 'news' | 'menu' | null

  // 조이스틱 상태
  let joystickActive = false;
  let joystickTouchId = null;
  let joystickOrigin = { x: 0, y: 0 };
  const JOYSTICK_DEADZONE = 15;
  const JOYSTICK_MAX_DIST = 50;

  // DOM 참조
  let joystickBase = null;
  let joystickHandle = null;
  let mobileControls = null;

  // 최근 스냅샷 (모달 콘텐츠 렌더링용)
  let _lastSnapshot = null;

  // ── 디바이스 감지 ──
  const detectMobile = () => {
    const ua = navigator.userAgent;
    // UA 기반: 일반 모바일 + 인앱 브라우저 (카카오톡, 네이버 등)
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|KAKAOTALK|NAVER|Line|Instagram|FB/i.test(ua);
    // 터치 + 좁은 화면
    const touchSmall = ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      && window.innerWidth < 1024;
    return uaMobile || touchSmall;
  };

  const isMobile = () => _isMobile;

  // ── 초기화 ──
  const init = () => {
    _isMobile = detectMobile();
    if (!_isMobile) return;
    if (_initialized) return;
    _initialized = true;

    document.body.classList.add('mobile');

    mobileControls = document.getElementById('mobileControls');
    joystickBase = document.getElementById('joystickBase');
    joystickHandle = document.getElementById('joystickHandle');

    if (!mobileControls) return;

    // 모바일 컨트롤 표시
    mobileControls.classList.remove('hidden');

    // Canvas 터치 기본 동작 방지
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.touchAction = 'none';
    }

    // 조이스틱 터치 이벤트
    const joystickZone = document.getElementById('joystickZone');
    if (joystickZone) {
      joystickZone.addEventListener('touchstart', onJoystickTouchStart, { passive: false });
      joystickZone.addEventListener('touchmove', onJoystickTouchMove, { passive: false });
      joystickZone.addEventListener('touchend', onJoystickTouchEnd, { passive: false });
      joystickZone.addEventListener('touchcancel', onJoystickTouchEnd, { passive: false });
    }

    // 정보 아이콘 버튼 이벤트
    const infoBar = document.getElementById('mobileInfoBar');
    if (infoBar) {
      infoBar.querySelectorAll('.mobile-info-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openModal(btn.dataset.modal);
        });
      });
    }

    // 모달 닫기 (click + touchend 둘 다 등록 — 모바일 호환)
    const modalClose = document.getElementById('mobileModalClose');
    if (modalClose) {
      modalClose.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
      modalClose.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); closeModal(); });
    }
    const backdrop = document.querySelector('.mobile-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
      backdrop.addEventListener('touchend', (e) => { e.preventDefault(); closeModal(); });
    }
    // 모달 콘텐츠 터치 이벤트 전파 차단 (backdrop으로 전달 방지)
    const modalContent = document.querySelector('.mobile-modal-content');
    if (modalContent) {
      modalContent.addEventListener('touchend', (e) => e.stopPropagation());
      modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // visualViewport 키보드 감지 (채팅용)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportResize);
    }
  };

  // ══════════════════════════════════════
  // 조이스틱 (화면 아무 곳이나 터치 → 그 위치에 생성)
  // ══════════════════════════════════════
  const onJoystickTouchStart = (e) => {
    // 모달이 열려있으면 조이스틱 무시
    const modal = document.getElementById('mobileModal');
    if (modal && !modal.classList.contains('hidden')) return;

    e.preventDefault();
    if (joystickActive) return;
    const touch = e.changedTouches[0];

    // 상단 아이콘바 영역 터치는 무시 (y < 60px)
    if (touch.clientY < 60) return;

    joystickActive = true;
    joystickTouchId = touch.identifier;

    // 터치 위치에 조이스틱 베이스 표시
    joystickOrigin.x = touch.clientX;
    joystickOrigin.y = touch.clientY;

    if (joystickBase) {
      joystickBase.style.display = 'block';
      joystickBase.style.left = (touch.clientX - 50) + 'px';
      joystickBase.style.top = (touch.clientY - 50) + 'px';
    }

    updateJoystickVisual(touch.clientX, touch.clientY);
    updateJoystickInput(touch.clientX, touch.clientY);
  };

  const onJoystickTouchMove = (e) => {
    e.preventDefault();
    if (!joystickActive) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        updateJoystickVisual(touch.clientX, touch.clientY);
        updateJoystickInput(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const onJoystickTouchEnd = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        joystickActive = false;
        joystickTouchId = null;
        resetJoystick();
        break;
      }
    }
  };

  const updateJoystickVisual = (touchX, touchY) => {
    if (!joystickHandle || !joystickBase) return;
    let dx = touchX - joystickOrigin.x;
    let dy = touchY - joystickOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_MAX_DIST) {
      dx = (dx / dist) * JOYSTICK_MAX_DIST;
      dy = (dy / dist) * JOYSTICK_MAX_DIST;
    }
    // 핸들 위치 = 베이스 중심 + 오프셋
    joystickHandle.style.left = (50 + dx) + 'px';
    joystickHandle.style.top = (50 + dy) + 'px';
  };

  const updateJoystickInput = (touchX, touchY) => {
    const dx = touchX - joystickOrigin.x;
    const dy = touchY - joystickOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < JOYSTICK_DEADZONE) {
      if (typeof Input !== 'undefined') {
        Input.setJoystickInput({ up: false, down: false, left: false, right: false });
      }
      return;
    }

    const angle = Math.atan2(dy, dx);
    const input = { up: false, down: false, left: false, right: false };

    if (angle > -Math.PI * 0.875 && angle < -Math.PI * 0.125) input.up = true;
    if (angle > Math.PI * 0.125 && angle < Math.PI * 0.875) input.down = true;
    if (Math.abs(angle) > Math.PI * 0.375) input.left = true;
    if (Math.abs(angle) < Math.PI * 0.625) input.right = true;

    if (typeof Input !== 'undefined') {
      Input.setJoystickInput(input);
    }
  };

  const resetJoystick = () => {
    if (joystickHandle) {
      joystickHandle.style.transform = 'translate(-50%, -50%)';
    }
    if (joystickBase) {
      joystickBase.style.display = 'none';
    }
    if (typeof Input !== 'undefined') {
      Input.setJoystickInput({ up: false, down: false, left: false, right: false });
    }
  };

  // ══════════════════════════════════════
  // 모달 시스템
  // ══════════════════════════════════════
  const openModal = (type) => {
    const modal = document.getElementById('mobileModal');
    const title = document.getElementById('mobileModalTitle');
    const body = document.getElementById('mobileModalBody');
    if (!modal || !title || !body) return;

    // 같은 모달 토글
    if (_currentModal === type && !modal.classList.contains('hidden')) {
      closeModal();
      return;
    }

    _currentModal = type;

    const _t = typeof I18n !== 'undefined' ? I18n.t.bind(I18n) : (k) => k;
    const titles = { stock: _t('mobile.stock'), chat: _t('mobile.chat'), news: _t('mobile.news') };
    title.textContent = titles[type] || type.toUpperCase();

    // 콘텐츠 렌더링
    if (type === 'stock') renderStockModal(body);
    else if (type === 'chat') renderChatModal(body);
    else if (type === 'news') renderNewsModal(body);

    // 조이스틱 존 비활성화 (터치 가로채기 방지)
    const jz = document.getElementById('joystickZone');
    if (jz) jz.style.pointerEvents = 'none';

    modal.classList.remove('hidden');
  };

  const closeModal = () => {
    const modal = document.getElementById('mobileModal');
    if (modal) modal.classList.add('hidden');
    _currentModal = null;
    // 조이스틱 존 재활성화
    const jz = document.getElementById('joystickZone');
    if (jz) jz.style.pointerEvents = 'auto';
  };

  // ── Stock Modal ──
  const renderStockModal = (body) => {
    const md = _lastSnapshot && _lastSnapshot.marketData;
    if (!md) {
      const _t = typeof I18n !== 'undefined' ? I18n.t.bind(I18n) : (k) => k;
      body.innerHTML = `<div style="text-align:center;color:#6b7a8d;padding:30px">${_t('mobile.stockLoading')}</div>`;
      return;
    }
    const badge = md.isMarketOpen
      ? '<span style="color:#34d399;font-size:10px">● OPEN</span>'
      : '<span style="color:#6b7a8d;font-size:10px">● CLOSED</span>';

    const renderRow = (name, color, data) => {
      if (!data) return `<div style="padding:8px 0"><span style="color:${color};font-weight:bold">${name}</span> <span style="color:#4a5568">N/A</span></div>`;
      const pct = data.changePercent;
      const cls = pct > 0 ? '#34d399' : pct < 0 ? '#ff3250' : '#6b7a8d';
      const sign = pct > 0 ? '+' : '';
      const price = data.price ? data.price.toLocaleString() : '--';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1e2a3a">
        <div><span style="color:${color};font-weight:bold;font-size:0.85rem">${name}</span></div>
        <div style="text-align:right">
          <div style="color:#e0e6ed">${price}</div>
          <div style="color:${cls};font-size:0.8rem">${sign}${pct != null ? pct.toFixed(2) + '%' : 'N/A'}</div>
        </div>
      </div>`;
    };

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="color:#6b7a8d;font-size:10px">KRX STOCK</span> ${badge}
      </div>
      ${renderRow('SAMSUNG', '#1e64ff', md.samsung)}
      ${renderRow('SK HYNIX', '#ff3250', md.skhynix)}
      <div style="margin-top:10px;font-size:9px;color:#4a5568;text-align:center">
        ${md.disclaimer || '주가 정보는 15분 이상 지연된 데이터입니다.'}
      </div>`;
  };

  // ── Chat Modal ──
  const renderChatModal = (body) => {
    // 기존 hub 메시지를 복사
    const hubMsgs = document.getElementById('hubMessages');
    const _t2 = typeof I18n !== 'undefined' ? I18n.t.bind(I18n) : (k) => k;
    const msgHtml = hubMsgs ? hubMsgs.innerHTML : `<div style="color:#4a5568;text-align:center;padding:20px">${_t2('chat.noMessages')}</div>`;

    body.innerHTML = `
      <div class="mobile-chat-messages" id="mobileChatMessages">${msgHtml}</div>
      <div class="mobile-chat-input-row">
        <input type="text" id="mobileChatInput" placeholder="메시지..." maxlength="120" autocomplete="off">
        <button id="mobileChatSendBtn">&#x27A4;</button>
      </div>`;

    // 채팅 전송 이벤트
    const input = document.getElementById('mobileChatInput');
    const sendBtn = document.getElementById('mobileChatSendBtn');
    if (input && sendBtn) {
      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        // Chat 모듈의 소켓으로 전송
        if (typeof Chat !== 'undefined' && Chat._socket) {
          Chat._socket.emit('chat:send', { text });
        }
        input.value = '';
        input.focus();
      };
      sendBtn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); send(); }
      });
      input.addEventListener('keyup', (e) => e.stopPropagation());
      input.addEventListener('keypress', (e) => e.stopPropagation());
      setTimeout(() => input.focus(), 100);
    }
  };

  // ── News Modal ──
  const renderNewsModal = (body) => {
    const newsBody = document.getElementById('newsBody');
    const _t3 = typeof I18n !== 'undefined' ? I18n.t.bind(I18n) : (k) => k;
    const newsHtml = newsBody ? newsBody.innerHTML : `<div style="color:#4a5568;text-align:center;padding:20px">${_t3('mobile.noNews')}</div>`;
    body.innerHTML = newsHtml;
  };

  // ── 채팅 모달 메시지 동기화 (새 메시지 도착 시) ──
  const syncChatModal = () => {
    if (_currentModal !== 'chat') return;
    const mobileMsgs = document.getElementById('mobileChatMessages');
    const hubMsgs = document.getElementById('hubMessages');
    if (mobileMsgs && hubMsgs) {
      mobileMsgs.innerHTML = hubMsgs.innerHTML;
      mobileMsgs.scrollTop = mobileMsgs.scrollHeight;
    }
  };

  // ══════════════════════════════════════
  // 기타
  // ══════════════════════════════════════

  const onViewportResize = () => {
    const modal = document.getElementById('mobileModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const vv = window.visualViewport;
    if (vv) {
      const keyboardHeight = window.innerHeight - vv.height;
      const content = modal.querySelector('.mobile-modal-content');
      if (content) {
        if (keyboardHeight > 100) {
          content.style.marginBottom = keyboardHeight + 'px';
          content.style.maxHeight = (vv.height - 40) + 'px';
        } else {
          content.style.marginBottom = '';
          content.style.maxHeight = '';
        }
      }
    }
  };

  const showEvolveButton = (show) => {
    const btn = document.getElementById('btnMobileEvolve');
    if (btn) {
      if (show) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    }
  };

  // 스냅샷 저장 (모달 렌더링에 사용)
  const setSnapshot = (snapshot) => {
    _lastSnapshot = snapshot;
    // 열려있는 모달 실시간 업데이트 (stock만)
    if (_currentModal === 'stock') {
      const body = document.getElementById('mobileModalBody');
      if (body) renderStockModal(body);
    }
  };

  return { init, isMobile, showEvolveButton, setSnapshot, syncChatModal, openModal, closeModal };
})();
