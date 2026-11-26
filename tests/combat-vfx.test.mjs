import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../vendor/three/three.module.min.js";
import * as combo from "../combo.js";
import * as defense from "../defense.js";
import * as superMeter from "../super-meter.js";
import { buildFighterModel, isKickHitboxActive, setSpecialReadyGlow } from "../fighter-model.js";
import { fighters } from "../fighters.js";
import { createDynamicCamera } from "../atmosphere.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function setupCombatVfx() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const dynamicCamera = createDynamicCamera(camera);
  const announcerClasses = new Set();
  const announcerSpan = { textContent: "" };
  const announcerStrong = { textContent: "" };
  const announcer = {
    querySelector: (s) => (s === "span" ? announcerSpan : announcerStrong),
    classList: {
      add: (c) => announcerClasses.add(c),
      remove: (...cs) => cs.forEach((c) => announcerClasses.delete(c)),
      toggle: (c, f) => (f ? announcerClasses.add(c) : announcerClasses.delete(c)),
      contains: (c) => announcerClasses.has(c)
    }
  };

  const makeFighter = (def, isPlayer, x) => ({
    definition: def,
    ...buildFighterModel(def, isPlayer ? 1 : -1),
    input: combo.createComboInput(),
    isPlayer, health: 100, superMeter: 100, x, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    facing: isPlayer ? 1 : -1, attack: null, cooldown: 0, stun: 0, recovery: 0,
    airborne: false, landingTime: 0, dodgeTimer: 0, blocking: false, blockTimer: 0,
    guardMode: null, parryTimer: 0, parryRecovery: 0, parryPose: 0, risingTimer: 0,
    usedSpecialInRound: false, lastAttackWasSpecial: false,
    reactionTime: 0, animationTime: 0, walkPhase: 0, airRotation: 0
  });

  const player = makeFighter(fighters[0], true, -0.5);
  const opponent = makeFighter(fighters[1], false, 0.5);
  const lensData = new Uint8ClampedArray(64 * 64 * 4);
  lensData.fill(255);
  const lensFlareTexture = new THREE.DataTexture(lensData, 64, 64, THREE.RGBAFormat);

  const badge = () => ({ textContent: "", classList: { add() {}, remove() {} } });
  const context = vm.createContext({
    THREE,
    clamp: THREE.MathUtils.clamp,
    random: (min, max) => (min + max) / 2,
    scene, camera, dynamicCamera,
    sparkGeometry: new THREE.OctahedronGeometry(0.08, 0),
    lineSparkGeometry: new THREE.BoxGeometry(0.026, 0.34, 0.026),
    ringGeometry: new THREE.RingGeometry(0.58, 0.78, 28),
    lensFlareTexture,
    particles: [], impactEffects: [], callouts: [], comicWords: ["FIDUCIA!"],
    player, opponent,
    matchActive: true, matchOver: false, isPaused: false, hitStop: 0, koSlowMo: 0, shake: 0, cameraTilt: 0,
    victory: null, announcer, announcerTimer: 0, tournamentStartedAt: 0,
    tournament: { roundLabel: "ROUND 1", recordRound: () => ({ roundOver: true }) },
    ...combo, ...defense, ...superMeter, isKickHitboxActive, setSpecialReadyGlow,
    sound: { swing() {}, impact() {}, parry() {}, knockout() {}, stopMatch() {}, emptyClick() {}, specialWindup() {} },
    clearInputs() {}, updateTouchVisibility() {}, updateHealthDisplay() {}, finishRoundTransition() {},
    spawnCallout() {}, spawnBallot() {}, clearProjectiles() {}, clearSidestepGhosts() {},
    poseFighter() {},
    toast: badge(), toastTimer: 0,
    document: { querySelector: () => badge() },
    performance, Math
  });

  vm.runInContext([
    slice("function showAnnouncer(", "function disposeFighter("),
    slice("function spawnBurst(", "function attackDefinition("),
    slice("function recordCombatHit(", "function showContinue("),
    slice("function updateImpactEffects(", "function checkTimer("),
    slice("function updateVictory(", "function update(")
  ].join("\n"), context);

  return { context, player, opponent, announcer, announcerSpan, announcerStrong, announcerClasses, dynamicCamera };
}

