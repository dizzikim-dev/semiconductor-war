// 서버 스냅샷 보간 (부드러운 움직임)
const Interpolation = (() => {
  const BUFFER_SIZE = 3;
  const buffer = [];     // [{ timestamp, snapshot }]
  let renderDelay = 100; // ms (서버 스냅샷 2~3개 뒤를 렌더링)

  const pushSnapshot = (snapshot) => {
    buffer.push({ timestamp: Date.now(), snapshot });
    // 버퍼 크기 제한
    while (buffer.length > BUFFER_SIZE + 2) {
      buffer.shift();
    }
  };

  // 현재 시간 - renderDelay 시점의 보간된 상태 반환
  const getInterpolatedState = () => {
    const renderTime = Date.now() - renderDelay;

    if (buffer.length < 2) {
      return buffer.length > 0 ? buffer[buffer.length - 1].snapshot : null;
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
      return buffer[buffer.length - 1].snapshot;
    }

    const total = after.timestamp - before.timestamp;
    const progress = total > 0 ? (renderTime - before.timestamp) / total : 0;
    const t = Math.max(0, Math.min(1, progress));

    return lerpSnapshot(before.snapshot, after.snapshot, t);
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  const lerpSnapshot = (snapA, snapB, t) => {
    // 깊은 복사 기반으로 위치만 보간
    const result = JSON.parse(JSON.stringify(snapB));

    // 플레이어 보간
    const mapA = new Map(snapA.players.map(p => [p.id, p]));
    result.players = result.players.map(p => {
      const pA = mapA.get(p.id);
      if (pA) {
        p.x = lerp(pA.x, p.x, t);
        p.y = lerp(pA.y, p.y, t);
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
