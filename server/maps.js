// ─── Map Registry ───
// Each map config is the single source of truth for world geometry,
// spawn points, obstacles, portals, lanes, zones, and boss settings.
//
// Semiconductor-authenticity design rationale:
//
// MAP 1 — Tri-Bus Circuit
//   Three horizontal lanes model a standard-cell row / metal bus routing channel.
//   "Via portals" replicate the function of real vias that connect metal layers
//   (M1↔M2 etc.) — players jump across the map as signals jump between layers.
//   Obstacles along lanes represent standard-cell blockages / power rail taps.
//   The central boss chamber is analogous to a clock-tree root buffer sitting at
//   the geometric center of the die, distributing timing/power to all buses.
//   Thin "power rail" and "ground rail" decorative strips at top/bottom edges
//   mirror VDD/VSS straps that bound every standard-cell row.
//
// MAP 2 — Wafer Ring Arena
//   Circular layout reflects a silicon wafer's radial geometry.
//   Obstacles are "die tiles" — rectangular blocks arranged in a wafer grid.
//   The outer ring event zone models the wafer edge exclusion zone where dies
//   are partially exposed and yield drops; debuff sectors simulate defects.
//   Four N/E/S/W connectors emulate scribe-line channels between die sites
//   that carry test signals across the wafer.
//   Central boss represents a Process Control Monitor (PCM) test structure
//   located at wafer center for parametric testing.

const DEFAULT_MAP_ID = 'map_tribus_circuit';

