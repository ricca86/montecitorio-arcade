/**
 * Self-contained 1998 PS1 Arcade Web Audio API Sound & Music Engine.
 * Generates all combat SFX, UI blips, and the 138 BPM minor-pentatonic synth/breakbeat
 * loop procedurally with zero external audio files.
 */

function getAudioContextClass() {
  return typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
}

// 138 BPM -> 16th-note grid = 60 / (138 * 4) seconds
export const MUSIC_BPM = 138;
export const MUSIC_STEP_SECONDS = 60 / (MUSIC_BPM * 4);

// A minor pentatonic frequencies (A, C, D, E, G) across bass and lead octaves
const BASS_RIFF = [
  55.00, 55.00, 110.00, 55.00,
  65.41, 73.42, 82.41, 65.41,
  55.00, 55.00, 98.00, 82.41,
  73.42, 65.41, 82.41, 98.00
];

const LEAD_RIFF = [
  220.00, 0, 261.63, 293.66,
  329.63, 0, 392.00, 329.63,
  440.00, 0, 392.00, 329.63,
  293.66, 261.63, 293.66, 0
];

// 16-step arcade breakbeat trigger patterns
const KICK_STEPS = new Set([0, 3, 6, 8, 10, 14]);
const SNARE_STEPS = new Set([4, 12]);
const HAT_STEPS = new Set([0, 2, 4, 6, 7, 8, 10, 12, 14, 15]);

let context = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;
let noiseBuffer = null;
let resumePending = false;
let musicEnabled = false;
let sfxEnabled = true;
let matchActive = false;
let musicTimer = null;
let nextNote = 0;
let noteIndex = 0;

function ensureNoiseBuffer() {
  if (!noiseBuffer && context) {
    const length = Math.max(1, Math.floor(context.sampleRate));
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

function connectWithPan(node, destination, pan = 0) {
  if (pan !== 0 && typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    if (panner.pan && typeof panner.pan.setValueAtTime === "function") {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), context.currentTime);
    }
    node.connect(panner);
    panner.connect(destination);
    return;
  }
  node.connect(destination);
}

function playTone(
  frequency,
  endFrequency,
  duration,
  volume,
  type = "sine",
  start = context.currentTime,
  destination = sfxBus,
  pan = 0
) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, frequency), start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  osc.connect(gain);
  connectWithPan(gain, destination, pan);
  osc.start(start);
  osc.stop(start + duration);
  return osc;
}

function playFM(
  carrierFreq,
  carrierEndFreq,
  modFreq,
  modDepth,
  duration,
  volume,
  { carrierType = "sine", modType = "sine", start = context.currentTime, destination = sfxBus, pan = 0 } = {}
) {
  const carrier = context.createOscillator();
  const mod = context.createOscillator();
  const modGain = context.createGain();
  const amp = context.createGain();

  carrier.type = carrierType;
  mod.type = modType;
  carrier.frequency.setValueAtTime(Math.max(1, carrierFreq), start);
  carrier.frequency.exponentialRampToValueAtTime(Math.max(1, carrierEndFreq), start + duration);
  mod.frequency.setValueAtTime(Math.max(1, modFreq), start);
  modGain.gain.setValueAtTime(modDepth, start);
  modGain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  amp.gain.setValueAtTime(Math.max(0.0001, volume), start);
  amp.gain.exponentialRampToValueAtTime(0.0008, start + duration);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(amp);
  connectWithPan(amp, destination, pan);

  mod.start(start);
  carrier.start(start);
  mod.stop(start + duration);
  carrier.stop(start + duration);
}

function playNoiseSweep(
  duration,
  volume,
  startFreq,
  endFreq = startFreq,
  filterType = "bandpass",
  { q = 1.2, start = context.currentTime, destination = sfxBus, pan = 0 } = {}
) {
  const buffer = ensureNoiseBuffer();
  const src = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  src.buffer = buffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(Math.max(20, startFreq), start);
  if (endFreq !== startFreq) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  }
  if (filter.Q && typeof filter.Q.setValueAtTime === "function") {
    filter.Q.setValueAtTime(q, start);
  }

  gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);

  src.connect(filter);
  filter.connect(gain);
  connectWithPan(gain, destination, pan);

  src.start(start);
  src.stop(start + duration);
}

