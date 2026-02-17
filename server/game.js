const C = require('./constants');
const { Player, Bullet, Minion, Monster, BossBullet, BossDrone, Pickup, CellTurret, NeutralMob } = require('./entities');
const { getMapConfig, DEFAULT_MAP_ID } = require('./maps');
const EventEngine = require('./market/event-engine');

class Game {
  constructor(mapId) {
    this.mapConfig = getMapConfig(mapId || DEFAULT_MAP_ID);
    this.mapId = this.mapConfig.id;
    this.worldW = this.mapConfig.world.width;
    this.worldH = this.mapConfig.world.height;

    this.players = new Map();
    this.bullets = [];
    this.minions = [];
    this.monsters = [];
    this.pickups = [];
    this.teamBuffs = {
      [C.TEAM.SAMSUNG]: [],
      [C.TEAM.SKHYNIX]: [],
    };
    this.teamKills = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    this.territoryScore = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    this.teamCaptures = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };

    // ── Cell Turrets 초기화 ──
    this.cells = [];
    if (this.mapConfig.cellNodes) {
      for (const node of this.mapConfig.cellNodes) {
        this.cells.push(new CellTurret(node));
      }
    }

    this.minionSpawnTimer = 0;
    this.pickupSpawnTimer = 0;
    this.monsterTypeIndex = 0;
    // ── 보스 시스템 ──
    this.bossBullets = [];
    this.bossDrones = [];
    this.bossRespawnTimer = C.BOSS_RESPAWN_DELAY; // 게임 시작 후 첫 보스도 30초 대기
    this.bossAlive = false;
    this.roundStartTime = Date.now();
    this.events = [];

    // ── Map 2 (Wafer Ring) zone state ──
    this.activeZoneId = null;
    this.zoneTimer = 0;
    this.zoneActiveTimer = 0;
    this.zoneCleansed = false;
    this.zoneCleanseTimer = 0;

    // ── Map 2 boss timed spawns ──
    this.bossSpawnedTimes = new Set();

    // ── Market Data Service (외부 주입) ──
    this._marketDataService = null;

    // ── Admin Event System ──
    this.eventEngine = new EventEngine();
    this.eventZones = [];           // ZONE_MODIFIER 이벤트로 생성된 존
    this.globalModifiers = {};      // param → multiplier
    this.activeNewsTickers = [];    // NEWS_TICKER 이벤트 배열

    // ── Plasma Etch Hazard Zones ──
    this.hazardZones = [];          // [ { id, x, y, radius, phase, timer, ... } ]
    this.hazardSpawnTimer = 0;
    this._nextHazardId = 1;

    // ── Neutral Mobs ──
    this.neutralMobs = [];
    this.neutralMobSpawnTimer = 0;
    this._neutralRespawnQueue = []; // { type, timer }

    // ── Ping System ──
    this.pings = [];  // { id, x, y, type, team, playerName, createdAt }

