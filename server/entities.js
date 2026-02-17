const C = require('./constants');

let nextId = 1;
const uid = () => String(nextId++);

// ─── Player ───
// spawnPoint는 mapConfig.teamSpawns[team]에서 주입
class Player {
  constructor(id, name, team, spawnPoint) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.spawnPoint = spawnPoint || { x: 400, y: 800 };
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.radius = C.PLAYER_RADIUS;
    this.isBot = false;
    this.alive = true;
    this.respawnTimer = 0;
    this.invulnTimer = 0;
    this.portalCooldowns = {};
    this.input = { up: false, down: false, left: false, right: false };

    // ── 클래스 / 레벨링 ──
    this.className = 'resistor';
    this.level = 1;
    this.xp = 0;
    this.evolveReady = false;       // 진화 가능 상태
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;

    // ── 오토 타겟팅 ──
    this.autoTargetId = null;
    this.autoTargetType = null;     // 'player' | 'cell' | 'minion'
    this.autoTargetTimer = 0;
    this.fireCooldown = 0;
    this.lastMoveAngle = 0;         // 마지막 이동 방향 (적 없을 때 발사 방향)

    this.dmgMultiplier = 1.0; // 레벨 성장으로만 강해짐 (EUV는 XP로 전환)

    // ── 오비탈 공격 (캐패시터) ──
    this.orbAngle = 0;              // 현재 궤도 기본 회전각
    this.orbHitTimers = {};         // { targetId: lastHitTime } 재히트 방지

    // ── 보호막 (캐패시터) ──
    this.shield = 0;
    this.maxShield = 0;
    this.shieldRechargeTimer = 0;   // 재충전 대기 타이머 (ms)

    // ── 시한 버프 (Timed Buffs) ──
    // 각 항목: { id, type, label, value, remaining, duration, color, icon }
    this.activeBuffs = [];