function addStereoSlapback(sourceGain, delaySeconds = 0.052, feedbackLevel = 0.28, destination = sfxBus) {
  if (typeof context.createDelay !== "function") return;
  const delay = context.createDelay(0.5);
  const wet = context.createGain();
  if (delay.delayTime && typeof delay.delayTime.setValueAtTime === "function") {
    delay.delayTime.setValueAtTime(delaySeconds, context.currentTime);
  }
  wet.gain.setValueAtTime(feedbackLevel, context.currentTime);
  sourceGain.connect(delay);
  delay.connect(wet);
  connectWithPan(wet, destination, 0.55);
}

function syncSfxGain() {
  if (!context || !sfxBus) return;
  sfxBus.gain.setValueAtTime(sfxEnabled ? 1.0 : 0.0, context.currentTime);
}

function scheduleMusic() {
  if (!context || !musicBus) return;
  const targetBus = musicFilter || musicBus;
  const now = context.currentTime;
  if (nextNote < now) nextNote = now;

  while (nextNote < now + 0.16) {
    const step = noteIndex % 16;
    const bassFreq = BASS_RIFF[step];
    const leadFreq = LEAD_RIFF[step];

    // Sawtooth arcade bass + crisp square lead through resonant low-pass filter
    playTone(bassFreq, bassFreq * 0.985, MUSIC_STEP_SECONDS * 1.15, 0.24, "sawtooth", nextNote, targetBus);
    if (leadFreq > 0) {
      playTone(leadFreq, leadFreq * 0.995, MUSIC_STEP_SECONDS * 1.35, 0.11, "square", nextNote, targetBus);
    }

    // Driving late-90s arcade breakbeat (kick / snare / hat)
    if (KICK_STEPS.has(step)) {
      playTone(118, 40, 0.11, 0.30, "sine", nextNote, musicBus);
    }
    if (SNARE_STEPS.has(step)) {
      playTone(195, 95, 0.08, 0.14, "triangle", nextNote, musicBus);
      playNoiseSweep(0.085, 0.14, 1900, 900, "highpass", { start: nextNote, destination: musicBus });
    }
    if (HAT_STEPS.has(step)) {
      playNoiseSweep(0.032, step % 4 === 2 ? 0.07 : 0.045, 7600, 6200, "highpass", {
        start: nextNote,
        destination: musicBus
      });
    }

    // Subtly sweep the low-pass filter on downbeats for PS1 filter pump
    if (musicFilter && step % 4 === 0) {
      const cutoff = step === 0 ? 1550 : step === 8 ? 1320 : 980;
      musicFilter.frequency.setValueAtTime(cutoff, nextNote);
      musicFilter.frequency.exponentialRampToValueAtTime(460, nextNote + MUSIC_STEP_SECONDS * 3.5);
    }

    noteIndex += 1;
    nextNote += MUSIC_STEP_SECONDS;
  }
}

function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  if (musicBus) {
    const bus = musicBus;
    const filter = musicFilter;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.025);
    setTimeout(() => {
      try {
        filter?.disconnect();
        bus.disconnect();
      } catch {
        // Already disconnected
      }
    }, 200);
    musicBus = null;
    musicFilter = null;
  }
}

function syncMusic() {
  if (!context || !musicEnabled || !matchActive) {
    stopMusic();
    return;
  }
  if (musicTimer !== null) return;
  musicBus = context.createGain();
  musicBus.gain.value = 0.38;
  musicBus.connect(master);

  musicFilter = context.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.setValueAtTime(1150, context.currentTime);
  if (musicFilter.Q && typeof musicFilter.Q.setValueAtTime === "function") {
    musicFilter.Q.setValueAtTime(2.4, context.currentTime);
  }
  musicFilter.connect(musicBus);

  nextNote = context.currentTime;
  noteIndex = 0;
  scheduleMusic();
  musicTimer = setInterval(scheduleMusic, 90);
}

/**
 * Initialize and resume the Web Audio API context safely on first user gesture.
 */
