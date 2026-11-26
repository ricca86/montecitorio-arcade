import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../vendor/three/three.module.min.js";
import { fighters } from "../fighters.js";
import { VersusManager, TournamentManager, difficultyForStage, formatTournamentTime } from "../tournament.js";
import * as combo from "../combo.js";
import * as defense from "../defense.js";
import * as input from "../input.js";
import * as fighterModel from "../fighter-model.js";
import * as arenaMod from "../arena.js";
import * as atmosphereMod from "../atmosphere.js";
import * as superMeter from "../super-meter.js";
import { getWinQuote, startQuoteTypewriter } from "../win-quotes.js";

const gameJs = await readFile(new URL("../game.js", import.meta.url), "utf8");

test("VersusManager tracks Best-of-3 rounds and reset without arcade ladder", () => {
  const vmMatch = new VersusManager("meloni", "salvini");
  assert.equal(vmMatch.roundLabel, "ROUND 1");
  assert.equal(vmMatch.recordRound("player"), "round");
  assert.equal(vmMatch.roundLabel, "ROUND 2");
  assert.equal(vmMatch.recordRound("cpu"), "round");
  assert.equal(vmMatch.roundLabel, "FINAL ROUND");
  assert.equal(vmMatch.recordRound("player"), "versus-p1");
  vmMatch.retry();
  assert.deepEqual(vmMatch.roundWins, { player: 0, cpu: 0 });
  assert.equal(vmMatch.recordRound("cpu"), "round");
  assert.equal(vmMatch.recordRound("cpu"), "versus-p2");
});

test("buildFighterModel tints mirror P2 suit distinctly when altSuit is enabled", () => {
  const baseDef = fighters[0];
  const p1Model = fighterModel.buildFighterModel(baseDef, 1);
  const p2Mirror = fighterModel.buildFighterModel(baseDef, -1, { altSuit: true });

  const armSample = (body) => {
    let sample = null;
    body.joints.leftShoulder.traverse((part) => {
      if (!sample && part.isMesh && part.material?.map?.userData?.pixels) {
        const px = part.material.map.userData.pixels;
        sample = [px[0], px[1], px[2]];
      }
    });
    return sample;
  };
  assert.ok(armSample(p1Model));
  assert.notDeepEqual(armSample(p1Model), armSample(p2Mirror));
});

