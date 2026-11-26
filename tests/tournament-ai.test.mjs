import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { difficultyForStage } from "../tournament.js";
import { attackHeight } from "../defense.js";
import { canAICastSpecial } from "../super-meter.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const aiCode = source.slice(source.indexOf("function setAIState("), source.indexOf("function movePlayer("));

function setup(stage, randomValue, overrides = {}) {
  const calls = [];
  const math = Object.create(Math);
  math.random = () => randomValue;
  const opponent = {
    x: 1.5, z: 0, health: 100, airborne: false, landingTime: 0,
    root: { scale: { x: 1 } }, definition: { stats: { speed: 3 } },
    difficulty: difficultyForStage(stage), aiState: "IDLE", aiTimer: 5,
    cooldown: 0, stun: 0, recovery: 0, aiCombo: 0, aiSide: 0, blockTimer: 0, vz: 0,
    superMeter: 100, usedSpecialInRound: false, lastAttackWasSpecial: false,
    ...overrides
  };
  const player = { x: 0, y: 0, z: 0, health: 100, attack: null };
  const context = vm.createContext({
    Math: math, opponent, player, attackHeight, canAICastSpecial,
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    random: (min, max) => (min + max) / 2,
    queueAttack: (_fighter, kind) => calls.push(kind),
    useSpecial: () => calls.push("special")
  });
  vm.runInContext(aiCode, context);
  return { context, opponent, player, calls };
}

test("mid-ladder AI reacts once per attack and blocks with the configured probability", () => {
  const blocked = setup(2, 0.39);
  blocked.player.attack = { high: true, age: 0, windup: 0.1 };
  blocked.context.updateAI(0.04);
  assert.equal(blocked.opponent.blockTimer, 0);
  blocked.context.updateAI(0.04);
  assert.equal(blocked.opponent.blockTimer, 0.45);
  const missed = setup(2, 0.41);
  missed.player.attack = { high: true, age: 0, windup: 0.1 };
  missed.context.updateAI(0.08);
  assert.equal(missed.opponent.blockTimer, 0);
});

test("late AI punishes missed attacks with specials and does not punish connected hits", () => {
  const missed = setup(6, 0);
  missed.player.attack = { high: true, hit: true, connected: false };
  missed.context.updateAI(0.04);
  assert.deepEqual(missed.calls, ["special"]);
  const connected = setup(6, 0);
  connected.player.attack = { high: true, hit: true, connected: true };
  connected.context.updateAI(0.04);
  assert.deepEqual(connected.calls, []);
});

test("stage four AI guards combo pressure and punishes heavy whiffs", () => {
  const guarding = setup(3, 0.6);
  guarding.player.input = { chain: ["u", "u"] };
  guarding.player.attack = { height: "high", age: 0, windup: 0.1 };
  guarding.opponent.aiState = "ATTACK";
  guarding.context.updateAI(0.07);
  assert.equal(guarding.opponent.guardMode, "standing");
  assert.deepEqual(guarding.calls, []);

  const punish = setup(3, 0.5);
  punish.player.attack = { kind: "heavy", height: "mid", hit: true, connected: false };
  punish.context.updateAI(0.07);
  assert.deepEqual(punish.calls, ["punch"]);
  const early = setup(1, 0.5);
  early.player.attack = { kind: "heavy", height: "mid", hit: true, connected: false };
  early.context.updateAI(0.07);
  assert.deepEqual(early.calls, []);
});

test("stunned AI cannot move or start attacks", () => {
  const { context, opponent, calls } = setup(6, 0);
  opponent.stun = 0.6;
  opponent.aiState = "APPROACH";
  context.updateAI(0.1);
  assert.equal(opponent.vx, undefined);
  assert.deepEqual(calls, []);
});

test("AI obeys Super Meter and anti-spam special limits", () => {
  const lowMeter = setup(6, 0, { superMeter: 80 });
  lowMeter.player.attack = { high: true, hit: true, connected: false };
  lowMeter.context.updateAI(0.04);
  assert.deepEqual(lowMeter.calls, ["launcher"]);

  const alreadyUsed = setup(6, 0, { superMeter: 100, usedSpecialInRound: true });
  alreadyUsed.player.attack = { high: true, hit: true, connected: false };
  alreadyUsed.context.updateAI(0.04);
  assert.deepEqual(alreadyUsed.calls, ["launcher"]);
});

test("tactical spacing classifies FAR, MID, STRIKE, DANGER and weaves footsies / sidesteps linear threats", () => {
  const { context, opponent, player } = setup(5, 0.05);
  assert.equal(context.classifyAIRange(4.0, null), "FAR");
  assert.equal(context.classifyAIRange(2.2, null), "MID");
  assert.equal(context.classifyAIRange(1.2, null), "STRIKE");
  assert.equal(context.classifyAIRange(1.6, { age: 0.14, windup: 0.1, duration: 0.4, range: 1.8, connected: false }), "DANGER");

  // MID range transitions into FOOTSIE instead of blindly suicide-rushing
  opponent.x = 2.4;
  opponent.aiState = "IDLE";
  context.updateAI(0.05);
  assert.equal(opponent.aiRange, "MID");
  assert.equal(opponent.aiState, "FOOTSIE");

  // Linear rightPunch / launcher within range triggers 3D sidestep with dodge frames
  opponent.x = 2.0;
  opponent.aiState = "FOOTSIE";
  player.attack = { kind: "punch", limb: "rightPunch", age: 0.01, windup: 0.12, duration: 0.36 };
  context.updateAI(0.04);
  assert.equal(opponent.aiState, "SIDESTEP");
  assert.ok(opponent.dodgeTimer > 0);
  assert.notEqual(opponent.vz, 0);
});

test("AI uses crouch guard against low kicks, holds guard through 3-hit strings, and dashes to whiff-punish", () => {
  // Low kick -> Crouch Guard ("low")
  const lowGuard = setup(7, 0.2);
  lowGuard.player.attack = { kind: "kick", limb: "leftKick", low: true, height: "low", age: 0, windup: 0.12 };
  lowGuard.context.updateAI(0.03);
  assert.equal(lowGuard.opponent.guardMode, "low");

  // High/Mid combo string -> holds standing guard while P1 swings, then counter-punishes on recovery
  const stringDef = setup(7, 0.2);
  stringDef.player.input = { chain: ["u", "u"] };
  stringDef.player.attack = { kind: "punch", height: "high", age: 0.05, windup: 0.1 };
  stringDef.context.updateAI(0.03);
  assert.equal(stringDef.opponent.guardMode, "standing");
  assert.deepEqual(stringDef.calls, []);
  stringDef.player.attack = null;
  stringDef.player.input.chain = [];
  stringDef.context.updateAI(0.03);
  assert.ok(stringDef.calls.length >= 1, "AI should immediately counter-punish once P1 combo finishes");

  // Whiff punish on progress > 0.55 dashes forward from mid range and queues punish
  const whiff = setup(5, 0.9, { x: 2.1, vx: 0 });
  whiff.player.attack = { kind: "heavy", height: "mid", age: 0.26, duration: 0.4, windup: 0.14, connected: false };
  whiff.context.updateAI(0.03);
  assert.ok(whiff.opponent.vx < 0, "AI should dash forward toward P1 at x=0 to whiff punish");
  assert.ok(whiff.calls.length >= 1);
});

test("AI executes full dial-a-combo queues, 2-hit air juggles, and avoids wasting Super Meter at FAR range", () => {
  // Full dial-a-combo queue chains step by step without waiting for idle reset
  const comboAI = setup(7, 0.1, { x: 1.4, aiState: "ATTACK", aiQueue: ["u", "u2", "u-u-i"] });
  comboAI.context.updateAI(0.02);
  assert.deepEqual(comboAI.calls, ["punch"]);
  comboAI.opponent.attack = { kind: "punch", age: 0.2, windup: 0.08, duration: 0.33, connected: true };
  comboAI.context.updateAI(0.02);
  assert.deepEqual(comboAI.calls, ["punch", "punch"]);
  comboAI.opponent.attack = { kind: "punch", age: 0.2, windup: 0.08, duration: 0.33, connected: true };
  comboAI.context.updateAI(0.02);
  assert.deepEqual(comboAI.calls, ["punch", "punch", "combo-finisher"]);

  // Never wastes Signature Special blindly from FAR distance (> 3.2 units)
  const farAI = setup(7, 0.0, { x: 4.5, aiState: "ATTACK", superMeter: 100 });
  farAI.context.updateAI(0.02);
  assert.equal(farAI.calls.includes("special"), false);

  // Uses Signature Special as a close-range round closer when P1 health <= 32
  const closerAI = setup(7, 0.0, { x: 1.5, aiState: "ATTACK", superMeter: 100 });
  closerAI.player.health = 24;
  closerAI.context.updateAI(0.02);
  assert.deepEqual(closerAI.calls, ["special"]);

  // Air-juggle conversion triggers 2 follow-up kicks when P1 is launched into the air
  const juggler = setup(7, 0.9, { x: 1.5 });
  juggler.player.y = 0.9;
  juggler.context.updateAI(0.02);
  juggler.opponent.attack = { kind: "kick", age: 0.2, windup: 0.08, duration: 0.36, connected: true };
  juggler.context.updateAI(0.02);
  assert.deepEqual(juggler.calls, ["kick", "kick"]);
});
