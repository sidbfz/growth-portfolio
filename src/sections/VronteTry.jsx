import { useEffect, useRef } from 'react'
import { site, links } from '../content.js'
import VrontePhone from '../components/vronte-phone/VrontePhone.jsx'
import { pen, rot } from '../lib/sketchy.js'
import './notebook/sketches.jsx' // the notebook's Caveat handwriting face (it adds the font link once)
import './VronteTry.css'

/*
 * "Built on Wispr Flow": one loud headline, one line, and Siddharth's real Vronte phone, live.
 * Everything around the phone is a static ink doodle in the notebook's pen (lib/sketchy.js), and stays off its screen:
 *  - a drawn speech bubble: one dictated Wispr Flow note (the W mark, a pink waveform, the note handwritten), and how
 *    it reaches Vronte ("via the Wispr Flow MCP") with a pink arrow to the phone's edge;
 *  - "it's live! swipe or tap a card", with a hand pointing at the phone (an arrow up to it on phones). It's a button
 *    that nudges the phone (a wiggle and a pink glow), so a click on it never feels like a dead link.
 * Desktop: both doodles stand left of the phone. Phones: the note above the phone, "it's live!" under it.
 * The strokes draw on once when the stage scrolls into view (not with reduced motion). Copy: site.vronte in content.js.
 */

/** The headline with its accent words in pink. */
function Title({ text, accent }) {
  const at = accent ? text.indexOf(accent) : -1
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <span className="vt__accent">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  )
}

/** Greedy wrap into lines of at most `max` characters. */
function wrap(text, max) {
  const lines = []
  for (const w of text.split(' ')) {
    const last = lines[lines.length - 1]
    if (last && (last + ' ' + w).length <= max) lines[lines.length - 1] = last + ' ' + w
    else lines.push(w)
  }
  return lines
}

const arc = (cx, cy, r, a0, a1, n = 6) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })

const PINK = { c: 'pink', double: false }
/** Mark the strokes `draw` adds with k ('side', 'down', 'up'): CSS shows the set that fits the layout. */
const tag = (p, k, draw) => {
  const from = p.strokes.length
  draw()
  p.strokes.slice(from).forEach((s) => { s.k = k })
}
const HAND_W = 0.345 // Caveat's average glyph width, in em (measured)

/**
 * The note: a speech bubble (its tail at the bottom left) with the W mark and a pink waveform, the note handwritten in
 * it, "via the Wispr Flow MCP" under it and an arrow from there to the phone. viewBox 0 0 300 224.
 */
function noteArt({ text, who, via }) {
  const p = pen(29)
  const out = []
  const x0 = 8, y0 = 8, x1 = 250, y1 = 160, r = 20
  // the bubble, one stroke from the top left round to its tail and back
  p.path([
    [x0 + r, y0], [x1 - r, y0 + 1], ...arc(x1 - r, y0 + r, r, -90, 0), [x1 + 1, y1 - r],
    ...arc(x1 - r, y1 - r, r, 0, 90), [78, y1 + 1], [44, y1 + 30], [56, y1], [x0 + r, y1 - 0.5],
    ...arc(x0 + r, y1 - r, r, 90, 180), [x0 - 0.5, y0 + r], ...arc(x0 + r, y0 + r, r, 180, 262),
  ], { w: 2.3 })
  // the W mark: a rounded tile with a drawn W
  p.rrect(26, 24, 28, 28, 7, { w: 2, double: false })
  p.path([[31.5, 31], [35.5, 45.5], [40, 35], [44.5, 45.5], [48.5, 31]], { w: 2, double: false, wob: 0.3 })
  // the voice: a pink waveform, loud in the middle
  const n = 26
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const env = Math.sin(Math.PI * (0.08 + t * 0.84))
    const h = 2.5 + env * (5 + 7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.9)))
    const x = 66 + i * 6.2
    p.line([x, 38 - h], [x + 0.3, 38 + h], { ...PINK, w: 2.4, wob: 0.15 })
  }
  // the note, handwritten
  const lines = wrap(text, 21)
  const size = 30
  lines.forEach((t, i) => out.push({ x: 26, y: 88 + i * 30, t, s: size }))
  // who asked, underlined in pink
  const at = lines[0].indexOf(who)
  if (who && at >= 0) {
    const ux = 26 + at * size * HAND_W
    const uw = who.length * size * HAND_W
    p.curve([[ux - 3, 95], [ux + uw * 0.5, 93], [ux + uw + 5, 91.5]], { ...PINK, w: 2.4 })
  }
  // how it gets there, and an arrow to the phone
  out.push({ x: 64, y: 196, t: via, s: 21, c: 'soft', r: -2 })
  // (two arrows: to the phone's side on desktop, down to it on phones; CSS shows one)
  const vx = 64 + via.length * 21 * 0.38 // (this line's glyphs run wider)
  tag(p, 'side', () => p.arrow([[vx + 8, 186], [vx + 30, 182], [297, 160]], { ...PINK, w: 2.2, head: 10 }))
  tag(p, 'down', () => p.arrow([[vx + 8, 186], [vx + 20, 198], [vx + 18, 220]], { ...PINK, w: 2.2, head: 9 }))
  return { strokes: p.strokes, text: out }
}

