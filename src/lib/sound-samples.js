/*
 * The recorded sounds: which files, how they are cut up once decoded, and the grain engine that
 * scrubs a recording in step with a scroll or an animation.
 *
 * The files are in public/assets/sfx/ (sources and licences: public/assets/sfx/README.md), mono
 * MP3s, a few hundred KB in all. src/lib/sound.js fetches and decodes them once, when the visitor
 * first presses the sound button (never on page load, never on any other click); until they are in, or if they fail, it
 * plays the synthesised stand-ins from src/lib/sound-synth.js.
 *
 *   tear   a continuous paper rip (~2.8 s, several real tears joined) that the page scrubs through
 *   peel   a sticker's adhesive letting go (~3.6 s of fine crackle in short release fronts), scrubbed
 *          the same way for the sticker peels; any recording dropped in its place works (prepBed)
 *   flip   page turns, a sprite: three of a stiff book page, then three of a top-bound notepad
 *   pop    four mouth "bubble" pops, a sprite
 *   whoosh the lid thrown off: a swung rope (air) layered with a swung sheet (body)
 *
 * Nothing here touches the DOM or a live AudioContext except scheduleGrain/splitSprite, so the
 * offline previews run the very same decisions as the page.
 */

const BASE = import.meta.env?.BASE_URL || '/'
const url = (f) => `${BASE}assets/sfx/${f}`

/**
 * sprite: variations separated by digital silence, split once decoded; groups name them.
 * bed: a scrubbed texture, tidied once decoded (prepBed): so any recording dropped in works as is.
 */
export const SAMPLES = {
  peel: { url: url('peel.mp3'), bed: true },
  whoosh: { url: url('whoosh.mp3') },
  pop: { url: url('pop.mp3'), sprite: 4 },
  tear: { url: url('tear.mp3') },
  flip: { url: url('flip.mp3'), sprite: 6, groups: { book: [0, 1, 2], pad: [3, 4, 5] } },
}

/**
 * Find the variations in a sprite: runs of sound separated by >= 90 ms of near-silence. Returns
 * [{ offset, dur }] in seconds. Done once per file, right after decoding (a few ms).
 */
export function splitSprite(data, sampleRate, expect) {
  const gap = Math.round(0.09 * sampleRate)
  const th = 0.0006
  const out = []
  let start = -1
  let quiet = 0
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > th) {
      if (start < 0) start = i
      quiet = 0
    } else if (start >= 0 && ++quiet >= gap) {
      out.push([start, i - quiet + 1])
      start = -1
      quiet = 0
    }
  }
  if (start >= 0) out.push([start, data.length])
  const segs = out
    .filter(([a, b]) => b - a > 0.02 * sampleRate)
    .map(([a, b]) => ({ offset: Math.max(0, a - 32) / sampleRate, dur: (b - a + 64) / sampleRate }))
  if (expect && segs.length !== expect && typeof console !== 'undefined') console.warn(`sfx: expected ${expect} variations, found ${segs.length}`)
  return segs
}

/**
 * Tidy a scrub bed in place, once, right after decoding (~15 ms for a few seconds of audio, off
 * the scroll path): a gentle high-pass (handling rumble, desk thumps), then every stretch of
 * >= 120 ms far below the loud parts (the pause before, between and after takes) is cut out, the
 * rest is joined with short crossfades, levelled to one loudness and looped to fill. So the peel can
 * be swapped for any recording (a phone memo of three sticker peels, silences and all) with no
 * code change; a bed that is already tight (the shipped one) comes out the same, just levelled.
 * Returns the buffer (the same object). Only the first 20 s are looked at.
 */
