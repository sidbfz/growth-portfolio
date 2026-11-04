/*
 * Sound effects: paper and sticker noises for the peel, the tears and the notebook.
 *
 * Real recordings (CC0, public/assets/sfx/, sources in its README.md), played through Web Audio:
 * the tear and the sticker peels are scrubbed in grains through a long recording, in step with the
 * scroll or the animation (src/lib/sound-samples.js); the flips, pops and the whoosh are one-shots.
 * The files are fetched and decoded once, when the visitor first switches sound on, never on page
 * load. Until they're in (or if they fail) the synthesised stand-ins play (src/lib/sound-synth.js).
 *
 * Rules it keeps:
 *  - Off on every visit, for everyone, until the visitor presses the header's sound button. Only
 *    that press turns it on: no other click, tap or key does (sound that switched itself on at
 *    some random later click would be a surprise mid-scroll). Until then there is no AudioContext,
 *    nothing is fetched, and every call is a no-op. Nothing is remembered: "on" can't be honoured
 *    on the next visit without another press anyway (browsers only start audio inside a click, tap
 *    or key), and "off" is the default, so there's nothing to store.
 *  - The press creates / resumes the context right inside the click, starts fetching the
 *    recordings and plays a little confirming pop. Pressing again fades everything out within
 *    ~0.1 s and suspends the context.
 *  - Silent while the tab is hidden (the context is suspended), while the voice note plays, and
 *    when switched off. After a quiet spell the context suspends itself to save battery and wakes
 *    on the next sound.
 *  - iOS: unlocked on touchend, with the classic one-sample kick for older Safari. The audio
 *    session is left on Safari's default ('auto', which acts as 'ambient' for Web Audio): these
 *    are UI sounds, so they mix with the visitor's music instead of stopping it, and they respect
 *    the ringer switch. ('playback' would bypass the switch but pause their podcast: wrong here.)
 *  - The page only ever schedules: per scroll frame a scrub stream does a few comparisons and
 *    starts at most a handful of grains (buffer slices) ~0.1 s ahead. Decoding happens once, off
 *    the scroll path; all mixing happens on the audio thread.
 *
 * For components:
 *   useScrubSound(kind, p, opts)  a 0..1 progress (null = idle) → the recording scrubbed in step: 'tear' | 'peel'
 *   scrubSound(kind, opts)        the same, outside React: returns update(p)
 *   useSoundCues(t, times, play)  calls play() as t passes each of times going forwards
 *   pageTurnSound(cfg)            returns update(timelineTime): a flip per leaf turned, either way
 *   sfx.flip(back, { pad }) / sfx.pop() / sfx.whoosh()
 *   useSound() → { supported, on, live }, toggleSound() (call it from the click itself)
 *
 * For other sound modules (e.g. src/lib/sound-expr.js), the shared context and master bus:
 *   getAudio()      → { ctx, out } while effects are on and audio is unlocked, else null. Connect
 *                     sources to `out` (master gain: the toggle, the voice-note duck and the level
 *                     apply). Calling it also wakes a napping context and holds off the idle nap.
 *                     If ctx.state isn't 'running' yet, start sources at ctx.currentTime anyway
 *                     (they play when it resumes) or wait for ctx.resume().
 *   loadSample(url) → Promise<AudioBuffer | null>: fetched and decoded once (cached by url). It
 *                     waits until sound is first switched on before fetching; null on failure.
 *   onSoundLive(f)  → unsubscribe: f() whenever sound goes live (on and allowed to play) or stops.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { VOICES, LEVEL, makeScrubber, makeTurnCounter } from './sound-synth.js'
import { SAMPLES, splitSprite, prepBed, makeGrainScrub, scheduleGrain } from './sound-samples.js'

const IDLE_MS = 12000 // suspend the context after this long without a sound
const FADE = 0.025 // s: the master's time constant when switched off (~0.1 s to silence)
const MAX_VOICES = 28 // one-shots and grains together (a fast tear keeps ~4 grains going)
const HAS_WINDOW = typeof window !== 'undefined'
const AC = HAS_WINDOW ? window.AudioContext || window.webkitAudioContext : null

// earlier versions remembered the toggle here; sound now starts off on every visit
try { if (HAS_WINDOW) localStorage.removeItem('sfx') } catch { /* storage blocked: nothing to clear */ }

