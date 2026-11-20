import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../vendor/three/three.module.min.js";
import * as combo from "../combo.js";
import * as defense from "../defense.js";
import { InputState, keyboardActions } from "../input.js";
import { fighters } from "../fighters.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const combatCode = source.slice(source.indexOf("function attackDefinition("), source.indexOf("function finishMatch("));
const updateCode = source.slice(source.indexOf("function updateCombatant("), source.indexOf("function updateBallots("));
const movementCode = source.slice(source.indexOf("function movePlayer("), source.indexOf("function spawnSidestepGhost("));
const projectileCode = source.slice(source.indexOf("function checkSingleProjectile("), source.indexOf("function updateParticles("));

function setup() {
  const badge = () => ({ textContent: "", classList: { add() {}, remove() {} } });
  const badges = { "#player-combo": badge(), "#cpu-combo": badge() };
  const fighter = (isPlayer) => ({
    definition: fighters[0], input: combo.createComboInput(), isPlayer,
    health: 100, x: isPlayer ? 0 : 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    facing: isPlayer ? 1 : -1, attack: null, cooldown: 0, stun: 0, airborne: false,
    landingTime: 0, dodgeTimer: 0, blocking: false, blockTimer: 0,
    guardMode: null, parryTimer: 0, parryRecovery: 0, parryPose: 0, risingTimer: 0,
    reactionTime: 0, animationTime: 0, airRotation: 0,
    root: { position: { x: 0, set() {} }, scale: { x: 1 }, getObjectByName() { return null; } }
  });
  const player = fighter(true);
  const opponent = fighter(false);
  const inputState = new InputState();
  const keys = {
    add(key) { inputState.set(keyboardActions[key], `keyboard:${key}`, true); },
    delete(key) { inputState.set(keyboardActions[key], `keyboard:${key}`, false); }
  };
  const context = vm.createContext({
    THREE, ...combo, ...defense, player, opponent, matchActive: true, isPaused: false, hitStop: 0, shake: 0, cameraTilt: 0,
    keys, inputState, keyboardActions, lastTap: { up: 0, down: 0 }, performance,
    document: { querySelector: (selector) => badges[selector] },
    sound: { swing() {}, impact() {} }, announceSpecial() {}, spawnBurst() {},
    spawnBallot() {}, spawnCallout() {}, spawnImpact() {}, updateHealthDisplay() {}, finishMatch() {},
    contactPoint: () => new THREE.Vector3(),
    clamp: THREE.MathUtils.clamp, poseFighter() {}, spawnSidestepGhost() {},
    comicWords: ["TEST"], Math
  });
  vm.runInContext(combatCode + updateCode + movementCode + projectileCode +
    source.slice(source.indexOf("function setInput("), source.indexOf("function pollGamepads(")), context);
  const tick = (dt) => {
    combo.advanceInputClock(player.input, dt);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (player.attack) {
      player.attack.age += dt;
      if (player.attack.age > player.attack.duration) {
        player.attack = null;
        combo.endComboAttack(player.input);
      }
    }
    context.consumeBufferedAttack(player);
  };
  return { context, player, opponent, badges, tick };
}

test("buffer accepts 300 ms and expires older inputs independently", () => {
  const state = combo.createComboInput();
  combo.bufferInput(state, "u");
  combo.advanceInputClock(state, 0.3);
  assert.equal(state.queue.length, 1);
  combo.bufferInput(state, "i");
  combo.advanceInputClock(state, 0.001);
  assert.deepEqual(state.queue.map((entry) => entry.key), ["i"]);
  combo.clearComboInput(state);
  assert.equal(state.queue.length, 0);
});

test("buffered strings resolve to correct finishers without frame-perfect presses", () => {
  const cases = [
    { inputs: ["u", "u", "i"], move: "straight", kind: "combo-finisher" },
    { inputs: ["u", "i", "k"], move: "roundhouse", kind: "kick" },
    { inputs: ["j", "k", "k"], move: "heel", kind: "kick" },
    { inputs: ["u", "u", "launcher"], kind: "launcher" },
    { inputs: ["i", "i", "l"], kind: "rush" }
  ];
  for (const entry of cases) {
    const { context, player, tick } = setup();
    context.playerAttack(entry.inputs[0]);
    tick(0.12);
    context.playerAttack(entry.inputs[1]);
    tick(0.07);
    if (entry.inputs[0] === "u" && entry.inputs[1] === "u") assert.equal(player.attack.limb, "rightPunch");
    tick(0.05);
    if (entry.inputs[2] === "launcher") context.keys.add("s");
    context.playerAttack(entry.inputs[2] === "launcher" ? "i" : entry.inputs[2]);
    tick(0.14);
    assert.equal(player.attack.kind, entry.kind, entry.inputs.join(" "));
    if (entry.move) {
      assert.equal(player.attack.comboMove, entry.move);
      assert.equal(player.attack.knockdown, true);
    }
    if (entry.kind === "launcher") assert.equal(player.attack.launch, true);
    if (entry.inputs[2] === "l") assert.equal(player.attack.special, true);
  }
});

test("touch and gamepad attacks use the same combo buffer and launcher as keyboard", () => {
  const { context, player, tick } = setup();
  for (const [action, source] of [["punchL", "touch:1"], ["punchL", "gamepad:0:punchL"], ["punchR", "touch:2"]]) {
    context.setInput(action, source, true);
    context.setInput(action, source, false);
    tick(0.16);
  }
  assert.equal(player.attack.comboMove, "straight");

  const launcher = setup();
  launcher.context.setInput("launcher", "touch:9", true);
  assert.equal(launcher.player.attack.kind, "launcher");
  assert.equal(launcher.player.attack.launch, true);
});

test("rapid inputs drain in order and interruption discards queued follow-ups", () => {
  const { context, player, opponent, tick } = setup();
  context.playerAttack("u");
  context.playerAttack("u");
  context.playerAttack("i");
  for (let i = 0; i < 17; i += 1) tick(1 / 60);
  assert.equal(player.attack.comboMove, "straight");
  context.bufferInput(player.input, "k");
  opponent.attack = { kind: "punch", limb: "leftPunch", high: true, damage: 5, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(opponent, player);
  assert.equal(player.attack, null);
  assert.equal(player.input.queue.length, 0);
  assert.equal(player.input.chain.length, 0);
});

test("launcher and four air hits count real damage and cap gravity assistance", () => {
  const { context, player, opponent, badges } = setup();
  context.queueAttack(player, "launcher", { damage: 10, range: 1.38, windup: 0.17, duration: 0.42, launch: true, limb: "rightPunch" });
  player.attack.age = 0.2;
  context.tryHit(player, opponent);
  assert.equal(opponent.airborne, true);
  assert.equal(opponent.juggle.hits, 0);
  opponent.y = 0.8;
  for (let i = 0; i < 5; i += 1) {
    opponent.vy = -2;
    player.attack = { kind: "punch", limb: "leftPunch", damage: 6, range: 2, age: 0.1, windup: 0.08, hit: false };
    context.tryHit(player, opponent);
    assert.equal(opponent.juggle.hits, Math.min(i + 1, 4));
    assert.equal(opponent.vy, i < 4 ? 1.6 : -2);
  }
  assert.equal(opponent.hitCombo.hits, 6);
  assert.equal(opponent.hitCombo.damage, 40);
  assert.equal(badges["#player-combo"].textContent, "6 HIT COMBO! 40 DAMAGE!");
});

test("blocking does not increase a combo and knockdown cannot relaunch an airborne target", () => {
  const { context, player, opponent } = setup();
  opponent.blocking = true;
  player.attack = { kind: "punch", limb: "rightPunch", high: true, damage: 10, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(player, opponent);
  assert.equal(opponent.hitCombo, undefined);
  opponent.blocking = false;
  opponent.airborne = true;
  opponent.juggle = { hits: 4 };
  opponent.y = 1;
  opponent.vy = -3;
  player.attack = { kind: "combo-finisher", limb: "rightPunch", knockdown: true, damage: 10, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(player, opponent);
  assert.equal(opponent.vy, -3);
});

test("launcher can reach four successive buffered air hits and resets on recovery", () => {
  const { context, player, opponent, badges } = setup();
  player.x = -0.3;
  opponent.x = 0.3;
  context.keys.add("s");
  context.playerAttack("i");
  context.keys.delete("s");
  const keys = ["u", "i", "j", "k"];
  let maxHits = 0;
  let fiveHitLabel = "";
  for (let frame = 0; frame < 240; frame += 1) {
    if ([13, 30, 47, 64].includes(frame)) context.playerAttack(keys.shift());
    context.updateCombatant(player, 1 / 120, opponent);
    context.updateCombatant(opponent, 1 / 120, player);
    maxHits = Math.max(maxHits, opponent.juggle?.hits || 0);
    if (opponent.hitCombo?.hits === 5) fiveHitLabel = badges["#player-combo"].textContent;
  }
  assert.equal(maxHits, 4);
  assert.match(fiveHitLabel, /^5 HIT COMBO! \d+ DAMAGE!$/);
  assert.equal(opponent.airborne, false);
  assert.equal(opponent.hitCombo, null);
});

test("neutral and facing-relative guard block correct heights and crouching ducks jabs", () => {
  for (const facing of [1, -1]) {
    const { context, player, opponent } = setup();
    player.x = 0;
    opponent.x = facing;
    context.movePlayer(0.01);
    assert.equal(player.guardMode, "standing");
    const strike = (height, extra = {}) => {
      opponent.attack = { kind: "punch", limb: "leftPunch", height, damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false, ...extra };
      context.tryHit(opponent, player);
    };
    strike("mid", { launch: true });
    assert.equal(player.health, 97);
    assert.equal(player.airborne, false);
    player.stun = 0;
    context.keys.add(facing === 1 ? "a" : "d");
    context.keys.add("s");
    context.movePlayer(0.01);
    assert.equal(player.guardMode, "low");
    strike("high");
    assert.equal(player.health, 97);
    strike("low");
    assert.equal(player.health, 94);
    player.stun = 0;
    strike("mid");
    assert.equal(player.health, 74);
    assert.equal(player.guardMode, null);
  }
});

test("forward parry window interrupts attacks for 0.6s but expires and preserves buffered strings", () => {
  for (const facing of [1, -1]) {
    const { context, player, opponent } = setup();
    player.facing = facing;
    opponent.facing = -facing;
    context.keys.add(facing === 1 ? "d" : "a");
    context.playerAttack("u");
    assert.equal(player.attack, null);
    assert.equal(player.parryTimer, 0.15);
    context.updateCombatant(player, 0.149, opponent);
    opponent.attack = { kind: "punch", height: "mid", damage: 10, range: 2, age: 0.1, windup: 0.08, hit: false };
    context.tryHit(opponent, player);
    assert.equal(player.health, 100);
    assert.equal(opponent.attack, null);
    assert.equal(opponent.stun, 0.6);
  }
  const { context, player, opponent } = setup();
  context.keys.add("d");
  context.playerAttack("u");
  context.updateCombatant(player, 0.151, opponent);
  opponent.attack = { kind: "punch", height: "mid", damage: 10, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(opponent, player);
  assert.equal(player.health, 90);
  const comboCase = setup();
  comboCase.context.playerAttack("u");
  comboCase.context.keys.add("d");
  comboCase.context.playerAttack("u");
  assert.equal(comboCase.player.input.queue.length, 1);
});

test("gamepad parry shortcut uses the same timed parry without moving forward", () => {
  const { context, player, opponent } = setup();
  context.setInput("parry", "gamepad:0:parry", true);
  assert.equal(player.parryTimer, 0.15);
  assert.equal(context.inputState.has("right"), false);
  opponent.attack = { kind: "punch", height: "mid", damage: 10, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(opponent, player);
  assert.equal(player.health, 100);
  assert.equal(opponent.stun, 0.6);
});

test("releasing low guard permits a rising launcher without breaking S+I", () => {
  const { context, player } = setup();
  context.keys.add("a");
  context.keys.add("s");
  context.movePlayer(0.01);
  const listeners = {};
  context.window = { addEventListener: (type, callback) => { listeners[type] = callback; } };
  const keyup = source.slice(source.indexOf('window.addEventListener("keyup"'), source.indexOf('window.addEventListener("blur"'));
  vm.runInContext(keyup, context);
  listeners.keyup({ key: "s" });
  assert.equal(player.risingTimer, 0.25);
  context.playerAttack("i");
  assert.equal(player.attack.kind, "launcher");
  assert.equal(player.risingTimer, 0);
});

test("counter-hits amplify startup damage and launch knockdowns, but not blocks or recovery", () => {
  const { context, player, opponent } = setup();
  opponent.attack = { age: 0.05, windup: 0.2, hit: false };
  player.attack = { kind: "combo-finisher", height: "mid", damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false, knockdown: true };
  context.tryHit(player, opponent);
  assert.equal(opponent.health, 73);
  assert.equal(opponent.vy, 5.1);
  assert.equal(context.hitStop, 0.1);
  const block = setup();
  block.opponent.guardMode = "standing";
  block.opponent.attack = { age: 0.05, windup: 0.2, hit: false };
  block.player.attack = { height: "mid", damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false, knockdown: true };
  block.context.tryHit(block.player, block.opponent);
  assert.equal(block.opponent.health, 97);
  assert.equal(block.opponent.airborne, false);
  assert.equal(block.context.hitStop, 0.06);
  const recovery = setup();
  recovery.opponent.attack = { age: 0.2, windup: 0.2, hit: true };
  recovery.player.attack = { height: "mid", damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false };
  recovery.context.tryHit(recovery.player, recovery.opponent);
  assert.equal(recovery.opponent.health, 80);
});

test("sidestep iframes exclude specials and projectiles; projectile guards and unblockables resolve normally", () => {
  const { context, player, opponent } = setup();
  opponent.dodgeTimer = 0.2;
  player.attack = { height: "mid", damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false };
  context.tryHit(player, opponent);
  assert.equal(opponent.health, 100);
  player.attack = { height: "mid", damage: 20, range: 2, age: 0.1, windup: 0.08, hit: false, special: true };
  context.tryHit(player, opponent);
  assert.equal(opponent.health, 80);
  opponent.guardMode = "standing";
  const projectile = (unblockable) => ({
    owner: player, projectile: true, height: "mid", damage: 20, vx: 7, life: 1, unblockable,
    mesh: { position: new THREE.Vector3(opponent.x, 1.1, opponent.z) }
  });
  context.checkSingleProjectile(projectile(false));
  assert.equal(opponent.health, 77);
  context.checkSingleProjectile(projectile(true));
  assert.equal(opponent.health, 57);
});
