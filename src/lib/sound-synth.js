/*
 * The synthesised stand-ins: what plays until the recordings (src/lib/sound-samples.js) are
 * decoded, or if they can't be fetched. Plain DSP on Float32Arrays, no DOM and no Web Audio, so the
 * same code renders the in-page buffers (src/lib/sound.js) and the offline previews.
 *
 * Every effect is a short mono "grain", built from noise, clicks and a couple of resonant filters,
 * in a few seeded variations so repeats never sound like a loop:
 *   tear   one stop-motion step of a paper rip: a cluster of fibre snaps over a short papery burst
 *   peel   one step of a vinyl sticker coming unstuck: a stick-slip rasp (a fast train of tiny
 *          adhesive clicks) through a bright resonance
 *   flip   a page turning: an air swish whose band sweeps up and back, a rustle riding on it, and
 *          a soft slap as the page lands
 *   pop    an object popping up out of the head: a soft pitched "pock" with a tiny click
 *   whoosh the peeled lid thrown off: a rising airy sweep with a little flutter
 *
 * Also here, pure and clock-agnostic: the scrub logic that turns a 0..1 progress stream into
 * grains (makeScrubber) and the page-turn counter (makeTurnCounter), so the previews run the very
 * same decisions the page does.
 */

export function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RBJ biquad (direct form I), coefficients can be changed while running. */
class Biquad {
  constructor(sr) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0 }
  set(type, f, Q = 0.707, db = 0) {
    const w = (2 * Math.PI * Math.min(f, this.sr * 0.45)) / this.sr
    const cs = Math.cos(w)
    const al = Math.sin(w) / (2 * Q)
    const A = Math.pow(10, db / 40)
    let b0, b1, b2, a0, a1, a2
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al }
    else { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A } // peaking
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0
    return this
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
    return y
  }
  run(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]); return buf }
}
const filt = (buf, sr, type, f, Q, db) => new Biquad(sr).set(type, f, Q, db).run(buf)

/** Short raised-cosine fades at both ends (no clicks), then scale the peak to `peak`. */
function finish(buf, sr, peak = 0.9, fin = 0.0006, fout = 0.006) {
  const a = Math.max(1, Math.round(fin * sr))
  const b = Math.max(1, Math.round(fout * sr))
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a)
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b)
  let m = 0
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]))
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / m
  return buf
}

const white = (n, r) => { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = r() * 2 - 1; return b }

/** A tiny noise snap at sample `at`: `dur` s long, exponentially decaying. Adds into `out`. */
function snap(out, sr, r, at, amp, dur) {
  const n = Math.max(2, Math.round(dur * sr))
  for (let i = 0; i < n && at + i < out.length; i++) out[at + i] += amp * (r() * 2 - 1) * Math.exp((-5 * i) / n)
}

/* ---------------------------------------------------------------- the effects */

export function tear(sr, seed) {
  const r = mulberry32(seed * 7919 + 11)
  const len = 0.042 + r() * 0.022
  const n = Math.round(len * sr)
  // fibre snaps: clustered toward the front, a few of them big
  const clicks = new Float32Array(n)
  const k = 6 + Math.floor(r() * 9)
  for (let j = 0; j < k; j++) {
    const at = Math.floor(Math.pow(r(), 1.7) * n * 0.62)
    const amp = 0.25 + Math.pow(r(), 2) * 0.95
    snap(clicks, sr, r, at, amp, 0.0004 + r() * 0.0014)
  }
  filt(clicks, sr, 'hp', 1700 + r() * 900, 0.7)
  // the papery body: a burst with a fast attack, bright band + a little low "tug"
  const tau = 0.008 + r() * 0.008
  const body = white(n, r)
  for (let i = 0; i < n; i++) { const t = i / sr; body[i] *= Math.min(1, t / 0.0012) * Math.exp(-t / tau) }
  const lowb = Float32Array.from(body)
  filt(body, sr, 'bp', 1300 + r() * 1500, 0.85)
  filt(lowb, sr, 'lp', 650 + r() * 250, 1.1)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = clicks[i] * 1.0 + body[i] * 1.6 + lowb[i] * 0.45
  filt(out, sr, 'hp', 170, 0.7)
  filt(out, sr, 'lp', 7500, 0.6) // keep the fizz off the top: small speakers make it harsh
  return finish(out, sr, 0.9)
}