export function prepBed(buffer) {
  try {
    const sr = buffer.sampleRate
    const x = buffer.getChannelData(0)
    const n = Math.min(x.length, 20 * sr)
    // high-pass, 2 x 2nd order at 400 Hz (RBJ)
    const w0 = (2 * Math.PI * 400) / sr, al = Math.sin(w0) / (2 * 0.707), cs = Math.cos(w0)
    const b0 = (1 + cs) / 2 / (1 + al), b1 = -(1 + cs) / (1 + al), a1 = (-2 * cs) / (1 + al), a2 = (1 - al) / (1 + al)
    const y = new Float32Array(n)
    y.set(x.subarray(0, n))
    for (let pass = 0; pass < 2; pass++) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0
      for (let i = 0; i < n; i++) {
        const v = b0 * y[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = y[i]; y2 = y1; y1 = v; y[i] = v
      }
    }
    // 10 ms frames: loud enough = within 24 dB of the loud parts (99th percentile: a phone memo
    // can be mostly room tone)
    const f = Math.round(0.01 * sr), nf = Math.floor(n / f)
    if (nf < 20) return buffer
    const db = new Float32Array(nf)
    for (let k = 0; k < nf; k++) {
      let e = 0
      for (let i = k * f; i < (k + 1) * f; i++) e += y[i] * y[i]
      db[k] = 10 * Math.log10(e / f + 1e-12)
    }
    const ref = Array.from(db).sort((a, b) => a - b)[Math.floor(nf * 0.99)]
    const on = Array.from(db, (v) => v > ref - 24)
    // a quiet stretch shorter than 120 ms is part of the sound (a sticker's own catches): keep it
    for (let k = 0; k < nf;) {
      if (on[k]) { k++; continue }
      let j = k
      while (j < nf && !on[j]) j++
      if (j - k < 12 && k > 0 && j < nf) for (let q = k; q < j; q++) on[q] = true
      k = j
    }
    const runs = []
    for (let k = 0; k < nf;) {
      if (!on[k]) { k++; continue }
      let j = k
      while (j < nf && on[j]) j++
      if (j - k >= 3) runs.push([Math.max(0, k - 1) * f, Math.min(n, (j + 1) * f)])
      k = j
    }
    const total = runs.reduce((s, [a, b]) => s + b - a, 0)
    if (total < 0.3 * sr) return buffer
    // join the runs (8 ms equal-power crossfades), level to one rms, repeat to fill the buffer
    const xf = Math.round(0.008 * sr)
    const bed = new Float32Array(total)
    let w = 0
    for (const [a, b] of runs) {
      const len = b - a, start = Math.max(0, w - xf)
      for (let i = 0; i < len; i++) {
        const v = y[a + i]
        const t = start + i
        if (w > 0 && i < xf) {
          const u = i / xf
          bed[t] = bed[t] * Math.cos((u * Math.PI) / 2) + v * Math.sin((u * Math.PI) / 2)
        } else bed[t] = v
      }
      w = start + len
    }
    let e = 0, pk = 0
    for (let i = 0; i < w; i++) { e += bed[i] * bed[i]; pk = Math.max(pk, Math.abs(bed[i])) }
    const rms = Math.sqrt(e / w)
    // to the shipped bed's loudness (~-28 dBFS rms, a crackle has big peaks); never past -1 dBFS peak
    const g = Math.min(0.039 / (rms || 1), 0.89 / (pk || 1))
    if (w >= x.length) {
      for (let i = 0; i < x.length; i++) x[i] = bed[i] * g // nothing cut: as it was, levelled
      return buffer
    }
    // a seamless loop: the end crossfades into the start, so a grain across the seam doesn't click
    const P = w - xf
    for (let i = 0; i < xf; i++) {
      const u = i / xf
      bed[i] = bed[P + i] * Math.cos((u * Math.PI) / 2) + bed[i] * Math.sin((u * Math.PI) / 2)
    }
    for (let i = 0; i < x.length; i++) x[i] = bed[i % P] * g
  } catch { /* leave it as decoded */ }
  return buffer
}

/* ---------------------------------------------------------------- the grain engine */

/**
 * Scrub profiles, in seconds of the recording.
 *  span   how much of the recording a full 0 → 1 pass reads (the rest gives each pass its own part)
 *  sRef   the reading speed (recording seconds per second) that counts as a normal, full-voiced tear
 *  grain  grain length; hop: time between grain starts (so ~grain/hop grains overlap)
 *  jit    random jitter of each grain's read position (hides the repeats when barely moving)
 *  back   level when scrubbing backwards (re-sticking, un-tearing: same texture, read backwards)
 */
export const GRAIN = {
  tear: { span: 0.95, sRef: 1.3, grain: 0.07, hop: 0.024, jit: 0.012, back: 0.72, jump: 0.25, pan: 0.55 },
  // shorter grains, little jitter: the crackle's release fronts stay crisp instead of washing into a rasp
  peel: { span: 1.1, sRef: 1.1, grain: 0.055, hop: 0.022, jit: 0.005, back: 0.7, jump: 0.3, pan: 0.3 },
}

/**
 * The duck: while an expression cue plays (src/lib/sound-expr.js), the scrubbed tears and peels
 * (their own bus in src/lib/sound.js) dip by `depth`, so the meme sound cuts through the paper
 * rasp. Exponential glides both ways (no clicks): in within ~30 ms, back over ~150 ms once the cue
 * has finished. The flips, pops and whoosh are one-shots and stay as they are.
 */
export const DUCK = { depth: 0.28, attack: 0.01, release: 0.05 } // -11 dB; time constants in s

/** Duck a gain AudioParam from `now` for `hold` s, then let it back up to 1. A new duck while one runs extends it. */
export function duckGain(param, now, hold, d = DUCK) {
  param.cancelScheduledValues(now) // drops a pending release; a glide already under way carries on from where it is
  param.setTargetAtTime(d.depth, now, d.attack)
  param.setTargetAtTime(1, now + Math.max(0, hold), d.release)
}

