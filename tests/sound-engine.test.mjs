import assert from "node:assert/strict";
import test from "node:test";

test("sound-engine synthesizes PS1 combat SFX, FM menu blips, 138 BPM pentatonic music, and SFX/Music mutes", async () => {
  const saved = { window: globalThis.window, setInterval, clearInterval, setTimeout };
  const created = [];
  const timers = new Map();
  let timerId = 0;

  class Param {
    constructor(name) {
      this.name = name;
      this.value = 0;
      this.calls = [];
    }
    setValueAtTime(value, time) {
      this.value = value;
      this.calls.push({ op: "set", value, time });
    }
    exponentialRampToValueAtTime(value, time) {
      this.calls.push({ op: "exp", value, time });
    }
    setTargetAtTime(value, time) {
      this.calls.push({ op: "target", value, time });
    }
  }

  class Node {
    constructor(kind) {
      this.kind = kind;
      this.type = "";
      this.gain = new Param("gain");
      this.frequency = new Param("frequency");
      this.Q = new Param("Q");
      this.delayTime = new Param("delayTime");
      this.pan = new Param("pan");
      this.connections = [];
      created.push(this);
    }
    connect(target) {
      this.connections.push(target);
    }
    disconnect() {}
    start(t = 0) {
      this.startedAt = t;
    }
    stop(t = 0) {
      this.stoppedAt = t;
    }
  }

  class RichAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = new Node("destination");
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() { return new Node("gain"); }
    createOscillator() { return new Node("oscillator"); }
    createBiquadFilter() { return new Node("filter"); }
    createBufferSource() { return new Node("noise"); }
    createDelay() { return new Node("delay"); }
    createStereoPanner() { return new Node("panner"); }
    createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
  }

  globalThis.window = { AudioContext: RichAudioContext };
  globalThis.setInterval = (cb) => { timers.set(++timerId, cb); return timerId; };
  globalThis.clearInterval = (id) => timers.delete(id);
  globalThis.setTimeout = (cb) => { cb(); return 0; };

  try {
    const mod = await import(`../sound-engine.js?test=${Date.now()}`);
    const { sound, MUSIC_BPM, MUSIC_STEP_SECONDS } = mod;

    assert.equal(MUSIC_BPM, 138);
    assert.ok(Math.abs(MUSIC_STEP_SECONDS - 60 / (138 * 4)) < 1e-9);
    assert.equal(sound.unlock(), true);

    const resetLog = () => { created.length = 0; };

    // Light whoosh (800Hz -> 250Hz, 90ms)
    resetLog();
    sound.swing({ heavy: false });
    const lightFilter = created.find((n) => n.kind === "filter");
    assert.equal(lightFilter.frequency.calls[0].value, 800);
    assert.equal(lightFilter.frequency.calls[1].value, 250);
    const lightNoise = created.find((n) => n.kind === "noise");
    assert.ok(Math.abs((lightNoise.stoppedAt - lightNoise.startedAt) - 0.09) < 1e-6);

    // Heavy whoosh (500Hz -> 120Hz, 140ms + sub drop)
    resetLog();
    sound.swing({ heavy: true });
    const heavyFilter = created.find((n) => n.kind === "filter");
    assert.equal(heavyFilter.frequency.calls[0].value, 500);
    assert.equal(heavyFilter.frequency.calls[1].value, 120);
    const heavyNoise = created.find((n) => n.kind === "noise");
    assert.ok(Math.abs((heavyNoise.stoppedAt - heavyNoise.startedAt) - 0.14) < 1e-6);
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "sine"));

    // Normal hit impact (140Hz -> 42Hz sine + crisp snap)
    resetLog();
    sound.impact();
    const hitSine = created.find((n) => n.kind === "oscillator" && n.type === "sine");
    assert.equal(hitSine.frequency.calls[0].value, 140);
    assert.equal(hitSine.frequency.calls[1].value, 42);
    assert.ok(created.some((n) => n.kind === "noise"));

    // Heavy / Counter / Launcher crash (bass boom + metallic ring mod + stereo slapback)
    resetLog();
    sound.impact({ counter: true, heavy: true, pan: -0.3 });
    assert.ok(created.some((n) => n.kind === "delay"));
    assert.ok(created.some((n) => n.kind === "panner"));
    assert.ok(created.some((n) => n.kind === "gain" && n.connections.some((c) => c.name === "gain")));

    // Guard / Block (tight 1800Hz triangle burst + high-pass noise)
    resetLog();
    sound.impact({ blocked: true });
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "triangle" && n.frequency.calls[0].value === 1800));
    assert.ok(created.some((n) => n.kind === "filter" && n.type === "highpass"));

    // Timed parry chime + ping
    resetLog();
    sound.parry(0.2);
    assert.ok(created.filter((n) => n.kind === "oscillator").length >= 3);

    // Signature move L activation sweep + bass drop
    resetLog();
    sound.specialWindup();
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "sawtooth"));
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "sine" && n.startedAt > 0));

    // Character-pitched 25ms formant voice blips (bass vs baritone vs high tier) + space skip
    const { VOICE_PROFILES, VICTORY_FANFARE_NOTES } = mod;
    assert.ok(VOICE_PROFILES.salvini.baseHz < VOICE_PROFILES.conte.baseHz);
    assert.ok(VOICE_PROFILES.conte.baseHz < VOICE_PROFILES.meloni.baseHz);

    resetLog();
    sound.voiceBlip("salvini", "A");
    const bassOsc = created.find((n) => n.kind === "oscillator");
    const bassFormant = created.find((n) => n.kind === "filter");
    assert.ok(bassOsc);
    assert.ok(Math.abs((bassOsc.stoppedAt - bassOsc.startedAt) - 0.025) < 1e-6);
    assert.equal(bassFormant.type, "bandpass");
    assert.equal(bassFormant.frequency.calls[0].value, VOICE_PROFILES.salvini.formantHz);

    resetLog();
    sound.voiceBlip("meloni", "A");
    const highOsc = created.find((n) => n.kind === "oscillator");
    assert.ok(highOsc.frequency.calls[0].value > bassOsc.frequency.calls[0].value * 1.8);

    resetLog();
    sound.voiceBlip("meloni", " ");
    assert.equal(created.length, 0, "Spaces should not emit typewriter blips");

    // 3-note C4 -> G4 -> C5 arcade brass victory fanfare with warm low-pass sweep
    assert.deepEqual(VICTORY_FANFARE_NOTES, [261.63, 392.00, 523.25]);
    resetLog();
    sound.victoryFanfare();
    const fanfareFilter = created.find((n) => n.kind === "filter");
    assert.equal(fanfareFilter.type, "lowpass");
    assert.ok(fanfareFilter.frequency.calls.some((c) => c.value >= 2500));
    const fanfareOscs = created.filter((n) => n.kind === "oscillator");
    assert.ok(fanfareOscs.some((o) => Math.abs(o.frequency.calls[0].value - 261.63) < 0.1));
    assert.ok(fanfareOscs.some((o) => Math.abs(o.frequency.calls[0].value - 392.00) < 0.1));
    assert.ok(fanfareOscs.some((o) => Math.abs(o.frequency.calls[0].value - 523.25) < 0.1));

    // K.O. deep reverberating downward gong
    resetLog();
    sound.knockout();
    assert.ok(created.filter((n) => n.kind === "delay").length >= 2);
    const koOsc = created.find((n) => n.kind === "oscillator" && n.type === "sine");
    assert.ok(koOsc.frequency.calls[1].value < koOsc.frequency.calls[0].value);

    // SFX mute toggle blocks SFX (including voiceBlip & fanfare) without breaking music
    sound.setSfxEnabled(false);
    assert.equal(sound.isSfxEnabled(), false);
    resetLog();
    sound.impact({ blocked: true });
    sound.parry();
    sound.voiceBlip("meloni", "X");
    sound.victoryFanfare();
    assert.equal(created.length, 0);
    sound.setSfxEnabled(true);

    // 138 BPM minor pentatonic music loop with low-pass filter
    resetLog();
    sound.setMusicEnabled(true);
    sound.startMatch();
    assert.equal(timers.size, 1);
    assert.ok(created.some((n) => n.kind === "filter" && n.type === "lowpass"));
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "sawtooth"));
    assert.ok(created.some((n) => n.kind === "oscillator" && n.type === "square"));
    sound.stopMatch();
    assert.equal(timers.size, 0);
  } finally {
    globalThis.window = saved.window;
    globalThis.setInterval = saved.setInterval;
    globalThis.clearInterval = saved.clearInterval;
    globalThis.setTimeout = saved.setTimeout;
  }
});
