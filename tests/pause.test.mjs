import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function node() {
  const classes = new Set();
  return {
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
      toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); }
    },
    setAttribute(name, value) { this[name] = value; },
    focus() { this.focused = true; },
    remove() { this.removed = true; }
  };
}

test("pause freezes simulation, hit-stop, camera and effects without stopping rendering", () => {
  const calls = [];
  const context = vm.createContext({
    isPaused: true, controllerNoticeUntil: 0, hitStop: 0.1, clock: { getDelta: () => 0.02 },
    requestAnimationFrame: () => calls.push("frame"),
    pollGamepads() {},
    renderer: { render: () => calls.push("render") }, scene: {}, camera: {},
    update: () => calls.push("update"),
    updateCamera: () => calls.push("camera"),
    updateImpactEffects: () => calls.push("effects"), Math
  });
  vm.runInContext(section("function animate()", "function navigateRoster("), context);
  context.animate();
  assert.deepEqual(calls, ["frame", "render"]);
  assert.equal(context.hitStop, 0.1);
  context.isPaused = false;
  calls.length = 0;
  context.animate();
  assert.deepEqual(calls, ["frame", "update", "camera", "effects", "render"]);
  assert.ok(Math.abs(context.hitStop - 0.08) < 1e-9);
});

test("pause clears held controls and restart restores the current match checkpoint", () => {
  const nodes = new Map();
  const get = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const tournament = { currentStage: 4, roundWins: { player: 1, cpu: 1 }, totalScore: 4000, winStreak: 3 };
  const animation = { playState: "running", pause() { this.playState = "paused"; }, play() { this.playState = "running"; } };
  const stageElement = node();
  stageElement.getAnimations = () => [animation];
  let starts = 0;
  const context = vm.createContext({
    matchActive: true, isPaused: false, pausedAnimations: [], player: { definition: { name: "Fighter", special: "Special" } },
    tournament, matchCheckpoint: { totalScore: 3000, winStreak: 2 },
    keys: new Set(["a", "s"]), lastTap: { w: 1, s: 2, ArrowUp: 0, ArrowDown: 0 },
    clearInputs() { context.keys.clear(); }, updateTouchVisibility() {},
    pauseScreen: node(), stageElement, pauseButton: node(),
    document: { querySelector: get }, drawLadderPortrait() {},
    startRound() { starts += 1; }
  });
  vm.runInContext(section("function setPaused(", "function returnToTitleScreen("), context);
  context.setPaused(true);
  assert.equal(context.isPaused, true);
  assert.equal(animation.playState, "paused");
  assert.equal(context.keys.size, 0);
  assert.equal(get("#pause-fighter-name").textContent, "Fighter");
  assert.equal(get("#pause-signature").textContent, "Signature: Special");
  assert.equal(get("#resume-button").focused, true);
  context.restartMatch();
  assert.equal(context.isPaused, false);
  assert.equal(animation.playState, "running");
  assert.equal(tournament.currentStage, 4);
  assert.equal(tournament.roundWins.player, 0);
  assert.equal(tournament.roundWins.cpu, 0);
  assert.equal(tournament.totalScore, 3000);
  assert.equal(tournament.winStreak, 2);
  assert.equal(starts, 1);
});

test("return to title cancels timers and disposes fighters and combat effects", () => {
  const removed = [];
  const disposed = [];
  const geometry = (name) => ({ dispose: () => disposed.push(name) });
  const material = (name) => ({ dispose: () => disposed.push(name) });
  const projectile = {
    projectile: true,
    mesh: { traverse: (visit) => visit({ isMesh: true, geometry: geometry("projectile geometry"), material: material("projectile material") }) }
  };
  const particle = { mesh: { geometry: geometry("particle geometry"), material: material("particle material") } };
  const effect = { mesh: { material: material("effect material") } };
  const callout = { element: node(), life: 1 };
  const selected = node();
  const nodes = new Map();
  const get = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const color = () => ({ set(value) { this.value = value; } });
  const vector = () => ({ set(...values) { this.values = values; }, copy(other) { this.values = other.values; } });
  const cameraRig = vector();
  const cameraTarget = vector();
  const canceled = [];
  const context = vm.createContext({
    ladderTimeout: 10, continueInterval: 11, continueDeadline: 100,
    clearTimeout: (id) => canceled.push(id), clearInterval: (id) => canceled.push(id),
    scene: { remove: (item) => removed.push(item), background: color(), fog: { color: color() } },
    ballots: [projectile], particles: [particle], impactEffects: [effect], callouts: [callout],
    clearSidestepGhosts() { disposed.push("ghosts"); },
    keys: new Set(["a"]), lastTap: { w: 1, s: 1 }, sound: { stopMatch() { disposed.push("music"); } },
    clearInputs() { context.keys.clear(); }, updateTouchVisibility() {},
    matchActive: true, matchOver: true, isPaused: true, pausedAnimations: [], victory: {}, hitStop: 0.1, shake: 1, cameraTilt: 1,
    elapsed: 2, tournamentStartedAt: 123, matchCheckpoint: {}, tournament: {},
    fightersInMatch: [{ id: "p1" }, { id: "cpu" }], disposeFighter: (fighter) => disposed.push(fighter.id),
    player: {}, opponent: {}, announcerTimer: 1, toastTimer: 1, announcer: node(), toast: node(),
    pauseScreen: node(), pauseButton: node(), stageElement: node(),
    resultScreen: node(), ladderScreen: node(), continueScreen: node(), selectScreen: node(),
    document: { querySelector: get }, rosterNode: { querySelector: () => selected }, buildRoster() {},
    ambientLight: { color: color(), groundColor: color() }, keyLight: { color: color() }, rimLight: { color: color() },
    cameraRig, cameraTarget, camera: { position: vector(), lookAt() {} }
  });
  vm.runInContext(section("function clearProjectiles(", "function startRound(") +
    section("function setPaused(", "function updateHealthDisplay("), context);
  context.returnToTitleScreen();
  assert.deepEqual(canceled, [10, 11]);
  assert.equal(context.ballots.length, 0);
  assert.equal(context.particles.length, 0);
  assert.equal(context.impactEffects.length, 0);
  assert.equal(context.callouts.length, 0);
  assert.equal(callout.element.removed, true);
  assert.deepEqual(removed, [projectile.mesh, particle.mesh, effect.mesh]);
  assert.deepEqual(disposed.sort(), ["projectile geometry", "projectile material", "ghosts", "particle geometry", "particle material", "effect material", "music", "p1", "cpu"].sort());
  assert.equal(context.tournament, null);
  assert.equal(context.player, null);
  assert.equal(context.opponent, null);
  assert.equal(context.isPaused, false);
  assert.equal(context.hitStop, 0);
  assert.equal(context.keys.size, 0);
  assert.deepEqual(cameraRig.values, [0, 7.4, 17.4]);
  assert.equal(selected.focused, true);
});