test("2P Local Versus mode switches UI, locks dual cursors, routes P2 controls, and shows 2P win options", async () => {
  const savedWindow = globalThis.window;
  globalThis.window = { AudioContext: null, webkitAudioContext: null };
  const { sound } = await import("../sound-engine.js");
  globalThis.window = savedWindow;

  const listeners = { window: { keydown: [], keyup: [] }, docs: new Map() };
  const scheduled = [];
  const makeEl = (tag = "div") => {
    const classes = new Set(["hidden"]);
    const attrs = new Map();
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      style: { setProperty() {}, transition: "", width: "" },
      children,
      clientWidth: 960, clientHeight: 540, offsetWidth: 0,
      textContent: "", innerHTML: "", disabled: false, title: "", dataset: {},
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (f ? classes.add(c) : classes.delete(c))),
        contains: (c) => classes.has(c)
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      appendChild: (c) => { children.push(c); return c; },
      replaceChildren: (...c) => { children.length = 0; children.push(...c); },
      remove() {}, focus() { doc.activeElement = el; }, blur() {}, closest: () => null,
      contains: (other) => other === el || children.some((c) => c.contains?.(other)),
      addEventListener: (type, fn) => {
        if (!listeners.docs.has(el)) listeners.docs.set(el, {});
        listeners.docs.get(el)[type] = fn;
      },
      click() { listeners.docs.get(el)?.click?.(); },
      removeEventListener() {},
      getContext: () => ({
        imageSmoothingEnabled: false, fillStyle: "", strokeStyle: "", lineWidth: 1,
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, strokeRect() {}, drawImage() {},
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}
      }),
      querySelector: (s) => getEl(s),
      querySelectorAll: () => children.filter((c) => c.tagName === "BUTTON"),
      animate: () => ({ playState: "running", pause() {}, play() {}, cancel() {} }),
      getAnimations: () => []
    };
    return el;
  };
  const domMap = new Map();
  const getEl = (sel) => { if (!domMap.has(sel)) domMap.set(sel, makeEl()); return domMap.get(sel); };
  getEl("#select-screen").classList.remove("hidden");

  const doc = {
    querySelector: getEl, querySelectorAll: () => [],
    createElement: makeEl, body: makeEl("body"), activeElement: null, addEventListener() {}
  };
  const MockTHREE = {
    ...THREE,
    WebGLRenderer: class {
      constructor() { this.domElement = makeEl("canvas"); this.shadowMap = {}; }
      setPixelRatio() {} setSize() {} render() {}
    }
  };
  const intervals = [];
  const ctx = vm.createContext({
    THREE: MockTHREE, fighters, sound, getWinQuote, startQuoteTypewriter, TournamentManager, VersusManager, difficultyForStage, formatTournamentTime,
    ...combo, ...defense, ...input, ...fighterModel, ...arenaMod, ...atmosphereMod, ...superMeter,
    document: doc,
    window: {
      devicePixelRatio: 1, innerHeight: 720, innerWidth: 1280,
      addEventListener: (type, fn) => {
        if (!listeners.window[type]) listeners.window[type] = [];
        listeners.window[type].push(fn);
      }
    },
    navigator: { maxTouchPoints: 0, getGamepads: () => [] },
    performance, requestAnimationFrame: () => 1,
    setTimeout: (cb, delay) => { scheduled.push({ cb, delay }); return scheduled.length; },
    clearTimeout() {},
    setInterval: (cb) => { intervals.push(cb); return intervals.length; },
    clearInterval(id) { if (id >= 1 && id <= intervals.length) intervals[id - 1] = null; },
    Math
  });
  vm.runInContext(gameJs.slice(gameJs.indexOf("const mount =")), ctx);

  // Switch to 2P Local Versus mode
  getEl("#mode-versus").click();
  assert.equal(getEl("#mode-versus").classList.contains("active"), true);

  // Move P1 to fighter 2 with 'd', keep P2 on fighter 2 (mirror match!) then lock both!
  const kd = (key, code = "") => listeners.window.keydown.forEach((fn) => fn({ key, code, repeat: false, target: doc.body, preventDefault() {} }));
  const ku = (key, code = "") => listeners.window.keyup.forEach((fn) => fn({ key, code, target: doc.body }));
  kd("d");
  // P2 default starts at index 1; confirm P2 stays on index 1 and both lock in for mirror match
  kd("u");
  assert.equal(getEl("#roster").children[1].classList.contains("locked-p1"), true);
  kd("Enter", "Numpad1");

  // 2s Versus splash should appear and schedule startRound at 2000ms
  assert.equal(getEl("#versus-screen").classList.contains("hidden"), false);
  assert.equal(scheduled.some((s) => s.delay === 2000), true);
  ctx.startRound();

  // HUD should show "2P", CONSENSO 1P & CONSENSO 2P
  assert.equal(getEl("#opponent-tag").textContent, "2P");
  assert.equal(getEl("#player-health-label").textContent, "CONSENSO 1P");
  assert.equal(getEl("#opponent-health-label").textContent, "CONSENSO 2P");

  // P2 controls (ArrowLeft + split keys) control opponent independently without moving P1
  const readFighters = () => vm.runInContext("({ player, opponent })", ctx);
  kd("ArrowLeft", "ArrowLeft");
  ctx.update(0.05);
  let state = readFighters();
  assert.ok(state.opponent.vx < 0, "ArrowLeft should walk P2 left in versus mode");
  assert.equal(state.player.vx, 0, "ArrowLeft must not move P1 in versus mode");
  ku("ArrowLeft", "ArrowLeft");

  // P2 Left Punch (J / Numpad4), Left Kick (N / Numpad1), Launcher (O)
  kd("j", "KeyJ");
  state = readFighters();
  assert.equal(state.opponent.attack?.limb, "leftPunch", "J should trigger P2 Left Punch");
  assert.equal(state.player.attack, null, "J must not trigger P1 attack in versus mode");
  state.opponent.attack = null;
  state.opponent.cooldown = 0;

  kd("1", "Numpad1");
  state = readFighters();
  assert.equal(state.opponent.attack?.limb, "leftKick", "Numpad 1 should trigger P2 Left Kick");
  state.opponent.attack = null;
  state.opponent.cooldown = 0;

  kd("o", "KeyO");
  state = readFighters();
  assert.equal(state.opponent.attack?.launch, true, "O should trigger P2 Launcher");
  state.opponent.attack = null;
  state.opponent.cooldown = 0;

  // P1 split keys (F Left Punch, T Launcher) must move P1 without moving P2
  kd("f", "KeyF");
  state = readFighters();
  assert.equal(state.player.attack?.limb, "leftPunch", "F should trigger P1 Left Punch");
  assert.equal(state.opponent.attack, null, "F must not trigger P2 attack in versus mode");
  state.player.attack = null;
  state.player.cooldown = 0;

  kd("t", "KeyT");
  state = readFighters();
  assert.equal(state.player.attack?.launch, true, "T should trigger P1 Launcher");
  state.player.attack = null;
  state.player.cooldown = 0;

  // Dynamic Pause Menu displays P1 and P2 side-by-side key bindings in 2P mode
  ctx.setPaused(true);
  assert.equal(getEl("#controls-title").textContent, "PLAYER 1 (LEFT SIDE)");
  assert.equal(getEl("#combos-title").textContent, "PLAYER 2 (RIGHT SIDE / NUMPAD)");
  assert.ok(getEl("#pause-controls-list").innerHTML.includes("<kbd>F</kbd> / <kbd>G</kbd>"));
  assert.ok(getEl("#pause-controls-list").innerHTML.includes("<kbd>C</kbd> / <kbd>V</kbd>"));
  assert.ok(getEl("#pause-combos-list").innerHTML.includes("<kbd>J</kbd>/<kbd>N4</kbd>"));
  assert.ok(getEl("#pause-combos-list").innerHTML.includes("<kbd>O</kbd>"));
  ctx.setPaused(false);

  // Finish 2P match with P2 victory -> check PLAYER 2 WINS, quote typewriter & 3 buttons visible
  ctx.finishRoundTransition("versus-p2");
  assert.equal(getEl("#result-title").textContent, "PLAYER 2 WINS!");
  assert.equal(getEl("#result-quote").classList.contains("hidden"), false);
  assert.equal(getEl("#result-quote").classList.contains("is-typing"), true);
  assert.equal(getEl("#result-quote").dataset.fullQuote, "TANTE CHIACCHIERE, ZERO COMBO. TORNA IN PANCHINA!");
  const activeTicker = intervals.find(Boolean);
  assert.ok(activeTicker);
  while (getEl("#result-quote").classList.contains("is-typing")) activeTicker();
  assert.equal(getEl("#result-quote").textContent, "TANTE CHIACCHIERE, ZERO COMBO. TORNA IN PANCHINA!");
  assert.equal(getEl("#rematch-button").textContent, "REMATCH");
  assert.equal(getEl("#versus-change-button").classList.contains("hidden"), false);
  assert.equal(getEl("#versus-menu-button").classList.contains("hidden"), false);

  // Verify REMATCH, CHANGE FIGHTERS, and MAIN MENU actions
  getEl("#rematch-button").click();
  assert.equal(getEl("#result-screen").classList.contains("hidden"), true);
  assert.equal(getEl("#hud").classList.contains("active"), true);
  getEl("#versus-change-button").click();
  assert.equal(getEl("#select-screen").classList.contains("hidden"), false);
  assert.equal(getEl("#mode-versus").classList.contains("active"), true);
  getEl("#versus-menu-button").click();
  assert.equal(getEl("#mode-arcade").classList.contains("active"), true);
});

