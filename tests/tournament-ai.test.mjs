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
