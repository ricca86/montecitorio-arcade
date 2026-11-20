export const keyboardActions = {
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
  w: "up", arrowup: "up", s: "down", arrowdown: "down", shift: "guard",
  u: "punchL", i: "punchR", j: "kickL", k: "kickR", l: "special",
  escape: "pause", p: "pause"
};

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
