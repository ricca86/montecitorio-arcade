import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { difficultyForStage } from "../tournament.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const aiCode = source.slice(source.indexOf("function setAIState("), source.indexOf("function movePlayer("));

function setup(stage, randomValue) {
  const calls = [];
  const math = Object.create(Math);
  math.random = () => randomValue;
  const opponent = {
    x: 1.5, z: 0, health: 100, airborne: false, landingTime: 0,
    root: { scale: { x: 1 } }, definition: { stats: { speed: 3 } },
    difficulty: difficultyForStage(stage), aiState: "IDLE", aiTimer: 5,
    cooldown: 0, stun: 0, aiCombo: 0, aiSide: 0, blockTimer: 0, vz: 0
  };
  const player = { x: 0, y: 0, z: 0, health: 100, attack: null };
  const context = vm.createContext({
    Math: math, opponent, player, clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
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