let pref = false // on/off: only ever switched on by the sound button
let ctx = null
let out = null
let unlocked = false // the context has run at least once (audio is allowed on this page)
let active = 0
let lastPlay = 0
let idleTimer = 0
let offTimer = 0
let waking = null
let loading = false // the recordings have been asked for
const bank = {} // synthesised stand-ins, built on demand
const rec = {} // recordings: voice → { buffer, segs? }
const lastPick = {}

/* ---------- state for the toggle ---------- */
const subs = new Set()
const snap = () => ({ supported: Boolean(AC), on: pref, live: Boolean(AC) && pref && unlocked })
let state = snap()
const emit = () => { const s = snap(); if (s.on !== state.on || s.live !== state.live) { state = s; subs.forEach((f) => f()) } }

/* ---------- the context ---------- */
function start() {
  if (!AC) return Promise.resolve()
  if (!ctx) {
    try { ctx = new AC({ latencyHint: 'interactive' }) } catch { try { ctx = new AC() } catch { return Promise.resolve() } }
    out = ctx.createGain()
    out.gain.value = LEVEL.master
    out.connect(ctx.destination)
    ctx.addEventListener('statechange', markRunning)
    // if a recording isn't in after a moment (slow network, blocked), build its stand-in while
    // nothing else is happening, one voice per idle slot, so it's never built mid-scroll
    const later = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(f, 60)
    setTimeout(() => Object.keys(VOICES).forEach((v) => later(() => { if (!rec[v]) buffers(v) })), 2500)
  }
  if (ctx.state === 'running') { markRunning(); return Promise.resolve() }
  ctx.resume().catch(() => {})
  // older iOS only unlocks once something has actually played inside the gesture
  try {
    const s = ctx.createBufferSource()
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    s.connect(ctx.destination)
    s.start(0)
  } catch { /* fine */ }
  // resume()'s promise can settle before the state reads 'running': wait for the state itself
  return new Promise((done) => {
    const c = ctx
    const end = () => { c.removeEventListener('statechange', on); clearTimeout(t); markRunning(); done() }
    const on = () => { if (c.state === 'running') end() }
    const t = setTimeout(end, 800)
    c.addEventListener('statechange', on)
    on()
  })
}

function markRunning() {
  if (ctx && ctx.state === 'running' && !unlocked) { unlocked = true; emit() }
}

/* ---------- loading (once sound has been switched on, never before) ---------- */
let armed = false // the sound button has been pressed on this page (the only thing that lets us fetch)
const armWaiters = []
const cache = new Map()

// decodeAudioData: the callback form works everywhere (old Safari has no promise form)
const decode = (ab) => new Promise((ok, no) => { const r = ctx.decodeAudioData(ab, ok, no); if (r && r.then) r.then(ok, no) })

