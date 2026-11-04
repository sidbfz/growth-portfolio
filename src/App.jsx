import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { theme } from './theme.js'
import { site } from './content.js'
import { useLenis, prefersReduced } from './lib/motion.js'
import { Float } from './components/Bits.jsx'
import FaceTracker from './components/FaceTracker.jsx'
import PaperTear from './components/PaperTear.jsx'
import VronteTry from './sections/VronteTry.jsx'
import NotebookSection from './sections/Notebook.jsx'
import { About, Footer } from './sections/About.jsx'
import TornHead, { aboveTearClip, tearLine } from './components/TornHead.jsx'
import CoverPeel, { useBoxSize, peeledClip, useSilhouette, FoldFlap, clipHalf, toClip, useHardMask, peelTip, CoverFlap, coverState, N } from './components/CoverPeel.jsx'
import { VoiceButton, HeaderVoice, VoiceCaption } from './components/VoiceNote.jsx'
import { arrow } from './components/Marker.jsx'
import { introReady, whenVisible, waiting, toTop, lockScroll, watchSkip } from './lib/introGate.js'
import { SWEEP_END } from './components/CoverPeel.jsx'
import { sfx, useScrubSound, useSoundCues, useSound, toggleSound } from './lib/sound.js'
import { sfxExpr } from './lib/sound-expr.js'
import SoundHint, { markIntroDone } from './components/SoundHint.jsx'

// the voice buttons show once a recording is set in content.js
const HAS_VOICE = Boolean(site.voiceNote?.src)

// phones, plus portrait tablets: the hero stacks (name, head, then line and CTAs) — keep in sync with App.css
const MOBILE = '(max-width: 760px), (orientation: portrait) and (max-width: 1100px)'
const INTRO_PARAM = parseFloat(new URLSearchParams(location.search).get('intro'))
// the sticker intro plays on every page load: not under reduced motion, and not when
// ?intro=<0..1> freezes it for a screenshot
const PLAY_INTRO = isNaN(INTRO_PARAM) && !prefersReduced()
// what the intro shows besides the head (introGate waits on the head itself, its silhouette and paper):
// the glances during the peel and the objects that come out of the opening
const INTRO_ASSETS = [...['upLeft', 'up', 'upRight', 'right'].map((k) => site.heroFrames[k]), ...Object.values(site.heroProps)]
if (PLAY_INTRO) {
  // from the very first frame: a plain page (no header) and no scroll position carried over from
  // before the reload, so the intro never plays off screen (useIntro takes it from here)
  try { history.scrollRestoration = 'manual' } catch { /* old browsers: useIntro's toTop covers it */ }
  waiting(true)
}

/** matchMedia as state. */
function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setOn(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return on
}

/** window.scrollY, plus the screen-space top of `ref` (if given), refreshed once per frame on scroll/resize. */
function useScrollFrame(ref) {
  const [st, setSt] = useState({ y: 0, top: 0, vw: window.innerWidth })
  useLayoutEffect(() => {
    let id = 0
    const read = () => {
      id = 0
      const y = window.scrollY
      const top = ref && ref.current ? ref.current.getBoundingClientRect().top : 0
      const vw = window.innerWidth
      setSt((o) => (o.y === y && o.vw === vw && Math.abs(o.top - top) < 0.5 ? o : { y, top, vw }))
    }
    const on = () => { if (!id) id = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(id) }
  }, [])
  return st
}

/**
 * The sound button (src/lib/sound.js): a pill like the name's, top right. Sound is off on every
 * visit and this is the only way to turn it on: no other click or key does, so the page never
 * starts making noise by surprise. The press itself unlocks audio (toggleSound runs inside the
 * click), fetches the recordings and pops to confirm; pressing again fades everything out.
 */