export function peel(sr, seed) {
  const r = mulberry32(seed * 104729 + 3)
  const len = 0.05 + r() * 0.03
  const n = Math.round(len * sr)
  const imp = new Float32Array(n)
  const period = 1 / (250 + r() * 230) // stick-slip: ~250-480 Hz buzz
  for (let t = r() * period; t < len; t += period * (0.7 + 0.6 * r())) {
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t / len)), 0.6)
    snap(imp, sr, r, Math.floor(t * sr), env * (0.55 + 0.45 * r()), 0.0003 + r() * 0.0004)
  }
  // each slip rings a bright resonance (the vinyl) and a lower, squeakier one (the glue)
  const tick = filt(Float32Array.from(imp), sr, 'bp', 2700 + r() * 1000, 2.6)
  const squeak = filt(Float32Array.from(imp), sr, 'bp', 1000 + r() * 500, 7)
  // the tacky start: a dull little smack as the adhesive lets go
  const tack = white(n, r)
  for (let i = 0; i < n; i++) tack[i] *= Math.exp(-i / sr / 0.005)
  filt(tack, sr, 'lp', 420, 0.9)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = tick[i] * 1.5 + squeak[i] * 1.6 + tack[i] * 0.35
  filt(out, sr, 'hp', 220, 0.7)
  filt(out, sr, 'lp', 8000, 0.6)
  return finish(out, sr, 0.85)
}

export function flip(sr, seed) {
  const r = mulberry32(seed * 15485863 + 5)
  const len = 0.3 + r() * 0.06
  const n = Math.round(len * sr)
  const out = new Float32Array(n)
  // the swish: noise through a band that sweeps up as the page swings and back down as it settles
  const bp = new Biquad(sr)
  const ta = 0.1 + r() * 0.03 // rise
  const tl = 0.72 * len // landing
  const fpk = 2000 + r() * 900
  const env = (t) => (t < ta ? Math.pow(t / ta, 2) : Math.exp(-(t - ta) / 0.06))
  for (let i = 0; i < n; i++) {
    const t = i / sr
    if (i % 32 === 0) bp.set('bp', 550 + fpk * Math.pow(Math.sin(Math.PI * Math.min(1, t / (0.8 * len))), 1.4), 0.75)
    out[i] = bp.tick(r() * 2 - 1) * env(t) * 1.3
  }
  // the rustle riding on it: paper crackle, as dense as the swish is loud
  const rus = new Float32Array(n)
  for (let i = 0; i < n; i += 8) if (r() < 0.06 * env(i / sr)) snap(rus, sr, r, i, 0.2 + r() * 0.5, 0.0003 + r() * 0.0008)
  filt(rus, sr, 'hp', 2400, 0.7)
  // the landing: a soft slap and a felt thump
  const at = Math.round(tl * sr)
  const slap = new Float32Array(n)
  for (let i = at; i < n; i++) {
    const t = (i - at) / sr
    slap[i] = (r() * 2 - 1) * Math.exp(-t / 0.011) * 0.75 + Math.sin(2 * Math.PI * (90 + 20 * r()) * t) * Math.exp(-t / 0.03) * 0.5
  }
  filt(slap, sr, 'lp', 2100, 0.8)
  for (let i = 0; i < n; i++) out[i] += rus[i] * 0.55 + slap[i] * (0.45 + r() * 0.0)
  filt(out, sr, 'hp', 85, 0.7)
  return finish(out, sr, 0.85, 0.002, 0.02)
}

export function pop(sr, seed) {
  const r = mulberry32(seed * 32452843 + 9)
  const len = 0.16
  const n = Math.round(len * sr)
  const out = new Float32Array(n)
  const f0 = 230 + r() * 70 // ends where a phone speaker still plays it
  const f1 = 420 + r() * 180
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    ph += (2 * Math.PI * (f0 + f1 * Math.exp(-t / 0.013))) / sr
    out[i] = Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.034)
  }
  const click = new Float32Array(n)
  snap(click, sr, r, 0, 1, 0.002)
  filt(click, sr, 'hp', 3000, 0.7)
  const air = white(n, r)
  for (let i = 0; i < n; i++) air[i] *= Math.exp(-i / sr / 0.014)
  filt(air, sr, 'bp', 1200, 1)
  for (let i = 0; i < n; i++) out[i] += click[i] * 0.22 + air[i] * 0.35
  return finish(out, sr, 0.8, 0.0005, 0.03)
}

export function whoosh(sr, seed) {
  const r = mulberry32(seed * 49979687 + 13)
  const len = 0.42 + r() * 0.06
  const n = Math.round(len * sr)
  const out = new Float32Array(n)
  const bp = new Biquad(sr)
  const tp = 0.3 * len
  const flutter = 18 + r() * 10
  for (let i = 0; i < n; i++) {
    const t = i / sr
    if (i % 32 === 0) bp.set('bp', 380 + 2600 * Math.pow(t / len, 0.75), 0.9)
    const env = t < tp ? Math.pow(t / tp, 1.5) : Math.exp(-(t - tp) / 0.085)
    out[i] = bp.tick(r() * 2 - 1) * env * (0.82 + 0.18 * Math.sin(2 * Math.PI * flutter * t))
  }
  // the last of the adhesive letting go, right at the start
  const cr = new Float32Array(n)
  for (let j = 0; j < 7; j++) snap(cr, sr, r, Math.floor(r() * 0.08 * sr), 0.15 + r() * 0.35, 0.0004 + r() * 0.001)
  filt(cr, sr, 'hp', 2200, 0.7)
  for (let i = 0; i < n; i++) out[i] += cr[i] * 0.3
  return finish(out, sr, 0.8, 0.002, 0.03)
}

