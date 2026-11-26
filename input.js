export const keyboardActions = {
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
  w: "up", arrowup: "up", s: "down", arrowdown: "down", shift: "guard",
  u: "punchL", i: "punchR", j: "kickL", k: "kickR", l: "special",
  escape: "pause", p: "pause"
};

// Disjoint split keyboard layout for 2P Local Versus on a single keyboard:
// P1 (Left side): A/D walk, W/S sidestep/crouch, F/G/C/V limbs, R special, T or S+G launcher
export const p1VersusKeyboardActions = {
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  shiftleft: "guard",
  f: "punchL",
  g: "punchR",
  c: "kickL",
  v: "kickR",
  r: "special",
  t: "launcher"
};

// P2 (Right side + Numpad): Arrows walk/sidestep/crouch, J/K/N/M (or Numpad 4/5/1/2) limbs,
// L/Numpad6 special, O or ArrowDown+K launcher
export const p2VersusKeyboardActions = {
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  shiftright: "guard",
  "/": "guard",
  j: "punchL",
  numpad4: "punchL",
  k: "punchR",
  numpad5: "punchR",
  n: "kickL",
  numpad1: "kickL",
  m: "kickR",
  numpad2: "kickR",
  l: "special",
  numpad6: "special",
  o: "launcher",
  numpad3: "launcher",
  numpad0: "launcher"
};

export const p2KeyboardActions = p2VersusKeyboardActions;

export class InputState {
  constructor() {
    this.sources = new Map();
  }

  has(action) {
    return (this.sources.get(action)?.size || 0) > 0;
  }

  set(action, source, pressed) {
    const wasDown = this.has(action);
    if (pressed) {
      if (!this.sources.has(action)) this.sources.set(action, new Set());
      this.sources.get(action).add(source);
    } else {
      this.sources.get(action)?.delete(source);
      if (!this.has(action)) this.sources.delete(action);
    }
    return { pressed: !wasDown && this.has(action), released: wasDown && !this.has(action) };
  }

  clear() {
    this.sources.clear();
  }
}

export function gamepadActions(gamepad) {
  const button = (index) => Boolean(gamepad.buttons[index]?.pressed);
  const x = gamepad.axes[0] || 0;
  const y = gamepad.axes[1] || 0;
  return {
    left: button(14) || x < -0.25,
    right: button(15) || x > 0.25,
    up: button(12) || y < -0.25,
    down: button(13) || y > 0.25,
    punchL: button(2), punchR: button(3), kickL: button(0), kickR: button(1),
    parry: button(4), launcher: button(5), special: button(7), pause: button(9)
  };
}

/**
 * Unified 2-player input coordinator owning `p1Input` and `p2Input`,
 * automatic single/dual gamepad slot routing, and 1P vs 2P split keyboard bindings.
 */
export class InputManager {
  constructor({ mode = "arcade", singlePadSlot = 2 } = {}) {
    this.p1Input = new InputState();
    this.p2Input = new InputState();
    this.mode = mode === "versus" ? "versus" : "arcade";
    this.singlePadSlot = singlePadSlot === 1 ? 1 : 2;
  }

  setMode(mode) {
    this.mode = mode === "versus" ? "versus" : "arcade";
    this.clear();
  }

  setSinglePadSlot(slot) {
    this.singlePadSlot = slot === 1 ? 1 : 2;
  }

  clear() {
    this.p1Input.clear();
    this.p2Input.clear();
  }

  getSlotState(slot) {
    return slot === 2 ? this.p2Input : this.p1Input;
  }

  /**
   * Resolve a connected standard gamepad's target player slot (1 or 2).
   * - Arcade mode: all standard pads drive P1 (slot 1).
   * - Versus mode with 2+ pads: first pad -> P1 (slot 1), second+ pad -> P2 (slot 2).
   * - Versus mode with 1 pad: single pad drives P2 (slot 2) by default (configurable via singlePadSlot)
   *   so Player 1 can stay on keyboard while Player 2 uses the controller.
   */
  resolveGamepadSlot(padIndex, connectedPadCount = 1) {
    if (this.mode !== "versus") return 1;
    if (connectedPadCount >= 2) {
      return padIndex === 0 ? 1 : 2;
    }
    return this.singlePadSlot;
  }

  /**
   * Resolve a keyboard event (`key` / `code`) to `{ slot, action, token }` without P1/P2 conflicts.
   */
  resolveKeyboardEvent(event) {
    const code = event.code ? event.code.toLowerCase() : "";
    const key = event.key ? event.key.toLowerCase() : "";
    if (this.mode !== "versus") {
      const action = keyboardActions[key] || null;
      return action ? { slot: 1, action, token: key } : null;
    }
    if (p2VersusKeyboardActions[code]) {
      return { slot: 2, action: p2VersusKeyboardActions[code], token: code };
    }
    if (p2VersusKeyboardActions[key]) {
      return { slot: 2, action: p2VersusKeyboardActions[key], token: key };
    }
    if (p1VersusKeyboardActions[code]) {
      return { slot: 1, action: p1VersusKeyboardActions[code], token: code };
    }
    if (p1VersusKeyboardActions[key]) {
      return { slot: 1, action: p1VersusKeyboardActions[key], token: key };
    }
    return null;
  }
}