const MAP_CONFIGS = {

  // ════════════════════════════════════════════════
  // MAP 1: TRI-BUS CIRCUIT (3600x2400 — 1.5x scale)
  // ════════════════════════════════════════════════
  map_tribus_circuit: {
    id: 'map_tribus_circuit',
    name: 'Tri-Bus Circuit',
    world: { width: 3600, height: 2400 },

    teamSpawns: {
      samsung:  { x: 330,  y: 1200 },
      skhynix: { x: 3270, y: 1200 },
    },

    // ── 3 Lanes (bus routing channels) ──
    lanes: [
      { id: 'top',    centerY: 630,  halfWidth: 150 },
      { id: 'mid',    centerY: 1200, halfWidth: 150 },
      { id: 'bottom', centerY: 1770, halfWidth: 150 },
    ],

    // ── 6 Via Portals (paired, symmetric) ──
    portals: [
      { id: 'viaT1', x: 1140, y: 630,  pairedId: 'viaT2', cooldown: 8000 },
      { id: 'viaT2', x: 2460, y: 630,  pairedId: 'viaT1', cooldown: 8000 },
      { id: 'viaM1', x: 1140, y: 1200, pairedId: 'viaM2', cooldown: 8000 },
      { id: 'viaM2', x: 2460, y: 1200, pairedId: 'viaM1', cooldown: 8000 },
      { id: 'viaB1', x: 1140, y: 1770, pairedId: 'viaB2', cooldown: 8000 },
      { id: 'viaB2', x: 2460, y: 1770, pairedId: 'viaB1', cooldown: 8000 },
    ],
    portalRadius: 28,
    portalInvulnTime: 250, // ms

    // ── Central Boss Chamber ──
    boss: {
      center: { x: 1800, y: 1200 },
      radius: 270,
    },

    // ── Obstacles (standard-cell blockages / power rail taps) ──
    obstacles: [
      // Top lane covers
      { x: 750,  y: 555,  w: 90,  h: 150, label: 'CELL' },
      { x: 1440, y: 570,  w: 120, h: 120, label: 'TAP' },
      { x: 2160, y: 555,  w: 90,  h: 150, label: 'CELL' },
      { x: 2850, y: 570,  w: 105, h: 120, label: 'TAP' },
      // Mid lane covers
      { x: 750,  y: 1140, w: 90,  h: 120, label: 'CELL' },
      { x: 1350, y: 1110, w: 75,  h: 180, label: 'VIA' },
      { x: 2250, y: 1110, w: 75,  h: 180, label: 'VIA' },
      { x: 2850, y: 1140, w: 90,  h: 120, label: 'CELL' },
      // Bottom lane covers
      { x: 750,  y: 1695, w: 90,  h: 150, label: 'CELL' },
      { x: 1440, y: 1710, w: 120, h: 120, label: 'TAP' },
      { x: 2160, y: 1695, w: 90,  h: 150, label: 'CELL' },
      { x: 2850, y: 1710, w: 105, h: 120, label: 'TAP' },
      // Central chamber pillars
      { x: 1710, y: 1080, w: 45, h: 45, label: 'BUF' },
      { x: 1845, y: 1080, w: 45, h: 45, label: 'BUF' },
      { x: 1710, y: 1275, w: 45, h: 45, label: 'BUF' },
      { x: 1845, y: 1275, w: 45, h: 45, label: 'BUF' },
    ],

    // ── Decorative elements (rendered client-side only) ──
    decorations: {
      powerRails: [
        { y: 30,   label: 'VDD',  color: '#ff3250' },
        { y: 2340, label: 'VSS',  color: '#1e64ff' },
      ],
      clockSpine: { x: 1800, y1: 150, y2: 2250, color: '#ffd700' },
    },

    // ── Cell Turret Nodes (셀 도미네이션) ──
    cellNodes: [
      // Top lane
      { id: 'T1', x: 630,  y: 630,  initialOwner: 'samsung',  laneOrSector: 'top' },
      { id: 'T2', x: 1800, y: 630,  initialOwner: 'neutral',  laneOrSector: 'top' },
      { id: 'T3', x: 3030, y: 630,  initialOwner: 'skhynix',  laneOrSector: 'top' },
      // Mid lane — M2는 보스 구역 바깥 배치
      { id: 'M1', x: 630,  y: 1200, initialOwner: 'samsung',  laneOrSector: 'mid' },
      { id: 'M2', x: 1800, y: 885,  initialOwner: 'neutral',  laneOrSector: 'mid' },
      { id: 'M3', x: 3030, y: 1200, initialOwner: 'skhynix',  laneOrSector: 'mid' },
      // Bottom lane
      { id: 'B1', x: 630,  y: 1770, initialOwner: 'samsung',  laneOrSector: 'bottom' },
      { id: 'B2', x: 1800, y: 1770, initialOwner: 'neutral',  laneOrSector: 'bottom' },
      { id: 'B3', x: 3030, y: 1770, initialOwner: 'skhynix',  laneOrSector: 'bottom' },
    ],

    // ── Minion Paths (waypoints per lane) ──
    minionPaths: {
      samsung: {
        top:    [{ x: 330, y: 630 }, { x: 900, y: 630 }, { x: 1800, y: 630 }, { x: 2700, y: 630 }, { x: 3270, y: 630 }],
        mid:    [{ x: 330, y: 1200 }, { x: 900, y: 1200 }, { x: 1800, y: 1200 }, { x: 2700, y: 1200 }, { x: 3270, y: 1200 }],
        bottom: [{ x: 330, y: 1770 }, { x: 900, y: 1770 }, { x: 1800, y: 1770 }, { x: 2700, y: 1770 }, { x: 3270, y: 1770 }],
      },
      skhynix: {
        top:    [{ x: 3270, y: 630 }, { x: 2700, y: 630 }, { x: 1800, y: 630 }, { x: 900, y: 630 }, { x: 330, y: 630 }],
        mid:    [{ x: 3270, y: 1200 }, { x: 2700, y: 1200 }, { x: 1800, y: 1200 }, { x: 900, y: 1200 }, { x: 330, y: 1200 }],
        bottom: [{ x: 3270, y: 1770 }, { x: 2700, y: 1770 }, { x: 1800, y: 1770 }, { x: 900, y: 1770 }, { x: 330, y: 1770 }],
      },
    },
  },

  // ════════════════════════════════════════════════
  // MAP 2: WAFER RING ARENA (3600x2400 — 1.5x scale)
  // ════════════════════════════════════════════════
  map_wafer_ring: {
    id: 'map_wafer_ring',
    name: 'Wafer Ring Arena',
    world: { width: 3600, height: 2400 },

    teamSpawns: {
      samsung:  { x: 1800, y: 330  },
      skhynix: { x: 1800, y: 2070 },
    },

    // ── Circular arena parameters ──
    arena: {
      center: { x: 1800, y: 1200 },
      innerCombatRadius: 390,
      mainRadius: 960,
      outerRingInner: 840,
      outerRingOuter: 960,
    },

    portals: [],
    portalRadius: 0,
    portalInvulnTime: 0,

    // ── Central Boss ──
    boss: {
      center: { x: 1800, y: 1200 },
      radius: 180,
      spawnTimes: [120000, 240000],
    },

    // ── 4 Rotational Connectors (scribe-line channels) ──
    connectors: [
      { id: 'N', x: 1800, y: 360,  angle: -Math.PI / 2 },
      { id: 'E', x: 2640, y: 1200, angle: 0 },
      { id: 'S', x: 1800, y: 2040, angle: Math.PI / 2 },
      { id: 'W', x: 960,  y: 1200, angle: Math.PI },
    ],
    connectorBoostSpeed: 1.5,
    connectorRadius: 40,

    // ── Obstacles (die tile blocks) ──
    obstacles: [
      // Inner ring die tiles
      { x: 1590, y: 840,  w: 75, h: 75, label: 'DIE' },
      { x: 1935, y: 840,  w: 75, h: 75, label: 'DIE' },
      { x: 1590, y: 1485, w: 75, h: 75, label: 'DIE' },
      { x: 1935, y: 1485, w: 75, h: 75, label: 'DIE' },
      // Mid ring die tiles
      { x: 1290, y: 720,  w: 90, h: 60, label: 'DIE' },
      { x: 2220, y: 720,  w: 90, h: 60, label: 'DIE' },
      { x: 1290, y: 1620, w: 90, h: 60, label: 'DIE' },
      { x: 2220, y: 1620, w: 90, h: 60, label: 'DIE' },
      // Outer ring die tiles
      { x: 1080, y: 900,  w: 68, h: 68, label: 'DIE' },
      { x: 2453, y: 900,  w: 68, h: 68, label: 'DIE' },
      { x: 1080, y: 1433, w: 68, h: 68, label: 'DIE' },
      { x: 2453, y: 1433, w: 68, h: 68, label: 'DIE' },
      // Cardinal axis blocks
      { x: 1763, y: 630,  w: 75, h: 45, label: 'PCM' },
      { x: 1763, y: 1725, w: 75, h: 45, label: 'PCM' },
    ],

    // ── Outer Ring Event Zones (4 sectors: NE, SE, SW, NW) ──
    zones: [
      { id: 'NE', angleStart: -Math.PI / 2, angleEnd: 0,            debuff: 'spd', value: 0.10, label: 'YIELD DROP: SPD -10%' },
      { id: 'SE', angleStart: 0,            angleEnd: Math.PI / 2,   debuff: 'acc', value: 0.05, label: 'DEFECT: ACC -5%' },
      { id: 'SW', angleStart: Math.PI / 2,  angleEnd: Math.PI,       debuff: 'spd', value: 0.10, label: 'YIELD DROP: SPD -10%' },
      { id: 'NW', angleStart: -Math.PI,     angleEnd: -Math.PI / 2,  debuff: 'acc', value: 0.05, label: 'DEFECT: ACC -5%' },
    ],
    zoneActivateInterval: 60000,
    zoneActiveDuration: 30000,
    zoneCleanseDuration: 30000,

    // ── Cell Turret Nodes (셀 도미네이션) ──
    cellNodes: [
      // Samsung arc (상단)
      { id: 'S1', x: 1440, y: 600,  initialOwner: 'samsung',  laneOrSector: 'samsung_left' },
      { id: 'S2', x: 2160, y: 600,  initialOwner: 'samsung',  laneOrSector: 'samsung_right' },
      // Hynix arc (하단)
      { id: 'H1', x: 1440, y: 1800, initialOwner: 'skhynix',  laneOrSector: 'hynix_left' },
      { id: 'H2', x: 2160, y: 1800, initialOwner: 'skhynix',  laneOrSector: 'hynix_right' },
      // Contested ring sectors
      { id: 'C1', x: 990,  y: 990,  initialOwner: 'neutral',  laneOrSector: 'NW' },
      { id: 'C2', x: 2610, y: 990,  initialOwner: 'neutral',  laneOrSector: 'NE' },
      { id: 'C3', x: 990,  y: 1410, initialOwner: 'neutral',  laneOrSector: 'SW' },
      { id: 'C4', x: 2610, y: 1410, initialOwner: 'neutral',  laneOrSector: 'SE' },
    ],

    // ── Minion Paths (radial: spawn → center → enemy spawn) ──
    minionPaths: {
      samsung: {
        top:    [{ x: 1800, y: 330 }, { x: 1350, y: 750 }, { x: 1200, y: 1200 }, { x: 1350, y: 1650 }, { x: 1800, y: 2070 }],
        mid:    [{ x: 1800, y: 330 }, { x: 1800, y: 750 }, { x: 1800, y: 1200 }, { x: 1800, y: 1650 }, { x: 1800, y: 2070 }],
        bottom: [{ x: 1800, y: 330 }, { x: 2250, y: 750 }, { x: 2400, y: 1200 }, { x: 2250, y: 1650 }, { x: 1800, y: 2070 }],
      },
      skhynix: {
        top:    [{ x: 1800, y: 2070 }, { x: 1350, y: 1650 }, { x: 1200, y: 1200 }, { x: 1350, y: 750 }, { x: 1800, y: 330 }],
        mid:    [{ x: 1800, y: 2070 }, { x: 1800, y: 1650 }, { x: 1800, y: 1200 }, { x: 1800, y: 750 }, { x: 1800, y: 330 }],
        bottom: [{ x: 1800, y: 2070 }, { x: 2250, y: 1650 }, { x: 2400, y: 1200 }, { x: 2250, y: 750 }, { x: 1800, y: 330 }],
      },
    },

    decorations: {
      waferEdge: true,
      dieBorder: '#2a3a4e',
      notchAngle: -Math.PI / 2,
    },
  },
};

const getMapConfig = (mapId) => {
  return MAP_CONFIGS[mapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
};

const getMapList = () => {
  return Object.values(MAP_CONFIGS).map(m => ({ id: m.id, name: m.name }));
};

const isValidMapId = (mapId) => {
  return mapId in MAP_CONFIGS;
};

module.exports = { MAP_CONFIGS, DEFAULT_MAP_ID, getMapConfig, getMapList, isValidMapId };
