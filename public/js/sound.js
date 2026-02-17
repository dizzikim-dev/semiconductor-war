/**
 * sound.js
 * Procedural sound effects using Web Audio API (NO external files)
 * IIFE module pattern
 */

const Sound = (() => {
  let ctx = null;
  let enabled = true;
  let masterVolume = 0.3;
  let masterGain = null;
  // ── Background Music (Chiptune Sequencer) ──
  let bgmPlaying = false;
  let bgmTimerId = null;
  let bgmGainNode = null;

  // Note frequencies (미디 노트 → Hz)
  const N = {
    C3:130.81, D3:146.83, Eb3:155.56, E3:164.81, F3:174.61, G3:196.00, Ab3:207.65, A3:220.00, Bb3:233.08, B3:246.94,
    C4:261.63, D4:293.66, Eb4:311.13, E4:329.63, F4:349.23, G4:392.00, Ab4:415.30, A4:440.00, Bb4:466.16, B4:493.88,
    C5:523.25, D5:587.33, Eb5:622.25, E5:659.25, F5:698.46, G5:783.99,
  };
  const _ = null; // rest

  // ── Battle BGM: Am → F → C → G (130 BPM, 16th note grid) ──
  const BATTLE_BPM = 130;

  // Lead melody (square wave) — 32 steps = 2 bars
  const battleLead = [
    N.E5, _,    N.E5, _,    _,    N.C5, N.E5, _,
    N.G5, _,    _,    _,    N.G4, _,    _,    _,
    N.C5, _,    _,    N.G4, _,    _,    N.E4, _,
    _,    N.A4, _,    N.B4, _,    N.Bb4,N.A4, _,
  ];
  // Bass (triangle wave) — 32 steps
  const battleBass = [
    N.A3, _,    _,    N.A3, _,    _,    N.A3, _,
    N.F3, _,    _,    N.F3, _,    _,    N.F3, _,
    N.C3, _,    _,    N.C3, _,    _,    N.C3, _,
    N.G3, _,    _,    N.G3, _,    N.G3, _,    _,
  ];
  // Arp (square wave, quiet) — 32 steps
  const battleArp = [
    N.A4, N.C5, N.E5, N.C5, N.A4, N.C5, N.E5, N.C5,
    N.F4, N.A4, N.C5, N.A4, N.F4, N.A4, N.C5, N.A4,
    N.C4, N.E4, N.G4, N.E4, N.C4, N.E4, N.G4, N.E4,
    N.G4, N.B4, N.D5, N.B4, N.G4, N.B4, N.D5, N.B4,
  ];
  // Drums: 'k'=kick, 'h'=hihat, 's'=snare, null=rest — 32 steps
  const battleDrums = [
    'k',  'h',  _,    'h',  's',  'h',  _,    'h',
    'k',  'h',  _,    'h',  's',  'h',  'h',  'h',
    'k',  'h',  _,    'h',  's',  'h',  _,    'h',
    'k',  'h',  'k',  'h',  's',  'h',  'h',  's',
  ];

  // ── Lobby BGM: Cm → Ab → Eb → Bb (80 BPM, ambient arp) ──
  const LOBBY_BPM = 80;
  const lobbyArp = [
    N.C4, _,    N.Eb4,_,    N.G4, _,    N.Eb4,_,
    N.Ab3,_,    N.C4, _,    N.Eb4,_,    N.C4, _,
    N.Eb4,_,    N.G4, _,    N.Bb4,_,    N.G4, _,
    N.Bb3,_,    N.D4, _,    N.F4, _,    N.D4, _,
  ];
  const lobbyBass = [
    N.C3, _,    _,    _,    _,    _,    _,    _,
    N.Ab3,_,    _,    _,    _,    _,    _,    _,
    N.Eb3,_,    _,    _,    _,    _,    _,    _,
    N.Bb3,_,    _,    _,    _,    _,    _,    _,
  ];

  /** Schedule a single chiptune note */
  const _schedNote = (freq, time, dur, type, vol, dest) => {
    if (!freq || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.setValueAtTime(vol * 0.8, time + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  };

  /** Schedule drum hit */
  const _schedDrum = (type, time, dest) => {
    if (!ctx) return;
    if (type === 'k') {
      // Kick: short sine sweep 150→40 Hz
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, time);
      g.gain.linearRampToValueAtTime(0, time + 0.1);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time + 0.11);
    } else if (type === 'h') {
      // Hihat: short noise burst
      const len = 0.03;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, time);
      g.gain.linearRampToValueAtTime(0, time + len);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(time);
    } else if (type === 's') {
      // Snare: noise + tone
      const len = 0.08;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2, time);
      g.gain.linearRampToValueAtTime(0, time + len);
      src.connect(g); g.connect(dest);
      src.start(time);
      // Tone body
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 200;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.15, time);
      og.gain.linearRampToValueAtTime(0, time + 0.05);
      osc.connect(og); og.connect(dest);
      osc.start(time); osc.stop(time + 0.06);
    }
  };

  /** Schedule one full loop of a BGM pattern, returns duration in seconds */
  const _scheduleBgmLoop = (startTime, type) => {
    const isBattle = type === 'battle';
    const bpm = isBattle ? BATTLE_BPM : LOBBY_BPM;
    const stepDur = 60 / bpm / 4; // 16th note duration
    const lead = isBattle ? battleLead : null;
    const bass = isBattle ? battleBass : lobbyBass;
    const arp  = isBattle ? battleArp  : lobbyArp;
    const drums = isBattle ? battleDrums : null;
    const steps = bass.length;

    for (let i = 0; i < steps; i++) {
      const t = startTime + i * stepDur;
      // Lead melody
      if (lead && lead[i]) _schedNote(lead[i], t, stepDur * 0.85, 'square', 0.12, bgmGainNode);
      // Bass
      if (bass[i]) _schedNote(bass[i], t, stepDur * 1.8, 'triangle', isBattle ? 0.18 : 0.10, bgmGainNode);
      // Arpeggio
      if (arp[i]) _schedNote(arp[i], t, stepDur * 0.6, 'square', isBattle ? 0.06 : 0.08, bgmGainNode);
      // Drums
      if (drums && drums[i]) _schedDrum(drums[i], t, bgmGainNode);
    }
    return steps * stepDur;
  };

  const playBGM = (type) => {
    stopBGM();
    if (!ctx || !enabled) return;

    bgmGainNode = ctx.createGain();
    bgmGainNode.gain.value = 0.5; // BGM volume (master gain controls overall)
    bgmGainNode.connect(masterGain);

    let nextLoopTime = ctx.currentTime + 0.05;
    const loopDur = _scheduleBgmLoop(nextLoopTime, type);

    // Schedule next loops ahead of time
    bgmTimerId = setInterval(() => {
      if (!ctx || !bgmPlaying) return;
      // Schedule 2 loops ahead for seamless playback
      while (nextLoopTime - ctx.currentTime < loopDur) {
        nextLoopTime += loopDur;
        _scheduleBgmLoop(nextLoopTime, type);
      }
    }, (loopDur * 500)); // Check twice per loop duration

    bgmPlaying = true;
  };

  const stopBGM = () => {
    if (bgmTimerId) { clearInterval(bgmTimerId); bgmTimerId = null; }
    if (bgmGainNode) {
      try { bgmGainNode.gain.linearRampToValueAtTime(0, (ctx ? ctx.currentTime : 0) + 0.1); } catch {}
      bgmGainNode = null;
    }
    bgmPlaying = false;
  };


  /**
   * Initialize AudioContext (lazy init on first user interaction)
   */
  const init = () => {
    if (ctx) return; // already initialized
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = masterVolume;
      masterGain.connect(ctx.destination);
      console.log('[Sound] Initialized Web Audio API');
    } catch (err) {
      console.warn('[Sound] AudioContext not available:', err);
      enabled = false;
    }
  };

  /**
   * Helper: Create and configure an oscillator
   */
  const createOsc = (type, freq, startTime, duration) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.start(startTime);
    osc.stop(startTime + duration);
    return osc;
  };

  /**
   * Helper: Create gain envelope
   */
  const createEnvelope = (startTime, attack, decay, sustain, release, peakGain = 1) => {
    const gain = ctx.createGain();
    const t0 = startTime;
    const t1 = t0 + attack;
    const t2 = t1 + decay;
    const t3 = t2 + sustain;
    const t4 = t3 + release;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t1);
    gain.gain.linearRampToValueAtTime(peakGain * 0.7, t2);
    gain.gain.setValueAtTime(peakGain * 0.7, t3);
    gain.gain.linearRampToValueAtTime(0, t4);

    return gain;
  };

  /**
   * 1. KILL — sharp rising tone + white noise burst
   */
  const playKill = () => {
    const now = ctx.currentTime;
    const duration = 0.15;

    // Rising tone
    const osc = createOsc('square', 200, now, duration);
    osc.frequency.exponentialRampToValueAtTime(800, now + duration);

    const oscGain = createEnvelope(now, 0.01, 0.05, 0.05, 0.04, 0.4);
    osc.connect(oscGain);
    oscGain.connect(masterGain);

    // White noise burst
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.start(now);

    const noiseGain = createEnvelope(now, 0.005, 0.04, 0.05, 0.055, 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
  };

  /**
   * 2. HIT — quick low thud
   */
  const playHit = () => {
    const now = ctx.currentTime;
    const duration = 0.08;

    const osc = createOsc('sine', 150, now, duration);
    osc.frequency.exponentialRampToValueAtTime(50, now + duration);

    const gain = createEnvelope(now, 0.005, 0.03, 0.02, 0.025, 0.5);
    osc.connect(gain);
    gain.connect(masterGain);
  };

  /**
   * 3. LEVELUP — ascending arpeggio (C-E-G)
   */
  const playLevelup = () => {
    const now = ctx.currentTime;
    const noteDuration = 0.08;
    const notes = [262, 330, 392]; // C4, E4, G4

    notes.forEach((freq, i) => {
      const startTime = now + i * noteDuration;
      const osc = createOsc('triangle', freq, startTime, noteDuration);
      const gain = createEnvelope(startTime, 0.01, 0.02, 0.03, 0.02, 0.3);
      osc.connect(gain);
      gain.connect(masterGain);
    });
  };

  /**
   * 4. EVOLVE — dramatic ascending sweep + sparkle
   */
  const playEvolve = () => {
    const now = ctx.currentTime;
    const duration = 0.5;

    // Sweep
    const osc = createOsc('sawtooth', 100, now, duration);
    osc.frequency.exponentialRampToValueAtTime(1200, now + duration);

    const oscGain = createEnvelope(now, 0.05, 0.1, 0.2, 0.15, 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration);

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(masterGain);

    // Sparkle (high-freq chirps)
    for (let i = 0; i < 5; i++) {
      const t = now + 0.1 + i * 0.08;
      const chirp = createOsc('sine', 1500 + i * 200, t, 0.05);
      const chirpGain = createEnvelope(t, 0.005, 0.01, 0.02, 0.015, 0.15);
      chirp.connect(chirpGain);
      chirpGain.connect(masterGain);
    }
  };

  /**
   * 5. BOSS_SPAWN — deep rumble + warning siren
   */
  const playBossSpawn = () => {
    const now = ctx.currentTime;
    const duration = 0.8;

    // Deep rumble
    const rumble = createOsc('sawtooth', 40, now, duration);
    const rumbleGain = createEnvelope(now, 0.1, 0.2, 0.3, 0.2, 0.3);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 200;

    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(masterGain);

    // Warning siren (oscillating pitch)
    const siren = createOsc('sine', 440, now, duration);
    siren.frequency.setValueAtTime(440, now);
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.1;
      siren.frequency.linearRampToValueAtTime(i % 2 === 0 ? 550 : 440, t);
    }

    const sirenGain = createEnvelope(now, 0.05, 0.1, 0.45, 0.2, 0.25);
    siren.connect(sirenGain);
    sirenGain.connect(masterGain);
  };

  /**
   * 6. CELL_CAPTURE — victory chime
   */
  const playCellCapture = () => {
    const now = ctx.currentTime;
    const noteDuration = 0.12;
    const notes = [523, 659, 784]; // C5, E5, G5

    notes.forEach((freq, i) => {
      const startTime = now + i * noteDuration * 0.8;
      const osc = createOsc('sine', freq, startTime, noteDuration);
      const gain = createEnvelope(startTime, 0.01, 0.03, 0.05, 0.03, 0.35);
      osc.connect(gain);
      gain.connect(masterGain);
    });
  };

  /**
   * 7. PICKUP — quick bright blip
   */
  const playPickup = () => {
    const now = ctx.currentTime;
    const duration = 0.08;

    const osc = createOsc('triangle', 800, now, duration);
    const gain = createEnvelope(now, 0.005, 0.02, 0.03, 0.025, 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
  };

  /**
   * 8. DEATH — descending tone + static fade
   */
  const playDeath = () => {
    const now = ctx.currentTime;
    const duration = 0.4;

    // Descending tone
    const osc = createOsc('triangle', 400, now, duration);
    osc.frequency.exponentialRampToValueAtTime(80, now + duration);

    const oscGain = createEnvelope(now, 0.02, 0.1, 0.15, 0.13, 0.4);
    osc.connect(oscGain);
    oscGain.connect(masterGain);

    // Static fade
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.start(now);

    const noiseGain = createEnvelope(now, 0.05, 0.1, 0.15, 0.1, 0.15);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    filter.frequency.exponentialRampToValueAtTime(100, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
  };

  /**
   * 9. RESPAWN — gentle warm tone rising
   */
  const playRespawn = () => {
    const now = ctx.currentTime;
    const duration = 0.35;

    const osc = createOsc('sine', 220, now, duration);
    osc.frequency.exponentialRampToValueAtTime(440, now + duration);

    const gain = createEnvelope(now, 0.05, 0.1, 0.12, 0.08, 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
  };

  /**
   * 10. CHAT — soft notification pop
   */
  const playChat = () => {
    const now = ctx.currentTime;
    const duration = 0.06;

    const osc = createOsc('sine', 600, now, duration);
    const gain = createEnvelope(now, 0.005, 0.015, 0.02, 0.02, 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
  };

  /**
   * Sound effect map
   */
  const soundMap = {
    kill: playKill,
    hit: playHit,
    levelup: playLevelup,
    evolve: playEvolve,
    bossSpawn: playBossSpawn,
    cellCapture: playCellCapture,
    pickup: playPickup,
    death: playDeath,
    respawn: playRespawn,
    chat: playChat,
  };

  /**
   * Play a named sound effect
   */
  const play = (name) => {
    if (!enabled || !ctx) return;

    const soundFunc = soundMap[name];
    if (!soundFunc) {
      console.warn(`[Sound] Unknown sound: ${name}`);
      return;
    }

    try {
      soundFunc();
    } catch (err) {
      console.warn(`[Sound] Error playing ${name}:`, err);
    }
  };

  /**
   * Set master volume (0-1)
   */
  const setVolume = (v) => {
    masterVolume = Math.max(0, Math.min(1, v));
    if (masterGain) {
      masterGain.gain.value = masterVolume;
    }
  };

  /**
   * Toggle mute
   */
  const toggle = () => {
    enabled = !enabled;
    if (masterGain) {
      masterGain.gain.value = enabled ? masterVolume : 0;
    }
    return enabled;
  };

  /**
   * Get enabled state
   */
  const isEnabled = () => enabled;

  return {
    init,
    play,
    playBGM,
    stopBGM,
    setVolume,
    toggle,
    isEnabled,
  };
})();

// Auto-export for browser
if (typeof window !== 'undefined') {
  window.Sound = Sound;
}