test("InputManager handles dual/single gamepad slots and disjoint 2P vs 1P keyboard bindings", () => {
  const manager = new input.InputManager();
  assert.equal(manager.resolveGamepadSlot(0, 1), 1);
  assert.equal(manager.resolveGamepadSlot(0, 2), 1);

  manager.setMode("versus");
  assert.equal(manager.resolveGamepadSlot(0, 1), 2, "Single gamepad in 2P mode defaults to P2");
  assert.equal(manager.resolveGamepadSlot(0, 2), 1, "Pad 0 routes to P1 when 2 gamepads are connected");
  assert.equal(manager.resolveGamepadSlot(1, 2), 2, "Pad 1 routes to P2 when 2 gamepads are connected");

  manager.setSinglePadSlot(1);
  assert.equal(manager.resolveGamepadSlot(0, 1), 1, "Configurable singlePadSlot works");

  // Verify zero key overlap between P1 and P2 versus bindings
  const p1Tokens = new Set(Object.keys(input.p1VersusKeyboardActions));
  const p2Tokens = new Set(Object.keys(input.p2VersusKeyboardActions));
  for (const token of p1Tokens) {
    assert.equal(p2Tokens.has(token), false, `Key/code conflict found on ${token}`);
  }

  // Verify resolveKeyboardEvent routing in 2P versus vs 1P arcade mode
  assert.deepEqual(manager.resolveKeyboardEvent({ key: "f", code: "KeyF" }), {
    slot: 1,
    action: "punchL",
    token: "f"
  });
  assert.deepEqual(manager.resolveKeyboardEvent({ key: "j", code: "KeyJ" }), {
    slot: 2,
    action: "punchL",
    token: "j"
  });
  assert.deepEqual(manager.resolveKeyboardEvent({ key: "u", code: "KeyU" }), null, "1P-only arcade U is inactive in 2P split");

  manager.setMode("arcade");
  assert.deepEqual(manager.resolveKeyboardEvent({ key: "u", code: "KeyU" }), {
    slot: 1,
    action: "punchL",
    token: "u"
  });
  assert.deepEqual(manager.resolveKeyboardEvent({ key: "ArrowLeft", code: "ArrowLeft" }), {
    slot: 1,
    action: "left",
    token: "arrowleft"
  });
});
