import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { sfxExpr } from '../lib/sound-expr.js'
import './FaceTracker.css'

/*
 * FaceTracker: a "sticker head" whose eyes look at the pointer, by swapping pre-made frames.
 *
 * Every frame is the same head with only the eyes changed, so a swap is a plain hard cut: all the
 * frames sit stacked and decoded up front, one is visible, and nothing about the head moves,
 * scales or fades when it changes. It answers the pointer on the next animation frame; the only
 * brakes are a little hysteresis on the zone borders and a tiny minimum hold, so a cursor resting
 * on a border can't make it flicker.
 *
 * Where it looks is decided by zones laid out around the head itself (see ZONES): above the eyes
 * by bands, so the whole space over the brows reads as "up" and beside the face as "left"/"right";
 * below the eyes by the angle from the eyes, so the lower right/left of the face (beside the nose,
 * mouth and chin, and below the chin off to the side) reads as a down diagonal and only a wedge
 * straight below the mouth and chin is plain "down". `frames.cross` (optional) shows when the
 * pointer is right between the eyes (`anchor`).
 *
 * After 3s without pointer input it mostly rests on the centre frame with an occasional glance.
 * Expressions only appear on click/tap (or idle if opted in). `forceFrame` lets a parent drive it.
 */

/*
 * Gaze zones, in fractions of the face box (u across, v down; the head spans u 0.15-0.85, the
 * brows sit at v ≈ 0.43, the eyes at the anchor ≈ [0.5, 0.51], the nose tip ≈ 0.62, the chin ≈ 0.88):
 *
 *            u: 0.08       0.21 ......... 0.79       0.92
 *   up-left       │  UP: the whole column over the head,   │      up-right
 *                 │  from the brows up, to the screen top  │
 *   v 0.33 ─ ─ ─ ─┤- - - - - - - - - - - - - - - - - - - - ├─ ─ ─ ─
 *   LEFT          │  v 0.43 ── brows ────────────────────  │      RIGHT
 *   (beside the   │ ear │ CENTER over the glasses     │ear │  (beside the
 *    face, to the │     │ (CROSS right at the bridge) │    │   face, to the
 *    screen edge) │     │                             │    │   screen edge)
 *   eyes ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═  (anchor's height)
 *   LEFT  ` ` ` ` ` ` ` ` ` ` ` ` ` ` ` ` v 0.64 nose ` ` ` ` ` ` ` ` ` ` ` ` RIGHT  (to `side`° below)
 *   down-left: beside the nose, mouth,   \ DOWN  /    down-right: beside the nose, mouth,
 *   chin, and below the chin off to the   \mouth/     chin, and below the chin off to the
 *   side                                   \chin/     side
 *
 * Above the eye line: over the brows within `col` → up; beside the head from `top` down → left /
 * right; the corners outside those get a diagonal, unless within SNAP° of straight up/left/right.
 * Below the eye line (outside the center patch over the glasses, which reaches down to the nose
 * at `mouth`), the angle below the horizontal from the eyes decides: up to `side`° → left / right,
 * from `down`° → down, in between → down-left / down-right. A frame that's showing stays while
 * the pointer is within HYST of its zone, so a border never flickers.
 */
const ZONES = {
  col: [0.08, 0.92], // the head's width (ears 0.15-0.85) plus a margin: above the brows within it → up
  face: [0.21, 0.79], // the glasses: over these, between brows and nose → center
  brow: 0.43,
  mouth: 0.64, // the bottom of the center patch (just under the nose)
  top: 0.33, // beside the head from here down to the eye line → left / right
  side: 12, // deg: below the eye line, this close to the horizontal still reads straight left / right
  down: 60, // deg: below the eye line, this steep or steeper reads straight down (mouth, chin, below)
}
const SNAP = 15 // deg
const HYST = 0.03 // of the face width (at least 12px)
const MIN_HOLD = 60 // ms a frame stays up at least: never a one-frame flicker, never a felt delay
const IDLE_AFTER = 3000 // ms without pointer movement before the head idles
const EXPRESSION_HOLD = 1100 // ms an expression stays up after a click
const DIR_KEYS = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight']
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]]

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

