// Siddharth's notebook: a 3D sketchbook that opens and turns its pages as you scroll.
//
// The page-turn mechanic is adapted from Jhey Tompkins' "Little book of Jhey w/ ScrollTrigger"
// (CodePen, MIT licence, https://codepen.io/jh3y): each leaf turns around its bound edge,
// scrubbed by ScrollTrigger, with a small z shuffle so the turned stack sorts correctly. The
// book sits at one fixed size; the stage is pinned with position: sticky, every turn gets the
// same slice of scroll, and clicking a page scrolls to its turn. The sketches are plain ink.
//
// Two shapes:
//  - book (700px and wider): bound on the left, two-page spreads, leaves turn on rotateY.
//  - pad (phones): a reporter's notepad bound at the top, one page at a time. Each leaf turns on
//    rotateX about the spiral: it lifts toward you, goes up and over (its back is paper), then
//    tips back behind the pad until it is edge-on to the eye, a line along the spiral. Only at
//    that angle, when it covers nothing, is it hidden: it never pops in or out.
//
// The back board is a flat layer under the 3D stack of leaves, not part of it. Inside one 3D
// context with the leaves, Chromium's depth sort blanked a leaf for a stretch of its turn
// (roughly 185 to 215deg on the pad: the page vanished mid-flip, then came back).
// Under reduced motion nothing scrubs: a tap turns the page (book: right page forward, left
// page back; pad: tap forward, the strip under the spiral goes back).
import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './Notebook.css'
import { site } from '../content.js'
import { prefersReduced } from '../lib/motion.js'
import { sfx, pageTurnSound } from '../lib/sound.js'
import { art, SWOOSH, Ink, Page, Blank } from './notebook/sketches.jsx'

gsap.registerPlugin(ScrollTrigger)

// Scroll budget, in vh of pinned scroll (the section is the stage's height plus PIN vh).
// Book: 8 + 5 turns (cover + 4 leaves for 8 pages) x 40 = 208, then a short hold. Pad: the cover
// waits INTRO (the seam above leaves the screen first), then 9 turns (cover + 8 pages) x 21 = 189,
// then a hold. Adding a page adds a turn on the pad (and one on the book every second page).
const SHAPE = {
  book: { PIN: 212, INTRO: 8, TURN: 40 },
  pad: { PIN: 225, INTRO: 24, TURN: 21 },
}
const PAD_FLIP = 0.82 // pad: share of a turn spent flipping; the rest is time to read the page
const DZ = 1 // px between stacked leaves
const WIDE = '(min-width: 700px)'
const COILS = 13

const nb = site.notebook
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const isWide = () => typeof window !== 'undefined' && window.matchMedia(WIDE).matches

function Cover() {
  return (
    <div className="nb-cover">
      <p className="nb-cover__title">
        <span>{nb.cover[0]}</span>
        <span className="nb-cover__line">
          {nb.cover[1]}
          <svg className="nb-cover__swoosh" viewBox="0 0 240 30" aria-hidden="true">
            <Ink strokes={SWOOSH} />
          </svg>
        </span>
      </p>
      <img className="nb-cover__sticker" src={site.heroFrames.center} alt="" draggable="false" />
      <span className="nb-cover__band" aria-hidden="true" />
    </div>
  )
}

function BackCover() {
  return (
    <svg className="nb-paper nb-paper--dark" viewBox="0 0 300 400" role="img" aria-label={nb.back}>
      <g transform="translate(26 2)" aria-hidden="true">
        <Ink strokes={art('camera').strokes} />
      </g>
      <text className="nb-name" x="150" y="322" textAnchor="middle" transform="rotate(-3 150 314)">
        {nb.back}
      </text>
    </svg>
  )
}

/** The pad's wire binding: a coil over each punched hole along the top edge. */
function Spiral() {
  const step = 300 / COILS
  return (
    <svg className="nb__spiral" viewBox="0 0 300 26" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: COILS }, (_, i) => {
        const x = step * (i + 0.5)
        return (
          <g key={i}>
            <ellipse className="nb__hole" cx={x} cy="19" rx="3.1" ry="2.5" />
            <path className="nb__coil" d={`M${x - 2.4} 19 C ${x - 3.4} 9, ${x - 2.2} 2.4, ${x + 0.8} 2.4 S ${x + 3.6} 9, ${x + 2.6} 18`} />
          </g>
        )
      })}
    </svg>
  )
}