function unlock() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return false;
  if (!context) {
    try {
      const audioContext = new AudioContextClass();
      const output = audioContext.createGain();
      output.gain.value = 0.34;
      output.connect(audioContext.destination);

      const sfx = audioContext.createGain();
      sfx.gain.value = sfxEnabled ? 1.0 : 0.0;
      sfx.connect(output);

      context = audioContext;
      master = output;
      sfxBus = sfx;
      syncMusic();
    } catch (error) {
      console.error("Could not initialize game audio:", error);
      return false;
    }
  }
  if (context.state !== "running" && context.state !== "closed" && !resumePending) {
    resumePending = true;
    context.resume().catch((error) => {
      console.error("Could not resume game audio:", error);
    }).finally(() => {
      resumePending = false;
    });
  }
  return true;
}

/**
 * Character Select cursor blip: retro 90s FM-synth blip.
 */
function select() {
  if (!context || !sfxEnabled) return;
  playFM(680, 960, 340, 260, 0.068, 0.18, { carrierType: "sine", modType: "triangle" });
}

/**
 * Candidate Lock-In: dramatic 90s two-tone arcade confirmation chord.
 */
function confirm() {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;
  // Tone 1 (root power interval)
  playFM(523.25, 523.25, 261.63, 180, 0.13, 0.16, { carrierType: "square", start: now, pan: -0.2 });
  playTone(783.99, 783.99, 0.13, 0.12, "sawtooth", now, sfxBus, 0.2);
  // Tone 2 (octave fifth resolution chord)
  playFM(659.25, 659.25, 329.63, 210, 0.28, 0.17, { carrierType: "square", start: now + 0.095, pan: -0.15 });
  playTone(1046.5, 1046.5, 0.30, 0.15, "triangle", now + 0.095, sfxBus, 0.15);
}

/**
 * Attack swing whoosh:
 * - Light (U, J): filtered white-noise sweep 800Hz -> 250Hz over 90ms
 * - Heavy (I, K, Launcher, Combo finisher): deeper 500Hz -> 120Hz noise sweep (140ms) + sub-bass drop
 */
function swing(option = false) {
  if (!context || !sfxEnabled) return;
  const isObj = typeof option === "object" && option !== null;
  const heavy = isObj ? Boolean(option.heavy || option.kick) : Boolean(option);
  const pan = isObj ? (option.pan ?? 0) : 0;

  if (heavy) {
    playNoiseSweep(0.14, 0.18, 500, 120, "bandpass", { q: 1.4, pan });
    playTone(125, 42, 0.14, 0.22, "sine", context.currentTime, sfxBus, pan);
  } else {
    playNoiseSweep(0.09, 0.14, 800, 250, "bandpass", { q: 1.5, pan });
    playTone(190, 80, 0.075, 0.09, "triangle", context.currentTime, sfxBus, pan);
  }
}

/**
 * Heavy / Launcher / Counter crash: deep bass boom + metallic ring modulation crash + stereo slapback.
 */
function heavyImpactCrash(pan = 0) {
  const now = context.currentTime;
  const crashOut = context.createGain();
  crashOut.gain.setValueAtTime(1, now);
  connectWithPan(crashOut, sfxBus, pan);
  addStereoSlapback(crashOut, 0.055, 0.32, sfxBus);

  // Deep sub-bass boom
  playTone(105, 30, 0.44, 0.72, "sine", now, crashOut);
  playTone(210, 56, 0.22, 0.28, "triangle", now, crashOut);

  // Metallic ring-modulation crash (carrier gain modulated by bipolar HF modulator)
  const carrier = context.createOscillator();
  const mod = context.createOscillator();
  const ringGain = context.createGain();
  const modDepth = context.createGain();
  const env = context.createGain();
  carrier.type = "square";
  mod.type = "sawtooth";
  carrier.frequency.setValueAtTime(440, now);
  carrier.frequency.exponentialRampToValueAtTime(175, now + 0.24);
  mod.frequency.setValueAtTime(670, now);
  mod.frequency.exponentialRampToValueAtTime(290, now + 0.24);
  ringGain.gain.setValueAtTime(0, now);
  modDepth.gain.setValueAtTime(0.65, now);
  env.gain.setValueAtTime(0.24, now);
  env.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
  carrier.connect(ringGain);
  mod.connect(modDepth);
  modDepth.connect(ringGain.gain);
  ringGain.connect(env);
  env.connect(crashOut);
  carrier.start(now);
  mod.start(now);
  carrier.stop(now + 0.24);
  mod.stop(now + 0.24);

  // Crunch noise blast
  playNoiseSweep(0.32, 0.30, 2100, 580, "bandpass", { q: 0.9, start: now, destination: crashOut });
}

