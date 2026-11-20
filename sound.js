let context = null;
let master = null;
let noiseBuffer = null;
let resumePending = false;
let musicEnabled = false;
let matchActive = false;
let musicTimer = null;
let musicBus = null;
let nextNote = 0;
let noteIndex = 0;

const bassPattern = [55, 55, 82.41, 55, 65.41, 55, 98, 82.41, 55, 55, 82.41, 110, 98, 82.41, 65.41, 73.42];
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

function unlock() {
  if (!AudioContextClass) return false;
  if (!context) {
    try {
      const audioContext = new AudioContextClass();
      const output = audioContext.createGain();
      output.gain.value = 0.32;
      output.connect(audioContext.destination);
      context = audioContext;
      master = output;
      syncMusic();
    } catch (error) {
      console.error("Could not initialize game audio:", error);
      return false;
    }
  }
  if (context.state !== "running" && context.state !== "closed" && !resumePending) {
    resumePending = true;
    context.resume().catch((error) => {
      console.error("Could not resume game audio:", error);
    }).finally(() => {
      resumePending = false;
    });
  }
  return true;
}

function tone(frequency, endFrequency, duration, volume, type = "sine", start = context.currentTime, destination = master) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function noise(duration, volume, frequency, filterType = "highpass") {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(now);
  source.stop(now + duration);
}

function select() {
  if (!context) return;
  tone(720, 880, 0.065, 0.2, "square");
}

function confirm() {
  if (!context) return;
  const now = context.currentTime;
  tone(523.25, 523.25, 0.12, 0.18, "square", now);
  tone(783.99, 783.99, 0.18, 0.16, "square", now + 0.09);
  tone(1046.5, 1046.5, 0.24, 0.12, "triangle", now + 0.18);
}

function swing(kick = false) {
  if (!context) return;
  noise(kick ? 0.19 : 0.12, kick ? 0.13 : 0.1, kick ? 950 : 1400);
  tone(kick ? 160 : 210, 65, 0.1, 0.16, "triangle");
}

function crash() {
  tone(115, 32, 0.48, 0.8);
  tone(230, 65, 0.2, 0.28, "triangle");
  noise(0.36, 0.3, 1700);
  tone(1270, 530, 0.14, 0.1, "square");
}

function impact({ blocked = false, launch = false } = {}) {
  if (!context) return;
  if (launch && !blocked) {
    crash();
  } else if (blocked) {
    tone(1250, 980, 0.16, 0.2, "square");
    tone(1820, 1380, 0.12, 0.1, "triangle");
    noise(0.12, 0.24, 2400);
  } else {
    tone(140, 48, 0.16, 0.46, "triangle");
    noise(0.09, 0.17, 800);
  }
}

function knockout() {
  if (context) crash();
}

function scheduleMusic() {
  const now = context.currentTime;
  if (nextNote < now) nextNote = now;
  while (nextNote < now + 0.15) {
    const frequency = bassPattern[noteIndex % bassPattern.length];
    tone(frequency, frequency * 0.96, 0.16, 0.19, "sawtooth", nextNote, musicBus);
    if (noteIndex % 4 === 0) tone(90, 43, 0.12, 0.23, "sine", nextNote, musicBus);
    noteIndex += 1;
    nextNote += 0.18;
  }
}

function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  if (musicBus) {
    const bus = musicBus;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.025);
    setTimeout(() => bus.disconnect(), 200);
    musicBus = null;
  }
}

function syncMusic() {
  if (!context || !musicEnabled || !matchActive) {
    stopMusic();
    return;
  }
  if (musicTimer !== null) return;
  musicBus = context.createGain();
  musicBus.gain.value = 0.38;
  musicBus.connect(master);
  nextNote = context.currentTime;
  noteIndex = 0;
  scheduleMusic();
  musicTimer = setInterval(scheduleMusic, 100);
}

export const sound = {
  available: Boolean(AudioContextClass),
  unlock,
  select,
  confirm,
  swing,
  impact,
  knockout,
  setMusicEnabled(enabled) {
    musicEnabled = enabled;
    syncMusic();
  },
  startMatch() {
    matchActive = true;
    syncMusic();
  },
  stopMatch() {
    matchActive = false;
    syncMusic();
  }
};