/** The zone (a frame key) for a point (px, in the viewport) around a face box `r`; see ZONES. */
export function gazeZone(x, y, r, ax = 0.5, ay = 0.5, g = ZONES) {
  const u = (x - r.left) / r.width
  const v = (y - r.top) / r.height
  const dx = x - (r.left + r.width * ax)
  const dy = y - (r.top + r.height * ay)
  const side = dx < 0 ? 'left' : 'right'
  if (u >= g.col[0] && u <= g.col[1] && v < g.brow) return 'up'
  if (u >= g.face[0] && u <= g.face[1] && v <= g.mouth) return 'center'
  if (dy > 0) {
    // below the eye line: sectors by the angle below the horizontal (0 = beside, 90 = straight down)
    const b = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI
    if (b >= g.down) return 'down'
    if (b <= g.side) return side
    return dx < 0 ? 'downLeft' : 'downRight'
  }
  if (v >= g.top) return side
  const a = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) // 0 = right, 90 = up, 180 = left
  if (Math.abs(a - 90) < SNAP) return 'up'
  if (a < SNAP || a > 180 - SNAP) return side
  return dx < 0 ? 'upLeft' : 'upRight'
}

export default function FaceTracker({
  frames: framesProp,
  expressions: expressionsProp,
  size = '320px',
  bubble,
  bubbleSide = 'right',
  className = '',
  style,
  idleExpressions = false, // opt in to rare expression frames while idle
  anchor, // [x, y] fraction of the image between the eyes; default: its centre
  zones = ZONES, // the gaze zones around the head (fractions of the face box), see ZONES
  crossRadius = 0.06, // with frames.cross: pointer within this fraction of the face width of the anchor goes cross-eyed
  forceFrame, // optional, controlled: a frame key (e.g. 'upLeft') or url to show right now, ignoring the pointer
}) {
  const ax = anchor?.[0] ?? 0.5
  const ay = anchor?.[1] ?? 0.5
  // Compare frames/expressions by value: a parent passing a fresh object or array with the
  // same images on every render must not restart the tracking loop.
  const framesKey = JSON.stringify(framesProp || {})
  const exprKey = JSON.stringify(expressionsProp || [])
  const zonesKey = JSON.stringify(zones)
  const frames = useMemo(() => framesProp, [framesKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const expressions = useMemo(() => expressionsProp || [], [exprKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => zones, [zonesKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const rootRef = useRef(null)
  const faceRef = useRef(null)
  const imgRefs = useRef(new Map())
  const decoded = useRef(new WeakSet())
  const bubbleRef = useRef(null)
  // read by the rAF loop, so a parent can drive the gaze every frame without restarting it
  const forceRef = useRef(forceFrame)
  forceRef.current = forceFrame

  // Unique list of every image we ever show, in a stable order.
  const urls = useMemo(() => {
    const list = [...Object.values(frames || {}), ...expressions].filter(Boolean)
    return [...new Set(list)]
  }, [frames, expressions])

  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  // Mutable runtime state shared by listeners and the rAF loop.
  const rt = useRef({
    px: 0,
    py: 0,
    hasPointer: false,
    lastMove: -Infinity,
    lastSwap: 0,
    current: frames?.center,
    shown: null,
    override: null, // { url, until }
    idle: null, // { url, until }
    visible: true,
    forced: false, // a parent is driving the gaze (forceFrame)
    awaitInput: false, // just released from forceFrame: look straight until the pointer really moves
  })

  // Show exactly one image: a hard cut, done imperatively so it lands on this very frame.
  const show = (url) => {
    const s = rt.current
    if (s.shown === url) return
    s.shown = url
    imgRefs.current.forEach((img, src) => {
      img.style.visibility = src === url ? 'visible' : 'hidden'
    })
  }

  // Keep the visible image in sync when the frame set changes (e.g. the hero
  // unlocking its full set after the intro).
  useLayoutEffect(() => {
    const s = rt.current
    if (!s.current || !urls.includes(s.current)) s.current = frames?.center
    s.shown = null
    show(s.current)
  }, [urls]) // eslint-disable-line react-hooks/exhaustive-deps

  // prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // Pointer tracking: passive handlers that only store coordinates.
  useEffect(() => {
    const s = rt.current
    const onPointer = (e) => {
      const p = e.touches ? e.touches[0] : e
      if (!p) return
      // the browser sends pointermove without any movement too (on load, after a scroll or a layout
      // change, to a cursor that's just resting there): only a real move (from a position we already
      // know), a press or a touch counts as the visitor doing something
      const moved = e.type !== 'pointermove' || (s.hasPointer && Math.hypot(p.clientX - s.px, p.clientY - s.py) > 2)
      s.px = p.clientX
      s.py = p.clientY
      s.hasPointer = true
      if (!moved) return
      s.lastMove = performance.now()
      if (!s.forced) s.awaitInput = false
    }
    // cursor left the window: stop staring at where it was, go idle soon
    const onOut = (e) => {
      if (!e.relatedTarget) s.lastMove = Math.min(s.lastMove, performance.now() - IDLE_AFTER + 600)
    }
    const opts = { passive: true }
    window.addEventListener('pointermove', onPointer, opts)
    window.addEventListener('pointerdown', onPointer, opts)
    window.addEventListener('touchmove', onPointer, opts) // pointer events cancel once a touch scrolls
    document.addEventListener('mouseout', onOut, opts)
    return () => {
      window.removeEventListener('pointermove', onPointer, opts)
      window.removeEventListener('pointerdown', onPointer, opts)
      window.removeEventListener('touchmove', onPointer, opts)
      document.removeEventListener('mouseout', onOut, opts)
    }
  }, [])

  // Only run while on screen.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => {
      rt.current.visible = entry.isIntersecting
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Main loop.
  useEffect(() => {
    const s = rt.current
    const center = frames?.center
    if (reduced) {
      s.current = center
      show(center)
      return
    }
    const keyOf = (url) => (url === frames.cross ? 'cross' : DIR_KEYS.find((k) => frames[k] === url) || (url === center ? 'center' : null))
    let raf

    const pointerTarget = () => {
      const el = faceRef.current
      if (!el) return center
      const r = el.getBoundingClientRect()
      if (!r.width) return center
      const { px, py } = s
      const cur = keyOf(s.current)
      // right between the eyes: cross-eyed (a little stickier once it's showing)
      if (frames.cross) {
        const dist = Math.hypot(px - (r.left + r.width * ax), py - (r.top + r.height * ay))
        if (dist < r.width * crossRadius * (cur === 'cross' ? 1.4 : 1)) return frames.cross
      }
      let z = gazeZone(px, py, r, ax, ay, geo)
      // hysteresis: keep the zone that's showing while the pointer is within HYST of it
      const stay = cur === 'cross' ? 'center' : cur
      if (stay && z !== stay) {
        const h = Math.max(12, HYST * r.width)
        if (AROUND.some(([ox, oy]) => gazeZone(px + ox * h, py + oy * h, r, ax, ay, geo) === stay)) z = stay
      }
      return frames[z] || center
    }

    // Calm idle: rest on the centre frame, glance to a side now and then.
    const idleTarget = (now) => {
      const sides = DIR_KEYS.map((k) => frames[k]).filter((u) => u && u !== center)
      if (!s.idle) {
        // just went idle: finish the current look, then come back to centre
        s.idle = { url: s.current, until: now + (s.current === center ? rand(2500, 5000) : rand(700, 1200)) }
      } else if (now >= s.idle.until) {
        if (s.idle.url !== center || !sides.length) {
          s.idle = { url: center, until: now + rand(3500, 7000) }
        } else if (idleExpressions && expressions.length && Math.random() < 0.18) {
          s.idle = { url: pick(expressions), until: now + rand(900, 1300) }
        } else {
          s.idle = { url: pick(sides), until: now + rand(1100, 1900) }
        }
      }
      return s.idle.url
    }

    const tick = (now) => {
      raf = requestAnimationFrame(tick)

      // controlled gaze (e.g. the hero intro): show the asked frame; tracking resumes once released
      const forced = forceRef.current && (frames[forceRef.current] || forceRef.current)
      if (forced) {
        s.forced = true
        s.idle = null
        if (forced !== s.current || s.shown !== forced) {
          s.current = forced
          s.lastSwap = now
          show(forced)
        }
        return
      }
      if (s.forced) {
        // just handed back: settle on the centre frame, and stay there until the pointer moves or a
        // finger touches (never jump to wherever the pointer last was, or idle-glance about)
        s.forced = false
        s.awaitInput = true
        s.idle = null
      }
      if (!s.visible) return

      let target
      const ov = s.override && now < s.override.until
      if (ov) target = s.override.url
      else if (s.awaitInput) target = center
      else if (s.hasPointer && now - s.lastMove < IDLE_AFTER) {
        s.idle = null
        target = pointerTarget()
      } else target = idleTarget(now)

      if (!target || target === s.current) return
      // a click/tap reaction is an answer to the user: right away; anything else holds a beat
      if (!ov && now - s.lastSwap < MIN_HOLD) return
      s.current = target
      s.lastSwap = now
      show(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced, frames, expressions, idleExpressions, ax, ay, crossRadius, geo])

  // Speech bubble: pop in with overshoot on enter, then bob.
  useEffect(() => {
    const el = bubbleRef.current
    if (!el || !bubble) return
    const rot = bubbleSide === 'left' ? 5 : -6
    if (reduced) {
      gsap.set(el, { autoAlpha: 1, scale: 1, rotation: rot })
      return
    }
    gsap.set(el, { autoAlpha: 0, scale: 0.3, rotation: rot * 3, y: 12 })
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        gsap.to(el, {
          autoAlpha: 1,
          scale: 1,
          rotation: rot,
          y: 0,
          duration: 0.6,
          delay: 0.15,
          ease: 'back.out(2.4)',
          onComplete: () => {
            gsap.to(el, { y: -6, rotation: rot + 1.2, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1 })
          },
        })
      },
      { threshold: 0.35 },
    )
    io.observe(rootRef.current)
    return () => {
      io.disconnect()
      gsap.killTweensOf(el)
    }
  }, [bubble, bubbleSide, reduced])

  const onActivate = () => {
    if (reduced || !expressions.length) return
    const s = rt.current
    let url = pick(expressions)
    if (url === s.current && expressions.length > 1) url = pick(expressions.filter((u) => u !== url))
    s.override = { url, until: performance.now() + EXPRESSION_HOLD }
    sfxExpr(url) // its cue, on the tap only (the frame shows on the next animation frame)
  }

  return (
    <div
      ref={rootRef}
      className={`face-tracker ${className}`.trim()}
      style={{ '--ft-size': size, ...style }}
    >
      {bubble && (
        <div ref={bubbleRef} className={`face-tracker__bubble is-${bubbleSide}`}>
          {bubble}
        </div>
      )}
      <div
        ref={faceRef}
        className="face-tracker__face"
        role="button"
        tabIndex={0}
        aria-label="Sticker head. Click for a reaction."
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onActivate()
          }
        }}
      >
        <div className="face-tracker__stage">
          {/* every frame stacked and decoded up front; exactly one is visible (set imperatively) */}
          {urls.map((src) => (
            <img
              key={src}
              ref={(el) => {
                if (el) {
                  if (!decoded.current.has(el)) {
                    decoded.current.add(el)
                    el.decode?.().catch(() => {})
                  }
                  imgRefs.current.set(src, el)
                } else imgRefs.current.delete(src)
              }}
              src={src}
              alt=""
              draggable={false}
              decoding="sync"
              style={{ visibility: src === (rt.current.shown || frames?.center) ? 'visible' : 'hidden' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
