/*
 * Expression sounds: a short internet-meme sound effect when the visitor taps or clicks the sticker
 * head and it pulls a face (hero and footer), and once as the hero's face turns surprised on scroll.
 * Wink → the Rizz sound, laugh → the Clash Royale King's "he-he-he-haw", confused → Huh cat, and so
 * on: stings and vocal bursts only, no spoken words. Files and sources: public/assets/sfx/expr/README.md.
 *
 *   sfxExpr(nameOrUrl)   play the cue for an expression ('wink', or '/assets/me/expressions/wink.webp')
 *
 * Rules it keeps:
 *  - Only ever called from a tap/click on the face (FaceTracker's onActivate), never for the
 *    expressions the head pulls by itself while idle; plus 'surprised', once each time the hero's
 *    scroll peel-off swaps that face in (App.jsx).
 *  - Rides the shared sound system (src/lib/sound.js): its AudioContext and master bus, so the
 *    header's sound button, the hidden-tab and voice-note mutes all apply. A no-op until the
 *    visitor switches sound on (it's off on every visit), while it's off, or where unsupported.
 *  - The files (~115 KB in all) are fetched only once sound is on, in idle time. A tap before
 *    they're in still gets its cue if the file lands within a beat, otherwise it's skipped
 *    (never late).
 *  - Mashing doesn't stack: one cue at a time (a new one cuts the last with a quick fade), at most
 *    one per COOLDOWN ms, and a longer gap once the taps come in a flurry. Variants alternate and
 *    each play is nudged a hair in pitch and level, so repeats don't sound canned.
 *
 * Swapping in his own recordings: drop `<name>.mp3` (and optionally `<name>-2.mp3`) into
 * public/assets/sfx/expr/ and list them in FILES below. Any length works; up to ~1.3 s (an
 * expression holds for 1.1 s).
 */
import { getAudio, loadSample, onSoundLive } from './sound.js'

const BASE = `${import.meta.env?.BASE_URL || '/'}assets/sfx/expr/`
/** expression name → its files (variants alternate). Names match the images in /assets/me/expressions/. */
const FILES = {
  smile: ['smile.mp3'], // Super Mario coin
  laugh: ['laugh.mp3'], // Clash Royale King laugh
  wink: ['wink.mp3', 'wink-2.mp3'], // Rizz / anime wink "ting"
  'happy-surprise': ['happy-surprise.mp3'], // heavenly choir "aaah"
  thinking: ['thinking.mp3'], // Jeopardy! "Think!" opening notes
  confused: ['confused.mp3', 'confused-2.mp3'], // Huh cat / Windows XP error
  surprised: ['surprised.mp3'], // the scroll peel-off face (App.jsx): vine boom
}
const LEVEL = 1.05 // into the master bus: ~8 LU over a page flip, well above the scroll's paper sounds (was 0.6)
const COOLDOWN = 380 // ms between cues
const FLURRY = { taps: 4, within: 2200, gap: 900 } // this many cues this fast → wait longer
const LATE = 260 // ms: a cue that can't start within this of the tap is dropped
const HAS_WINDOW = typeof window !== 'undefined'

const buffers = {} // file → AudioBuffer | Promise | null (failed)
const lastPick = {}
let recent = [] // times of recent cues
let current = null // { src, g }
let preloaded = false

/* ---------- the shared context (owned by sound.js) ---------- */

/** { ctx, out } while effects are on and allowed to play, else null. */
function audio() {
  const a = getAudio()
  if (!a) return null
  if (HAS_WINDOW && (document.hidden || document.documentElement.hasAttribute('data-voice-playing'))) return null
  return a
}

/** The decoded buffer for a file, or a promise of it (null if it failed). Shared loader, cached. */
function load(file) {
  if (file in buffers) return buffers[file]
  const p = loadSample(BASE + file)
    .then((buf) => (buffers[file] = buf || null))
    .catch(() => (buffers[file] = null))
  buffers[file] = p
  return p
}

function preload() {
  if (preloaded) return
  const a = audio()
  if (!a) return
  preloaded = true
  const later = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(f, 200)
  later(() => Object.values(FILES).flat().forEach(load))
}

if (HAS_WINDOW) {
  // once sound is switched on and live (until the files are on their way)
  const stop = onSoundLive(() => {
    if (preloaded) return
    preload()
    if (preloaded) stop()
  })
}

/* ---------- playing ---------- */

/** 'wink' or '/assets/me/expressions/wink.webp' → 'wink' */
const nameOf = (x) => String(x || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '')

function pickFile(name) {
  const list = FILES[name]
  if (!list || !list.length) return null
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length
  lastPick[name] = i
  return list[i]
}

function start(a, buf, name) {
  const { ctx, out } = a
  const now = ctx.currentTime
  if (current) {
    // one cue at a time: the last one ducks out in ~25 ms
    try {
      current.g.gain.setTargetAtTime(0, now, 0.008)
      current.src.stop(now + 0.06)
    } catch { /* already over */ }
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 0.97 + Math.random() * 0.06
  const g = ctx.createGain()
  g.gain.value = LEVEL * (0.9 + Math.random() * 0.1)
  src.connect(g)
  g.connect(out)
  const me = { src, g }
  current = me
  src.onended = () => {
    if (current === me) current = null
    try { src.disconnect(); g.disconnect() } catch { /* gone */ }
  }
  src.start(now)
  if (HAS_WINDOW && window.__sfxDebug) window.__sfxDebug.push({ voice: 'expr:' + name, t: performance.now(), played: true })
  return true
}

/**
 * Play the cue for an expression the visitor just triggered (call it on the tap, as the frame
 * shows). Returns true if a cue was started or is on its way.
 */
export function sfxExpr(expr) {
  const name = nameOf(expr)
  const log = HAS_WINDOW && window.__sfxDebug
  const a = audio()
  const t = HAS_WINDOW ? performance.now() : 0
  const skip = (why) => { if (log) log.push({ voice: 'expr:' + name, t, played: false, why }); return false }
  if (!a) return skip('off')
  if (!FILES[name]) return skip('unknown')
  recent = recent.filter((x) => t - x < FLURRY.within)
  const last = recent[recent.length - 1]
  if (last != null && t - last < (recent.length >= FLURRY.taps - 1 ? FLURRY.gap : COOLDOWN)) return skip('cooldown')
  recent.push(t)
  preload()
  const file = pickFile(name)
  const b = load(file)
  const ready = (buf) => {
    if (!buf) return false
    const late = performance.now() - t
    if (late > LATE) return skip('late')
    const now = audio()
    if (!now) return skip('off')
    if (now.ctx.state === 'running') return start(now, buf, name)
    // sound.js lets the context nap when it's quiet: wake it (we're inside the tap) and go if it's quick
    now.ctx.resume().then(() => { if (performance.now() - t < LATE && audio()) start(now, buf, name) }, () => {})
    return true
  }
  if (b && typeof b.then === 'function') { b.then(ready); return true }
  return ready(b)
}