/** The leaves, cover first: two pages a leaf on a spread, one (with a ruled back) on the pad. */
function layout(pages, wide) {
  const leaves = [{ front: <Cover />, back: <div className="nb-endpaper" /> }]
  if (wide) {
    for (let i = 0; i < pages.length; i += 2) {
      leaves.push({
        front: <Page page={pages[i]} n={i + 1} side="right" />,
        back: pages[i + 1] ? <Page page={pages[i + 1]} n={i + 2} side="left" /> : <Blank />,
      })
    }
  } else {
    pages.forEach((p, i) => leaves.push({ front: <Page page={p} n={i + 1} side="right" />, back: <Blank /> }))
  }
  return leaves
}

/** Hook ScrollTrigger to Lenis once per Lenis instance (other sections may do the same). */
function syncLenis() {
  const l = window.__lenis
  if (!l || typeof l.on !== 'function') return false
  if (!l.__scrollTriggerSync) {
    l.__scrollTriggerSync = true
    l.on('scroll', ScrollTrigger.update)
  }
  return true
}

export default function Notebook() {
  const rootRef = useRef(null)
  const bookRef = useRef(null)
  const api = useRef({ next() {}, prev() {} })
  const [mode] = useState(() => (prefersReduced() ? 'still' : 'scroll'))
  const [wide, setWide] = useState(isWide)
  const shape = wide ? 'book' : 'pad'
  const { PIN } = SHAPE[shape]
  const leaves = layout(nb.pages, wide)
  const N = leaves.length

  useLayoutEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    const book = bookRef.current
    const stage = root.querySelector('.nb__stage')
    const leafEls = [...book.querySelectorAll('.nb__stack > .nb__leaf')]
    const hint = root.querySelector('.nb__hint')
    const reduced = mode === 'still'
    const { INTRO, TURN } = SHAPE[shape]
    const pad = shape === 'pad'
    const shift = pad ? 0 : 50 // centre the open spread on wide screens
    // pad: past 180deg the page tips back behind the spiral. It is edge-on to the eye (a line) where
    // its plane passes through the viewpoint: perspective P in front, origin oy below the spiral.
    const edgeOn = () => {
      const cs = getComputedStyle(book)
      const P = parseFloat(cs.perspective) || 2400
      const oy = parseFloat(cs.perspectiveOrigin.split(' ')[1]) || book.offsetHeight * 0.45
      return 180 + (Math.atan2(P, oy) * 180) / Math.PI
    }
    const flat = (i) => (pad ? { rotateX: 0, z: -i * DZ, visibility: 'visible' } : { rotateY: 0, z: -i * DZ })
    const turned = (i) => (pad ? { rotateX: edgeOn(), z: (i + 1) * DZ, visibility: 'hidden' } : { rotateY: -180 + i * 0.35, z: (i + 1) * DZ })

    const ctx = gsap.context(() => {
      gsap.set(leafEls, { transformOrigin: pad ? '50% 0%' : '0% 50%' })
      leafEls.forEach((l, i) => gsap.set(l, flat(i)))

      if (reduced) {
        let n = 1
        const show = () => {
          leafEls.forEach((l, i) => gsap.set(l, i < n ? turned(i) : flat(i)))
          gsap.set(book, { xPercent: n > 0 ? shift : 0 })
        }
        show()
        api.current = {
          next() { if (n < N) sfx.flip(false, { pad }); n = Math.min(N, n + 1); show() },
          prev() { if (n > 0) sfx.flip(true, { pad }); n = Math.max(0, n - 1); show() },
        }
        return
      }

      // The turns play while the stage is stuck (its sticky top comes from Notebook.css).
      const stuckTop = () => {
        const t = parseFloat(getComputedStyle(stage).top)
        return Number.isFinite(t) ? t : Math.max(0, (window.innerHeight - stage.offsetHeight) / 2)
      }
      // Once the pin is over the stage rests on the seam below: it stays over that seam's band, or
      // the band (upper page painted blush) cuts the book's shadow off in a straight line.
      const past = (self) => stage.classList.toggle('is-past', !self.isActive && self.progress >= 1)
      // a paper flick each time a leaf passes standing on edge, either way (src/lib/sound.js)
      const turnSound = pageTurnSound({ intro: INTRO, turn: TURN, mid: pad ? TURN * PAD_FLIP * 0.41 : TURN / 2, count: N, pad })
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate() { turnSound(this.time()) },
        scrollTrigger: {
          trigger: root,
          start: () => `top ${stuckTop()}px`,
          end: () => `bottom ${stuckTop() + stage.offsetHeight}px`,
          scrub: 0.6,
          invalidateOnRefresh: true,
          // while stuck, turning leaves may swing past the stage: keep them above the seam above
          toggleClass: { targets: stage, className: 'is-stuck' },
          onToggle: past,
          onUpdate: past, // also catches a jump straight past the pin (anchor link, reload)
          onRefresh: past,
        },
      })
      if (hint) tl.to(hint, { autoAlpha: 0, duration: TURN * 0.3 }, INTRO)
      if (!pad) tl.fromTo(book, { xPercent: 0 }, { xPercent: shift, duration: TURN, ease: 'power1.inOut' }, INTRO)
      leafEls.forEach((l, i) => {
        const at = INTRO + i * TURN
        if (pad) {
          // one steady turn: up toward you, over the spiral, back until it is edge-on, then hidden
          const f = TURN * PAD_FLIP
          tl.to(l, { rotateX: edgeOn, duration: f, ease: 'sine.inOut' }, at)
          tl.to(l, { z: (i + 1) * DZ, duration: f * 0.2 }, at) // in front of the stack as it lifts
          tl.set(l, { visibility: 'hidden' }, at + f)
        } else {
          tl.to(l, { rotateY: -180 + i * 0.35, duration: TURN, ease: 'power1.inOut' }, at)
          tl.to(l, { z: (i + 1) * DZ, duration: TURN / 2 }, at)
        }
      })
      tl.set({}, {}, PIN)

      const go = (dir) => {
        const st = tl.scrollTrigger
        const n = clamp(Math.round((tl.time() - INTRO) / TURN), 0, N)
        const target = clamp(n + dir, 0, N)
        if (target === n) return
        const y = st.start + ((INTRO + target * TURN) / PIN) * (st.end - st.start)
        const l = window.__lenis
        if (l && typeof l.scrollTo === 'function') l.scrollTo(y, { duration: 1.1 })
        else window.scrollTo({ top: y, behavior: 'smooth' })
      }
      api.current = { next: () => go(1), prev: () => go(-1) }
    }, root)

    if (reduced) return () => ctx.revert()

    // Lenis may be created after this effect (the app makes it in its own effect): retry briefly.
    let tries = 0
    let raf = 0
    const hook = () => {
      if (syncLenis() || ++tries > 120) return
      raf = requestAnimationFrame(hook)
    }
    hook()

    // Content above can change height (images, fonts): re-measure when the page does.
    let timer = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => ScrollTrigger.refresh(), 150)
    })
    ro.observe(document.body)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      ro.disconnect()
      ctx.revert()
    }
  }, [mode, shape, N, PIN])

  const onClick = (e) => {
    const r = bookRef.current.getBoundingClientRect()
    // Book: the box is the right-hand page; left of its spine is the left page (back).
    // Pad: the strip under the binding goes back, the rest of the page forward.
    const back = wide ? e.clientX < r.left : e.clientY < r.top + r.height * 0.14
    if (back) api.current.prev()
    else api.current.next()
  }
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      api.current.next()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      api.current.prev()
    }
  }

  return (
    <section className="nb" ref={rootRef} data-mode={mode} data-shape={shape} style={{ '--pin': PIN + 'vh' }} aria-label={nb.cover.join(' ')}>
      <div className="nb__stage">
        <p className="nb__hint">{mode === 'still' ? nb.hintStill : nb.hint}</p>
        <div className="nb__persp">
          <div className="nb__book" ref={bookRef} role="group" aria-roledescription="notebook" aria-label={wide ? nb.label : nb.labelPad || nb.label} tabIndex={0} onClick={onClick} onKeyDown={onKey}>
            <div className="nb__board">
              <div className="nb__face">
                <BackCover />
              </div>
            </div>
            <div className="nb__stack">
              {leaves.map((leaf, i) => (
                <div key={shape + i} className={'nb__leaf' + (i === 0 ? ' nb__leaf--cover' : '')}>
                  <div className="nb__face nb__face--front">{leaf.front}</div>
                  <div className="nb__face nb__face--back">{leaf.back}</div>
                </div>
              ))}
              {!wide && <Spiral />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