/** Fetch + decode a sound file once (cached by url). Waits until sound is first switched on. */
export function loadSample(src) {
  if (!AC || !HAS_WINDOW) return Promise.resolve(null)
  if (cache.has(src)) return cache.get(src)
  const ready = new Promise((go) => { if (armed && ctx) go(); else armWaiters.push(go) })
  const p = ready
    .then(() => fetch(src))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${src}`))))
    .then(decode)
    .catch(() => null)
  cache.set(src, p)
  return p
}

function arm() {
  if (armed || !ctx) return
  armed = true
  armWaiters.splice(0).forEach((f) => f())
}

/** The recordings, in the order they're first needed (the intro: peel, whoosh, pops). */
function loadAll() {
  if (loading) return
  loading = true
  for (const [voice, s] of Object.entries(SAMPLES)) {
    loadSample(s.url).then((buffer) => {
      if (!buffer) return
      if (s.sprite) {
        const segs = splitSprite(buffer.getChannelData(0), buffer.sampleRate, s.sprite)
        if (!segs.length) return
        rec[voice] = { buffer, segs }
      } else rec[voice] = { buffer: s.bed ? prepBed(buffer) : buffer }
    })
  }
}

function buffers(voice) {
  if (bank[voice] || !ctx) return bank[voice]
  const [gen, count] = VOICES[voice]
  bank[voice] = Array.from({ length: count }, (_, i) => {
    const d = gen(ctx.sampleRate, i + 1)
    const b = ctx.createBuffer(1, d.length, ctx.sampleRate)
    b.getChannelData(0).set(d)
    return b
  })
  return bank[voice]
}

/** Resume after an idle or hidden-tab suspend (allowed: the page has had its activation). */
function wake() {
  if (!ctx || ctx.state === 'running' || document.hidden) return null
  if (!waking) waking = ctx.resume().catch(() => {}).finally(() => { waking = null })
  return waking
}

function checkIdle() {
  idleTimer = 0
  const left = IDLE_MS - (performance.now() - lastPlay)
  if (left > 50) idleTimer = setTimeout(checkIdle, left)
  else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {})
}

function touch() {
  lastPlay = performance.now()
  if (!idleTimer) idleTimer = setTimeout(checkIdle, IDLE_MS)
}

const voicePlaying = () => document.documentElement.hasAttribute('data-voice-playing')
const allowed = () => pref && ctx && unlocked && !document.hidden && !voicePlaying()

/** Start one sound. Returns true if it was scheduled. */
function play(voice, { gain = 1, rate = 1, pan = 0, delay = 0, pad = false } = {}, retry = true) {
  const log = HAS_WINDOW && window.__sfxDebug
  if (!allowed()) {
    if (log) log.push({ voice, t: performance.now(), played: false })
    return false
  }
  if (ctx.state !== 'running') {
    const asked = performance.now()
    const w = wake()
    // a one-shot keeps its moment if the context is back within a beat; otherwise it's dropped
    if (w && retry) w.then(() => { if (performance.now() - asked < 250) play(voice, { gain, rate, pan, delay, pad }, false) })
    return false
  }
  if (active >= MAX_VOICES) return false
  const r = rec[voice]
  let src
  if (r) {
    // a recording: one variation of the sprite (never the same twice running), or the whole file
    let seg = null
    if (r.segs) {
      const group = SAMPLES[voice].groups?.[pad ? 'pad' : 'book']
      const ids = group ? group.filter((i) => i < r.segs.length) : r.segs.map((_, i) => i)
      const pool = ids.length ? ids : r.segs.map((_, i) => i)
      let k = Math.floor(Math.random() * pool.length)
      if (pool.length > 1 && pool[k] === lastPick[voice]) k = (k + 1) % pool.length
      lastPick[voice] = pool[k]
      seg = r.segs[pool[k]]
    }
    src = scheduleGrain(ctx, out, r.buffer, { offset: seg ? seg.offset : 0, dur: seg ? seg.dur : r.buffer.duration, gain: gain * LEVEL.rec[voice], rate, pan }, ctx.currentTime + delay, [0, 0.04])
  } else {
    // the synthesised stand-in
    const list = buffers(voice)
    if (!list) return false
    let i = Math.floor(Math.random() * list.length)
    if (list.length > 1 && i === lastPick['s' + voice]) i = (i + 1) % list.length
    lastPick['s' + voice] = i
    src = scheduleGrain(ctx, out, list[i], { gain: gain * LEVEL[voice], rate, pan }, ctx.currentTime + delay, [0, 0.02])
  }
  active++
  const end = src.onended
  src.onended = () => { active--; end?.() }
  touch()
  if (log) log.push({ voice, t: lastPlay, played: true, rec: Boolean(r), gain: +gain.toFixed(2), rate: +rate.toFixed(2), pan: +pan.toFixed(2) })
  return true
}

/** Start a batch of scrub grains from the recording (they're timed from now). */
function playGrains(voice, grains) {
  const r = rec[voice]
  const now = ctx.currentTime
  let n = 0
  for (const g of grains) {
    if (active >= MAX_VOICES) break
    const src = scheduleGrain(ctx, out, r.buffer, { ...g, gain: g.gain * LEVEL.rec[voice] }, now + g.at)
    active++
    const end = src.onended
    src.onended = () => { active--; end?.() }
    n++
  }
  if (n) touch()
  const log = window.__sfxDebug
  if (log && n) log.push({ voice, t: lastPlay, played: true, rec: true, grains: n, gain: +grains[0].gain.toFixed(2) })
}

/* ---------- page wiring ---------- */
// the master's level: full while on, 0 while off or while the voice note plays
const fadeMaster = (tc = FADE) => { if (out) out.gain.setTargetAtTime(pref && !voicePlaying() ? LEVEL.master : 0, ctx.currentTime, tc) }

if (HAS_WINDOW && AC) {
  // once sound is on, a later tap or key brings back a context iOS interrupted (a call, Siri).
  // It never switches sound on, and with sound off (or not yet started) it does nothing at all.
  const rewake = () => { if (pref && ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}) }
  ;['touchend', 'keydown', 'click'].forEach((t) => window.addEventListener(t, rewake, { capture: true, passive: true }))
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ctx && ctx.state === 'running') ctx.suspend().catch(() => {})
  })
  // a voice note starting cuts off any tail straight away
  window.addEventListener('voicenote:state', () => fadeMaster(0.03))
}

/* ---------- public ---------- */

export const sfx = {
  flip: (back = false, o = {}) => play('flip', { rate: (back ? 0.93 : 1) * (0.97 + Math.random() * 0.06), ...o }),
  pop: (o = {}) => play('pop', { rate: 0.94 + Math.random() * 0.12, ...o }),
  whoosh: (o = {}) => play('whoosh', o),
}

/**
 * A scrub stream for 'tear' or 'peel': returns update(p), p in 0..1 (null resets). With the
 * recording loaded it scrubs through it in grains; before that, the synthesised stop-motion grains.
 */
export function scrubSound(kind, opts) {
  const synth = makeScrubber(kind, opts)
  let grains = null
  let len = 0
  return (p) => {
    const now = performance.now()
    const r = rec[kind]
    if (r && (!grains || len !== r.buffer.duration)) { len = r.buffer.duration; grains = makeGrainScrub(kind, len, opts) }
    if (grains) {
      const list = grains(p, now)
      if (list && allowed()) {
        if (ctx.state !== 'running') wake()
        else playGrains(kind, list)
      }
      return
    }
    const g = synth(p, now)
    if (g) play(g.voice, g)
  }
}

/** React: feed a progress value (null when idle) to a scrub stream. */
export function useScrubSound(kind, p, opts) {
  const ref = useRef(null)
  if (!ref.current) ref.current = scrubSound(kind, opts)
  useEffect(() => { ref.current(p) }, [p])
}

/** React: call play() as t (null = off) passes each of `times`, going forwards only. */
export function useSoundCues(t, times, play) {
  const last = useRef(null)
  useEffect(() => {
    const a = last.current
    last.current = t
    if (t == null || a == null || !(t > a)) return
    let n = 0
    for (const x of times) if (a < x && t >= x && n < 3) play({ delay: 0.05 * n++ })
  })
}

/**
 * Page turns on a scrubbed timeline: update(time) plays a flip for each leaf that has just passed
 * standing on edge, either way (a fast scroll past several riffles up to three).
 * cfg: { intro, turn, mid, count } in timeline units, see makeTurnCounter; pad: the notepad's flips.
 */
export function pageTurnSound(cfg) {
  const c = makeTurnCounter(cfg)
  return (time) => {
    const d = c(time)
    for (let i = 0; i < Math.abs(d); i++) sfx.flip(d < 0, { delay: i * 0.075, gain: i ? 0.7 : 1, pad: Boolean(cfg.pad) })
  }
}

/**
 * The shared context and master bus for other sound modules: { ctx, out } while the effects are
 * on and audio is unlocked (and the tab is visible, no voice note playing), else null. Wakes a
 * napping context and holds off the next nap. See the header comment for how to use it.
 */
export function getAudio() {
  if (!AC || !HAS_WINDOW || !allowed()) return null
  if (ctx.state !== 'running') wake()
  touch()
  return { ctx, out }
}

/**
 * Switch the effects on or off (for this page view only). Call it synchronously from the click /
 * key handler itself: switching on creates or resumes the AudioContext inside that gesture (the
 * only moment browsers allow it), starts fetching the recordings and plays a short pop to confirm.
 * Switching off fades the master out (~0.1 s) and then suspends the context.
 */
export function setSound(on) {
  if (!AC || !HAS_WINDOW) return
  pref = Boolean(on)
  clearTimeout(offTimer)
  if (pref) {
    const started = start() // the unlock: right here, inside the press
    arm()
    loadAll()
    fadeMaster(0.01)
    // the confirming pop: the recorded one if it lands within a beat (it's fetched on this very press)
    started.then(() => {
      const beat = new Promise((r) => setTimeout(r, 220))
      Promise.race([loadSample(SAMPLES.pop.url), beat]).then(() => { if (pref) play('pop', { gain: 0.9, rate: 1.12 }) })
    })
  } else if (ctx) {
    fadeMaster()
    offTimer = setTimeout(() => { if (!pref && ctx.state === 'running') ctx.suspend().catch(() => {}) }, 120)
  }
  emit()
}

/** The sound button's action: flips what it shows. */
export const toggleSound = () => setSound(!pref)

const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
/** Calls f() whenever the state changes (sound switched on or off, or it goes live). */
export const onSoundLive = subscribe
const getSnap = () => state
const getServerSnap = () => state
/** { supported, on (the preference: what the toggle shows), live (on and allowed to play yet) } */
export const useSound = () => useSyncExternalStore(subscribe, getSnap, getServerSnap)