/** A hand with its index finger up (fingertip at 6, 0), as points: the outline, the creases, the cuff. */
function hand() {
  const outline = [
    [4, 74], [2.5, 63], [-5, 55], [-11, 47], [-10.5, 41], [-5, 39.5], [0, 43],
    [0, 24], [-0.2, 8], ...arc(6, 7, 6, 185, 355, 6), [12, 12], [12.2, 30],
    [15, 27], [19.5, 26.8], [22.5, 29.5], [26, 29.5], [30, 30.5], [32, 33.5], [35.5, 34], [38, 37], [38.8, 42],
    [38.6, 52], [36, 63], [33, 74],
  ]
  const creases = [
    [[22.5, 30], [22, 36.5]],
    [[32, 34], [31.5, 39.5]],
  ]
  return { outline, creases, cuff: [[3, 75], [35, 75]], cuff2: [[2.5, 81], [35.5, 81]] }
}

/**
 * Live: a pink dot and "it's live!", "swipe or tap a card" (`accent` in pink ink: no underline, it isn't a link), and
 * what points at the phone. Desktop: a hand pointing right at the phone's edge, a pink swipe arc over its finger.
 * Phones (the doodle sits under the phone): a pink arrow curving up to it. Strokes tagged 'side' / 'up'; CSS shows one
 * set. viewBox 0 0 232 112; nothing reaches past x 232, so nothing lands on the phone's screen.
 */
function liveArt({ live, hint, accent }) {
  const p = pen(61)
  const out = []
  // the hand, turned to point right (a touch up, toward the cards), its fingertip at (230, 25)
  tag(p, 'side', () => {
    const h = hand()
    const place = (pts) => rot(pts, 6, 0, 84).map(([x, y]) => [x + 224, y + 25])
    p.curve(place(h.outline), { w: 2.2 })
    h.creases.forEach((c) => p.line(...place(c), { w: 1.6, double: false, wob: 0.3 }))
    p.line(...place(h.cuff), { w: 1.8, double: false })
    p.line(...place(h.cuff2), { w: 1.8, double: false })
    // a swipe: a pink arc over the finger, heading for the phone
    p.arrow([[166, 0], [192, -9], [222, -6]], { ...PINK, w: 2.3, head: 8 })
  })
  // phones: an arrow from the words up to the phone above
  tag(p, 'up', () => p.arrow([[154, 40], [176, 26], [186, 0]], { ...PINK, w: 2.2, head: 9 }))
  // the live dot and the words
  p.ellipse(14, 40, 3.4, 3.4, { ...PINK, w: 7, lump: 0.04 })
  out.push({ x: 28, y: 50, t: live, s: 34, c: 'bold' })
  const at = accent ? hint.indexOf(accent) : -1
  const parts = at < 0 ? hint : [[hint.slice(0, at)], [accent, 'pink'], [hint.slice(at + accent.length)]].filter(([t]) => t)
  out.push({ x: 28, y: 88, t: parts, s: 26, c: 'soft' })
  return { strokes: p.strokes, text: out }
}