const LOOKAHEAD = 0.1 // s of grains scheduled ahead of the current moment
const HOLD = 0.07 // s without movement before the stream counts as stopped

/**
 * A scrub stream over a recording `len` seconds long. update(p, wallMs) takes the latest 0..1
 * progress (null = idle, resets) and returns the grains to start now:
 *   [{ at (s from now), offset (s into the recording), dur, gain, rate, pan, env? }]
 * Faster = louder, denser and a touch brighter; slow = quiet, sparse crackles; stopped = silent
 * within ~0.1 s. Grains follow the progress: dragging back and forth re-reads the same stretch.
 */
export function makeGrainScrub(kind, len, opts = {}, rand = Math.random) {
  const c = { ...GRAIN[kind], ...opts }
  const room = Math.max(0, len - c.span - c.grain - 0.02)
  let at = rand() * room // where this pass starts in the recording
  let last = null
  let lastT = 0
  let lastMove = -1
  let v = 0 // smoothed velocity, progress per second (signed)
  let next = 0 // wall time (s) of the next grain
  return (p, wallMs) => {
    const t = wallMs / 1000
    if (p == null || !Number.isFinite(p)) {
      if (last != null) at = rand() * room // a fresh stretch next time
      last = null
      v = 0
      return null
    }
    if (last == null || t - lastT > 1.5) {
      if (last != null && t - lastT > 1.5) at = rand() * room
      last = p
      lastT = t
      v = 0
      return null
    }
    const dp = p - last
    const dt = Math.max(0.004, t - lastT)
    last = p
    lastT = t
    if (Math.abs(dp) > c.jump) { v = 0; lastMove = -1; return null } // a skip or an anchor jump: silent
    if (dp !== 0) {
      v = v * 0.45 + (dp / dt) * 0.55
      lastMove = t
    } else v *= 0.5
    if (lastMove < 0 || t - lastMove > HOLD || Math.abs(v) < 0.02) return null
    const s = Math.abs(v) * c.span // recording seconds read per second
    const k = Math.min(1.4, s / c.sRef) // intensity
    const back = v < 0
    const out = []
    if (next < t) next = t + 0.004
    while (next < t + LOOKAHEAD) {
      const dtg = next - t
      // slow scrubbing: fewer grains, each from a more scattered spot: sparse fibre crackles
      const sparse = k < 0.45 && rand() > 0.3 + k * 1.55
      if (!sparse) {
        const pr = Math.min(1, Math.max(0, p + v * dtg))
        const jit = c.jit * (k < 0.5 ? 3 : 1)
        const offset = Math.min(len - c.grain, Math.max(0, at + pr * c.span + (rand() - 0.5) * 2 * jit))
        const gain = Math.min(1.12, Math.max(0.16, Math.pow(k, 0.6))) * (back ? c.back : 1) * (0.85 + rand() * 0.3)
        const rate = (1 + 0.07 * (Math.min(k, 1.4) - 0.8)) * (back ? 0.94 : 1) * (0.97 + rand() * 0.06)
        const pan = (c.pan || 0) * (opts.pan || 0) * (pr * 2 - 1)
        // barely moving: short grains with a quick onset, so they come out as fibre snaps, not puffs
        const slow = k < 0.45
        const dur = c.grain * (slow ? 0.45 + k : 1) * (0.85 + rand() * 0.3)
        out.push({ at: dtg, offset, dur, gain, rate, pan, env: slow ? [0.12, 0.88] : undefined })
      }
      next += c.hop * (0.8 + 0.4 * rand())
    }
    return out.length ? out : null
  }
}

/**
 * Start one grain (or a one-shot slice): buffer from `offset` for `dur` s at audio time `when`,
 * through a smooth rise and fall, into `dest`. Returns the source (call sites count voices).
 * env: [rise, fall] as shares of dur (one-shots use a click-free 2 ms rise and their own tail).
 */
export function scheduleGrain(ctx, dest, buffer, { offset = 0, dur, gain = 1, rate = 1, pan = 0, env: own }, when, env = own || [0.4, 0.6]) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  const g = ctx.createGain()
  const len = dur ?? buffer.duration - offset
  const real = len / rate // wall length of the slice
  const a = Math.max(0.002, env[0] * real)
  const b = Math.max(0.004, env[1] * real)
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(gain, when + a)
  g.gain.setValueAtTime(gain, Math.max(when + a, when + real - b))
  g.gain.linearRampToValueAtTime(0, when + real)
  src.connect(g)
  let tail = g
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    g.connect(p)
    tail = p
  }
  tail.connect(dest)
  src.start(when, offset, len + 0.005)
  src.onended = () => { try { src.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect() } catch { /* gone */ } }
  return src
}