    this._applyClassStats();
    this._spawnAt(this.spawnPoint);
  }

  _applyClassStats() {
    const cls = C.CLASSES[this.className];
    this.maxHp = Math.round(cls.hp * (1 + C.LEVEL_GROWTH.hp * (this.level - 1)));
    this.speed = Math.round(cls.speed * (1 + C.LEVEL_GROWTH.speed * (this.level - 1)));
    this.hp = this.maxHp;

    // 캐패시터 보호막
    if (cls.shieldMax) {
      this.maxShield = Math.round(cls.shieldMax * (1 + C.LEVEL_GROWTH.hp * (this.level - 1)));
      this.shield = this.maxShield;
      this.shieldRechargeTimer = 0;
    } else {
      this.maxShield = 0;
      this.shield = 0;
    }
  }

  getAttackDamage() {
    const cls = C.CLASSES[this.className];
    return cls.attackDamage * (1 + C.LEVEL_GROWTH.damage * (this.level - 1)) * this.dmgMultiplier;
  }

  getClassConfig() {
    return C.CLASSES[this.className];
  }

  xpToNext() {
    return this.level * C.XP_PER_LEVEL;
  }

  grantXp(amount) {
    if (this.level >= C.MAX_LEVEL) return false;
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext() && this.level < C.MAX_LEVEL) {
      this.xp -= this.xpToNext();
      this.level++;
      leveled = true;
      this._applyClassStats();
      // 진화 레벨 도달 시
      if (this.level >= C.EVOLVE_LEVEL && this.className === 'resistor') {
        this.evolveReady = true;
      }
    }
    return leveled;
  }

  evolve(newClass) {
    if (!this.evolveReady) return false;
    if (newClass !== 'capacitor' && newClass !== 'repeater') return false;
    this.className = newClass;
    this.evolveReady = false;
    this._applyClassStats();
    this.hp = this.maxHp; // 진화 시 풀 HP
    return true;
  }

  addBuff(buff) {
    // 같은 type의 기존 버프는 갱신 (중복 방지)
    const idx = this.activeBuffs.findIndex(b => b.type === buff.type);
    if (idx >= 0) {
      this.activeBuffs[idx].remaining = buff.duration;
      this.activeBuffs[idx].value = buff.value;
      return;
    }
    this.activeBuffs.push({
      id: buff.id || buff.type,
      type: buff.type,
      label: buff.label,
      value: buff.value,
      remaining: buff.duration,
      duration: buff.duration,
      color: buff.color || '#ffffff',
      icon: buff.icon || 'bolt',
    });
  }

  getBuffValue(type) {
    const b = this.activeBuffs.find(b => b.type === type);
    return b ? b.value : 0;
  }

  _spawnAt(point) {
    this.x = point.x + (Math.random() - 0.5) * C.FAB_RADIUS;
    this.y = point.y + (Math.random() - 0.5) * C.FAB_RADIUS;
  }

  respawn() {
    this._spawnAt(this.spawnPoint);
    this._applyClassStats();
    this.hp = this.maxHp;
    this.alive = true;
    this.fireCooldown = 0;
    this.invulnTimer = 0;
    this.autoTargetId = null;
    this.autoTargetType = null;
    this.orbAngle = 0;
    this.orbHitTimers = {};
    this.shieldRechargeTimer = 0;
    this.activeBuffs = [];
    // 레벨/XP는 유지, 사망 시 XP 감소는 game.js에서 처리
  }

  serialize() {
    const data = {
      id: this.id, name: this.name, team: this.team,
      x: Math.round(this.x), y: Math.round(this.y), angle: this.angle,
      hp: Math.round(this.hp), maxHp: this.maxHp,
      alive: this.alive, kills: this.kills, deaths: this.deaths, score: this.score,
      radius: this.radius, isBot: this.isBot,
      invuln: this.invulnTimer > 0,
      // 클래스 / 레벨
      className: this.className,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext(),
      evolveReady: this.evolveReady,
      autoTargetId: this.autoTargetId,
    };
    // 캐패시터 오비탈 + 보호막
    if (this.className === 'capacitor') {
      const cls = C.CLASSES.capacitor;
      data.orbAngle = this.orbAngle;
      data.orbCount = cls.orbCount;
      data.orbRadius = cls.orbRadius;
      data.orbSize = cls.orbSize;
      data.shield = Math.round(this.shield);
      data.maxShield = this.maxShield;
    }
    // 시한 버프 목록
    if (this.activeBuffs.length > 0) {
      data.activeBuffs = this.activeBuffs.map(b => ({
        type: b.type,
        label: b.label,
        remaining: Math.round(b.remaining),
        duration: b.duration,
        color: b.color,
        icon: b.icon,
      }));
    }
    return data;
  }
}

// ─── Bullet ───
class Bullet {
  constructor(ownerId, ownerTeam, x, y, angle, damage, opts) {
    this.id = uid();
    this.ownerId = ownerId;
    this.team = ownerTeam;
    this.x = x;
    this.y = y;
    const speed = (opts && opts.speed) || C.BULLET_SPEED;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = (opts && opts.radius) || C.BULLET_RADIUS;
    this.damage = damage;
    this.lifetime = (opts && opts.lifetime) || C.BULLET_LIFETIME;
    this.alive = true;
  }

  serialize() {
    return {
      id: this.id, team: this.team,
      x: Math.round(this.x), y: Math.round(this.y),
      radius: this.radius,
    };
  }
}

// ─── Minion ───
// spawnPoint와 waypoints는 mapConfig에서 주입
class Minion {
  constructor(team, spawnPoint, waypoints) {
    this.id = uid();
    this.team = team;
    this.hp = C.MINION_HP;
    this.radius = C.MINION_RADIUS;
    this.speed = C.MINION_SPEED;
    this.damage = C.MINION_DAMAGE;
    this.attackCooldown = 0;
    this.alive = true;
    this.targetId = null;
    this.waypoints = waypoints || [];
    this.waypointIdx = 0;

    if (spawnPoint) {
      this.x = spawnPoint.x + (Math.random() - 0.5) * 40;
      this.y = spawnPoint.y + (Math.random() - 0.5) * 40;
    } else {
      this.x = 400;
      this.y = 800;
    }
  }

  serialize() {
    return {
      id: this.id, team: this.team,
      x: Math.round(this.x), y: Math.round(this.y),
      hp: this.hp, radius: this.radius, alive: this.alive,
    };
  }
}