/** Pen strokes and handwriting; each stroke draws on in turn (see VronteTry.css). */
function Doodle({ art, viewBox, className, start = 0, span = 1.2 }) {
  const n = art.strokes.length
  return (
    <svg className={`vt-ink ${className}`} viewBox={viewBox} aria-hidden="true" focusable="false">
      {art.strokes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          pathLength="1"
          className={[s.c === 'pink' && 'vt-ink__pink', s.k && `vt-ink--${s.k}`].filter(Boolean).join(' ') || undefined}
          style={{ strokeWidth: s.w, opacity: s.op, '--d': `${(start + (span * i) / n).toFixed(3)}s` }}
        />
      ))}
      {art.text.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          className={l.c ? `vt-ink__${l.c}` : undefined}
          style={{ fontSize: l.s + 'px', '--d': `${(start + span * 0.35 + i * 0.12).toFixed(2)}s` }}
          transform={l.r ? `rotate(${l.r} ${l.x} ${l.y})` : undefined}
        >
          {Array.isArray(l.t)
            ? l.t.map(([t, c], j) => <tspan key={j} className={c ? `vt-ink__${c}` : undefined}>{t}</tspan>)
            : l.t}
        </text>
      ))}
    </svg>
  )
}

const NOTE = noteArt(site.vronte.note)
const LIVE = liveArt({ live: site.vronte.live, hint: site.vronte.liveHint, accent: site.vronte.liveAccent })

export default function VronteTry() {
  const v = site.vronte
  const href = links[v.href]
  const stage = useRef(null)
  const nudgeT = useRef(0)

  /*
   * Clicking "it's live!" points the visitor at the phone, since that's where the demo is: the phone wiggles and its
   * frame glows pink (just the glow with reduced motion). If the phone's top is scrolled away (phones: the doodle is
   * under it), the page first scrolls the cards back into view. From the keyboard, focus goes to the first card.
   */
  const nudge = (e) => {
    const ph = stage.current?.querySelector('.vt__phone')
    if (!ph) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = ph.getBoundingClientRect().top
    const scroll = top < -40
    if (scroll) {
      const y = window.scrollY + top - 80 // under the fixed header pills
      const l = window.__lenis
      if (l && typeof l.scrollTo === 'function') l.scrollTo(y, reduce ? { immediate: true } : { duration: 0.8 })
      else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' })
    }
    clearTimeout(nudgeT.current)
    ph.classList.remove('is-nudged')
    nudgeT.current = setTimeout(() => {
      void ph.offsetWidth // restart the animation on a repeat click
      ph.classList.add('is-nudged')
      nudgeT.current = setTimeout(() => ph.classList.remove('is-nudged'), 1200)
    }, scroll && !reduce ? 700 : 0)
    if (e.detail === 0) {
      // (each card has two layouts, one hidden: the first open button that's showing)
      const open = [...(ph.shadowRoot?.querySelectorAll('.slot [data-act="open"]') ?? [])]
        .find((b) => getComputedStyle(b).visibility === 'visible')
      open?.focus({ preventScroll: scroll })
    }
  }
  useEffect(() => () => clearTimeout(nudgeT.current), [])

  // draw the doodles on once, when the stage comes into view
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const done = () => el.classList.add('is-drawn')
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return done()
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        done()
      }
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section className="vt" id="vronte" aria-labelledby="vt-title">
      <div className="vt__text">
        <h2 className="vt__title" id="vt-title">
          <Title text={v.title} accent={v.accent} />
        </h2>
        <p className="vt__line">{v.line}</p>
        <p className="vt__links">
          <a className="vt__link" href={href} target="_blank" rel="noopener noreferrer"
            data-track="vronte_seat" data-track-where="vronte_try">{v.linkLabel}</a>
        </p>
      </div>

      <figure className="vt__stage" ref={stage}>
        <div className="vt__note" role="img" aria-label={`${v.note.head}: “${v.note.text}” Vronte reads it ${v.note.via}.`}>
          <Doodle art={NOTE} viewBox="0 0 300 224" className="vt__note-ink" />
        </div>

        <VrontePhone className="vt__phone" caption={false} />

        <figcaption className="vt__live">
          <button type="button" className="vt__live-btn" onClick={nudge}>
            <span className="vt__sr">{v.live} {v.liveHint}, on the phone</span>
            <Doodle art={LIVE} viewBox="0 0 232 112" className="vt__live-ink" start={0.9} span={0.8} />
          </button>
        </figcaption>
      </figure>
    </section>
  )
}