    console.log(`[Game] Map loaded: ${this.mapConfig.name} (${this.mapId})`);
  }

  setMarketDataService(service) {
    this._marketDataService = service;
  }

  _getMarketBuff(team) {
    if (!this._marketDataService) return { damageModifier: 0, speedModifier: 0 };
    const buff = this._marketDataService.getTeamBuff(team);
    return buff || { damageModifier: 0, speedModifier: 0 };
  }

  addPlayer(id, name, team) {
    const spawn = this.mapConfig.teamSpawns[team] || { x: this.worldW / 2, y: this.worldH / 2 };
    const player = new Player(id, name, team, spawn);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  handleInput(id, input) {
    const player = this.players.get(id);
    if (!player) return;
    player.input = input;
  }

  handlePing(socketId, pingType) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    if (!['attack', 'defend', 'danger', 'retreat'].includes(pingType)) return;

    // Rate limit: 1 ping per 2 seconds per player
    const now = Date.now();
    if (p._lastPingTime && now - p._lastPingTime < 2000) return;
    p._lastPingTime = now;

    this.pings.push({
      id: `ping_${now}_${socketId}`,
      x: p.x,
      y: p.y,
      type: pingType,
      team: p.team,
      playerName: p.name,
      createdAt: now,
    });

    // Clean old pings (>4 seconds)
    this.pings = this.pings.filter(pg => now - pg.createdAt < 4000);
  }

  resetRound() {
    this.teamKills = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    this.territoryScore = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    this.teamCaptures = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    this.teamBuffs = { [C.TEAM.SAMSUNG]: [], [C.TEAM.SKHYNIX]: [] };
    for (const cell of this.cells) cell.reset();
    this.roundStartTime = Date.now();
    this.activeZoneId = null;
    this.zoneTimer = 0;
    this.zoneActiveTimer = 0;
    this.zoneCleansed = false;
    this.zoneCleanseTimer = 0;
    this.bossSpawnedTimes = new Set();
    this.bossBullets = [];
    this.bossDrones = [];
    this.bossRespawnTimer = C.BOSS_RESPAWN_DELAY;
    this.bossAlive = false;
    // Admin Event System 리셋
    this.eventEngine.reset();
    this.eventZones = [];
    this.globalModifiers = {};
    this.activeNewsTickers = [];
    this.hazardZones = [];
    this.hazardSpawnTimer = 0;
    this.neutralMobs = [];
    this.neutralMobSpawnTimer = 0;
    this._neutralRespawnQueue = [];
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.respawn();
    }
  }

  update(dt) {
    const now = Date.now();
    this.events = [];

    if (now - this.roundStartTime >= C.ROUND_DURATION) {
      this.resetRound();
    }

    this._updatePlayers(dt, now);
    this._updateBullets(dt);
    this._updateMinions(dt, now);
    this._updateBossAI(dt, now);
    this._updateBossBullets(dt);
    this._updateBossDrones(dt, now);
    this._updateCells(dt, now);
    this._checkPortals(now);
    this._spawnMinions(dt);
    this._spawnBoss(dt);
    this._spawnPickups(dt);
    this._checkBulletCollisions(now);
    this._checkMinionCombat(dt, now);
    this._checkPickupCollisions();
    this._updateZones(dt, now);
    this._processAdminEvents(dt);
    if (C.FEATURE_FLAGS.ENABLE_HAZARD_ZONES) this._updateHazardZones(dt, now);
    this._spawnNeutralMobs(dt);
    this._updateNeutralMobs(dt, now);
    this._updatePlayerBuffs(dt);
    this._cleanDead();
    this._expireBuffs(now);
  }

  // ── 플레이어 업데이트 (오토 커뱃) ──
  _updatePlayers(dt, now) {
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (p.respawnTimer > 0) p.respawnTimer -= dt * 1000;
        continue;
      }

      // 무적 타이머
      if (p.invulnTimer > 0) p.invulnTimer -= dt * 1000;

      // 이동 (WASD만)
      let dx = 0, dy = 0;
      if (p.input.up)    dy -= 1;
      if (p.input.down)  dy += 1;
      if (p.input.left)  dx -= 1;
      if (p.input.right) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const spdBuff = this._getTeamBuffValue(p.team, 'spd');
        const marketBuff = this._getMarketBuff(p.team);
        let speed = p.speed * (1 + spdBuff) * (1 + marketBuff.speedModifier);
        speed *= (1 - this._getZoneDebuff(p, 'spd'));
        // Admin event zone effects
        speed *= (1 + this._getEventZoneEffect(p, 'speed_boost'));
        speed *= (1 - this._getEventZoneEffect(p, 'slow_zone'));

        // 개인 시한 버프 (TSV Booster 등)
        const personalSpd = p.getBuffValue('speed_boost');
        if (personalSpd > 0) speed *= (1 + personalSpd);

        // 해저드 존 내 슬로우
        if (C.FEATURE_FLAGS.ENABLE_HAZARD_ZONES) {
          speed *= (1 - this._getHazardSlow(p));
        }

        // TSV 속도 캡 적용
        const baseSpeed = p.speed;
        if (speed > baseSpeed * C.TSV_SPEED_CAP) {
          speed = baseSpeed * C.TSV_SPEED_CAP;
        }

        if (this.mapConfig.connectors) {
          for (const conn of this.mapConfig.connectors) {
            if (this._dist(p, conn) <= (this.mapConfig.connectorRadius || 40)) {
              speed *= (this.mapConfig.connectorBoostSpeed || 1.5);
              break;
            }
          }
        }

        const newX = p.x + (dx / len) * speed * dt;
        const newY = p.y + (dy / len) * speed * dt;
        if (!this._collidesWithObstacle(newX, p.y, p.radius)) p.x = newX;
        if (!this._collidesWithObstacle(p.x, newY, p.radius)) p.y = newY;

        // 마지막 이동 방향 기억 (적 없을 때 전방 사격용)
        p.lastMoveAngle = Math.atan2(dy, dx);
      }

      // 맵 경계
      p.x = Math.max(p.radius, Math.min(this.worldW - p.radius, p.x));
      p.y = Math.max(p.radius, Math.min(this.worldH - p.radius, p.y));

      // ── 스폰 보호 존 (Spawn Protection Zone) ──
      for (const [team, spawn] of Object.entries(this.mapConfig.teamSpawns)) {
        const dist = this._dist(p, spawn);
        if (dist < C.SPAWN_ZONE_RADIUS) {
          if (p.team === team) {
            // 아군 스폰 존: 무적 시간 갱신
            if (p.invulnTimer < C.SPAWN_ZONE_INVULN_REFRESH) {
              p.invulnTimer = C.SPAWN_ZONE_INVULN_REFRESH;
            }
          } else {
            // 적 스폰 존: 데미지 + 밀어내기
            const dmg = C.SPAWN_ZONE_DAMAGE * dt;
            if (p.hp > 0) p.hp -= dmg;

            // 밀어내기: 스폰 중심에서 멀어지는 방향으로 강제 이동
            if (dist > 0) {
              const angle = Math.atan2(p.y - spawn.y, p.x - spawn.x);
              const pushX = Math.cos(angle) * C.SPAWN_ZONE_KNOCKBACK * dt;
              const pushY = Math.sin(angle) * C.SPAWN_ZONE_KNOCKBACK * dt;
              const newX = p.x + pushX;
              const newY = p.y + pushY;
              if (!this._collidesWithObstacle(newX, p.y, p.radius)) p.x = newX;
              if (!this._collidesWithObstacle(p.x, newY, p.radius)) p.y = newY;
            }

            // HP 소진 시 사망 처리
            if (p.hp <= 0) {
              p.hp = 0; p.alive = false; p.deaths++;
              p.respawnTimer = C.PLAYER_RESPAWN_DELAY;
              p.xp = Math.floor(p.xp * (1 - C.XP_LOSS_ON_DEATH));
              this.events.push({ type: 'spawn_kill', victim: p.name });
            }
          }
        }
      }

      // ── 오토 타겟팅 ──
      if (p.fireCooldown > 0) p.fireCooldown -= dt * 1000;
      p.autoTargetTimer -= dt * 1000;
      if (p.autoTargetTimer <= 0) {
        p.autoTargetTimer = C.AUTO_TARGET_INTERVAL;
        this._findAutoTarget(p);
      }

      const cls = p.getClassConfig();
      if (cls.attackType === 'orbit') {
        // 캐패시터/인덕터/트랜스포머: 오비탈 회전 공격 + 보호막
        this._updateOrbitals(p, dt, now);
        this._updateShield(p, dt);
        // 인덕터: 자기장 인력
        if (cls.magneticPull) {
          this._applyMagneticPull(p, dt);
        }
        // 트랜스포머: 아군 버프 오라
        if (cls.aura) {
          this._applyTransformerAura(p, dt);
        }
      } else {
        // 레지스터/리피터/오실레이터/앰플리파이어: 탄환 발사
        this._autoFire(p);
      }

      // HP 리젠 버프
      const regenVal = this._getTeamBuffValue(p.team, 'regen');
      if (regenVal > 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + regenVal * dt);
      }
    }
  }

  // ── 오토 타겟팅: 가장 가까운 적 찾기 ──
  _findAutoTarget(p) {
    const cls = p.getClassConfig();
    // 캐패시터는 오비탈 범위를 타겟팅 범위로 사용 (방향 전환용)
    const range = cls.attackType === 'orbit' ? (cls.orbRadius + 60) : cls.attackRange;
    let bestTarget = null;
    let bestDist = range;
    let bestPriorityIdx = C.AUTO_TARGET_PRIORITY.length;

    // 적 플레이어
    const playerPriIdx = C.AUTO_TARGET_PRIORITY.indexOf('player');
    if (playerPriIdx >= 0 && playerPriIdx < bestPriorityIdx) {
      for (const other of this.players.values()) {
        if (!other.alive || other.team === p.team) continue;
        if (other.invulnTimer > 0) continue;
        const d = this._dist(p, other);
        if (d <= range && (playerPriIdx < bestPriorityIdx || d < bestDist)) {
          bestTarget = { id: other.id, type: 'player', x: other.x, y: other.y };
          bestDist = d;
          bestPriorityIdx = playerPriIdx;
        }
      }
    }

    // 중립 보스 (양팀 공격 가능)
    const monsterPriIdx = C.AUTO_TARGET_PRIORITY.indexOf('monster');
    if (monsterPriIdx >= 0) {
      for (const mon of this.monsters) {
        if (!mon.alive) continue;
        const d = this._dist(p, mon);
        if (d <= range && (monsterPriIdx < bestPriorityIdx || d < bestDist)) {
          bestTarget = { id: mon.id, type: 'monster', x: mon.x, y: mon.y };
          bestDist = d;
          bestPriorityIdx = monsterPriIdx;
        }
      }
    }

    // 적 셀 (파괴 가능한 상태만)
    const cellPriIdx = C.AUTO_TARGET_PRIORITY.indexOf('cell');
    if (cellPriIdx >= 0 && cellPriIdx < bestPriorityIdx) {
      for (const cell of this.cells) {
        if (cell.ownerTeam === p.team) continue;
        if (cell.state === 'destroyed' || cell.state === 'rebuilding') continue;
        if (cell.shieldTimer > 0) continue;
        const d = this._dist(p, cell);
        if (d <= range && (cellPriIdx < bestPriorityIdx || d < bestDist)) {
          bestTarget = { id: cell.id, type: 'cell', x: cell.x, y: cell.y };
          bestDist = d;
          bestPriorityIdx = cellPriIdx;
        }
      }
    }

    // 적 미니언
    const minionPriIdx = C.AUTO_TARGET_PRIORITY.indexOf('minion');
    if (minionPriIdx >= 0 && minionPriIdx < bestPriorityIdx) {
      for (const m of this.minions) {
        if (!m.alive || m.team === p.team) continue;
        const d = this._dist(p, m);
        if (d <= range && (minionPriIdx < bestPriorityIdx || d < bestDist)) {
          bestTarget = { id: m.id, type: 'minion', x: m.x, y: m.y };
          bestDist = d;
          bestPriorityIdx = minionPriIdx;
        }
      }
    }

    // 중립 몹 (미니언보다 낮은 우선순위)
    const neutralPriIdx = C.AUTO_TARGET_PRIORITY.length; // 가장 낮은 우선순위
    if (neutralPriIdx < bestPriorityIdx || (bestTarget === null)) {
      for (const nm of this.neutralMobs) {
        if (!nm.alive) continue;
        const d = this._dist(p, nm);
        if (d <= range && (neutralPriIdx < bestPriorityIdx || d < bestDist)) {
          bestTarget = { id: nm.id, type: 'neutralMob', x: nm.x, y: nm.y };
          bestDist = d;
          bestPriorityIdx = neutralPriIdx;
        }
      }
    }

    if (bestTarget) {
      p.autoTargetId = bestTarget.id;
      p.autoTargetType = bestTarget.type;
      p.angle = Math.atan2(bestTarget.y - p.y, bestTarget.x - p.x);
    } else {
      p.autoTargetId = null;
      p.autoTargetType = null;
      p.angle = p.lastMoveAngle;
    }
  }

  // ── 오토 발사 ──
  _autoFire(p) {
    if (p.fireCooldown > 0) return;
    const cls = p.getClassConfig();

    // 타겟이 없으면 Repeater 계열만 전방 사격
    if (!p.autoTargetId) {
      if (cls.attackType === 'single' && (p.className === 'repeater' || p.className === 'oscillator' || p.className === 'amplifier')) {
        this._fireProjectile(p, cls, p.lastMoveAngle);
      }
      return;
    }

    // 타겟 유효성 재확인 (간단 거리 체크)
    let targetObj = this._resolveTarget(p.autoTargetId, p.autoTargetType);
    if (!targetObj) { p.autoTargetId = null; return; }
    const d = this._dist(p, targetObj);
    if (d > cls.attackRange * 1.2) { p.autoTargetId = null; return; }

    const angle = Math.atan2(targetObj.y - p.y, targetObj.x - p.x);
    p.angle = angle;

    this._fireProjectile(p, cls, angle);
  }

  _fireProjectile(p, cls, angle) {
    const dmgBuff = this._getTeamBuffValue(p.team, 'dmg');
    const marketBuff = this._getMarketBuff(p.team);
    const eventDmgBoost = this._getEventZoneEffect(p, 'damage_boost');
    const transformerBoost = this._getTransformerAuraDmg(p);
    const baseDamage = p.getAttackDamage() * (1 + dmgBuff) * (1 + marketBuff.damageModifier) * (1 + eventDmgBoost) * (1 + transformerBoost);

    // AMPLIFIER 증폭탄: N발째마다 강화 (스트라이커즈 1945 패턴)
    let damage = baseDamage;
    let bulletRadius = cls.bulletRadius;
    let isAmped = false;
    if (cls.ampedEvery) {
      if (!p.shotCounter) p.shotCounter = 0;
      p.shotCounter++;
      if (p.shotCounter >= cls.ampedEvery) {
        p.shotCounter = 0;
        damage = baseDamage * (cls.ampedDmgMultiplier || 3.0);
        bulletRadius = cls.ampedBulletRadius || 6;
        isAmped = true;
      }
    }

    // OSCILLATOR 확산탄: 메인 + 좌우 (스트라이커즈 1945 패턴)
    const shotCount = cls.multiShot || 1;
    const spread = cls.spreadAngle || 0;
    for (let i = 0; i < shotCount; i++) {
      let shotAngle = angle;
      if (shotCount > 1) {
        // i=0: -spread, i=1: 0 (center), i=2: +spread
        shotAngle = angle + (i - Math.floor(shotCount / 2)) * spread;
      }
      const bullet = new Bullet(p.id, p.team, p.x, p.y, shotAngle, damage, {
        speed: cls.bulletSpeed,
        radius: bulletRadius,
        lifetime: cls.bulletLifetime,
        isAmped,
      });
      this.bullets.push(bullet);
    }
    p.fireCooldown = cls.attackCooldown;
  }

  // ── 캐패시터 오비탈 회전 공격 ──
  _updateOrbitals(p, dt, now) {
    const cls = p.getClassConfig();
    const orbCount = cls.orbCount || 3;
    const orbRadius = cls.orbRadius || 90;
    const orbSpeed = cls.orbSpeed || 2.8;
    const orbSize = cls.orbSize || 14;
    const hitCooldown = cls.orbHitCooldown || 700;

    // 회전 진행
    p.orbAngle += orbSpeed * dt;
    if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;

    // 만료된 히트타이머 정리
    for (const tid of Object.keys(p.orbHitTimers)) {
      if (now - p.orbHitTimers[tid] > hitCooldown) {
        delete p.orbHitTimers[tid];
      }
    }

    const dmgBuff = this._getTeamBuffValue(p.team, 'dmg');
    const marketBuff = this._getMarketBuff(p.team);
    const eventDmgBoost = this._getEventZoneEffect(p, 'damage_boost');
    const transformerBoost = this._getTransformerAuraDmg(p);
    const damage = p.getAttackDamage() * (1 + dmgBuff) * (1 + marketBuff.damageModifier) * (1 + eventDmgBoost) * (1 + transformerBoost);

    // 각 오브 위치 계산 및 충돌 체크
    for (let i = 0; i < orbCount; i++) {
      const angle = p.orbAngle + (Math.PI * 2 / orbCount) * i;
      const ox = p.x + Math.cos(angle) * orbRadius;
      const oy = p.y + Math.sin(angle) * orbRadius;

      // vs 적 플레이어
      for (const other of this.players.values()) {
        if (!other.alive || other.team === p.team) continue;
        if (other.invulnTimer > 0) continue;
        if (p.orbHitTimers[other.id] && now - p.orbHitTimers[other.id] < hitCooldown) continue;
        const dx = ox - other.x, dy = oy - other.y;
        if (dx * dx + dy * dy <= (orbSize + other.radius) * (orbSize + other.radius)) {
          p.orbHitTimers[other.id] = now;
          const armorBuff = this._getTeamBuffValue(other.team, 'armor');
          this._applyDamageToPlayer(other, damage * (1 - armorBuff), p);
        }
      }

      // vs 적 미니언
      for (const m of this.minions) {
        if (!m.alive || m.team === p.team) continue;
        if (p.orbHitTimers[m.id] && now - p.orbHitTimers[m.id] < hitCooldown) continue;
        const dx = ox - m.x, dy = oy - m.y;
        if (dx * dx + dy * dy <= (orbSize + m.radius) * (orbSize + m.radius)) {
          p.orbHitTimers[m.id] = now;
          m.hp -= damage;
          if (m.hp <= 0) {
            m.alive = false;
            this._grantXp(p, 'minionKill');
          }
        }
      }

      // vs 몬스터
      for (const mon of this.monsters) {
        if (!mon.alive) continue;
        if (p.orbHitTimers[mon.id] && now - p.orbHitTimers[mon.id] < hitCooldown) continue;
        const dx = ox - mon.x, dy = oy - mon.y;
        if (dx * dx + dy * dy <= (orbSize + mon.radius) * (orbSize + mon.radius)) {
          p.orbHitTimers[mon.id] = now;
          mon.hp -= damage;
          mon.lastHitTeam = p.team;
          this._trackDamage(mon, p.id, damage);
          if (mon.hp <= 0) {
            mon.alive = false;
            this._onMonsterKill(mon, p.team, p.id);
          }
        }
      }

      // vs 중립 몹
      for (const nm of this.neutralMobs) {
        if (!nm.alive) continue;
        if (p.orbHitTimers[nm.id] && now - p.orbHitTimers[nm.id] < hitCooldown) continue;
        const dx = ox - nm.x, dy = oy - nm.y;
        if (dx * dx + dy * dy <= (orbSize + nm.radius) * (orbSize + nm.radius)) {
          p.orbHitTimers[nm.id] = now;
          nm.hp -= damage;
          if (nm.behavior === 'passive' && !nm.fleeing) {
            nm.fleeing = true;
            nm.fleeTimer = nm.config.fleeDuration || 2000;
            const fAngle = Math.atan2(nm.y - p.y, nm.x - p.x);
            nm.fleeDx = Math.cos(fAngle);
            nm.fleeDy = Math.sin(fAngle);
          }
          if (nm.hp <= 0) {
            nm.alive = false;
            p.score += nm.xpReward;
            p.grantXp(nm.xpReward);
            this.events.push({ type: 'neutral_kill', mobName: nm.name, playerId: p.id });
            this._neutralRespawnQueue.push({ type: nm.type, timer: nm.config.respawnDelay });
          }
        }
      }

      // vs 적 셀 터렛
      for (const cell of this.cells) {
        if (cell.state === 'destroyed' || cell.state === 'rebuilding') continue;
        if (cell.ownerTeam === p.team) continue;
        if (cell.shieldTimer > 0) continue;
        const cid = `cell_${cell.id}`;
        if (p.orbHitTimers[cid] && now - p.orbHitTimers[cid] < hitCooldown) continue;
        const dx = ox - cell.x, dy = oy - cell.y;
        if (dx * dx + dy * dy <= (orbSize + cell.radius) * (orbSize + cell.radius)) {
          p.orbHitTimers[cid] = now;
          let cellDmg = damage * (1 + (cls.cellDmgBonus || 0));
          // 백도어 감소
          const nearbyAllyMinion = this.minions.some(m =>
            m.alive && m.team === p.team && this._dist(m, cell) <= C.CELL_FRIENDLY_MINION_RANGE
          );
          if (!nearbyAllyMinion) cellDmg *= (1 - C.CELL_BACKDOOR_REDUCTION);
          cell.hp -= cellDmg;
          if (cell.hp <= 0) {
            cell.hp = 0;
            cell.state = 'destroyed';
            cell.captureProgress = 0;
            cell.captureTeam = null;
            this._grantXp(p, 'cellDestroy');
            this.events.push({ type: 'cell_destroyed', cellId: cell.id, team: p.team });
          }
        }
      }
    }
  }

  // ── 캐패시터 보호막 업데이트 ──
  _updateShield(p, dt) {
    const cls = p.getClassConfig();
    if (!cls.shieldMax) return;

    if (p.shield <= 0) {
      // 보호막 소진: 재충전 대기
      p.shieldRechargeTimer -= dt * 1000;
      if (p.shieldRechargeTimer <= 0) {
        // 재충전 시작
        p.shield = Math.min(p.maxShield, p.shield + cls.shieldRechargeRate * dt);
      }
    } else if (p.shield < p.maxShield && p.shieldRechargeTimer <= 0) {
      // 보호막 부분 손실 시 서서히 회복
      p.shield = Math.min(p.maxShield, p.shield + cls.shieldRechargeRate * dt);
    }
  }

  // ── 보호막 포함 플레이어 데미지 적용 ──
  _applyDamageToPlayer(target, damage, attacker, source) {
    // 스폰 보호 존 체크 (최우선)
    if (this._isInOwnSpawnZone(target)) return;

    // 캐패시터 보호막 우선 흡수
    if (target.shield > 0) {
      if (target.shield >= damage) {
        target.shield -= damage;
        damage = 0;
      } else {
        damage -= target.shield;
        target.shield = 0;
      }
      // 보호막이 깨지면 재충전 대기 시작
      if (target.shield <= 0) {
        const cls = C.CLASSES[target.className];
        target.shieldRechargeTimer = (cls && cls.shieldRechargeDelay) || 5000;
      }
    }

    // Photoresist 실드 흡수 (캐패시터 보호막 다음)
    if (damage > 0) {
      const prBuff = target.activeBuffs.find(b => b.type === 'damage_shield');
      if (prBuff && prBuff.value > 0) {
        if (prBuff.value >= damage) {
          prBuff.value -= damage;
          damage = 0;
        } else {
          damage -= prBuff.value;
          prBuff.value = 0;
          // 실드 소진 → 버프 제거
          target.activeBuffs = target.activeBuffs.filter(b => b.type !== 'damage_shield');
        }
      }
    }

    if (damage <= 0) return;

    // 데미지 기여 추적 (어시스트 시스템)
    if (attacker) {
      this._trackDamage(target, attacker.id, damage);
    }

    target.hp -= damage;
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false; target.deaths++;
      target.respawnTimer = C.PLAYER_RESPAWN_DELAY;
      target.xp = Math.floor(target.xp * (1 - C.XP_LOSS_ON_DEATH));

      // 킬러 팀 파악 (attacker, source, 또는 기여 기록에서)
      const killerTeam = attacker ? attacker.team : (source && source.team) || null;

      if (attacker) {
        attacker.kills++; this.teamKills[attacker.team]++;
        // 복수 킬 체크
        const isRevenge = attacker.revengeTargetId === target.id;
        this._grantXp(attacker, 'playerKill');
        if (isRevenge) {
          this._grantXp(attacker, 'revenge');
          attacker.revengeTargetId = null;
          this.events.push({ type: 'revenge', killer: attacker.name, victim: target.name, killerTeam: attacker.team });
        }
        this.events.push({ type: 'kill', killer: attacker.name, victim: target.name, killerTeam: attacker.team, killerClass: attacker.className });
        target.lastKilledBy = { name: attacker.name, id: attacker.id, className: attacker.className };
        target.revengeTargetId = attacker.id;
      } else if (source === 'hazard') {
        target.lastKilledBy = { name: 'Plasma Etch', className: 'hazard' };
        target.revengeTargetId = null;
      } else if (source && source.typeName) {
        target.lastKilledBy = { name: source.typeName, className: source.className || 'boss' };
        target.revengeTargetId = null;
      } else {
        target.lastKilledBy = null;
        target.revengeTargetId = null;
      }

      // 어시스트 XP: 킬러와 같은 팀이고 기여도 충족한 플레이어에게 보상
      this._processAssists(target, attacker ? attacker.id : null, killerTeam);
    }
  }

  // ── 데미지 기여 추적 ──
  _trackDamage(target, attackerId, damage) {
    const now = Date.now();
    if (!target.damageContributors) target.damageContributors = {};
    const entry = target.damageContributors[attackerId];
    if (entry) {
      entry.damage += damage;
      entry.lastTime = now;
    } else {
      target.damageContributors[attackerId] = { damage, lastTime: now };
    }
  }

  // ── 어시스트 XP 분배 ──
  _processAssists(deadTarget, killerId, killerTeam) {
    const now = Date.now();
    const threshold = deadTarget.maxHp * C.ASSIST_THRESHOLD;
    for (const [playerId, entry] of Object.entries(deadTarget.damageContributors || {})) {
      if (playerId === killerId) continue; // 킬러는 이미 킬 XP 받음
      if (now - entry.lastTime > C.DAMAGE_TRACKER_EXPIRE) continue; // 오래된 기여 무시
      if (entry.damage < threshold) continue; // 기여도 미달
      const contributor = this.players.get(playerId);
      if (!contributor || !contributor.alive) continue;
      // 같은 팀만 어시스트 인정 (적에게 줄 필요 없음)
      if (killerTeam && contributor.team !== killerTeam) continue;
      this._grantXp(contributor, 'assist');
      this.events.push({ type: 'assist', player: contributor.name, playerId: contributor.id, victim: deadTarget.name, team: contributor.team });
    }
    deadTarget.damageContributors = {}; // 기록 초기화
  }

  // ── 보스 처치 보상 ──
  _onMonsterKill(mon, team, killerId) {
    if (team) {
      // 같은 버프 타입은 갱신 (중복 스택 방지)
      const existingIdx = this.teamBuffs[team].findIndex(b => b.buff === mon.buff);
      if (existingIdx >= 0) {
        this.teamBuffs[team][existingIdx].value = mon.buffValue;
        this.teamBuffs[team][existingIdx].label = mon.buffLabel;
        this.teamBuffs[team][existingIdx].expiresAt = Date.now() + C.MONSTER_BUFF_DURATION;
      } else {
        this.teamBuffs[team].push({
          buff: mon.buff, value: mon.buffValue, label: mon.buffLabel,
          expiresAt: Date.now() + C.MONSTER_BUFF_DURATION,
        });
      }
      this.events.push({
        type: 'monster_kill', team,
        monsterName: mon.typeName, buffLabel: mon.buffLabel,
      });
      // 보스 라스트히트 XP: 처치자에게 monsterKill 보상
      if (killerId) {
        const killer = this.players.get(killerId);
        if (killer && killer.alive) {
          this._grantXp(killer, 'monsterKill');
        }
      }
      // 보스 어시스트 XP: 데미지 기여한 모든 플레이어에게 보상
      const now = Date.now();
      for (const [playerId, entry] of Object.entries(mon.damageContributors || {})) {
        if (now - entry.lastTime > C.DAMAGE_TRACKER_EXPIRE) continue;
        if (playerId === killerId) continue; // 처치자는 이미 monsterKill XP 받음
        const contributor = this.players.get(playerId);
        if (!contributor || !contributor.alive) continue;
        this._grantXp(contributor, 'bossAssist');
      }
      mon.damageContributors = {};
      // Wafer Ring: boss kill → cleanse zones
      if (this.mapConfig.zones && this.mapConfig.zones.length > 0) {
        this.zoneCleansed = true;
        this.zoneCleanseTimer = this.mapConfig.zoneCleanseDuration || 30000;
        this.activeZoneId = null;
      }
    }
  }

  // ── 타겟 오브젝트 찾기 ──
  _resolveTarget(targetId, targetType) {
    if (targetType === 'player') {
      const t = this.players.get(targetId);
      return (t && t.alive) ? t : null;
    } else if (targetType === 'cell') {
      const t = this.cells.find(c => c.id === targetId);
      return (t && t.state !== 'destroyed' && t.state !== 'rebuilding') ? t : null;
    } else if (targetType === 'minion') {
      const t = this.minions.find(m => m.id === targetId);
      return (t && t.alive) ? t : null;
    } else if (targetType === 'monster') {
      const t = this.monsters.find(m => m.id === targetId);
      return (t && t.alive) ? t : null;
    } else if (targetType === 'neutralMob') {
      const t = this.neutralMobs.find(m => m.id === targetId);
      return (t && t.alive) ? t : null;
    }
    return null;
  }

  // ── XP 부여 + 스코어 누적 ──
  _grantXp(player, rewardType) {
    const amount = C.XP_REWARD[rewardType] || 0;
    if (amount <= 0) return;
    player.score += amount;
    const leveled = player.grantXp(amount);
    if (leveled) {
      this.events.push({ type: 'level_up', playerId: player.id, level: player.level, name: player.name });
    }
    if (player.evolveReady) {
      this.events.push({ type: 'evolve_ready', playerId: player.id });
    }
  }

  // ── 총알 업데이트 ──
  _updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifetime -= dt * 1000;

      if (b.lifetime <= 0 || b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH) {
        b.alive = false;
        continue;
      }
      // 장애물에 총알 충돌
      if (this._collidesWithObstacle(b.x, b.y, b.radius)) {
        b.alive = false;
      }
    }
  }

  // ── 미니언 AI (웨이포인트 기반) ──
  _updateMinions(dt, now) {
    for (const m of this.minions) {
      if (!m.alive) continue;

      // 가장 가까운 적 찾기
      let closestDist = Infinity;
      let closestTarget = null;

      for (const p of this.players.values()) {
        if (p.team === m.team || !p.alive) continue;
        const d = this._dist(m, p);
        if (d < closestDist) { closestDist = d; closestTarget = p; }
      }
      for (const other of this.minions) {
        if (other.team === m.team || !other.alive) continue;
        const d = this._dist(m, other);
        if (d < closestDist) { closestDist = d; closestTarget = other; }
      }

      // 적이 가까우면 공격, 아니면 웨이포인트 따라 이동
      const aggroRange = 200;
      let targetX, targetY;

      if (closestTarget && closestDist < aggroRange) {
        targetX = closestTarget.x;
        targetY = closestTarget.y;
      } else if (m.waypoints && m.waypoints.length > 0) {
        const wp = m.waypoints[m.waypointIdx];
        const wpDist = Math.sqrt((m.x - wp.x) ** 2 + (m.y - wp.y) ** 2);
        if (wpDist < 30 && m.waypointIdx < m.waypoints.length - 1) {
          m.waypointIdx++;
        }
        const curWp = m.waypoints[m.waypointIdx];
        targetX = curWp.x;
        targetY = curWp.y;
      } else if (closestTarget) {
        targetX = closestTarget.x;
        targetY = closestTarget.y;
      } else {
        continue;
      }

      // 이동
      const angle = Math.atan2(targetY - m.y, targetX - m.x);
      m.x += Math.cos(angle) * m.speed * dt;
      m.y += Math.sin(angle) * m.speed * dt;

      // 근접 공격
      if (closestTarget && closestDist <= C.MINION_ATTACK_RANGE + m.radius + (closestTarget.radius || 0)) {
        if (m.attackCooldown <= 0) {
          m.attackCooldown = C.MINION_ATTACK_COOLDOWN;
          if (closestTarget.constructor.name === 'Player') {
            // C-1: 보호막/아머 적용, C-2: XP 손실 + lastKilledBy 처리
            this._applyDamageToPlayer(closestTarget, m.damage, null, { typeName: `${m.team} Minion`, className: 'minion' });
          } else {
            closestTarget.hp -= m.damage;
            if (closestTarget.hp <= 0) {
              closestTarget.alive = false;
            }
          }
        }
      }

      m.attackCooldown = Math.max(0, m.attackCooldown - dt * 1000);
      m.x = Math.max(m.radius, Math.min(this.worldW - m.radius, m.x));
      m.y = Math.max(m.radius, Math.min(this.worldH - m.radius, m.y));
    }
  }

  // ── 몬스터 AI ──
  // ── 보스 AI: 이동 + 공격 패턴 ──
  _updateBossAI(dt, now) {
    for (const mon of this.monsters) {
      if (!mon.alive || mon.isEventBoss) continue;

      // 1) 배회 이동
      mon.wanderTimer -= dt * 1000;
      if (mon.wanderTimer <= 0) {
        mon.wanderAngle = Math.random() * Math.PI * 2;
        mon.wanderTimer = 2000 + Math.random() * 2000;
      }
      const tx = mon.center.x + Math.cos(mon.wanderAngle) * C.BOSS_WANDER_RADIUS * 0.6;
      const ty = mon.center.y + Math.sin(mon.wanderAngle) * C.BOSS_WANDER_RADIUS * 0.6;
      const dx = tx - mon.x, dy = ty - mon.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        mon.x += (dx / dist) * C.BOSS_MOVE_SPEED * dt;
        mon.y += (dy / dist) * C.BOSS_MOVE_SPEED * dt;
      }
      // 맵 경계 클램프
      mon.x = Math.max(mon.radius, Math.min(this.worldW - mon.radius, mon.x));
      mon.y = Math.max(mon.radius, Math.min(this.worldH - mon.radius, mon.y));

      // 2) 가장 가까운 플레이어 찾기
      let closest = null, closestDist = Infinity;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = this._dist(mon, p);
        if (d < closestDist) { closestDist = d; closest = p; }
      }
      if (closest) {
        mon.angle = Math.atan2(closest.y - mon.y, closest.x - mon.x);
      }

      // 3) 공격 쿨다운
      mon.attackCooldown = Math.max(0, mon.attackCooldown - dt * 1000);
      if (mon.attackCooldown > 0 || !closest) continue;
      if (closestDist > 400) continue; // 사거리 밖이면 공격 안함

      mon.attackCooldown = mon.attackCooldownMax;

      // 4) 공격 스타일별 실행
      switch (mon.attackStyle) {
        case 'spray': {
          const baseAngle = mon.angle;
          for (let i = 0; i < mon.bulletCount; i++) {
            const offset = (i - (mon.bulletCount - 1) / 2) * mon.spreadAngle;
            this.bossBullets.push(new BossBullet(
              mon.x, mon.y, baseAngle + offset, mon.attackDamage, C.BOSS_BULLET_SPEED, mon.color, mon.typeName
            ));
          }
          break;
        }
        case 'sniper': {
          this.bossBullets.push(new BossBullet(
            mon.x, mon.y, mon.angle, mon.attackDamage, mon.bulletSpeed, mon.color, mon.typeName
          ));
          break;
        }
        case 'drone': {
          const liveDrones = this.bossDrones.filter(d => d.alive && d.color === mon.color);
          if (liveDrones.length < mon.maxDrones) {
            for (let i = 0; i < mon.droneCount; i++) {
              if (liveDrones.length + i >= mon.maxDrones) break;
              const d = new BossDrone(mon.x, mon.y, mon.color);
              d.targetId = closest.id;
              this.bossDrones.push(d);
            }
          }
          break;
        }
        case 'pulse': {
          if (!mon.pulseActive) {
            mon.pulseActive = true;
            mon.pulseCurrentRadius = 0;
            mon.pulseTimer = 400; // 펄스 확장 시간 ms
          }
          break;
        }
        case 'twin': {
          const perp = mon.angle + Math.PI / 2;
          const offset = 8;
          for (const side of [-1, 1]) {
            this.bossBullets.push(new BossBullet(
              mon.x + Math.cos(perp) * offset * side,
              mon.y + Math.sin(perp) * offset * side,
              mon.angle, mon.attackDamage, C.BOSS_BULLET_SPEED, mon.color, mon.typeName
            ));
          }
          break;
        }
      }

      // 5) 펄스 업데이트
      if (mon.pulseActive) {
        mon.pulseTimer -= dt * 1000;
        const progress = 1 - Math.max(0, mon.pulseTimer) / 400;
        mon.pulseCurrentRadius = mon.pulseRadius * progress;
        if (mon.pulseTimer <= 0) {
          // 펄스 판정
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            if (this._dist(mon, p) <= mon.pulseRadius + p.radius) {
              this._applyDamageToPlayer(p, mon.attackDamage, null, mon);
            }
          }
          mon.pulseActive = false;
          mon.pulseCurrentRadius = 0;
        }
      }
    }
  }

  // ── 보스 발사체 업데이트 ──
  _updateBossBullets(dt) {
    for (const b of this.bossBullets) {
      if (!b.alive) continue;
      b.update(dt);
      // 맵 밖이면 제거
      if (b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH) {
        b.alive = false;
        continue;
      }
      // vs 플레이어
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (this._circleCollide(b, p)) {
          this._applyDamageToPlayer(p, b.damage, null, { typeName: b.bossName });
          b.alive = false;
          break;
        }
      }
    }
    this.bossBullets = this.bossBullets.filter(b => b.alive);
  }

  // ── 보스 드론 업데이트 (추적 AI) ──
  _updateBossDrones(dt, now) {
    for (const d of this.bossDrones) {
      if (!d.alive) continue;
      d.lifetime -= dt * 1000;
      if (d.lifetime <= 0) { d.alive = false; continue; }
      d.attackCooldown = Math.max(0, d.attackCooldown - dt * 1000);

      // 타겟 추적
      let target = this.players.get(d.targetId);
      if (!target || !target.alive) {
        // 가장 가까운 플레이어 재탐색
        let best = null, bestDist = Infinity;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const dist = this._dist(d, p);
          if (dist < bestDist) { bestDist = dist; best = p; }
        }
        target = best;
        if (target) d.targetId = target.id;
      }
      if (target) {
        const dx = target.x - d.x, dy = target.y - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        d.angle = Math.atan2(dy, dx);
        if (dist > 5) {
          d.x += (dx / dist) * d.speed * dt;
          d.y += (dy / dist) * d.speed * dt;
        }
        // 접촉 데미지
        if (dist <= d.radius + target.radius && d.attackCooldown <= 0) {
          this._applyDamageToPlayer(target, d.damage, null);
          d.attackCooldown = 800;
        }
      }
    }
    this.bossDrones = this.bossDrones.filter(d => d.alive);
  }

  // ── 셀 터렛 업데이트 ──
  _updateCells(dt, now) {
    for (const cell of this.cells) {
      // 타이머 감소
      if (cell.warmupTimer > 0) cell.warmupTimer -= dt * 1000;
      if (cell.shieldTimer > 0) cell.shieldTimer -= dt * 1000;
      if (cell.attackCooldown > 0) cell.attackCooldown -= dt * 1000;

      // ── 상태별 처리 ──
      // neutral 셀은 수동 — 공격하지 않음 (파괴/점령만 가능)
      if (cell.state === 'owned' && cell.warmupTimer <= 0) {
        this._cellAutoAttack(cell, dt);
      } else if (cell.state === 'destroyed') {
        // 점령 시도 감지: 파괴된 셀 근처에 적(또는 아무) 팀 플레이어가 있는지
        this._cellCaptureCheck(cell, dt);
      } else if (cell.state === 'rebuilding') {
        // 재건 진행
        this._cellRebuildCheck(cell, dt);
      }
    }

    // ── 영토 점수 누적 ──
    for (const team of [C.TEAM.SAMSUNG, C.TEAM.SKHYNIX]) {
      const ownedCount = this.cells.filter(c => c.ownerTeam === team && (c.state === 'owned')).length;
      this.territoryScore[team] += C.CELL_SCORE_PER_SEC * ownedCount * dt;
    }
  }

  _cellAutoAttack(cell, dt) {
    // 타겟 우선순위: 플레이어 > 미니언
    let bestTarget = null;
    let bestDist = C.CELL_ATTACK_RANGE;
    let bestPriority = 0; // 1 = minion, 2 = player

    for (const p of this.players.values()) {
      if (!p.alive || p.team === cell.ownerTeam) continue;
      if (p.invulnTimer > 0) continue;
      const d = this._dist(cell, p);
      if (d <= C.CELL_ATTACK_RANGE) {
        if (bestPriority < 2 || d < bestDist) {
          bestTarget = p;
          bestDist = d;
          bestPriority = 2;
        }
      }
    }

    if (bestPriority < 2) {
      for (const m of this.minions) {
        if (!m.alive || m.team === cell.ownerTeam) continue;
        const d = this._dist(cell, m);
        if (d <= C.CELL_ATTACK_RANGE && (bestPriority < 1 || d < bestDist)) {
          bestTarget = m;
          bestDist = d;
          bestPriority = 1;
        }
      }
    }

    cell.currentTargetId = bestTarget ? bestTarget.id : null;

    // ── 오버히트 게이지 ──
    if (bestTarget) {
      // 적이 있으면 충전, idle 타이머 리셋
      cell.overheat = Math.min(1, cell.overheat + C.CELL_OVERHEAT_CHARGE_RATE * dt);
      cell.idleTimer = 0;
    } else {
      // 적이 없으면 대기 후 냉각
      cell.idleTimer += dt;
      if (cell.idleTimer >= C.CELL_OVERHEAT_IDLE_DELAY) {
        cell.overheat = Math.max(0, cell.overheat - C.CELL_OVERHEAT_DECAY_RATE * dt);
      }
    }

    if (bestTarget && cell.attackCooldown <= 0) {
      const angle = Math.atan2(bestTarget.y - cell.y, bestTarget.x - cell.x);
      const bullet = new Bullet(
        `cell_${cell.id}`, cell.ownerTeam,
        cell.x, cell.y, angle, C.CELL_ATTACK_DAMAGE
      );
      this.bullets.push(bullet);
      cell.attackCooldown = cell.getAttackCooldown();
    }
  }

  _cellCaptureCheck(cell, dt) {
    // 파괴된 셀 주변 플레이어 탐지
    const teamsPresent = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (this._dist(p, cell) <= C.CELL_CAPTURE_RADIUS) {
        teamsPresent[p.team]++;
      }
    }

    const samPresent = teamsPresent[C.TEAM.SAMSUNG];
    const skhPresent = teamsPresent[C.TEAM.SKHYNIX];

    // 양 팀 모두 있으면 분쟁 — 진행 멈춤
    if (samPresent > 0 && skhPresent > 0) {
      return;
    }

    const capturingTeam = samPresent > 0 ? C.TEAM.SAMSUNG : skhPresent > 0 ? C.TEAM.SKHYNIX : null;

    if (!capturingTeam) {
      // 아무도 없으면 점령 진행도 서서히 감소
      cell.captureProgress = Math.max(0, cell.captureProgress - dt * 1000 * 0.5);
      if (cell.captureProgress <= 0) cell.captureTeam = null;
      return;
    }

    // 점령팀 변경 시 리셋
    if (cell.captureTeam && cell.captureTeam !== capturingTeam) {
      cell.captureProgress = 0;
    }
    cell.captureTeam = capturingTeam;
    cell.captureProgress += dt * 1000;

    if (cell.captureProgress >= C.CELL_CAPTURE_TIME) {
      // 재건 시작
      cell.state = 'rebuilding';
      cell.rebuildProgress = 0;
    }
  }

  _cellRebuildCheck(cell, dt) {
    // 재건 중 분쟁 체크
    const teamsPresent = { [C.TEAM.SAMSUNG]: 0, [C.TEAM.SKHYNIX]: 0 };
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (this._dist(p, cell) <= C.CELL_CAPTURE_RADIUS) {
        teamsPresent[p.team]++;
      }
    }

    const enemyTeam = cell.captureTeam === C.TEAM.SAMSUNG ? C.TEAM.SKHYNIX : C.TEAM.SAMSUNG;
    if (teamsPresent[enemyTeam] > 0) {
      // 적이 있으면 재건 일시정지
      return;
    }

    cell.rebuildProgress += dt * 1000;

    if (cell.rebuildProgress >= C.CELL_REBUILD_TIME) {
      // 재건 완료 → 소유권 변경
      cell.ownerTeam = cell.captureTeam;
      cell.state = 'owned';
      cell.hp = cell.maxHp * C.CELL_REBUILD_HP_RATIO;
      cell.warmupTimer = C.CELL_WARMUP_TIME;
      cell.shieldTimer = C.CELL_SHIELD_TIME;
      cell.captureProgress = 0;
      cell.rebuildProgress = 0;
      cell.currentTargetId = null;
      this.teamCaptures[cell.ownerTeam]++;
      // 점령 구역 내 해당 팀 플레이어에게 XP 부여
      for (const p of this.players.values()) {
        if (p.alive && p.team === cell.ownerTeam && this._dist(p, cell) <= C.CELL_CAPTURE_RADIUS) {
          this._grantXp(p, 'cellCapture');
        }
      }
      this.events.push({
        type: 'cell_captured', cellId: cell.id,
        team: cell.ownerTeam,
      });
    }
  }

  // ── 포탈 텔레포트 ──
  _checkPortals(now) {
    const portals = this.mapConfig.portals;
    if (!portals || portals.length === 0) return;
    const portalR = this.mapConfig.portalRadius || 28;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const portal of portals) {
        const dx = p.x - portal.x;
        const dy = p.y - portal.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > portalR + p.radius) continue;

        // 쿨다운 체크
        if (p.portalCooldowns[portal.id] && now < p.portalCooldowns[portal.id]) continue;

        // 페어 포탈 찾기
        const paired = portals.find(pt => pt.id === portal.pairedId);
        if (!paired) continue;

        // 텔레포트
        p.x = paired.x;
        p.y = paired.y;
        p.invulnTimer = this.mapConfig.portalInvulnTime || 250;
        p.portalCooldowns[portal.id] = now + portal.cooldown;
        p.portalCooldowns[paired.id] = now + portal.cooldown;

        this.events.push({ type: 'portal_use', playerId: p.id, from: portal.id, to: paired.id });
        break;
      }
    }
  }

  // ── 총알 충돌 ──
  _checkBulletCollisions(now) {
    for (const b of this.bullets) {
      if (!b.alive) continue;

      // vs 적 플레이어 (보호막 흡수 포함)
      for (const p of this.players.values()) {
        if (!p.alive || p.team === b.team) continue;
        if (p.invulnTimer > 0) continue;
        if (this._isInOwnSpawnZone(p)) continue; // 스폰 보호 존
        if (this._circleCollide(b, p)) {
          const armorBuff = this._getTeamBuffValue(p.team, 'armor');
          let dmg = b.damage * (1 - armorBuff);
          b.alive = false;

          // 보호막 흡수
          if (p.shield > 0) {
            if (p.shield >= dmg) {
              p.shield -= dmg; dmg = 0;
            } else {
              dmg -= p.shield; p.shield = 0;
            }
            if (p.shield <= 0) {
              const pcls = C.CLASSES[p.className];
              p.shieldRechargeTimer = (pcls && pcls.shieldRechargeDelay) || 5000;
            }
          }

          // 데미지 기여 추적
          const shooterForTrack = this.players.get(b.ownerId);
          if (shooterForTrack && dmg > 0) this._trackDamage(p, shooterForTrack.id, dmg);

          if (dmg > 0) p.hp -= dmg;
          if (p.hp <= 0) {
            p.hp = 0; p.alive = false; p.deaths++;
            p.respawnTimer = C.PLAYER_RESPAWN_DELAY;
            p.xp = Math.floor(p.xp * (1 - C.XP_LOSS_ON_DEATH));
            const shooter = shooterForTrack;
            if (shooter) {
              shooter.kills++;
              this.teamKills[shooter.team]++;
              const isRevenge = shooter.revengeTargetId === p.id;
              this._grantXp(shooter, 'playerKill');
              if (isRevenge) {
                this._grantXp(shooter, 'revenge');
                shooter.revengeTargetId = null;
                this.events.push({ type: 'revenge', killer: shooter.name, victim: p.name, killerTeam: shooter.team });
              }
              this.events.push({ type: 'kill', killer: shooter.name, victim: p.name, killerTeam: shooter.team, killerClass: shooter.className });
              p.lastKilledBy = { name: shooter.name, id: shooter.id, className: shooter.className };
              p.revengeTargetId = shooter.id;
            } else if (b.ownerId.startsWith('cell_')) {
              this.teamKills[b.team]++;
              const cellId = b.ownerId.replace('cell_', '');
              this.events.push({ type: 'cell_kill', cellId, victim: p.name, killerTeam: b.team });
              p.lastKilledBy = { name: 'Cell Turret', className: 'cell' };
              p.revengeTargetId = null;
            } else {
              p.lastKilledBy = null;
              p.revengeTargetId = null;
            }
            // 어시스트 XP (킬러 또는 같은 팀 기여자에게)
            this._processAssists(p, shooter ? shooter.id : null, b.team);
          }
          break;
        }
      }
      if (!b.alive) continue;

      // vs 적 미니언
      for (const m of this.minions) {
        if (!m.alive || m.team === b.team) continue;
        if (this._circleCollide(b, m)) {
          m.hp -= b.damage; b.alive = false;
          if (m.hp <= 0) {
            m.alive = false;
            const shooter = this.players.get(b.ownerId);
            if (shooter) this._grantXp(shooter, 'minionKill');
          }
          break;
        }
      }
      if (!b.alive) continue;

      // vs 몬스터
      for (const mon of this.monsters) {
        if (!mon.alive) continue;
        if (this._circleCollide(b, mon)) {
          mon.hp -= b.damage;
          mon.lastHitTeam = b.team;
          // 보스 데미지 기여 추적
          const bShooter = this.players.get(b.ownerId);
          if (bShooter) this._trackDamage(mon, bShooter.id, b.damage);
          b.alive = false;
          if (mon.hp <= 0) {
            mon.alive = false;
            this._onMonsterKill(mon, mon.lastHitTeam, bShooter ? bShooter.id : null);
          }
          break;
        }
      }
      if (!b.alive) continue;

      // vs 보스 드론
      for (const drone of this.bossDrones) {
        if (!drone.alive) continue;
        if (this._circleCollide(b, drone)) {
          drone.hp -= b.damage;
          b.alive = false;
          if (drone.hp <= 0) drone.alive = false;
          break;
        }
      }
      if (!b.alive) continue;

      // vs 중립 몹
      for (const nm of this.neutralMobs) {
        if (!nm.alive) continue;
        if (this._circleCollide(b, nm)) {
          nm.hp -= b.damage;
          b.alive = false;
          // 피격 시 도주 반응 (passive 타입)
          if (nm.behavior === 'passive' && !nm.fleeing) {
            nm.fleeing = true;
            nm.fleeTimer = nm.config.fleeDuration || 2000;
            const angle = Math.atan2(nm.y - b.y, nm.x - b.x);
            nm.fleeDx = Math.cos(angle);
            nm.fleeDy = Math.sin(angle);
          }
          if (nm.hp <= 0) {
            nm.alive = false;
            const shooter = this.players.get(b.ownerId);
            if (shooter) {
              shooter.score += nm.xpReward;
              shooter.grantXp(nm.xpReward);
              this.events.push({ type: 'neutral_kill', mobName: nm.name, playerId: shooter.id });
            }
            // 리스폰 큐에 추가
            this._neutralRespawnQueue.push({ type: nm.type, timer: nm.config.respawnDelay });
          }
          break;
        }
      }
      if (!b.alive) continue;

      // vs 셀 터렛 (적 또는 중립 셀에만 데미지)
      for (const cell of this.cells) {
        if (cell.state === 'destroyed' || cell.state === 'rebuilding') continue;
        if (cell.ownerTeam === b.team) continue; // 아군 셀 무시
        if (cell.shieldTimer > 0) continue;      // 무적 상태
        const dx = b.x - cell.x;
        const dy = b.y - cell.y;
        if (dx * dx + dy * dy <= (b.radius + cell.radius) * (b.radius + cell.radius)) {
          let dmg = b.damage;
          // 셀 추가 데미지 (캐패시터 보너스)
          const shooterP = this.players.get(b.ownerId);
          if (shooterP) {
            const cellBonus = shooterP.getClassConfig().cellDmgBonus || 0;
            dmg *= (1 + cellBonus);
          }
          // 백도어 보호: 아군 미니언이 근처에 없으면 피해 감소
          if (cell.ownerTeam !== 'neutral') {
            const hasAllyMinion = this.minions.some(m =>
              m.alive && m.team === b.team &&
              this._dist(m, cell) <= C.CELL_FRIENDLY_MINION_RANGE
            );
            if (!hasAllyMinion) {
              dmg *= (1 - C.CELL_BACKDOOR_REDUCTION);
            }
          }
          cell.hp -= dmg;
          b.alive = false;
          if (cell.hp <= 0) {
            cell.hp = 0;
            cell.state = 'destroyed';
            cell.captureProgress = 0;
            cell.captureTeam = null;
            cell.currentTargetId = null;
            if (shooterP) this._grantXp(shooterP, 'cellDestroy');
            this.events.push({
              type: 'cell_destroyed', cellId: cell.id,
              team: b.team,
            });
          }
          break;
        }
      }
    }
  }

  // ── 미니언 vs 몬스터 ──
  _checkMinionCombat(dt, now) {
    for (const m of this.minions) {
      if (!m.alive) continue;
      for (const mon of this.monsters) {
        if (!mon.alive) continue;
        const d = this._dist(m, mon);
        if (d <= C.MINION_ATTACK_RANGE + m.radius + mon.radius && m.attackCooldown <= 0) {
          mon.hp -= m.damage;
          mon.lastHitTeam = m.team;
          m.attackCooldown = C.MINION_ATTACK_COOLDOWN;
          if (mon.hp <= 0) mon.alive = false;
        }
      }
    }
  }

  // ── 아이템 픽업 ──
  _checkPickupCollisions() {
    for (const pk of this.pickups) {
      if (!pk.alive) continue;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (this._circleCollide(pk, p)) {
          if (pk.type === 'WAFER') {
            p.hp = Math.min(p.maxHp, p.hp + pk.config.heal);
          } else if (pk.type === 'EUV') {
            p.grantXp(pk.config.xpGain);
          } else if (pk.type === 'TSV_BOOSTER' && C.FEATURE_FLAGS.ENABLE_SPEED_PICKUP) {
            p.addBuff({
              type: 'speed_boost',
              label: 'TSV Booster',
              value: pk.config.spdBoost,
              duration: pk.config.duration,
              color: pk.config.color,
              icon: 'bolt',
            });
            this.events.push({ type: 'pickup_buff', playerId: p.id, buffLabel: 'TSV Booster' });
          } else if (pk.type === 'PHOTORESIST') {
            p.addBuff({
              type: 'damage_shield',
              label: 'Photoresist',
              value: pk.config.shieldAmount,
              duration: pk.config.duration,
              color: pk.config.color,
              icon: 'shield',
            });
            this.events.push({ type: 'pickup_buff', playerId: p.id, buffLabel: 'Photoresist' });
          } else if (pk.type === 'CMP_PAD') {
            p.addBuff({
              type: 'regen',
              label: 'CMP Pad',
              value: pk.config.regenRate,
              duration: pk.config.duration,
              color: pk.config.color,
              icon: 'regen',
            });
            this.events.push({ type: 'pickup_buff', playerId: p.id, buffLabel: 'CMP Pad' });
          }
          pk.alive = false;
          break;
        }
      }
    }
  }

  // ── 스폰: 미니언 (맵 경로 기반) ──
  _spawnMinions(dt) {
    this.minionSpawnTimer += dt * 1000;
    const minionRateMod = this.globalModifiers.minionSpawnRate || 1.0;
    const effectiveInterval = C.MINION_SPAWN_INTERVAL / minionRateMod;
    if (this.minionSpawnTimer < effectiveInterval) return;
    this.minionSpawnTimer = 0;

    const paths = this.mapConfig.minionPaths;
    if (!paths) return;

    const countMod = this.globalModifiers.minionSpawnCount || 1.0;
    const spawnCount = Math.round(C.MINION_SPAWN_COUNT * countMod);

    for (const team of [C.TEAM.SAMSUNG, C.TEAM.SKHYNIX]) {
      const teamPaths = paths[team];
      if (!teamPaths) continue;
      const laneKeys = Object.keys(teamPaths);
      for (let i = 0; i < spawnCount; i++) {
        const lane = laneKeys[i % laneKeys.length];
        const waypoints = teamPaths[lane];
        const spawn = waypoints[0];
        this.minions.push(new Minion(team, spawn, waypoints));
      }
    }
  }

  // ── 스폰: 보스 (필드에 1마리만, 죽으면 30초 후 다음 보스) ──
  _spawnBoss(dt) {
    const bossConf = this.mapConfig.boss;
    if (!bossConf) return;

    const aliveMonsters = this.monsters.filter(m => m.alive && !m.isEventBoss);
    if (aliveMonsters.length > 0) {
      this.bossAlive = true;
      return;
    }

    // 보스가 방금 죽었으면 타이머 시작
    if (this.bossAlive) {
      this.bossAlive = false;
      this.bossRespawnTimer = C.BOSS_RESPAWN_DELAY;
      // 보스 관련 드론/총알 정리
      this.bossDrones = [];
      this.bossBullets = [];
    }

    // 리스폰 대기
    this.bossRespawnTimer -= dt * 1000;
    if (this.bossRespawnTimer <= 0) {
      this.bossRespawnTimer = 0;
      const newBoss = new Monster(this.monsterTypeIndex, bossConf.center);
      this.monsters.push(newBoss);
      this.monsterTypeIndex++;
      this.bossAlive = true;
      this.events.push({
        type: 'boss_spawn',
        bossName: newBoss.typeName, buffLabel: newBoss.buffLabel, color: newBoss.color,
      });
    }
  }

  // ── 스폰: 픽업 ──
  _spawnPickups(dt) {
    this.pickupSpawnTimer += dt * 1000;
    const pickupRateMod = this.globalModifiers.pickupSpawnRate || 1.0;
    const effectivePickupInterval = C.PICKUP_SPAWN_INTERVAL / pickupRateMod;
    if (this.pickupSpawnTimer >= effectivePickupInterval) {
      this.pickupSpawnTimer = 0;
      const alivePickups = this.pickups.filter(p => p.alive);
      if (alivePickups.length < C.PICKUP_MAX) {
        const roll = Math.random();
        let type;
        if (C.FEATURE_FLAGS.ENABLE_SPEED_PICKUP && roll < 0.10) {
          type = 'TSV_BOOSTER';   // 10%
        } else if (roll < 0.225) {
          type = 'PHOTORESIST';   // 12.5%
        } else if (roll < 0.35) {
          type = 'CMP_PAD';       // 12.5%
        } else if (roll < 0.65) {
          type = 'WAFER';         // 30%
        } else {
          type = 'EUV';           // 35%
        }
        this.pickups.push(new Pickup(type, this.worldW, this.worldH));
      }
    }
  }

  // ── Wafer Ring: Zone debuff system ──
  _updateZones(dt, now) {
    const zones = this.mapConfig.zones;
    if (!zones || zones.length === 0) return;

    // 클렌즈 타이머
    if (this.zoneCleansed) {
      this.zoneCleanseTimer -= dt * 1000;
      if (this.zoneCleanseTimer <= 0) this.zoneCleansed = false;
      return; // 클렌즈 중에는 존 비활성
    }

    // 활성 존 타이머
    if (this.activeZoneId) {
      this.zoneActiveTimer -= dt * 1000;
      if (this.zoneActiveTimer <= 0) {
        this.activeZoneId = null;
      }
      return;
    }

    // 새 존 활성화 타이머
    this.zoneTimer += dt * 1000;
    const interval = this.mapConfig.zoneActivateInterval || 60000;
    if (this.zoneTimer >= interval) {
      this.zoneTimer = 0;
      const zone = zones[Math.floor(Math.random() * zones.length)];
      this.activeZoneId = zone.id;
      this.zoneActiveTimer = this.mapConfig.zoneActiveDuration || 30000;
      this.events.push({ type: 'zone_activate', zoneId: zone.id, label: zone.label });
    }
  }

  _getZoneDebuff(player, debuffType) {
    if (!this.activeZoneId || this.zoneCleansed) return 0;
    const arena = this.mapConfig.arena;
    if (!arena) return 0;

    // 플레이어가 외곽 링 안에 있는지
    const dx = player.x - arena.center.x;
    const dy = player.y - arena.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < arena.outerRingInner || dist > arena.outerRingOuter) return 0;

    // 해당 섹터에 있는지 확인
    const angle = Math.atan2(dy, dx);
    const zones = this.mapConfig.zones;
    const activeZone = zones.find(z => z.id === this.activeZoneId);
    if (!activeZone) return 0;

    // 각도 범위 체크
    let inZone = false;
    if (activeZone.angleStart <= activeZone.angleEnd) {
      inZone = angle >= activeZone.angleStart && angle <= activeZone.angleEnd;
    } else {
      inZone = angle >= activeZone.angleStart || angle <= activeZone.angleEnd;
    }

    if (inZone && activeZone.debuff === debuffType) {
      return activeZone.value;
    }
    return 0;
  }

  // ── Admin Event System ──
  _processAdminEvents(dt) {
    this.eventEngine.update(dt);

    // 새로 실행된 이벤트 처리
    for (const event of this.eventEngine._justExecuted) {
      this._executeEvent(event);
    }

    // 만료/취소된 이벤트 되돌리기
    for (const event of this.eventEngine._justExpired) {
      this._revertEvent(event);
    }

    // 이벤트 존 효과 적용
    this._applyEventZoneEffects(dt);
  }

  _executeEvent(event) {
    switch (event.type) {
      case 'BOSS_SPAWN': this._executeBossSpawn(event); break;
      case 'ZONE_MODIFIER': this._executeZoneModifier(event); break;
      case 'GLOBAL_PARAM': this._executeGlobalParam(event); break;
      case 'NEWS_TICKER': this._executeNewsTicker(event); break;
    }
    // 게임 이벤트로 클라이언트에 알림
    this.events.push({
      type: 'admin_event',
      eventType: event.type,
      title: event.title || event.type,
      titleKo: event.titleKo || '',
    });
    console.log(`[Event] Executed: ${event.type} (${event.id})`);
  }

  _executeBossSpawn(event) {
    const monsterType = C.MONSTER_TYPES.find(m => m.name === event.params.monsterType);
    if (!monsterType) return;
    const typeIndex = C.MONSTER_TYPES.indexOf(monsterType);
    const pos = event.params.position || { x: this.worldW / 2, y: this.worldH / 2 };
    const monster = new Monster(typeIndex, pos);
    monster.hp *= (event.params.hpMultiplier || 1);
    monster.maxHp = monster.hp;
    monster.isEventBoss = true;
    monster.eventId = event.id;
    this.monsters.push(monster);
    event._spawnedEntityIds = [monster.id];
  }

  _executeZoneModifier(event) {
    this.eventZones.push({
      id: event.id,
      x: event.params.position.x,
      y: event.params.position.y,
      radius: event.params.radius,
      effect: event.params.effect,
      value: event.params.value,
      affectsTeam: event.params.affectsTeam || 'all',
      color: event.params.visualColor || '#76b900',
      label: event.params.customLabel || event.type,
    });
  }

  _executeGlobalParam(event) {
    const param = event.params.parameter;
    event._originalValue = this.globalModifiers[param] || 1.0;
    this.globalModifiers[param] = event.params.multiplier;
  }

  _executeNewsTicker(event) {
    this.activeNewsTickers.push({
      id: event.id,
      headline: event.params.headline || '',
      headlineKo: event.params.headlineKo || '',
      importance: event.params.importance || 'medium',
      team: event.params.team || null,
      expiresAt: event.expiresAt,
    });
  }

  _revertEvent(event) {
    switch (event.type) {
      case 'BOSS_SPAWN':
        if (event._spawnedEntityIds) {
          this.monsters = this.monsters.filter(m => !event._spawnedEntityIds.includes(m.id));
        }
        break;
      case 'ZONE_MODIFIER':
        this.eventZones = this.eventZones.filter(z => z.id !== event.id);
        break;
      case 'GLOBAL_PARAM': {
        const param = event.params.parameter;
        this.globalModifiers[param] = event._originalValue || 1.0;
        break;
      }
      case 'NEWS_TICKER':
        this.activeNewsTickers = this.activeNewsTickers.filter(t => t.id !== event.id);
        break;
    }
    console.log(`[Event] Reverted: ${event.type} (${event.id})`);
  }

  _applyEventZoneEffects(dt) {
    if (this.eventZones.length === 0) return;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const zone of this.eventZones) {
        const dx = p.x - zone.x;
        const dy = p.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > zone.radius) continue;
        if (zone.affectsTeam !== 'all' && zone.affectsTeam !== p.team) continue;

        // heal_zone: dt 비례 회복 (value는 초당 maxHp 비율)
        if (zone.effect === 'heal_zone') {
          p.hp = Math.min(p.maxHp, p.hp + zone.value * p.maxHp * dt);
        }
        // damage_boost, speed_boost, slow_zone은 _updatePlayers에서 참조
      }
    }
  }

  /**
   * 이벤트 존의 특정 효과 합산값 반환
   */
  _getEventZoneEffect(player, effectType) {
    let total = 0;
    for (const zone of this.eventZones) {
      const dx = player.x - zone.x;
      const dy = player.y - zone.y;
      if (dx * dx + dy * dy > zone.radius * zone.radius) continue;
      if (zone.affectsTeam !== 'all' && zone.affectsTeam !== player.team) continue;
      if (zone.effect === effectType) total += zone.value;
    }
    return total;
  }

  // ── Plasma Etch Hazard Zones ──
  _updateHazardZones(dt, now) {
    // 진행 중인 해저드 존 업데이트
    for (const hz of this.hazardZones) {
      hz.timer -= dt * 1000;

      if (hz.phase === 'warning' && hz.timer <= 0) {
        // 경고 → 활성 전환
        hz.phase = 'active';
        hz.timer = C.HAZARD_ZONE.ACTIVE_DURATION;
        this.events.push({ type: 'hazard_activate', hazardId: hz.id });
      } else if (hz.phase === 'active') {
        // 존 내 플레이어에게 주기적 데미지
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if (p.invulnTimer > 0) continue;
          const dx = p.x - hz.x;
          const dy = p.y - hz.y;
          if (dx * dx + dy * dy <= hz.radius * hz.radius) {
            const dmg = C.HAZARD_ZONE.DAMAGE_PER_SEC * dt;
            this._applyDamageToPlayer(p, dmg, null, 'hazard');
          }
        }
        if (hz.timer <= 0) {
          hz.phase = 'expired';
        }
      }
    }

    // 만료된 존 제거
    this.hazardZones = this.hazardZones.filter(hz => hz.phase !== 'expired');

    // 새 해저드 스폰
    this.hazardSpawnTimer += dt * 1000;
    if (this.hazardSpawnTimer >= C.HAZARD_ZONE.SPAWN_INTERVAL) {
      this.hazardSpawnTimer = 0;
      const activeCount = this.hazardZones.filter(hz => hz.phase !== 'expired').length;
      if (activeCount < C.HAZARD_ZONE.MAX_ACTIVE) {
        const pos = this._pickHazardPosition();
        if (pos) {
          const hz = {
            id: `hz_${this._nextHazardId++}`,
            x: pos.x,
            y: pos.y,
            radius: C.HAZARD_ZONE.RADIUS,
            phase: 'warning',  // 'warning' → 'active' → 'expired'
            timer: C.HAZARD_ZONE.WARN_DURATION,
          };
          this.hazardZones.push(hz);
          this.events.push({ type: 'hazard_warning', hazardId: hz.id, x: hz.x, y: hz.y });
        }
      }
    }
  }

  _pickHazardPosition() {
    // 분쟁 지역 우선: 중립 셀 → 보스방 → 맵 중앙
    const candidates = [];

    // 중립/분쟁 셀 주변
    for (const cell of this.cells) {
      if (cell.ownerTeam === 'neutral' || cell.state === 'destroyed') {
        candidates.push({ x: cell.x, y: cell.y });
      }
    }

    // 보스방 중앙
    if (this.mapConfig.boss) {
      candidates.push(this.mapConfig.boss.center);
    }

    // 포탈 주변
    if (this.mapConfig.portals) {
      for (const p of this.mapConfig.portals) {
        candidates.push({ x: p.x, y: p.y });
      }
    }

    if (candidates.length === 0) {
      candidates.push({ x: this.worldW / 2, y: this.worldH / 2 });
    }

    // 기존 해저드와 너무 가까운 후보 제외
    const filtered = candidates.filter(c => {
      for (const hz of this.hazardZones) {
        const dx = c.x - hz.x, dy = c.y - hz.y;
        if (dx * dx + dy * dy < (C.HAZARD_ZONE.RADIUS * 2.5) ** 2) return false;
      }
      return true;
    });

    const pool = filtered.length > 0 ? filtered : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _getHazardSlow(player) {
    let maxSlow = 0;
    for (const hz of this.hazardZones) {
      if (hz.phase !== 'active') continue;
      const dx = player.x - hz.x;
      const dy = player.y - hz.y;
      if (dx * dx + dy * dy <= hz.radius * hz.radius) {
        maxSlow = Math.max(maxSlow, C.HAZARD_ZONE.SLOW_FACTOR);
      }
    }
    return maxSlow;  // 중복 해저드는 최대값만 적용 (스택 방지)
  }

  // ── 시한 버프 만료 처리 ──
  _updatePlayerBuffs(dt) {
    for (const p of this.players.values()) {
      if (!p.alive || p.activeBuffs.length === 0) continue;
      for (let i = p.activeBuffs.length - 1; i >= 0; i--) {
        const buff = p.activeBuffs[i];
        buff.remaining -= dt * 1000;

        // CMP Pad 리젠 적용
        if (buff.type === 'regen' && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + buff.value * dt);
        }

        if (buff.remaining <= 0) {
          p.activeBuffs.splice(i, 1);
        }
      }
    }
  }

  // ── 중립 몹 스폰 ──
  _spawnNeutralMobs(dt) {
    // 리스폰 큐 처리
    for (let i = this._neutralRespawnQueue.length - 1; i >= 0; i--) {
      this._neutralRespawnQueue[i].timer -= dt * 1000;
      if (this._neutralRespawnQueue[i].timer <= 0) {
        this._neutralRespawnQueue.splice(i, 1);
        // 타이머 만료 → 다음 스폰 체크에서 자연 보충
      }
    }

    this.neutralMobSpawnTimer += dt * 1000;
    if (this.neutralMobSpawnTimer < C.NEUTRAL_MOB_SPAWN_INTERVAL) return;
    this.neutralMobSpawnTimer = 0;

    for (const [type, config] of Object.entries(C.NEUTRAL_MOB_TYPES)) {
      const alive = this.neutralMobs.filter(m => m.alive && m.type === type).length;
      const inQueue = this._neutralRespawnQueue.filter(q => q.type === type).length;
      const needed = config.maxCount - alive - inQueue;
      if (needed <= 0) continue;

      // 한 번에 최대 3마리씩 스폰 (서서히 채움)
      const toSpawn = Math.min(needed, type === 'photon' ? 5 : 2);
      for (let i = 0; i < toSpawn; i++) {
        const pos = this._pickNeutralSpawnPos(type);
        if (pos) {
          this.neutralMobs.push(new NeutralMob(type, config, pos.x, pos.y));
        }
      }
    }
  }

  _pickNeutralSpawnPos(type) {
    const margin = 200;
    const spawns = this.mapConfig.teamSpawns;
    const bossCenter = this.mapConfig.boss ? this.mapConfig.boss.center : null;
    const bossR = this.mapConfig.boss ? this.mapConfig.boss.radius : 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = margin + Math.random() * (this.worldW - margin * 2);
      const y = margin + Math.random() * (this.worldH - margin * 2);

      // 스폰 영역 회피
      let tooClose = false;
      for (const team of Object.values(spawns)) {
        if (Math.abs(x - team.x) < 180 && Math.abs(y - team.y) < 180) {
          tooClose = true; break;
        }
      }
      if (tooClose) continue;

      // 보스방 회피 (alpha만 보스 근처 허용)
      if (bossCenter && type !== 'alpha') {
        const bDist = Math.sqrt((x - bossCenter.x) ** 2 + (y - bossCenter.y) ** 2);
        if (bDist < bossR + 50) continue;
      }

      // 장애물 회피
      if (this._collidesWithObstacle(x, y, 15)) continue;

      return { x, y };
    }
    return null;
  }

  // ── 중립 몹 업데이트 ──
  _updateNeutralMobs(dt, now) {
    const WANDER_SPEED = { photon: 30, dopant: 18, alpha: 12 };
    const WANDER_RADIUS = 120;  // 스폰 지점에서 최대 이탈 거리

    for (const nm of this.neutralMobs) {
      if (!nm.alive) continue;

      // 쿨다운 감소
      if (nm.attackCooldown > 0) nm.attackCooldown -= dt * 1000;

      // 도주 행동 (passive)
      if (nm.fleeing) {
        nm.fleeTimer -= dt * 1000;
        if (nm.fleeTimer <= 0) {
          nm.fleeing = false;
        } else {
          const fleeSpd = nm.config.fleeSpeed || 120;
          nm.x += nm.fleeDx * fleeSpd * dt;
          nm.y += nm.fleeDy * fleeSpd * dt;
          nm.x = Math.max(nm.radius, Math.min(this.worldW - nm.radius, nm.x));
          nm.y = Math.max(nm.radius, Math.min(this.worldH - nm.radius, nm.y));
        }
        continue;
      }

      // idle 배회 — 스폰 지점 근처에서 느리게 돌아다님
      const spd = WANDER_SPEED[nm.type] || 20;
      nm.wanderTimer -= dt * 1000;
      if (nm.wanderTimer <= 0) {
        // 방향 전환: 스폰 지점에서 멀어졌으면 돌아가는 방향으로
        const dx = nm.originX - nm.x;
        const dy = nm.originY - nm.y;
        const distFromOrigin = Math.sqrt(dx * dx + dy * dy);
        if (distFromOrigin > WANDER_RADIUS) {
          nm.angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
        } else {
          nm.angle += (Math.random() - 0.5) * Math.PI;
        }
        nm.wanderTimer = 2000 + Math.random() * 3000;
      }
      nm.x += Math.cos(nm.angle) * spd * dt;
      nm.y += Math.sin(nm.angle) * spd * dt;
      nm.x = Math.max(nm.radius, Math.min(this.worldW - nm.radius, nm.x));
      nm.y = Math.max(nm.radius, Math.min(this.worldH - nm.radius, nm.y));

      // 장애물 충돌 시 방향 반전
      if (this._collidesWithObstacle(nm.x, nm.y, nm.radius)) {
        nm.x -= Math.cos(nm.angle) * spd * dt * 2;
        nm.y -= Math.sin(nm.angle) * spd * dt * 2;
        nm.angle += Math.PI + (Math.random() - 0.5) * 0.5;
        nm.wanderTimer = 500;
      }

      // Force return to origin if too far (max distance 300px)
      if (nm.originX !== undefined && nm.originY !== undefined) {
        const distFromOrigin = Math.hypot(nm.x - nm.originX, nm.y - nm.originY);
        if (distFromOrigin > 300 && nm.state !== 'flee') {
          const angle = Math.atan2(nm.originY - nm.y, nm.originX - nm.x);
          nm.x += Math.cos(angle) * 60 * dt;
          nm.y += Math.sin(angle) * 60 * dt;
        }
      }

      // 반격 (defensive)
      if (nm.behavior === 'defensive' && nm.attackCooldown <= 0) {
        let closest = null, closestDist = nm.attackRange;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const d = this._dist(nm, p);
          if (d <= nm.attackRange + p.radius && d < closestDist) {
            closestDist = d;
            closest = p;
          }
        }
        if (closest) {
          this._applyDamageToPlayer(closest, nm.attackDamage, null);
          nm.attackCooldown = nm.attackCooldownMax;
        }
      }
    }

    // 죽은 중립 몹 제거
    this.neutralMobs = this.neutralMobs.filter(m => m.alive);
  }

  // ── 장애물 충돌 ──
  _collidesWithObstacle(x, y, radius) {
    const obstacles = this.mapConfig.obstacles;
    if (!obstacles) return false;
    for (const obs of obstacles) {
      // AABB vs 원 충돌
      const nearX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
      const nearY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
      const dx = x - nearX;
      const dy = y - nearY;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  }

  // ── 버프 만료 ──
  _expireBuffs(now) {
    for (const team of [C.TEAM.SAMSUNG, C.TEAM.SKHYNIX]) {
      this.teamBuffs[team] = this.teamBuffs[team].filter(b => b.expiresAt > now);
    }
  }

  // ── 죽은 엔티티 제거 ──
  _cleanDead() {
    this.bullets = this.bullets.filter(b => b.alive);
    this.minions = this.minions.filter(m => m.alive);
    this.monsters = this.monsters.filter(m => m.alive);
    this.pickups = this.pickups.filter(p => p.alive);
    this.bossBullets = this.bossBullets.filter(b => b.alive);
    this.bossDrones = this.bossDrones.filter(d => d.alive);
  }

  // ── 팀 버프 합산 ──
  _getTeamBuffValue(team, buffType) {
    let total = 0;
    for (const b of this.teamBuffs[team]) {
      if (b.buff === buffType) total += b.value;
    }
    return total;
  }

  // ── 유틸 ──
  _dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _circleCollide(a, b) {
    return this._dist(a, b) <= a.radius + b.radius;
  }

  _isInOwnSpawnZone(player) {
    const spawn = this.mapConfig.teamSpawns[player.team];
    if (!spawn) return false;
    return this._dist(player, spawn) < C.SPAWN_ZONE_RADIUS;
  }

  // ── 스냅샷 ──
  getSnapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.serialize());
    }
    return {
      mapId: this.mapId,
      mapConfig: {
        id: this.mapConfig.id,
        name: this.mapConfig.name,
        world: this.mapConfig.world,
        teamSpawns: this.mapConfig.teamSpawns,
        lanes: this.mapConfig.lanes || null,
        portals: this.mapConfig.portals || [],
        portalRadius: this.mapConfig.portalRadius || 0,
        obstacles: this.mapConfig.obstacles || [],
        boss: this.mapConfig.boss || null,
        arena: this.mapConfig.arena || null,
        connectors: this.mapConfig.connectors || null,
        zones: this.mapConfig.zones || null,
        cellNodes: this.mapConfig.cellNodes || null,
        cellBalance: {
          attackRange: C.CELL_ATTACK_RANGE,
          captureRadius: C.CELL_CAPTURE_RADIUS,
          captureTime: C.CELL_CAPTURE_TIME,
          rebuildTime: C.CELL_REBUILD_TIME,
        },
        spawnZoneRadius: C.SPAWN_ZONE_RADIUS,
        decorations: this.mapConfig.decorations || null,
      },
      players,
      bullets: this.bullets.map(b => b.serialize()),
      minions: this.minions.map(m => m.serialize()),
      monsters: this.monsters.map(m => m.serialize()),
      bossBullets: this.bossBullets.map(b => b.serialize()),
      bossDrones: this.bossDrones.map(d => d.serialize()),
      // 보스 정보 (HUD용)
      bossInfo: this._getBossInfo(),
      pickups: this.pickups.map(p => p.serialize()),
      neutralMobs: this.neutralMobs.filter(m => m.alive).map(m => m.serialize()),
      cells: this.cells.map(c => c.serialize()),
      teamKills: this.teamKills,
      territoryScore: {
        [C.TEAM.SAMSUNG]: Math.floor(this.territoryScore[C.TEAM.SAMSUNG]),
        [C.TEAM.SKHYNIX]: Math.floor(this.territoryScore[C.TEAM.SKHYNIX]),
      },
      teamCaptures: this.teamCaptures,
      teamBuffs: {
        [C.TEAM.SAMSUNG]: this.teamBuffs[C.TEAM.SAMSUNG].map(b => ({
          buff: b.buff, label: b.label,
          remaining: Math.max(0, Math.round(b.expiresAt - Date.now())),
          duration: C.MONSTER_BUFF_DURATION,
        })),
        [C.TEAM.SKHYNIX]: this.teamBuffs[C.TEAM.SKHYNIX].map(b => ({
          buff: b.buff, label: b.label,
          remaining: Math.max(0, Math.round(b.expiresAt - Date.now())),
          duration: C.MONSTER_BUFF_DURATION,
        })),
      },
      events: this.events,
      activeZoneId: this.activeZoneId,
      zoneCleansed: this.zoneCleansed,
      roundElapsed: Date.now() - this.roundStartTime,
      roundDuration: C.ROUND_DURATION,
      // Admin Event System
      activeEvents: this.eventEngine.getSnapshotData(),
      eventZones: this.eventZones,
      activeNewsTickers: this.activeNewsTickers,
      // Plasma Etch Hazard Zones
      hazardZones: this.hazardZones.map(hz => ({
        id: hz.id, x: hz.x, y: hz.y, radius: hz.radius,
        phase: hz.phase, timer: Math.round(hz.timer),
      })),
      // Feature Flags (클라이언트가 렌더 여부 판단)
      featureFlags: {
        hazardZones: C.FEATURE_FLAGS.ENABLE_HAZARD_ZONES,
        speedPickup: C.FEATURE_FLAGS.ENABLE_SPEED_PICKUP,
        buffIcons: C.FEATURE_FLAGS.ENABLE_BUFF_ICONS,
      },
      // Ping System
      pings: this.pings,
    };
  }

  _getBossInfo() {
    const aliveBoss = this.monsters.find(m => m.alive && !m.isEventBoss);
    if (aliveBoss) {
      return {
        status: 'alive',
        name: aliveBoss.typeName,
        buffLabel: aliveBoss.buffLabel,
        color: aliveBoss.color,
        hp: Math.round(aliveBoss.hp),
        maxHp: aliveBoss.maxHp,
        attackStyle: aliveBoss.attackStyle,
      };
    }
    // 다음 보스 정보
    const nextType = C.MONSTER_TYPES[this.monsterTypeIndex % C.MONSTER_TYPES.length];
    return {
      status: 'waiting',
      respawnTimer: Math.max(0, Math.ceil(this.bossRespawnTimer / 1000)),
      nextName: nextType.name,
      nextBuffLabel: nextType.label,
      nextColor: nextType.color,
      nextAttackStyle: nextType.attackStyle,
    };
  }

  // ── 봇 AI (지능형: 장애물 회피, 자동 리스폰, 전술 이동) ──
  updateBots() {
    // 게임 시작/라운드 리셋 후 첫 3초간 봇 AI 비활성화 (스폰 위치 유지)
    if (Date.now() - this.roundStartTime < 3000) return;

    for (const p of this.players.values()) {
      if (!p.isBot) continue;

      // 봇 자동 리스폰 (플레이어와 동일하게 5초)
      if (!p.alive) {
        if (p.respawnTimer <= 0) p.respawn();
        continue;
      }

      // 봇 진화: 가능하면 즉시 랜덤 진화
      if (p.evolveReady) {
        p.evolve(Math.random() < 0.5 ? 'capacitor' : 'repeater');
      }

      // 봇 내부 상태 초기화
      if (!p._botState) {
        p._botState = {
          wanderAngle: Math.random() * Math.PI * 2,
          wanderTimer: 0,
          stuckTimer: 0,
          lastX: p.x,
          lastY: p.y,
          strafeDir: Math.random() < 0.5 ? 1 : -1,
          strafeTimer: 0,
        };
      }
      const bs = p._botState;

      // 스턱 감지: 일정 시간 거의 안 움직이면 방향 전환
      const moved = Math.abs(p.x - bs.lastX) + Math.abs(p.y - bs.lastY);
      if (moved < 2) {
        bs.stuckTimer += 1;
      } else {
        bs.stuckTimer = 0;
      }
      bs.lastX = p.x;
      bs.lastY = p.y;

      // 스턱 시 랜덤 방향 전환
      if (bs.stuckTimer > 30) {
        bs.wanderAngle = Math.random() * Math.PI * 2;
        bs.stuckTimer = 0;
        bs.strafeDir *= -1;
      }

      // 타겟 선택: 적 플레이어 > 중립몹 > 셀 > 맵 중앙
      let target = null;
      let targetDist = Infinity;
      let targetType = 'none';

      // 적 플레이어 (가장 가까운)
      for (const other of this.players.values()) {
        if (other.team === p.team || !other.alive) continue;
        const d = this._dist(p, other);
        if (d < targetDist) { targetDist = d; target = other; targetType = 'player'; }
      }

      // 적 없으면 중립몹
      if (!target && this.neutralMobs.length > 0) {
        for (const nm of this.neutralMobs) {
          if (!nm.alive) continue;
          const d = this._dist(p, nm);
          if (d < targetDist) { targetDist = d; target = nm; targetType = 'mob'; }
        }
      }

      // 타겟도 없으면 적 셀
      if (!target) {
        for (const cell of this.cells) {
          if (cell.state === 'destroyed' || cell.team === p.team) continue;
          const d = Math.hypot(cell.x - p.x, cell.y - p.y);
          if (d < targetDist) { targetDist = d; target = cell; targetType = 'cell'; }
        }
      }

      let desiredAngle;
      let desiredMove = true;

      if (target) {
        desiredAngle = Math.atan2(target.y - p.y, target.x - p.x);
        const optDist = p.className === 'capacitor' ? 80 : 250;

        if (targetDist <= optDist && targetDist > optDist * 0.5) {
          // 적정 거리: 스트레이핑 (옆으로 이동하며 전투)
          bs.strafeTimer += 1;
          if (bs.strafeTimer > 60 + Math.random() * 40) {
            bs.strafeDir *= -1;
            bs.strafeTimer = 0;
          }
          desiredAngle += (Math.PI / 2) * bs.strafeDir;
        } else if (targetDist < optDist * 0.5 && p.className !== 'capacitor') {
          // 너무 가까우면 후퇴
          desiredAngle += Math.PI;
        }
        // else: 접근 (desiredAngle 그대로)
      } else {
        // 타겟 없으면 배회
        bs.wanderTimer += 1;
        if (bs.wanderTimer > 90 + Math.random() * 60) {
          bs.wanderAngle += (Math.random() - 0.5) * Math.PI;
          bs.wanderTimer = 0;
        }
        desiredAngle = bs.wanderAngle;

        // 맵 경계 회피
        const margin = 200;
        if (p.x < margin) desiredAngle = 0;
        else if (p.x > this.worldW - margin) desiredAngle = Math.PI;
        if (p.y < margin) desiredAngle = Math.PI / 2;
        else if (p.y > this.worldH - margin) desiredAngle = -Math.PI / 2;
      }

      // 장애물 회피: 진행 방향에 장애물 있으면 우회
      const lookDist = 60;
      const lookX = p.x + Math.cos(desiredAngle) * lookDist;
      const lookY = p.y + Math.sin(desiredAngle) * lookDist;
      if (this._collidesWithObstacle(lookX, lookY, p.radius + 5)) {
        // 좌/우 탐색해서 열린 방향으로 회전
        let found = false;
        for (let offset = 0.5, checks = 0; offset <= Math.PI && checks < 5; offset += 0.5, checks++) {
          const tryAngle = desiredAngle + offset * bs.strafeDir;
          const tx = p.x + Math.cos(tryAngle) * lookDist;
          const ty = p.y + Math.sin(tryAngle) * lookDist;
          if (!this._collidesWithObstacle(tx, ty, p.radius + 5)) {
            desiredAngle = tryAngle;
            found = true;
            break;
          }
          const tryAngle2 = desiredAngle - offset * bs.strafeDir;
          const tx2 = p.x + Math.cos(tryAngle2) * lookDist;
          const ty2 = p.y + Math.sin(tryAngle2) * lookDist;
          if (!this._collidesWithObstacle(tx2, ty2, p.radius + 5)) {
            desiredAngle = tryAngle2;
            found = true;
            break;
          }
        }
        if (!found) {
          desiredAngle += Math.PI; // 완전히 막히면 역방향
        }
      }

      // 입력 변환
      if (desiredMove) {
        p.input.up = Math.sin(desiredAngle) < -0.3;
        p.input.down = Math.sin(desiredAngle) > 0.3;
        p.input.left = Math.cos(desiredAngle) < -0.3;
        p.input.right = Math.cos(desiredAngle) > 0.3;
      } else {
        p.input.up = false; p.input.down = false;
        p.input.left = false; p.input.right = false;
      }
    }
  }

  // ── 인덕터 자기장 인력 ──
  _applyMagneticPull(p, dt) {
    const cls = p.getClassConfig();
    const pullRange = cls.magneticRange || 180;
    const pullForce = cls.magneticForce || 40;

    // 범위 내 모든 적에게 인력 적용
    for (const other of this.players.values()) {
      if (!other.alive || other.team === p.team) continue;
      const dist = this._dist(p, other);
      if (dist > 0 && dist <= pullRange) {
        const angle = Math.atan2(p.y - other.y, p.x - other.x);
        const pullX = Math.cos(angle) * pullForce * dt;
        const pullY = Math.sin(angle) * pullForce * dt;
        const newX = other.x + pullX;
        const newY = other.y + pullY;
        if (!this._collidesWithObstacle(newX, other.y, other.radius)) other.x = newX;
        if (!this._collidesWithObstacle(other.x, newY, other.radius)) other.y = newY;
      }
    }
  }

  // ── 트랜스포머 아군 버프 오라 ──
  _applyTransformerAura(p, dt) {
    const cls = p.getClassConfig();
    const auraRange = cls.auraRange || 200;
    const dmgBoost = cls.auraDmgBoost || 0.15;
    const regen = cls.auraRegen || 2;

    // 범위 내 아군에게 즉시 효과 적용 (버프 아님, 실시간 효과)
    for (const ally of this.players.values()) {
      if (!ally.alive || ally.team !== p.team || ally.id === p.id) continue;
      const dist = this._dist(p, ally);
      if (dist <= auraRange) {
        // HP 리젠
        if (ally.hp < ally.maxHp) {
          ally.hp = Math.min(ally.maxHp, ally.hp + regen * dt);
        }
        // 데미지 부스트는 실시간 적용 (현재는 시각 표시만, 실제 데미지는 _getTransformerAuraDmg에서 계산)
      }
    }
  }

  // ── 트랜스포머 오라 데미지 부스트 계산 (발사 시 호출) ──
  _getTransformerAuraDmg(player) {
    let boost = 0;
    for (const ally of this.players.values()) {
      if (!ally.alive || ally.team !== player.team) continue;
      const cls = ally.getClassConfig();
      if (cls.aura) {
        const dist = this._dist(player, ally);
        if (dist <= (cls.auraRange || 200)) {
          boost = Math.max(boost, cls.auraDmgBoost || 0.15);
        }
      }
    }
    return boost;
  }

  // ── 오실레이터 버스트 발사 ──
  _autoBurstFire(p, dt) {
    // 버스트 상태 초기화
    if (!p.burstState) {
      p.burstState = { inBurst: false, shotsFired: 0, burstDelay: 0 };
    }

    const cls = p.getClassConfig();
    const burstCount = cls.burstCount || 3;
    const burstDelay = cls.burstDelay || 80;
    const burstCooldown = cls.burstCooldown || 600;

    if (p.burstState.inBurst) {
      // 버스트 진행 중
      p.burstState.burstDelay -= dt * 1000;
      if (p.burstState.burstDelay <= 0 && p.burstState.shotsFired < burstCount) {
        // 다음 발 발사
        if (p.autoTargetId) {
          let targetObj = this._resolveTarget(p.autoTargetId, p.autoTargetType);
          if (targetObj) {
            const angle = Math.atan2(targetObj.y - p.y, targetObj.x - p.x);
            p.angle = angle;
            this._fireProjectile(p, cls, angle);
          }
        } else if (p.className === 'oscillator') {
          // 타겟 없으면 전방 사격
          this._fireProjectile(p, cls, p.lastMoveAngle);
        }
        p.burstState.shotsFired++;
        p.burstState.burstDelay = burstDelay;
      }
      if (p.burstState.shotsFired >= burstCount) {
        // 버스트 종료
        p.burstState.inBurst = false;
        p.fireCooldown = burstCooldown;
      }
    } else {
      // 버스트 대기 중
      if (p.fireCooldown <= 0 && (p.autoTargetId || p.className === 'oscillator')) {
        // 버스트 시작
        p.burstState.inBurst = true;
        p.burstState.shotsFired = 0;
        p.burstState.burstDelay = 0;
      }
    }
  }

  // ── 진화 처리 (소켓 이벤트) ──
  handleEvolve(playerId, newClass) {
    const player = this.players.get(playerId);
    if (!player) return false;
    return player.evolve(newClass);
  }
}

module.exports = Game;
