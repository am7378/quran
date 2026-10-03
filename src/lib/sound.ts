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
