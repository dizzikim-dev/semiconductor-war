// 서버 스냅샷 보간 (부드러운 움직임)
const Interpolation = (() => {
  const BUFFER_SIZE = 3;
  const buffer = [];     // [{ timestamp, snapshot }]
  let renderDelay = 100; // ms (서버 스냅샷 2~3개 뒤를 렌더링)
  let pendingEvents = []; // 새 스냅샷의 이벤트를 1회만 전달하기 위한 큐

  const pushSnapshot = (snapshot) => {
    buffer.push({ timestamp: Date.now(), snapshot });
    // 새 스냅샷의 이벤트를 큐에 수집 (최대 100개 캡)
    if (snapshot.events && snapshot.events.length > 0) {
      pendingEvents.push(...snapshot.events);
      if (pendingEvents.length > 100) {
        pendingEvents = pendingEvents.slice(-100);
      }
    }
    // 버퍼 크기 제한
    while (buffer.length > BUFFER_SIZE + 2) {
      buffer.shift();
    }
  };

  // 현재 시간 - renderDelay 시점의 보간된 상태 반환
  const getInterpolatedState = () => {
    const renderTime = Date.now() - renderDelay;

    // 이벤트는 1회만 전달 후 비움
    const events = pendingEvents;
    pendingEvents = [];

    if (buffer.length < 2) {
      if (buffer.length === 0) return null;
      const snap = buffer[buffer.length - 1].snapshot;
      return { ...snap, events };
    }

    // renderTime 사이에 있는 두 스냅샷 찾기
    let before = null;
    let after = null;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
        before = buffer[i];
        after = buffer[i + 1];
        break;
      }
    }

    // 적절한 스냅샷 쌍이 없으면 최신 것 반환
    if (!before || !after) {
      const snap = buffer[buffer.length - 1].snapshot;
      return { ...snap, events };
    }

    const total = after.timestamp - before.timestamp;
    const progress = total > 0 ? (renderTime - before.timestamp) / total : 0;
    const t = Math.max(0, Math.min(1, progress));

    const result = lerpSnapshot(before.snapshot, after.snapshot, t);
    result.events = events;
    return result;
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  const lerpSnapshot = (snapA, snapB, t) => {
    // 얕은 복사 기반으로 위치만 보간 (JSON.parse 대신 성능 최적화)
    const result = { ...snapB };
    result.events = []; // 이벤트는 getInterpolatedState에서 별도 관리
    result.players = snapB.players.map(p => ({ ...p }));
    result.bullets = snapB.bullets.map(b => ({ ...b }));
    result.minions = snapB.minions.map(m => ({ ...m }));

    // 플레이어 보간
    const TELEPORT_THRESHOLD_SQ = 200 * 200; // 200px 이상 이동 시 텔레포트로 판정
    const mapA = new Map(snapA.players.map(p => [p.id, p]));
    result.players = result.players.map(p => {
      const pA = mapA.get(p.id);
      if (pA) {
        const dx = p.x - pA.x;
        const dy = p.y - pA.y;
        // 텔레포트 감지: 거리가 임계값 이상이면 보간 없이 즉시 스냅
        if (dx * dx + dy * dy < TELEPORT_THRESHOLD_SQ) {
          p.x = lerp(pA.x, p.x, t);
          p.y = lerp(pA.y, p.y, t);
        }
        // 텔레포트면 snapB 좌표를 그대로 사용 (lerp 생략)
        // Orbital angle lerp (handle wrap-around)
        if (pA.orbAngle !== undefined && p.orbAngle !== undefined) {
          let da = p.orbAngle - pA.orbAngle;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          p.orbAngle = pA.orbAngle + da * t;
        }
      }
      return p;
    });

    // 총알 보간
    const bulletMapA = new Map(snapA.bullets.map(b => [b.id, b]));
    result.bullets = result.bullets.map(b => {
      const bA = bulletMapA.get(b.id);
      if (bA) {
        b.x = lerp(bA.x, b.x, t);
        b.y = lerp(bA.y, b.y, t);
      }
      return b;
    });

    // 미니언 보간
    const minionMapA = new Map(snapA.minions.map(m => [m.id, m]));
    result.minions = result.minions.map(m => {
      const mA = minionMapA.get(m.id);
      if (mA) {
        m.x = lerp(mA.x, m.x, t);
        m.y = lerp(mA.y, m.y, t);
      }
      return m;
    });

    return result;
  };

  return { pushSnapshot, getInterpolatedState };
})();
