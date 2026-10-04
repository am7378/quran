/**
 * The sound of a highlighter drawn across paper: a short band of noise, brighter as the felt tip
 * starts, with a slight rasp of the paper's grain, fading as it lifts. Made with the Web Audio API
 * (no sound files), quiet, and only ever after the reader has touched the page.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(c: AudioContext) {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const len = Math.floor(c.sampleRate * 0.8);
  noise = c.createBuffer(1, len, c.sampleRate);
  const d = noise.getChannelData(0);
  // brown-ish noise: softer than white, like felt on paper
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.035 * w) / 1.035;
    d[i] = last * 3.2 + w * 0.18;
  }
  return noise;
}

/** One stroke of the marker; `length` (0–1) stretches it for a longer highlight. */
export function playHighlight(length = 0.5) {
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const dur = 0.22 + Math.min(1, Math.max(0, length)) * 0.26;

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;

  // the felt tip: a band around 2–3 kHz that rises as the stroke speeds up
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(1500, t);
  band.frequency.linearRampToValueAtTime(2600, t + dur * 0.55);
  band.frequency.linearRampToValueAtTime(1900, t + dur);

  // the paper's grain: a fast flutter in the loudness
  const grain = c.createGain();
  grain.gain.value = 0.8;
  const lfo = c.createOscillator();
  lfo.frequency.value = 38 + Math.random() * 14;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.22;
  lfo.connect(lfoDepth).connect(grain.gain);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
  env.gain.setValueAtTime(0.14, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(band).connect(grain).connect(env).connect(c.destination);
  src.start(t, Math.random() * 0.2, dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

/* ── the marker drawn live: while a selection grows, a loop of the same felt-on-paper noise
   sounds, louder and brighter as the selection moves faster, silent the moment it stops ── */
let stroke: { src: AudioBufferSourceNode; band: BiquadFilterNode; env: GainNode; lfo: OscillatorNode; idle: number } | null = null;
let lastStroke = -Infinity;

/** The selection moved by `amount` characters. */
export function strokeMove(amount: number) {
  const c = context();
  if (!c || amount <= 0) return;
  const now = c.currentTime;
  if (!stroke) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.value = 1700;
    const grain = c.createGain();
    grain.gain.value = 0.8;
    const lfo = c.createOscillator();
    lfo.frequency.value = 40 + Math.random() * 10;
    const depth = c.createGain();
    depth.gain.value = 0.22;
    lfo.connect(depth).connect(grain.gain);
    const env = c.createGain();
    env.gain.value = 0.0001;
    src.connect(band).connect(grain).connect(env).connect(c.destination);
    src.start(now, Math.random() * 0.4);
    lfo.start(now);
    stroke = { src, band, env, lfo, idle: 0 };
  }
  const speed = Math.min(1, amount / 10);
  stroke.env.gain.cancelScheduledValues(now);
  stroke.env.gain.setTargetAtTime(0.09 + speed * 0.07, now, 0.012);
  stroke.env.gain.setTargetAtTime(0.0001, now + 0.06, 0.045); // and dies away unless it moves again
  stroke.band.frequency.setTargetAtTime(1600 + speed * 1300, now, 0.03);
  lastStroke = performance.now();
  window.clearTimeout(stroke.idle);
  stroke.idle = window.setTimeout(strokeEnd, 450);
}

/** The pen lifts. */
export function strokeEnd() {
  if (!stroke || !ctx) return;
  const s = stroke;
  stroke = null;
  window.clearTimeout(s.idle);
  const now = ctx.currentTime;
  s.env.gain.cancelScheduledValues(now);
  s.env.gain.setTargetAtTime(0.0001, now, 0.02);
  s.src.stop(now + 0.15);
  s.lfo.stop(now + 0.15);
}

/** Whether a live stroke has just been heard (then the finished highlight needs no sound of its own). */
export const strokeRecently = (ms = 1500) => performance.now() - lastStroke < ms;

/* ── the site's other sounds: quiet, short, made here like the marker's (no files), each kind
   switched on and off in Settings → Sound. A tap is a soft tick with a little body; a switch
   ticks up as it goes on and down as it goes off; a key is a tiny thock; a note is paper lifted
   and laid down; a menu opens with a small round pop; a recording begins and ends with a blip;
   a surah completed answers with two soft bell notes. ── */

export type Sfx = "tap" | "on" | "off" | "key" | "lift" | "drop" | "menu" | "recOn" | "recOff" | "complete" | "undo" | "detent" | "detentEnd" | "settle";

const KIND: Record<Sfx, keyof SoundSettings> = {
  tap: "soundTaps",
  on: "soundTaps",
  off: "soundTaps",
  menu: "soundTaps",
  undo: "soundTaps",
  key: "soundTyping",
  lift: "soundNotes",
  drop: "soundNotes",
  recOn: "soundRecord",
  recOff: "soundRecord",
  complete: "soundComplete",
  detent: "soundSlider",
  detentEnd: "soundSlider",
  settle: "soundSlider",
};
type SoundSettings = { sound: boolean; soundTaps: boolean; soundTyping: boolean; soundNotes: boolean; soundRecord: boolean; soundComplete: boolean; soundSlider: boolean };

// the settings are read through this (set by the app), so this file needs nothing of the store's
let readSettings: () => SoundSettings | null = () => null;
export function soundSettingsFrom(read: () => SoundSettings) {
  readSettings = read;
}

let white: AudioBuffer | null = null;
function whiteNoise(c: AudioContext) {
  if (white && white.sampleRate === c.sampleRate) return white;
  const len = Math.floor(c.sampleRate * 0.6);
  white = c.createBuffer(1, len, c.sampleRate);
  const d = white.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return white;
}

/** a burst of noise through a band, with a quick rise and an exponential fall */
function noiseBurst(c: AudioContext, t: number, { lo, hi, gain, attack = 0.0008, decay, out }: { lo: number; hi: number; gain: number; attack?: number; decay: number; out: AudioNode }) {
  const src = c.createBufferSource();
  src.buffer = whiteNoise(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = lo;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = hi;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(hp).connect(lp).connect(env).connect(out);
  src.start(t, Math.random() * 0.4, attack + decay + 0.02);
}

/** a short tone that falls from f0 to f1, fading out */
function tone(c: AudioContext, t: number, { f0, f1 = f0, gain, attack = 0.002, decay, type = "sine", out }: { f0: number; f1?: number; gain: number; attack?: number; decay: number; type?: OscillatorType; out: AudioNode }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay * 0.6);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(env).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.03);
}

/** a soft bell: a few partials, the higher ones dying first */
function bell(c: AudioContext, t: number, f: number, gain: number, out: AudioNode) {
  [
    [1, 1, 1.4],
    [2.0, 0.22, 0.7],
    [2.76, 0.12, 0.45],
    [5.4, 0.05, 0.18],
  ].forEach(([m, a, d]) => tone(c, t, { f0: f * m, gain: gain * a, attack: 0.004, decay: d, out }));
}

let lastKey = 0;
let lastAny = 0;
let lastDetent = 0;

/**
 * Play one of the site's sounds, if the reader has that kind on. `at` (0 to 1): where along the
 * ayah slider a detent is, its pitch rising a little toward the end, like a fine dial.
 */
export function sfx(kind: Sfx, at = 0.5) {
  const s = readSettings();
  if (!s || !s.sound || !s[KIND[kind]]) return;
  const now = performance.now();
  // the slider's detents: one per ayah passed; swept fast they run on like a fine ratchet, softer,
  // never a buzz
  let sweep = 1;
  if (kind === "detent") {
    const gap = now - lastDetent;
    if (gap < 16) return;
    lastDetent = now;
    sweep = gap < 45 ? 0.55 : gap < 90 ? 0.8 : 1;
  }
  if (kind === "key") {
    if (now - lastKey < 28) return; // a held key, or very fast typing: not a buzz
    lastKey = now;
  } else if (kind === "tap" || kind === "on" || kind === "off") {
    if (now - lastAny < 40) return; // one press, one sound
    lastAny = now;
  }
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(c.destination);
  const pitch = 0.94 + Math.random() * 0.12; // no two quite alike
  switch (kind) {
    case "tap":
      noiseBurst(c, t, { lo: 2200, hi: 7000, gain: 0.05, decay: 0.006, out });
      tone(c, t, { f0: 190 * pitch, f1: 150, gain: 0.04, decay: 0.03, out });
      break;
    case "on":
      noiseBurst(c, t, { lo: 2600, hi: 8000, gain: 0.04, decay: 0.005, out });
      tone(c, t, { f0: 900 * pitch, f1: 1240, gain: 0.022, decay: 0.07, out });
      break;
    case "off":
      noiseBurst(c, t, { lo: 1800, hi: 6000, gain: 0.04, decay: 0.006, out });
      tone(c, t, { f0: 760 * pitch, f1: 520, gain: 0.02, decay: 0.07, out });
      break;
    case "undo":
      tone(c, t, { f0: 520 * pitch, f1: 380, gain: 0.025, decay: 0.09, out });
      break;
    case "key":
      noiseBurst(c, t, { lo: 1400 * pitch, hi: 3200 * pitch, gain: 0.03, decay: 0.012, out });
      tone(c, t, { f0: (150 + Math.random() * 40) * pitch, gain: 0.018, decay: 0.022, out });
      break;
    case "lift":
      noiseBurst(c, t, { lo: 900, hi: 6000, gain: 0.03, attack: 0.04, decay: 0.16, out });
      break;
    case "drop":
      noiseBurst(c, t, { lo: 700, hi: 5000, gain: 0.035, attack: 0.012, decay: 0.12, out });
      tone(c, t + 0.01, { f0: 170, f1: 120, gain: 0.03, decay: 0.05, out });
      break;
    case "menu":
      tone(c, t, { f0: 520 * pitch, f1: 300, gain: 0.035, attack: 0.003, decay: 0.07, out });
      break;
    case "recOn":
      tone(c, t, { f0: 1320, gain: 0.04, attack: 0.003, decay: 0.09, out });
      break;
    case "recOff":
      tone(c, t, { f0: 880, gain: 0.04, attack: 0.003, decay: 0.1, out });
      tone(c, t + 0.09, { f0: 660, gain: 0.03, attack: 0.003, decay: 0.12, out });
      break;
    case "detent": {
      // a precise click: a very short bright tick and a faint high ring, the ring rising along the slider
      const f = 2100 + Math.max(0, Math.min(1, at)) * 900;
      noiseBurst(c, t, { lo: 3800, hi: 11000, gain: 0.032 * sweep, attack: 0.0004, decay: 0.0028, out });
      tone(c, t, { f0: f, gain: 0.007 * sweep, attack: 0.001, decay: 0.014, out });
      break;
    }
    case "detentEnd":
      // the end of the track: firmer, with a little body
      noiseBurst(c, t, { lo: 2600, hi: 9000, gain: 0.045, attack: 0.0004, decay: 0.004, out });
      tone(c, t, { f0: 420, f1: 300, gain: 0.03, attack: 0.001, decay: 0.035, out });
      tone(c, t, { f0: 2600, gain: 0.009, attack: 0.001, decay: 0.02, out });
      break;
    case "settle":
      // let go: the thumb comes to rest on its ayah
      tone(c, t, { f0: 330, f1: 250, gain: 0.022, attack: 0.002, decay: 0.05, out });
      noiseBurst(c, t, { lo: 1500, hi: 5000, gain: 0.012, attack: 0.001, decay: 0.008, out });
      break;
    case "complete":
      // two soft bell notes rising, a fifth apart, and a faint shimmer under them
      bell(c, t, 784, 0.05, out);
      bell(c, t + 0.11, 1175, 0.04, out);
      noiseBurst(c, t + 0.05, { lo: 6000, hi: 12000, gain: 0.006, attack: 0.08, decay: 0.5, out });
      break;
  }
}

/** Sounds wake on the first touch or click (browsers keep audio asleep until then). */
export function wakeSound() {
  context();
}
