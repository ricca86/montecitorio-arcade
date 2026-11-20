import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { InputState, gamepadActions } from "../input.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const inputCode = source.slice(source.indexOf("function sidestep("), source.indexOf('window.addEventListener("keydown"'));

test("input state tracks simultaneous sources independently and emits single transitions", () => {
  const state = new InputState();
  assert.equal(state.set("left", "keyboard:a", true).pressed, true);
  assert.equal(state.set("left", "touch:1", true).pressed, false);
  assert.equal(state.set("left", "keyboard:a", false).released, false);
  assert.equal(state.has("left"), true);
  assert.equal(state.set("left", "touch:1", false).released, true);
  assert.equal(state.has("left"), false);
});

test("touch actions combine held directions, attacks, macros and direct sidesteps", () => {
  const calls = [];
  const player = { stun: 0, airborne: false, landingTime: 0, attack: null, guardMode: "low" };
  const state = new InputState();
  const context = vm.createContext({
    inputState: state, player, matchActive: true, isPaused: false,
    lastTap: { up: 0, down: 0 }, performance: { now: () => 1000 },
    playerAttack: (key) => calls.push(key), setPaused: (paused) => calls.push(paused)
  });
  vm.runInContext(inputCode, context);
  context.setInput("left", "touch:1", true, true);
  context.setInput("down", "touch:2", true, true);
  assert.equal(state.has("left"), true);
  assert.equal(state.has("down"), true);
  assert.equal(player.vz, 5.2);
  assert.equal(player.dodgeTimer, 0.36);
  context.setInput("punchR", "touch:3", true, true);
  context.setInput("launcher", "touch:4", true, true);
  assert.deepEqual(calls, ["i", "launcher"]);
  context.setInput("down", "touch:2", false);
  assert.equal(player.risingTimer, 0.25);
  assert.equal(state.has("left"), true);
  context.setInput("up", "touch:5", true, true);
  assert.equal(player.vz, -5.2);
});

test("standard gamepads map physical positions, release on disconnect, and do not repeat held buttons", () => {
  const calls = [];
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  buttons[2].pressed = true;
  buttons[5].pressed = true;
  const pad = { index: 0, mapping: "standard", axes: [-0.8, 0], buttons };
  const state = new InputState();
  const context = vm.createContext({
    inputState: state, player: { stun: 0, airborne: false, landingTime: 0, attack: null },
    matchActive: true, isPaused: false, lastTap: { up: 0, down: 0 },
    performance: { now: () => 1000 }, gamepadActions, gamepadPrevious: new Map(),
    navigator: { getGamepads: () => [pad] }, playerAttack: (key) => calls.push(key), setPaused() {}
  });
  vm.runInContext(inputCode, context);
  context.pollGamepads();
  context.pollGamepads();
  assert.equal(state.has("left"), true);
  assert.deepEqual(calls, ["u", "launcher"]);
  context.navigator.getGamepads = () => [];
  context.pollGamepads();
  assert.equal(state.has("left"), false);
  assert.equal(state.has("punchL"), false);
});

test("controller uses the 0.25 deadzone and requested PlayStation button layout", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { buttons, axes: [0.25, -0.25] };
  let actions = gamepadActions(pad);
  assert.equal(actions.right, false);
  assert.equal(actions.up, false);
  pad.axes = [0.251, -0.251];
  actions = gamepadActions(pad);
  assert.equal(actions.right, true);
  assert.equal(actions.up, true);
  for (const [index, action] of [[0, "kickL"], [1, "kickR"], [2, "punchL"], [3, "punchR"],
    [4, "parry"], [5, "launcher"], [7, "special"], [9, "pause"], [12, "up"], [13, "down"], [14, "left"], [15, "right"]]) {
    pad.axes = [0, 0];
    buttons[index].pressed = true;
    actions = gamepadActions(pad);
    assert.equal(actions[action], true, `button ${index}`);
    buttons[index].pressed = false;
  }
});

test("gamepad navigates selection, ladder, and pause menus without attacking", () => {
  const calls = [];
  const screen = (hidden) => ({ classList: { contains: () => hidden } });
  const nodes = {};
  const context = vm.createContext({
    matchActive: false, isPaused: false, selectScreen: screen(false),
    ladderScreen: screen(true), continueScreen: screen(true), resultScreen: screen(true),
    document: { activeElement: null, querySelector: (selector) => nodes[selector] },
    navigateRoster: (key) => calls.push(key),
    beginMatch: () => calls.push("begin"),
    inputState: new InputState(), gamepadPrevious: new Map(), gamepadActions,
    performance: { now: () => 1000 },
    navigator: { getGamepads: () => [] }
  });
  const button = (name) => ({
    focus() { context.document.activeElement = this; },
    click() { calls.push(name); }
  });
  nodes["#next-stage-button"] = button("fight");
  nodes["#change-fighter-button"] = button("change");
  const resume = button("resume");
  const restart = button("restart");
  const quit = button("quit");
  context.pauseScreen = { querySelectorAll: () => [resume, restart, quit] };
  vm.runInContext(inputCode, context);
  context.handleGamepadMenu("right");
  context.handleGamepadMenu("pause");
  assert.deepEqual(calls, ["ArrowRight", "begin"]);
  context.selectScreen = screen(true);
  context.ladderScreen = screen(false);
  context.document.activeElement = nodes["#next-stage-button"];
  context.handleGamepadMenu("down");
  context.handleGamepadMenu("kickL");
  assert.equal(calls.at(-1), "change");
  context.isPaused = true;
  context.document.activeElement = resume;
  context.handleGamepadMenu("down");
  context.handleGamepadMenu("kickL");
  assert.equal(calls.at(-1), "restart");
});