/**
 * Combat Impact SFX:
 * - Guard / Block: tight metallic high-pass clack (1800Hz triangle burst + high-pass crack)
 * - Heavy / Counter / Launcher: deep bass boom + metallic ring modulation + stereo slapback
 * - Normal hit: punchy sine thud (140Hz -> 42Hz) + crisp transient snap
 */
function impact({ blocked = false, launch = false, heavy = false, counter = false, special = false, pan = 0 } = {}) {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;

  if (blocked) {
    // Tight metallic 1800Hz triangle burst + crisp high-pass guard clack
    playTone(1800, 1280, 0.085, 0.20, "triangle", now, sfxBus, pan);
    playTone(1120, 860, 0.11, 0.14, "square", now, sfxBus, pan);
    playNoiseSweep(0.085, 0.20, 2400, 1800, "highpass", { q: 1.0, start: now, destination: sfxBus, pan });
    return;
  }

  if (launch || heavy || counter || special) {
    heavyImpactCrash(pan);
    return;
  }

  // Normal hit impact: low-end sine thud (140Hz -> 42Hz) + crisp transient snap
  playTone(140, 42, 0.16, 0.48, "sine", now, sfxBus, pan);
  playTone(280, 95, 0.06, 0.22, "triangle", now, sfxBus, pan);
  playNoiseSweep(0.065, 0.18, 1250, 420, "bandpass", { q: 1.1, start: now, destination: sfxBus, pan });
}

/**
 * Timed Parry: crisp upward chime + deflection ping.
 */
function parry(pan = 0) {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;
  playTone(1046.5, 1567.98, 0.11, 0.19, "triangle", now, sfxBus, pan);
  playFM(1680, 2140, 840, 420, 0.18, 0.16, { carrierType: "sine", start: now + 0.035, destination: sfxBus, pan });
}

/**
 * Signature Move (L) Activation: rising synth power-up sweep followed by a dramatic bass drop.
 */
function specialWindup(pan = 0) {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;
  playTone(240, 1220, 0.24, 0.18, "sawtooth", now, sfxBus, pan);
  playTone(480, 1580, 0.20, 0.12, "triangle", now + 0.03, sfxBus, pan);
  // Dramatic bass drop right as the flash lands
  playTone(155, 34, 0.34, 0.44, "sine", now + 0.20, sfxBus, pan);
}

/**
 * K.O. Finish: deep reverberating arcade gong/boom that pitches downward during slow-motion.
 */
function knockout() {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;
  const gongBus = context.createGain();
  gongBus.gain.setValueAtTime(1, now);
  gongBus.connect(sfxBus);
  addStereoSlapback(gongBus, 0.085, 0.42, sfxBus);
  addStereoSlapback(gongBus, 0.17, 0.26, sfxBus);

  // Downward slow-motion arcade gong & sub-boom
  playTone(138, 26, 0.85, 0.72, "sine", now, gongBus);
  playFM(245, 78, 368, 260, 0.82, 0.28, { carrierType: "triangle", modType: "sine", start: now, destination: gongBus });
  playNoiseSweep(0.45, 0.28, 1600, 260, "lowpass", { q: 0.8, start: now, destination: gongBus });
}

/**
 * Per-leader vocal-style formant pitch profiles for Victory Screen typewriter blips:
 * - Bass tier: salvini, calenda
 * - Baritone tier: conte, tajani, bonelli, renzi
 * - Higher tier: meloni, schlein
 */
export const VOICE_PROFILES = {
  salvini: { baseHz: 112, formantHz: 680, wave: "sawtooth" },
  calenda: { baseHz: 124, formantHz: 760, wave: "sawtooth" },
  conte: { baseHz: 152, formantHz: 920, wave: "triangle" },
  tajani: { baseHz: 162, formantHz: 980, wave: "triangle" },
  bonelli: { baseHz: 170, formantHz: 1040, wave: "triangle" },
  renzi: { baseHz: 184, formantHz: 1120, wave: "sawtooth" },
  schlein: { baseHz: 238, formantHz: 1300, wave: "triangle" },
  meloni: { baseHz: 256, formantHz: 1380, wave: "triangle" }
};

export const VICTORY_FANFARE_NOTES = [261.63, 392.00, 523.25]; // C4 -> G4 -> C5

