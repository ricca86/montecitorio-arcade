export const INPUT_WINDOW = 0.3;

const strings = [
  ["u", "u", "i"],
  ["u", "i", "k"],
  ["j", "k", "k"],
  ["u", "u", "launcher"],
  ["i", "i", "l"]
];

export function createComboInput() {
  return { queue: [], chain: [], clock: 0, expires: 0 };
}

export function bufferInput(state, key) {
  if (!["u", "i", "j", "k", "launcher", "l"].includes(key)) return;
  if (state.queue.length >= 4) return;
  state.queue.push({ key, time: state.clock });
}

export function advanceInputClock(state, dt) {
  state.clock += dt;
  while (state.queue.length && state.clock - state.queue[0].time > INPUT_WINDOW + 1e-9) state.queue.shift();
  if (state.expires && state.clock > state.expires) {
    state.chain = [];
    state.expires = 0;
  }
}

export function resolveComboInput(state, key) {
  const sequence = [...state.chain, key];
  const matched = strings.find((entry) => sequence.every((value, i) => entry[i] === value));
  state.chain = matched ? sequence : (strings.some((entry) => entry[0] === key) ? [key] : []);
  state.expires = 0;
  const code = matched && sequence.length === matched.length ? sequence.join("-") : null;
  if (code) state.chain = [];
  return {
    code,
    cross: sequence.length === 2 && sequence[0] === "u" && key === "u",
    snap: sequence.length === 2 && sequence[0] === "j" && key === "k",
    heavy: sequence.length === 2 && sequence[0] === "i" && key === "i"
  };
}

export function endComboAttack(state) {
  if (state.chain.length) state.expires = state.clock + INPUT_WINDOW;
}

export function clearComboInput(state) {
  state.queue.length = 0;
  state.chain = [];
  state.expires = 0;
}