test("3D hit sparks, guard sparks, shockwave rings, and lens-flare flash spawn cleanly", () => {
  const { context, dynamicCamera } = setupCombatVfx();
  const pt = new THREE.Vector3(0.4, 1.4, 0);

  // Normal hit: 12-16 golden/orange diamond & line sparks decaying over 250ms
  context.spawnImpact(pt, { direction: 1 });
  assert.ok(context.impactEffects.length >= 12 && context.impactEffects.length <= 16);
  const sparks = context.impactEffects.filter((e) => e.kind === "spark");
  assert.equal(sparks[0].duration, 0.25);
  assert.ok(sparks.some((e) => e.mesh.geometry === context.sparkGeometry));
  assert.ok(sparks.some((e) => e.mesh.geometry === context.lineSparkGeometry));
  const initialSpeed = sparks[0].velocity.length();
  context.updateImpactEffects(0.05);
  assert.ok(sparks[0].velocity.length() < initialSpeed, "spark velocity must decay rapidly");
  context.updateImpactEffects(0.25);
  assert.equal(context.impactEffects.length, 0);

  // Guard / Block: cool electric-blue/cyan sparks
  context.spawnImpact(pt, { blocked: true, direction: 1 });
  const guardColors = new Set(context.impactEffects.map((e) => "#" + e.mesh.material.color.getHexString()));
  assert.ok([...guardColors].some((c) => c === "#38c8ff" || c === "#7ff6ff"));
  context.impactEffects.length = 0;

  // Launchers / Counters / Signature Moves: expanding crimson/gold rings + additive lens-flare Sprite
  for (const flags of [{ launch: true }, { counter: true }, { special: true }]) {
    context.impactEffects.length = 0;
    context.spawnImpact(pt, flags);
    const rings = context.impactEffects.filter((e) => e.kind === "ring");
    const flares = context.impactEffects.filter((e) => e.kind === "flare");
    assert.ok(rings.length >= 1, "expected expanding RingGeometry shockwave");
    assert.equal(flares.length, 1, "expected lens-flare flash sprite");
    assert.equal(flares[0].mesh.isSprite, true);
    const s0 = rings[0].mesh.scale.x;
    context.updateImpactEffects(0.08);
    assert.ok(rings[0].mesh.scale.x > s0, "shockwave ring should scale upward");
  }
  assert.ok(dynamicCamera);
});

test("arcade hit-stop (55/95/130ms), proportional shake, and KO slow-mo victory slam", () => {
  const { context, player, opponent, announcerStrong, announcerClasses } = setupCombatVfx();
  const hitPt = new THREE.Vector3(0.2, 1.35, 0);

  // Normal hit -> 55ms hitStop
  context.hitStop = 0; context.shake = 0;
  context.resolveCombatImpact(player, opponent, { kind: "punch", limb: "leftPunch", height: "high", damage: 7 }, hitPt);
  assert.equal(context.hitStop, 0.055);
  const normalShake = context.shake;

  // Heavy / Counter hit -> 95ms hitStop + higher damage shake
  context.hitStop = 0; context.shake = 0;
  opponent.attack = { age: 0.02, windup: 0.2, hit: false };
  context.resolveCombatImpact(player, opponent, { kind: "heavy", limb: "rightPunch", height: "mid", damage: 14 }, hitPt);
  assert.equal(context.hitStop, 0.095);
  assert.ok(context.shake > normalShake, "heavy/counter hit should produce stronger proportional shake");

  // Signature Move -> 130ms hitStop
  context.hitStop = 0; context.shake = 0;
  opponent.attack = null;
  context.resolveCombatImpact(player, opponent, { kind: "rush", limb: "rightPunch", special: true, damage: 26 }, hitPt);
  assert.equal(context.hitStop, 0.130);

  // K.O. hit -> 1.2s slow-motion, red/gold burst, loser drops to floor -> slams "K.O. — MOZIONE APPROVATA!"
  opponent.health = 5;
  context.impactEffects.length = 0;
  context.resolveCombatImpact(player, opponent, { kind: "heavy", limb: "rightKick", knockdown: true, damage: 15 }, hitPt);
  assert.equal(context.koSlowMo, 1.2);
  assert.ok(context.impactEffects.length >= 30, "K.O. should trigger massive spark burst + rings + flare");
  assert.equal(context.victory.koSlammed, false);

  for (let i = 0; i < 60; i += 1) {
    context.updateVictory(0.03);
  }
  assert.equal(context.victory.koSlammed, true);
  assert.equal(context.koSlowMo, 0);
  assert.equal(announcerStrong.textContent, "K.O. — MOZIONE APPROVATA!");
  assert.equal(announcerClasses.has("show"), true);
  assert.equal(announcerClasses.has("ko-slam"), true);
});