function SoundToggle() {
  const { supported, on } = useSound()
  if (!supported) return null
  return (
    <button type="button" className={`hsnd ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={toggleSound}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="hsnd__spk" d="M3.8 9.6h3.1l4.4-3.7v12.2l-4.4-3.7H3.8z" />
        <path className="hsnd__w hsnd__w1" d="M14.7 9.4c1.3 1.5 1.3 3.7 0 5.2" />
        <path className="hsnd__w hsnd__w2" d="M17.3 6.9c2.6 2.9 2.6 7.3 0 10.2" />
        <path className="hsnd__x" d="M15.2 9.7l4.6 4.6M19.8 9.7l-4.6 4.6" />
      </svg>
      <span className="hsnd__label"><span className="hsnd__word">Sound </span><span className="hsnd__state">{on ? 'on' : 'off'}</span></span>
    </button>
  )
}

/**
 * Name left, voice note and sound button right (the sound button in the corner, so it never moves). The voice pill stays hidden while the hero's own voice button is on
 * screen (one voice button at a time), and fades in once that has scrolled away; the small name
 * comes in once the giant one has scrolled out from under the header. While the note plays, the
 * captions hang under whichever of the two buttons is showing.
 */
function Header() {
  const { y, vw } = useScrollFrame()
  const title = typeof document !== 'undefined' ? document.querySelector('.hero__title') : null
  const solid = title ? title.getBoundingClientRect().bottom < 40 : y > 0.2 * vw
  return (
    <header className={`hdr ${solid ? 'hdr--solid' : ''}`}>
      <a className="hdr__logo" href="#top" tabIndex={solid ? 0 : -1} aria-hidden={!solid}><span>{site.name}</span></a>
      <div className="hdr__right">
        {HAS_VOICE && <HeaderVoice />}
        <SoundToggle />
        {/* "psst… sound on?": a marker note at the pill, after the intro, while the hero is up */}
        <SoundHint away={solid} />
        {HAS_VOICE && <VoiceCaption />}
      </div>
    </header>
  )
}

// The intro, in ms
// from the moment the sticker has decoded:
//   RISE   the whole-head sticker comes up from below the screen, growing a touch, and lands
//   TITLE  the giant name slides up out of its line, behind the head, as the head settles
//   PEEL   the lid (the top of the head, above the tear) peels off from the left end of the tear,
//          curls up and over to the right and is thrown off up and to the right (CoverPeel's
//          progress 0 → 1); the objects rise out of the opening as it uncovers them (propStarts);
//          the eyes follow the lid: up-left, up, up-right (never down), and look straight back at
//          the visitor as soon as it has been thrown off the head (gazeSchedule)
//   END    hand back to the cursor (the face stays straight ahead until the pointer really moves)
const IN = { rise: [0, 800], title: [540, 1300], peel: [860, 2200], prop: 560, end: 2300 }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const span = (ms, [a, b]) => clamp01((ms - a) / (b - a))
// a soft landing: out-ease with a small overshoot (~1.5%), nothing springy
const backOut = (t, s = 0.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

/**
 * The sticker intro's clock, in ms (0 → IN.end; IN.end = done). It plays on every page load, never
 * under reduced motion. Until the head sticker and what its peel needs are decoded (introGate: a
 * split second, capped) the page is a plain sheet; the clock starts on the next frame with the tab
 * on screen. It runs on the frames actually shown (each step capped at MAX_STEP, none counted while
 * the tab is hidden or the page sits in the back/forward cache), so it carries on from where it was
 * instead of jumping to the end. Once it runs, the visitor's own wheel, touch drag or scrollbar drag
 * skips to the end (watchSkip); a programmatic or restored scroll never does (the page just goes
 * back to the top), nor does a click, a tap or a key. The page can't scroll from first paint until
 * the intro ends or is skipped. The value note and the voice button are live throughout.
 */
const MAX_STEP = 250 // ms: the most the clock moves in one frame (a slow machine's long frames still count)
function useIntro(src) {
  // dev aid: ?intro=0.4 freezes the intro at that fraction of its timeline (?intro=1 skips it)
  const frozen = INTRO_PARAM
  const [t0] = useState(() => (!isNaN(frozen) ? clamp01(frozen) * IN.end : PLAY_INTRO ? 0 : IN.end))
  const [t, setT] = useState(t0)
  useLayoutEffect(() => {
    if (!isNaN(frozen) || t0 >= IN.end) { waiting(false); return }
    let id = 0
    let alive = true
    let started = Infinity // when the clock started: only a wheel gesture begun after it skips
    let unresume = () => {}
    waiting(true)
    const release = lockScroll() // through the wait and the intro
    toTop()
    const watch = watchSkip(() => end(true), () => started)
    function end(skipped) {
      if (!alive) return
      alive = false
      cancelAnimationFrame(id)
      watch.stop()
      unresume()
      release()
      waiting(false)
      if (skipped) setT(IN.end)
    }
    introReady({ head: src, assets: INTRO_ASSETS }).then(async (go) => {
      if (!alive) return
      if (go !== 'play') { end(true); return } // the head never came: show the finished hero
      await whenVisible()
      if (!alive) return
      toTop()
      waiting(false)
      let clock = 0
      let last = -1
      // hidden (or frozen) and back: carry on from the same moment, not from where the wall clock is
      const resume = () => { last = -1 }
      document.addEventListener('visibilitychange', resume)
      window.addEventListener('pageshow', resume)
      unresume = () => { document.removeEventListener('visibilitychange', resume); window.removeEventListener('pageshow', resume) }
      const step = (now) => {
        if (!alive) return
        if (last >= 0) clock += Math.min(MAX_STEP, Math.max(0, now - last))
        last = now
        const x = Math.min(IN.end, clock)
        setT(x)
        if (x < IN.end) id = requestAnimationFrame(step)
        else end(false)
      }
      started = performance.now()
      watch.arm()
      id = requestAnimationFrame(step)
    })
    return () => end(false)
  }, [])
  return t
}

// the eye frames the face runs through while the lid travels, in order (it never looks back, and
// never down: the lid only ever moves up and to the right of where it starts)
const GAZE = ['upLeft', 'up', 'upRight', 'right']
const GAZE_DEG = { upLeft: -135, up: -90, upRight: -45, right: 0 }
const GAZE_GAP = 0.08 // each glance holds for at least this much of the peel (~110ms): stop-motion, never a flicker
/**
 * When (in peel progress) each glance starts: the first moment the lifting lid (the middle of its
 * loose part, see peelTip) lies nearest that direction from between the eyes, spaced out by GAZE_GAP;
 * and `back`: when it has been thrown clear of the head, and the face looks back at the visitor.
 */
function gazeSchedule(w, h, pts) {
  if (!w || !pts) return null
  const [ax, ay] = site.heroEyeAnchor
  const at = GAZE.map(() => Infinity)
  at[0] = 0
  let best = 0
  let back = 0.92
  for (let q = 0.005; q < 1; q += 0.005) {
    const c = peelTip(q, w, h, pts, TEAR_LINE)
    if (!c) continue
    if (c[1] < -0.3 * h || c[0] > 1.45 * w) { back = q; break } // (about off the screen)
    const ang = (Math.atan2(c[1] - ay * h, c[0] - ax * w) * 180) / Math.PI
    let i = 0
    let gap = Infinity
    GAZE.forEach((g, j) => { const d = Math.abs(((ang - GAZE_DEG[g] + 540) % 360) - 180); if (d < gap) { gap = d; i = j } })
    for (let j = best + 1; j <= i; j++) at[j] = q
    best = Math.max(best, i)
  }
  for (let j = 1; j < at.length; j++) if (at[j] !== Infinity) at[j] = Math.max(at[j], at[j - 1] + GAZE_GAP)
  return { at, back: Math.max(back, at[best] + GAZE_GAP) }
}

/**
 * When (ms) each object starts rising out of the opening: once the lid has come loose over the
 * tear where it stands (its centre, in % of the head box, as placed in App.css), so the opening is
 * there before anything comes out of it. They all finish before the intro ends.
 */
const PROP_X = { mic: 19, book: 32.1, heart: 37.4, laptop: 52.2, camera: 74.5 }
function propStarts(w, h, pts) {
  const out = {}
  const dur = IN.peel[1] - IN.peel[0]
  Object.entries(PROP_X).forEach(([k, x], i) => {
    let ms = IN.peel[0] + 140 * i + 120 // (unmeasured: one after the other)
    if (w) {
      const y = TEAR_LINE.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b))[1]
      const v = (x * w * N[0] + y * h * N[1]) / 100 + 0.02 * w
      for (let q = 0; q <= 1; q += 0.005) if (coverState(q, w, h, pts, TEAR_LINE).d >= v) { ms = IN.peel[0] + q * dur; break }
    }
    out[k] = Math.min(ms, IN.end - IN.prop * 0.7)
  })
  return out
}

/**
 * HOVER: with a mouse (or pen), an object near the pointer gives a little, each on its own: it's
 * nudged away from the pointer and dragged along as the pointer brushes through it, leaning a few
 * degrees the way it's pushed, on a soft spring that settles it back once the pointer has gone. At
 * most ~1.2% of the head's width (≈ 10px on a laptop) and 5°. It moves each object's inner layer
 * (.hp__in), so the float bob and the intro rise on the .hp wrapper are untouched, and the objects
 * stay under their clips (a nudge down only tucks more of one under the torn edge). The objects take
 * no pointer events: the eyes and the face tap never notice. Off for touch, under reduced motion and
 * until the intro is over; the frame loop only runs while the pointer or an object is moving.
 */
function usePropsHover(ref, on, hw) {
  useEffect(() => {
    const root = ref.current
    if (!on || !root || !hw || prefersReduced()) return
    const items = [...root.querySelectorAll('.hp')].map((el) => ({ el, layer: el.querySelector('.hp__in'), x: 0, y: 0, vx: 0, vy: 0, css: '' }))
    const max = Math.min(12, Math.max(3, hw * 0.012)) // px
    const K = 120 // spring stiffness (1/s²) and damping (1/s): a little give, one soft overshoot
    const D = 15
    const DRAG = 0.25 * max // how far a brush at ~600px/s carries it: ~3/4 of max at the centre
    let p = null // the pointer (client px), while it's a mouse over the window
    let prev = null
    let ux = 0 // its velocity (px/s), smoothed
    let uy = 0
    let t0 = 0
    let id = 0
    const frame = (t) => {
      id = 0
      const dt = Math.min(0.05, t0 ? Math.max(0.001, (t - t0) / 1000) : 1 / 60)
      t0 = t
      if (p && prev) {
        const a = 1 - Math.exp(-dt / 0.05)
        ux += ((p.x - prev.x) / dt - ux) * a
        uy += ((p.y - prev.y) / dt - uy) * a
      } else ux = uy = 0
      prev = p && { ...p }
      const rects = items.map((o) => o.el.getBoundingClientRect()) // (reads first, then writes)
      let busy = Math.hypot(ux, uy) > 2
      items.forEach((o, i) => {
        const r = rects[i]
        let tx = 0
        let ty = 0
        let fx = 0
        let fy = 0
        if (p && r.width) {
          const R = 0.55 * Math.max(r.width, r.height) // "near": a bit past the image's own box
          const dx = r.left + r.width / 2 - p.x // from the pointer to the object's centre
          const dy = r.top + r.height / 2 - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < R) {
            const n = 1 - dist / R
            const f = n * n * (3 - 2 * n) // 1 at the centre, easing to 0 at R
            const push = 0.45 * max * Math.sin(Math.PI * (dist / R)) // away from the pointer
            tx = dist ? (dx / dist) * push : 0
            ty = dist ? (dy / dist) * push : 0
            fx = ux * f * DRAG
            fy = uy * f * DRAG
          }
        }
        o.vx += (K * (tx - o.x) - D * o.vx + fx) * dt
        o.vy += (K * (ty - o.y) - D * o.vy + fy) * dt
        o.x += o.vx * dt
        o.y += o.vy * dt
        // settled (on its push, or back home): stop here until the pointer moves or the page scrolls
        const settled = Math.abs(tx - o.x) + Math.abs(ty - o.y) < 0.05 && Math.abs(o.vx) + Math.abs(o.vy) < 0.5
        if (!settled) busy = true
        let css = ''
        if (settled && !tx && !ty) o.x = o.y = o.vx = o.vy = 0
        else {
          const m = Math.hypot(o.x, o.y)
          const k = m > 0 ? (max * Math.tanh(m / max)) / m : 0 // a soft cap at max
          const rot = 5 * Math.tanh(o.x / max) // leans the way it's pushed
          css = `translate3d(${(o.x * k).toFixed(2)}px, ${(o.y * k).toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg)`
        }
        if (css !== o.css) { o.css = css; o.layer.style.transform = css }
      })
      if (busy) id = requestAnimationFrame(frame)
      else t0 = 0
    }
    const kick = () => { if (!id) id = requestAnimationFrame(frame) }
    const move = (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      p = { x: e.clientX, y: e.clientY }
      kick()
    }
    const out = (e) => { if (!e.relatedTarget && p) { p = prev = null; kick() } } // left the window
    const opts = { passive: true }
    window.addEventListener('pointermove', move, opts)
    window.addEventListener('scroll', kick, opts) // the objects move under a resting pointer
    document.addEventListener('mouseout', out, opts)
    return () => {
      window.removeEventListener('pointermove', move, opts)
      window.removeEventListener('scroll', kick, opts)
      document.removeEventListener('mouseout', out, opts)
      cancelAnimationFrame(id)
      items.forEach((o) => { if (o.layer) o.layer.style.transform = '' })
    }
  }, [ref, on, hw])
}

/** true once `on` has stayed true for `ms`. */
function useAfter(on, ms) {
  const [done, setDone] = useState(on && prefersReduced())
  useEffect(() => {
    if (!on) { setDone(false); return }
    const id = setTimeout(() => setDone(true), ms)
    return () => clearTimeout(id)
  }, [on, ms])
  return done
}

/** Fetch + decode images up front, so later swaps never show a blank frame. */
function usePreload(urls) {
  useEffect(() => {
    urls.forEach((u) => { const i = new Image(); i.src = u; i.decode?.().catch(() => {}) })
  }, [])
}

/** Mobile only: ‹ › arrows beside the head and a paper pill naming a section, cycling. */
function HeadCarousel({ labels }) {
  const uid = useId().replace(/:/g, '')
  const [i, setI] = useState(0)
  const [kick, setKick] = useState(0) // restarts the autoplay after a tap
  useEffect(() => {
    if (prefersReduced()) return
    const id = setInterval(() => setI((v) => (v + 1) % labels.length), 2800)
    return () => clearInterval(id)
  }, [labels.length, kick])
  const go = (dir) => { setI((v) => (v + dir + labels.length) % labels.length); setKick((k) => k + 1) }
  const chev = (d) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return (
    <>
      <button className="hcar__arrow hcar__arrow--prev" aria-label="Previous" onClick={() => go(-1)}>{chev('M14.5 6 8.5 12l6 6')}</button>
      <button className="hcar__arrow hcar__arrow--next" aria-label="Next" onClick={() => go(1)}>{chev('M9.5 6l6 6-6 6')}</button>
      <div className="hcar__label" aria-live="polite">
        <span className="hcar__pill" key={i}>
          <svg className="hcar__paper" viewBox="0 0 184 68" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id={`hcarRough${uid}`} x="-5%" y="-10%" width="110%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3" />
                <feDisplacementMap in="SourceGraphic" scale="4.5" />
              </filter>
            </defs>
            <rect x="4" y="4" width="176" height="60" rx="30" fill="#f7f7f1" filter={`url(#hcarRough${uid})`} />
          </svg>
          <span className="hcar__text">{labels[i]}</span>
        </span>
      </div>
    </>
  )
}

const HERO_FACES = Object.values(site.heroFrames)
const HERO_NO_EXPR = []
const HERO_PRELOAD = [...Object.values(site.heroFrames), ...site.heroExpressions, site.heroSurprised]
const HERO_LABELS = site.heroLabels || []
const TEAR = { base: 36.5, seed: 5 } // on the forehead (hairline ~26-30%, brow tops ~41-43%): its lowest dip (+3.1 at x≈41%) stays ~2% clear of the brows
const TEAR_LINE = tearLine(1, TEAR.base, TEAR.seed) // (% of the head box) the lid's lower edge, shared by everything that follows it
// Scroll choreography, measured off the reference (it is the same on desktop and mobile):
// the hero simply scrolls; when the torn top nears the top of the screen the face cuts to the
// surprised one, then that sticker peels off from its chin upwards along a ~33° crease that
// sweeps up the page about twice as fast as the page scrolls.
const FOLD_N = [0.545, -0.838] // unit normal of the crease, pointing at the part still stuck down
const FOLD_SPEED = 1.57 // px the crease moves along FOLD_N per px scrolled
const SWAP_AT = 30 // screen y of the tear at which the face turns surprised
const PEEL_OFF = { level: 0.79 } // its sound: -2 dB under the intro's peel, so the surprised face's vine boom leads
// ...and the crease reaches the chin when the tear is at screen y 22 - 0.028·(head height): ~-14 on desktop, ~12 on a phone

/** Where the crease first touches the head (d0) and where it has passed all of it (d1), in px along FOLD_N. */
function foldRange(pts, w, h) {
  if (!pts || !w) return null
  const [nx, ny] = FOLD_N
  const below = TEAR.base / 100 - 0.04
  let d0 = Infinity
  let d1 = -Infinity
  for (const [x, y] of pts) {
    const v = x * w * nx + y * h * ny
    if (v < d0) d0 = v
    if (y >= below && v > d1) d1 = v
  }
  return d0 < d1 ? { d0: d0 - 2, d1 } : null
}

/** The value line; accent segments render pink. */
function HeroLine() {
  return (
    <p className="hero__line">
      {site.heroLine.map((seg, i) => <span key={i} className={seg.accent ? 'u-accent' : undefined}>{seg.t}</span>)}
    </p>
  )
}

// the note's hand-drawn arrows (marker strokes): beside the face it points right at the head; on a
// phone, where the note sits under the name, it curls down into the head
const ARROW_SIDE = arrow([8, 50], [88, 20], 16, 15)
const ARROW_DOWN = arrow([8, 6], [40, 50], -10, 13)

function Hero() {
  const ms = useIntro(site.heroFrames.center)
  const done = ms >= IN.end
  const intro = span(ms, IN.peel) // the lid's peel, 0 → 1
  // the face is looking straight ahead by now (see gazeNow); hand it to the cursor right after
  const live = useAfter(done, 100)
  useEffect(() => { if (done) markIntroDone() }, [done]) // the sound hint waits for this
  usePreload(HERO_PRELOAD)
  const headRef = useRef(null)
  const peelRef = useRef(null)
  const mouthRef = useRef(null)
  const { w: hw, h: hh } = useBoxSize(headRef)
  const sil = useSilhouette(site.heroFrames.center)
  const silS = useSilhouette(site.heroSurprised)
  const flapMask = useHardMask(site.heroSurprised)
  const { top } = useScrollFrame(headRef)
  const mobile = useMedia(MOBILE)
  const reduced = prefersReduced()
  // (the mic pokes out past the head's outline: keep every object hidden until the lid has left it)
  const propsClip = intro <= 0 ? 'polygon(0 0, 0 0, 0 0)' : peeledClip(intro, hw, hh, sil, TEAR_LINE)

  // RISE: from just below the bottom of the screen (measured untransformed), growing ~8%, landing
  // with a small overshoot; its shadow tightens as it lands
  const [riseFrom, setRiseFrom] = useState(() => window.innerHeight)
  useLayoutEffect(() => {
    const el = peelRef.current
    if (!el || done) return
    let y = 0
    for (let n = el; n; n = n.offsetParent) y += n.offsetTop
    setRiseFrom(Math.max(120, window.innerHeight - (y - window.scrollY) + 30))
  }, [])
  const rise = done ? 1 : backOut(span(ms, IN.rise))
  const riseStyle = rise >= 1 && ms >= IN.rise[1] ? undefined : {
    transform: `translate3d(0, ${((1 - rise) * riseFrom).toFixed(1)}px, 0) scale(${(0.92 + 0.08 * rise).toFixed(4)})`,
    '--lift': clamp01(1 - rise).toFixed(3),
  }
  // TITLE: the name slides up out of its line, behind the head, as the head lands
  const title = done ? 1 : expoOut(span(ms, IN.title))
  // the note and the voice button fade in as the head lands (they're live throughout)
  const pitch = done ? 1 : span(ms, [IN.rise[1] - 350, IN.rise[1] + 150])
  // the objects bob up out of the opening as the lid uncovers each one
  const starts = useMemo(() => propStarts(hw, hh, sil), [hw, hh, sil])
  const propRise = (k) => {
    if (done) return undefined
    const a = starts[k]
    const e = backOut(span(ms, [a, Math.min(IN.end, a + IN.prop)]), 1.4) // straight up, a small overshoot
    // (from far enough down that all of it starts under the torn edge: the mic stands out past the head)
    return { translate: `0 ${((1 - e) * 96).toFixed(2)}%` }
  }
  // EYES: the face (and the lid, which shows the same drawing) looks at the lifting lid, then,
  // once it has been thrown off, straight back at the visitor
  const schedule = useMemo(() => gazeSchedule(hw, hh, sil), [hw, hh, sil])
  const glance = ms < IN.peel[0] + 30 || !schedule || intro >= schedule.back ? 'center' : GAZE[schedule.at.findLastIndex((q) => intro >= q)] || 'upLeft'
  // ended or skipped: straight ahead (FaceTracker then keeps it there until the pointer really moves)
  const gaze = done ? 'center' : glance
  const mouthClip = aboveTearClip(1, TEAR.base, TEAR.seed, 1.5)
  const props = site.heroProps
  usePropsHover(mouthRef, done, hw)

  // the torn head and its objects scroll with the page, untouched; only the face reacts
  const tear = top + (hh * TEAR.base) / 100
  const surprised = hw > 0 && tear < SWAP_AT
  const range0 = useMemo(() => foldRange(silS, hw, hh), [silS, hw, hh])
  const d = range0 ? range0.d0 + FOLD_SPEED * (22 - 0.028 * hh - tear) : 0
  const peeling = !reduced && range0 && d > range0.d0
  const gone = peeling && d > range0.d1 + (range0.d1 - range0.d0) * 1.5
  // the curl starts almost edge-on (a thin rim) and lies back to ~0.6 as more comes loose
  const k = peeling ? 0.6 * Math.min(1, (d - range0.d0) / (0.2 * hw)) : 0
  const box = [[-hw, -hh], [hw * 2, -hh], [hw * 2, hh * 2], [-hw, hh * 2]]
  const stuck = peeling ? toClip(clipHalf(box, d, 'stuck', FOLD_N)) : undefined
  const torn = useMemo(() => {
    if (!hw) return null
    const line = tearLine(1, TEAR.base, TEAR.seed).map(([x, v]) => [(x * hw) / 100, (v * hh) / 100])
    return [...line, [hw * 1.03, hh * 1.03], [-hw * 0.03, hh * 1.03]]
  }, [hw, hh])
  // SOUND (src/lib/sound.js): the lid's sticky rasp follows its sweep, a whoosh as it's thrown off,
  // a soft pop as each object comes up; later the surprised face's peel-off rasps with the scroll
  useScrubSound('peel', done || intro <= 0 ? null : coverState(intro, hw, hh, sil, TEAR_LINE).s)
  useSoundCues(done ? null : intro, [SWEEP_END], sfx.whoosh)
  useSoundCues(done ? null : ms, Object.values(starts).map((a) => a + 0.25 * IN.prop), sfx.pop)
  useScrubSound('peel', peeling && !gone ? Math.min(1, (d - range0.d0) / (range0.d1 - range0.d0)) : null, PEEL_OFF)
  useEffect(() => { if (surprised) sfxExpr('surprised') }, [surprised]) // its meme cue, once per swap

  return (
    <section className={`hero ${done ? 'is-ready' : pitch <= 0 ? 'is-hush' : 'is-unhush'}`} id="top" style={pitch < 1 ? { '--pitch': pitch.toFixed(3) } : undefined}>
      <h1 className="hero__title" style={title < 1 ? { '--tin': (1 - title).toFixed(4) } : undefined}>
        <span className="hero__name">{site.name}</span>
      </h1>

      {/* the value line, as a marker note: beside the face at eye level on wide screens, under the
          name on a phone; the voice button sits under it (on a phone, under the head) */}
      <div className="hero__pitch">
        <div className="hero__note">
          <HeroLine />
          <svg className="hero__arrow hero__arrow--side" viewBox="0 0 100 70" aria-hidden="true">{ARROW_SIDE.map((d, i) => <path key={i} d={d} pathLength="1" style={{ '--sub': i }} />)}</svg>
          <svg className="hero__arrow hero__arrow--down" viewBox="0 0 50 60" aria-hidden="true">{ARROW_DOWN.map((d, i) => <path key={i} d={d} pathLength="1" style={{ '--sub': i }} />)}</svg>
        </div>
        {HAS_VOICE && (
          <div className="hero__ctas">
            <VoiceButton />
            <VoiceCaption where="hero" />
          </div>
        )}
      </div>

      <div className={`hero__stage ${peeling ? 'is-peeling' : ''}`}>
        <div className="hero__peel" ref={peelRef} style={{ clipPath: stuck, WebkitClipPath: stuck, visibility: gone ? 'hidden' : undefined, ...riseStyle }}>
          <div className="hero__props" style={{ clipPath: propsClip, WebkitClipPath: propsClip }}>
            {/* five 3D objects poking out of the tear; back to front */}
            <div className="hero__mouth" ref={mouthRef} style={{ clipPath: mouthClip, WebkitClipPath: mouthClip }}>
              <Float seed={2} amp={9} className="hp hp--book" style={propRise('book')}><div className="hp__in"><img src={props.book} alt="" /></div></Float>
              <Float seed={6} amp={8} className="hp hp--camera" style={propRise('camera')}><div className="hp__in"><img src={props.camera} alt="" /></div></Float>
              <Float seed={3} amp={11} className="hp hp--laptop" style={propRise('laptop')}><div className="hp__in"><img src={props.laptop} alt="" /></div></Float>
              <Float seed={1} amp={8} className="hp hp--mic" style={propRise('mic')}><div className="hp__in"><img src={props.mic} alt="" /></div></Float>
              <Float seed={4} amp={9} className="hp hp--heart" style={propRise('heart')}><div className="hp__in"><img src={props.heart} alt="" /></div></Float>
            </div>
          </div>
          <div className="hero__head" ref={headRef}>
            <TornHead open={1} base={TEAR.base} seed={TEAR.seed} maskSrc={site.heroFrames.center}>
              {/* a hard cut, never a cross-fade: the two drawings don't line up */}
              <div className={`hero__face ${surprised ? 'is-hidden' : ''}`}>
                <FaceTracker frames={site.heroFrames} expressions={live ? site.heroExpressions : HERO_NO_EXPR} forceFrame={live ? undefined : gaze} anchor={site.heroEyeAnchor} size="100%" />
              </div>
              <img className={`hero__surprised ${surprised ? '' : 'is-hidden'}`} src={site.heroSurprised} alt="" />
            </TornHead>
            <CoverPeel src={site.heroFrames.center} face={site.heroFrames[gaze]} faces={HERO_FACES} progress={done ? 1 : intro} w={hw} h={hh} tear={TEAR_LINE} />
          </div>
        </div>
        {/* the lid's loose paper, outside the head's shadow filter (thin paper gets no outline) */}
        {!done && intro > 0 && <CoverFlap src={site.heroFrames.center} face={site.heroFrames[gaze]} progress={intro} w={hw} h={hh} tear={TEAR_LINE} />}
        {peeling && !gone && <FoldFlap d={d} d0={range0.d0} k={k} n={FOLD_N} w={hw} h={hh} poly={torn} src={flapMask || site.heroSurprised} face={site.heroSurprised} />}
        {mobile && done && <HeadCarousel labels={HERO_LABELS} />}
      </div>

    </section>
  )
}

/* ---------- below the hero: four screens (src/sections), two torn seams ---------- */

// torn-paper seams between sections: scroll-scrubbed rip with the page-peel curl
// (short band, steeper line: the same slant in less height; the rip is scrubbed against the viewport)
const SEAM = { height: 'clamp(108px, 14vw, 230px)', rise: [0.08, 0.72], align: 0.4, className: 'seam' }

export default function App() {
  useLenis()
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.35)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <>
      <Header solid={solid} />
      <main>
        <Hero />
        <VronteTry />
        <PaperTear {...SEAM} from={theme.bg} to={theme.alt} direction="up" seed={7} />
        {/* the story, on blush: the flip notebook */}
        <div className="on-blush"><NotebookSection /></div>
        <PaperTear {...SEAM} from={theme.alt} to={theme.bg} direction="down" seed={21} />
        <About />
        <Footer />
      </main>
    </>
  )
}