// ─── Monster (중립 빅테크) ───
// bossCenter는 mapConfig.boss.center에서 주입
class Monster {
  constructor(typeIndex, bossCenter) {
    this.id = uid();
    const type = C.MONSTER_TYPES[typeIndex % C.MONSTER_TYPES.length];
    this.typeIndex = typeIndex % C.MONSTER_TYPES.length;
    this.typeName = type.name;
    this.buff = type.buff;
    this.buffValue = type.value;
    this.buffLabel = type.label;
    this.color = type.color;
    this.attackStyle = type.attackStyle;
    this.attackDamage = type.attackDamage;
    this.attackCooldownMax = type.attackCooldown;
    this.bulletCount = type.bulletCount || 1;
    this.spreadAngle = type.spreadAngle || 0;
    this.bulletSpeed = type.bulletSpeed || C.BOSS_BULLET_SPEED;
    this.droneCount = type.droneCount || 0;
    this.maxDrones = type.maxDrones || 0;
    this.pulseRadius = type.pulseRadius || 0;

    this.hp = type.hp || C.MONSTER_HP;
    this.maxHp = this.hp;
    this.radius = C.MONSTER_RADIUS;
    this.attackCooldown = 0;
    this.alive = true;
    this.lastHitTeam = null;

    // 이동 AI
    this.center = bossCenter || { x: 1200, y: 800 };
    this.x = this.center.x;
    this.y = this.center.y;
    this.angle = 0;                    // 바라보는 방향
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;              // 방향 전환 타이머

    // 펄스 전용
    this.pulseActive = false;
    this.pulseTimer = 0;
    this.pulseCurrentRadius = 0;
  }

  serialize() {
    return {
      id: this.id, typeName: this.typeName,
      buffLabel: this.buffLabel, color: this.color,
      attackStyle: this.attackStyle,
      x: Math.round(this.x), y: Math.round(this.y),
      angle: this.angle,
      hp: this.hp, maxHp: this.maxHp,
      radius: this.radius, alive: this.alive,
      // 펄스 이펙트
      pulseActive: this.pulseActive,
      pulseCurrentRadius: Math.round(this.pulseCurrentRadius),
      pulseMaxRadius: this.pulseRadius,
    };
  }
}

// ─── Boss Bullet (보스 전용 발사체) ───
class BossBullet {
  constructor(x, y, angle, damage, speed, color) {
    this.id = uid();
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed || C.BOSS_BULLET_SPEED;
    this.radius = C.BOSS_BULLET_RADIUS;
    this.damage = damage;
    this.color = color;
    this.alive = true;
    this.lifetime = C.BOSS_BULLET_LIFETIME;
  }

  update(dt) {
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.lifetime -= dt * 1000;
    if (this.lifetime <= 0) this.alive = false;
  }

  serialize() {
    return {
      id: this.id, x: Math.round(this.x), y: Math.round(this.y),
      radius: this.radius, color: this.color, isBoss: true,
    };
  }
}

// ─── Boss Drone (TSMC 추적 드론) ───
class BossDrone {
  constructor(x, y, color) {
    this.id = uid();
    this.x = x;
    this.y = y;
    this.speed = C.BOSS_DRONE_SPEED;
    this.radius = C.BOSS_DRONE_RADIUS;
    this.hp = C.BOSS_DRONE_HP;
    this.damage = C.BOSS_DRONE_DAMAGE;
    this.color = color;
    this.alive = true;
    this.lifetime = C.BOSS_DRONE_LIFETIME;
    this.targetId = null;
    this.angle = Math.random() * Math.PI * 2;
    this.attackCooldown = 0;
  }

  serialize() {
    return {
      id: this.id, x: Math.round(this.x), y: Math.round(this.y),
      radius: this.radius, color: this.color, angle: this.angle,
    };
  }
}

// ─── Pickup (아이템) ───
class Pickup {
  constructor(type, worldW, worldH) {
    this.id = uid();
    this.type = type;
    this.config = C.PICKUP_TYPES[type];
    this.radius = C.PICKUP_RADIUS;
    this.alive = true;

    const w = worldW || C.MAP_WIDTH;
    const h = worldH || C.MAP_HEIGHT;
    this.x = 200 + Math.random() * (w - 400);
    this.y = 200 + Math.random() * (h - 400);
  }