/**
 * Character-pitched 25ms formant-filtered voice blip for victory quote typewriter text.
 */
function voiceBlip(characterId = "", char = "") {
  if (!context || !sfxEnabled) return;
  if (typeof char === "string" && char.length > 0 && /^\s+$/.test(char)) return;
  const profile = VOICE_PROFILES[characterId] || { baseHz: 176, formantHz: 1000, wave: "triangle" };
  const now = context.currentTime;
  const duration = 0.025;
  const code = typeof char === "string" && char.length > 0 ? char.charCodeAt(0) : 65;
  const inflection = 0.96 + ((code % 7) * 0.018);
  const startFreq = profile.baseHz * inflection;

  const osc = context.createOscillator();
  const formant = context.createBiquadFilter();
  const gain = context.createGain();

  osc.type = profile.wave;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 1.08, now + duration);

  formant.type = "bandpass";
  formant.frequency.setValueAtTime(profile.formantHz, now);
  if (formant.Q && typeof formant.Q.setValueAtTime === "function") {
    formant.Q.setValueAtTime(3.2, now);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

  osc.connect(formant);
  formant.connect(gain);
  connectWithPan(gain, sfxBus, 0);

  osc.start(now);
  osc.stop(now + duration);
}

/**
 * 3-note 90s arcade brass-synth fanfare (C4 -> G4 -> C5) with warm low-pass filter sweep.
 */
function victoryFanfare() {
  if (!context || !sfxEnabled) return;
  const now = context.currentTime;

  const brassFilter = context.createBiquadFilter();
  brassFilter.type = "lowpass";
  brassFilter.frequency.setValueAtTime(520, now);
  brassFilter.frequency.exponentialRampToValueAtTime(2950, now + 0.34);
  brassFilter.frequency.exponentialRampToValueAtTime(1400, now + 0.86);
  if (brassFilter.Q && typeof brassFilter.Q.setValueAtTime === "function") {
    brassFilter.Q.setValueAtTime(1.6, now);
  }
  brassFilter.connect(sfxBus);

  const steps = [
    { freq: VICTORY_FANFARE_NOTES[0], offset: 0.00, duration: 0.16, pan: -0.18, vol: 0.16 },
    { freq: VICTORY_FANFARE_NOTES[1], offset: 0.14, duration: 0.18, pan: 0.18, vol: 0.18 },
    { freq: VICTORY_FANFARE_NOTES[2], offset: 0.28, duration: 0.58, pan: 0.0, vol: 0.22 }
  ];

  for (const note of steps) {
    const start = now + note.offset;
    // Dual detuned sawtooth brass + warm triangle body
    playTone(note.freq, note.freq * 1.003, note.duration, note.vol, "sawtooth", start, brassFilter, note.pan);
    playTone(note.freq * 1.005, note.freq * 1.007, note.duration, note.vol * 0.72, "sawtooth", start, brassFilter, -note.pan * 0.6);
    playTone(note.freq * 0.5, note.freq * 0.5, note.duration, note.vol * 0.55, "triangle", start, brassFilter, note.pan);
  }
  // Harmonic fifth shimmer under the triumphant final C5 stab
  playTone(VICTORY_FANFARE_NOTES[1], VICTORY_FANFARE_NOTES[1], 0.54, 0.10, "sawtooth", now + 0.28, brassFilter, -0.12);
}

/**
 * Empty click cue when L is pressed below 100% Super Meter.
 */
function emptyClick() {
  if (!context || !sfxEnabled) return;
  playTone(260, 130, 0.045, 0.09, "triangle");
}

export const sound = {
  get available() {
    return Boolean(getAudioContextClass());
  },
  unlock,
  select,
  confirm,
  swing,
  impact,
  parry,
  knockout,
  voiceBlip,
  victoryFanfare,
  emptyClick,
  specialWindup,
  setMusicEnabled(enabled) {
    musicEnabled = Boolean(enabled);
    syncMusic();
  },
  isMusicEnabled() {
    return musicEnabled;
  },
  setSfxEnabled(enabled) {
    sfxEnabled = Boolean(enabled);
    syncSfxGain();
  },
  isSfxEnabled() {
    return sfxEnabled;
  },
  startMatch() {
    matchActive = true;
    syncMusic();
  },
  stopMatch() {
    matchActive = false;
    syncMusic();
  }
};