/** Generators and how many seeded variations of each to keep. */
export const VOICES = { tear: [tear, 10], peel: [peel, 8], flip: [flip, 4], pop: [pop, 5], whoosh: [whoosh, 2] }

/**
 * Mix levels (linear): each voice's own level, then the master. Quiet on purpose: a texture, not a
 * soundtrack. `rec`: the same for the recordings (files peak at -3 dBFS; a scrub overlaps ~3 grains).
 * The scroll's own sounds (the tears, the page flips) sit SCROLL lower, so the face-tap expression
 * cues (src/lib/sound-expr.js) stay clearly on top of them.
 */
const SCROLL = 0.71 // -3 dB
export const LEVEL = {
  master: 0.5,
  tear: 0.62 * SCROLL, peel: 0.75, flip: 0.58 * SCROLL, pop: 0.3, whoosh: 0.42,
  rec: { tear: 1.25 * SCROLL, peel: 1.5, flip: 0.85 * SCROLL, pop: 0.36, whoosh: 0.55 },
}

/* ---------------------------------------------------------------- scrub → grains */

/**
 * Scrub profiles. A grain fires once the progress has moved `step` since the last one, but never
 * sooner than `gap` ms after it (±25% jitter): at speed it settles into an even stop-motion
 * stutter (~22 a second for the tear), slow scrubbing gives sparse single crackles, and stopping
 * is silent. Faster = louder and a touch higher; scrubbing backwards (un-tearing, re-sticking)
 * is softer and lower. A jump bigger than `jump` in one update (a skip, an anchor link) is silent.
 */
export const SCRUB = {
  tear: { voice: 'tear', step: 1 / 70, gap: 46, jump: 0.25, vRef: 1.2, gain: [0.32, 1], pan: 0.55 },
  peel: { voice: 'peel', step: 1 / 40, gap: 36, jump: 0.3, vRef: 1.0, gain: [0.35, 1], pan: 0.3 },
}

/**
 * Returns update(p, nowMs) → a grain description { voice, gain, rate, pan } or null.
 * `opts.pan` (+1 / -1): which way the rip travels across the screen (0 = centred).
 */
export function makeScrubber(kind, opts = {}, rand = Math.random) {
  const c = { ...SCRUB[kind], ...opts }
  let last = null
  let lastT = 0
  let acc = 0
  let next = 0
  let v = 0 // smoothed speed (progress per second)
  return (p, now) => {
    if (p == null || !Number.isFinite(p)) { last = null; return null }
    if (last == null) { last = p; lastT = now; acc = 0; return null }
    const dp = p - last
    const dt = Math.max(1, now - lastT)
    last = p
    lastT = now
    if (Math.abs(dp) > c.jump) { acc = 0; return null }
    if (dp === 0) return null
    v = v * 0.6 + ((Math.abs(dp) * 1000) / dt) * 0.4
    acc += Math.abs(dp)
    if (acc < c.step || now < next) return null
    acc = Math.min(acc - c.step, c.step)
    next = now + c.gap * (0.75 + 0.5 * rand())
    const s = Math.min(1, v / c.vRef)
    const back = dp < 0
    const gain = (c.gain[0] + (c.gain[1] - c.gain[0]) * Math.sqrt(s)) * (back ? 0.75 : 1)
    const rate = (0.9 + 0.22 * s + (rand() - 0.5) * 0.12) * (back ? 0.86 : 1)
    const pan = (c.pan || 0) * (opts.pan || 0) * (Math.min(1, Math.max(0, p)) * 2 - 1)
    return { voice: c.voice, gain, rate, pan }
  }
}

/**
 * Page turns: update(time) → how many flips to play now (negative = backwards), at most `max`.
 * A leaf counts as turned once the timeline passes the moment it stands on edge (`mid` into its
 * turn); the first reading only sets the baseline (a page loaded part-way down stays quiet).
 */
export function makeTurnCounter({ intro, turn, mid, count, max = 3 }) {
  let last = null
  return (time) => {
    const n = Math.max(0, Math.min(count, Math.floor((time - intro - mid) / turn) + 1))
    if (last == null) { last = n; return 0 }
    const d = n - last
    last = n
    return Math.max(-max, Math.min(max, d))
  }
}