  serialize() {
    return {
      id: this.id, type: this.type,
      name: this.config.name, color: this.config.color,
      x: Math.round(this.x), y: Math.round(this.y),
      radius: this.radius,
    };
  }
}

// ─── CellTurret (셀 터렛) ───
// 셀 도미네이션 모드: 점령 가능한 영토 터렛
class CellTurret {
  constructor(config) {
    this.id = config.id;
    this.x = config.x;
    this.y = config.y;
    this.laneOrSector = config.laneOrSector || null;
    this.initialOwner = config.initialOwner; // 라운드 리셋 시 복원용

    this.ownerTeam = config.initialOwner;     // 'neutral' | 'samsung' | 'skhynix'
    this.state = config.initialOwner === 'neutral' ? 'neutral' : 'owned';
    this.hp = config.initialOwner === 'neutral' ? C.CELL_MAX_HP * 0.5 : C.CELL_MAX_HP;
    this.maxHp = C.CELL_MAX_HP;
    this.radius = C.CELL_RADIUS;

    this.attackCooldown = 0;
    this.currentTargetId = null;

    // 점령/재건 진행도
    this.captureProgress = 0;   // 0 ~ CELL_CAPTURE_TIME
    this.captureTeam = null;    // 현재 점령 시도 중인 팀
    this.rebuildProgress = 0;   // 0 ~ CELL_REBUILD_TIME

    // 전환 후 보호
    this.warmupTimer = 0;       // 공격 대기
    this.shieldTimer = 0;       // 무적
  }

  reset() {
    this.ownerTeam = this.initialOwner;
    this.state = this.initialOwner === 'neutral' ? 'neutral' : 'owned';
    this.hp = this.initialOwner === 'neutral' ? C.CELL_MAX_HP * 0.5 : C.CELL_MAX_HP;
    this.attackCooldown = 0;
    this.currentTargetId = null;
    this.captureProgress = 0;
    this.captureTeam = null;
    this.rebuildProgress = 0;
    this.warmupTimer = 0;
    this.shieldTimer = 0;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      ownerTeam: this.ownerTeam,
      state: this.state,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      radius: this.radius,
      captureProgress: this.captureProgress,
      captureTeam: this.captureTeam,
      rebuildProgress: this.rebuildProgress,
      currentTargetId: this.currentTargetId,
      warmup: this.warmupTimer > 0,
      shield: this.shieldTimer > 0,
      laneOrSector: this.laneOrSector,
    };
  }
}

// ─── NeutralMob (중립 몹 — 포톤/도펀트/알파 파티클) ───
class NeutralMob {
  constructor(type, config, x, y) {
    this.id = uid();
    this.type = type;             // 'photon' | 'dopant' | 'alpha'
    this.config = config;
    this.name = config.name;
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.radius = config.radius;
    this.xpReward = config.xpReward;
    this.behavior = config.behavior; // 'passive' | 'defensive'
    this.x = x;
    this.y = y;
    this.alive = true;

    // 도주 (passive 타입)
    this.fleeing = false;
    this.fleeTimer = 0;
    this.fleeDx = 0;
    this.fleeDy = 0;

    // idle 배회 (평상시 느린 이동)
    this.angle = Math.random() * Math.PI * 2;     // 현재 이동 방향
    this.wanderTimer = 2000 + Math.random() * 3000; // 방향 전환까지 남은 시간(ms)
    this.originX = x;  // 스폰 지점 (멀리 못 가게)
    this.originY = y;

    // 반격 (defensive 타입)
    this.attackCooldown = 0;
    this.attackDamage = config.attackDamage || 0;
    this.attackRange = config.attackRange || 0;
    this.attackCooldownMax = config.attackCooldown || 1000;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      radius: this.radius,
      shape: this.config.shape,
      color: this.config.color,
      fleeing: this.fleeing,
      angle: +(this.angle).toFixed(2),
    };
  }
}

module.exports = { Player, Bullet, Minion, Monster, BossBullet, BossDrone, Pickup, CellTurret, NeutralMob, uid };
