import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { fighters } from "../fighters.js";
import { TournamentManager } from "../tournament.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function node() {
  const classes = new Set();
  return {
    children: [], textContent: "", className: "",
    classList: { add: (value) => classes.add(value), remove: (value) => classes.delete(value) },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    setAttribute() {},
    focus() { this.focused = true; }
  };
}

test("ladder reveals only completed and current stages, top to bottom, and schedules one start", () => {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, node());
    return elements.get(selector);
  };
  const tournament = new TournamentManager("meloni");
  tournament.currentStage = 3;
  const scheduled = [];
  const canceled = [];
  const context = vm.createContext({
    tournament, ladderScreen: node(), continueScreen: node(), matchActive: true, victory: {},
    ladderTimeout: 7, fightersById: new Map(fighters.map((fighter) => [fighter.id, fighter])),
    document: { querySelector: get, createElement: node },
    setStageMood() {}, drawLadderPortrait() {}, startRound() {},
    clearTimeout(id) { canceled.push(id); },
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return 8; }
  });
  vm.runInContext(section("function showLadder(", "function clearProjectiles("), context);
  context.showLadder();
  const rows = get("#ladder-list").children;
  const label = (row) => row.children[1].textContent;
  assert.equal(rows.length, 8);
  assert.match(label(rows[0]), /^FINAL BOSS: PALAZZO CHIGI · \?\?\?$/);
  assert.match(label(rows[7]), /^STAGE 1 · /);
  assert.equal(rows.filter((row) => row.className === "locked").length, 4);
  assert.equal(rows.filter((row) => row.className === "completed").length, 3);
  assert.ok(rows.filter((row) => row.className === "locked").every((row) => label(row).endsWith("???")));
  assert.equal(rows[4].className, "current");
  assert.equal(rows[7].children[2].textContent, "ELETTO / DEFEATED");
  assert.equal(get("#ladder-opponent-name").textContent, fighters.find((fighter) => fighter.id === tournament.opponentId).name);
  assert.deepEqual(canceled, [7]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 3000);
});

test("stage mood transitions at stages four and seven", () => {
  const color = () => ({ set(value) { this.value = value; } });
  const scene = { background: color(), fog: { color: color() } };
  const ambientLight = { color: color(), groundColor: color() };
  const keyLight = { color: color() };
  const rimLight = { color: color() };
  const context = vm.createContext({ scene, ambientLight, keyLight, rimLight });
  vm.runInContext(section("function setStageMood(", "function drawLadderPortrait("), context);
  const keys = [];
  for (const stage of [0, 2, 3, 5, 6, 7]) {
    context.setStageMood(stage);
    keys.push(keyLight.color.value);
    assert.equal(scene.background.value, scene.fog.color.value);
  }
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[2], keys[3]);
  assert.equal(keys[4], keys[5]);
  assert.notEqual(keys[1], keys[2]);
  assert.notEqual(keys[3], keys[4]);
});
