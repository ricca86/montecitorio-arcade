import assert from "node:assert/strict";
import test from "node:test";

test("audio unlock, effects and match-only music", async () => {
  const saved = { window: globalThis.window, setInterval, clearInterval, setTimeout };
  const events = [];
  const timers = new Map();
  let timerId = 0;
  let instances = 0;
  let audioContext;

  class Param {
    setValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
    setTargetAtTime(value) { this.value = value; }
  }
  class Node {
    constructor(kind) {
      this.kind = kind;
      this.gain = new Param();
      this.frequency = new Param();
    }
    connect() {}
    disconnect() {}
    start() { events.push(this.kind); }
    stop() {}
  }
  class MockAudioContext {
    constructor() {
      instances += 1;
      audioContext = this;
      this.state = "suspended";
      this.currentTime = 0;
      this.sampleRate = 100;
      this.destination = new Node("destination");
    }
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() { return new Node("gain"); }
    createOscillator() { return new Node("oscillator"); }
    createBiquadFilter() { return new Node("filter"); }
    createBufferSource() { return new Node("noise"); }
    createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
  }

  globalThis.window = { AudioContext: MockAudioContext };
  globalThis.setInterval = (callback) => { timers.set(++timerId, callback); return timerId; };
  globalThis.clearInterval = (id) => timers.delete(id);
  globalThis.setTimeout = (callback) => { callback(); return 0; };
  try {
    const { sound } = await import("../sound.js");
    sound.select();
    sound.startMatch();
    assert.equal(instances, 0, "audio must wait for interaction");
    assert.deepEqual(events, []);

    assert.equal(sound.unlock(), true);
    sound.unlock();
    assert.equal(instances, 1);
    sound.select();
    sound.confirm();
    sound.swing();
    sound.swing(true);
    sound.impact();
    sound.impact({ blocked: true });
    sound.impact({ launch: true });
    sound.knockout();
    assert.ok(events.filter((event) => event === "oscillator").length >= 12);
    assert.equal(events.filter((event) => event === "noise").length, 6);
    assert.equal(timers.size, 0, "music defaults to off");

    sound.setMusicEnabled(true);
    assert.equal(timers.size, 1);
    const notesBefore = events.length;
    audioContext.currentTime += 0.18;
    [...timers.values()][0]();
    assert.ok(events.length > notesBefore, "the loop must schedule another note");
    sound.startMatch();
    assert.equal(timers.size, 1, "starting twice must not duplicate the loop");
    sound.setMusicEnabled(false);
    assert.equal(timers.size, 0);
    sound.setMusicEnabled(true);
    assert.equal(timers.size, 1);
    sound.stopMatch();
    assert.equal(timers.size, 0);
    sound.setMusicEnabled(false);
    sound.setMusicEnabled(true);
    assert.equal(timers.size, 0, "music must not play outside a match");
    sound.startMatch();
    assert.equal(timers.size, 1, "music preference should carry into a rematch");
    sound.stopMatch();
  } finally {
    globalThis.window = saved.window;
    globalThis.setInterval = saved.setInterval;
    globalThis.clearInterval = saved.clearInterval;
    globalThis.setTimeout = saved.setTimeout;
  }
});

test("unsupported browsers can continue without audio", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const { sound } = await import("../sound.js?unsupported");
    assert.equal(sound.available, false);
    assert.equal(sound.unlock(), false);
    sound.select();
    sound.impact({ launch: true });
    sound.setMusicEnabled(true);
    sound.startMatch();
    sound.stopMatch();
  } finally {
    globalThis.window = previousWindow;
  }
});
