import { loadSilhouette, loadHardMask, loadSoftMask, loadBackTex } from '../components/CoverPeel.jsx'

/*
 * What the sticker intro waits on before its clock starts, and the scroll lock it plays under.
 *
 * No loader: until the head sticker (and what its peel is cut from) has been fetched and decoded,
 * the visitor sees the plain page (the hero holds its pre-intro pose: head below the screen, name
 * under its line, the rest faded out; the header waits too, see `waiting`). That is a split second
 * on a warm cache; WAIT caps it, so a slow file never keeps the page blank: past it the intro plays
 * as soon as the head itself is in, and if even that hasn't come by HEAD_WAIT the finished hero shows.
 */
export const WAIT = 2500 // ms: the most the intro waits for everything it uses
export const HEAD_WAIT = 4000 // ms: ...and for the head sticker itself, past that the hero just shows

/** Fetch and decode one image; settles true when it's ready, false if it failed (never rejects). */
const imgCache = new Map()
export function decodeImage(src) {
  if (!src) return Promise.resolve(false)
  if (imgCache.has(src)) return imgCache.get(src)
  const job = new Promise((done) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => (img.decode ? img.decode().then(() => done(true), () => done(true)) : done(true))
    img.onerror = () => done(false)
    img.src = src
  })
  imgCache.set(src, job)
  return job
}

const timeout = (ms) => new Promise((r) => setTimeout(() => r('timeout'), ms))

/**
 * Resolves 'play' once the intro can start (`head` decoded with its silhouette, plus `assets`,
 * `masks`' paper and the display font, or WAIT has passed with at least the head in), or 'skip'
 * when the head hasn't arrived by HEAD_WAIT. Called again (StrictMode, a remount) it reuses the jobs.
 */
export function introReady({ head, assets = [] }) {
  const t0 = performance.now()
  const headJob = Promise.all([decodeImage(head), loadSilhouette(head)]).then(([ok, sil]) => ok && !!sil)
  const fonts = document.fonts
    ? Promise.all(['600 1em "Inter Tight"', '700 1em "Inter Tight"'].map((f) => document.fonts.load(f))).catch(() => {})
    : Promise.resolve()
  // the lid's paper (its hard edge, soft shadow and back) is cut from the head: have it ready for the peel
  const paper = [loadHardMask(head), loadSoftMask(head), loadBackTex(head)].map((p) => Promise.resolve(p).catch(() => {}))
  const all = Promise.all([headJob, fonts, ...paper, ...assets.map(decodeImage)])
  const left = (ms) => Math.max(0, ms - (performance.now() - t0))
  return Promise.race([all, timeout(WAIT)]).then(async () => {
    const ok = await Promise.race([headJob, timeout(left(HEAD_WAIT)).then(() => false)])
    return ok ? 'play' : 'skip'
  })
}

/** Resolves once the tab is on screen (the intro never starts, or runs its clock, unseen). */
export function whenVisible() {
  if (document.visibilityState !== 'hidden') return Promise.resolve()
  return new Promise((r) => {
    const on = () => {
      if (document.visibilityState === 'hidden') return
      document.removeEventListener('visibilitychange', on)
      r()
    }
    document.addEventListener('visibilitychange', on)
  })
}

/**
 * While the intro waits for its files, the page is a plain sheet: <html data-intro="wait"> (set
 * from the first frame, see App.jsx) hides the header (App.css) and the page under it is inert, so
 * Tab can't land on, and scroll to, something not shown yet. `waiting(false)` lifts both.
 */
export function waiting(on) {
  const root = document.documentElement
  if (on) root.dataset.intro = 'wait'
  else delete root.dataset.intro
  const app = document.getElementById('root')
  if (app) app.inert = !!on
}

/** Back to the top, the native scroll and Lenis' own idea of it both. */
export function toTop() {
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  const l = window.__lenis
  if (l && (l.scroll || l.targetScroll)) l.scrollTo(0, { immediate: true, force: true })
}

/**
 * Holds the page still (Lenis stopped, plus wheel / touch / scroll keys blocked natively, which also
 * covers the moments before Lenis exists). No overflow:hidden, so a desktop scrollbar never
 * disappears and the layout never shifts. Returns the release; calling it twice is harmless.
 */
export function lockScroll() {
  let on = true
  let id = 0
  // scroll keys never scroll while locked, whatever has focus (a focused link or button would
  // otherwise let End / PageDown / arrows through). Only text entry keeps its keys, and Space
  // still presses a focused button (it doesn't scroll there).
  const KEYS = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'])
  const typing = (el) => el && el.closest && el.closest('input, textarea, select, [contenteditable]')
  const pressable = (el) => el && el.closest && el.closest('button, [role="button"], summary')
  const block = (e) => {
    if (e.type === 'keydown' && (!KEYS.has(e.key) || typing(e.target) || (e.key === ' ' && pressable(e.target)))) return
    if (e.cancelable) e.preventDefault()
  }
  const opts = { capture: true, passive: false }
  ;['wheel', 'touchmove', 'keydown'].forEach((t) => window.addEventListener(t, block, opts))
  // Lenis is created in an effect that may run after ours: keep it stopped while the lock is on
  const hold = () => {
    if (!on) return
    const l = window.__lenis
    if (l && !l.isStopped) l.stop()
    id = requestAnimationFrame(hold)
  }
  hold()
  return () => {
    if (!on) return
    on = false
    cancelAnimationFrame(id)
    ;['wheel', 'touchmove', 'keydown'].forEach((t) => window.removeEventListener(t, block, opts))
    window.__lenis?.start()
  }
}

/**
 * What counts as the visitor scrolling, to skip the intro: a wheel gesture that began after
 * `since()` (momentum from a flick made before the reload, or during the wait, keeps arriving for a
 * second or more; it's the same gesture, not a new one), a touch drag, or the page itself moving
 * while a mouse button is down (the scrollbar's thumb, middle-click autoscroll). Every other scroll
 * (the browser restoring the old position, scrollTo, Lenis, ScrollTrigger's refresh, focus pulling a
 * link into view, an inner box scrolling) is not the visitor: the page goes back to the top and the
 * intro plays on. A click, a tap or a key never skips. `onSkip(kind)` fires at most once per call
 * of `arm()`. Returns { arm, stop }: before arm() it only keeps the page at the top.
 */
export function watchSkip(onSkip, since) {
  const GAP = 280 // ms without a wheel event that ends a gesture
  let armed = false
  let lastWheel = -Infinity
  let gestureAt = -Infinity
  let buttons = 0
  let touchY = null
  const fire = (kind) => {
    if (!armed) return
    armed = false
    onSkip(kind)
  }
  const onWheel = (e) => {
    const now = performance.now()
    if (now - lastWheel > GAP) gestureAt = now
    lastWheel = now
    if (!e.isTrusted || (!e.deltaY && !e.deltaX)) return
    if (gestureAt >= since()) fire('wheel')
  }
  const onDown = (e) => { buttons = e.buttons }
  const onUp = (e) => { buttons = e.buttons || 0 }
  const onTouchStart = (e) => { touchY = e.touches[0]?.clientY ?? null }
  const onTouchMove = (e) => {
    const y = e.touches[0]?.clientY
    if (touchY != null && y != null && Math.abs(y - touchY) > 24) fire('touch')
  }
  const onTouchEnd = () => { touchY = null }
  const onScroll = (e) => {
    if (e.target !== document && e.target !== window) return // an inner box: not the page
    if (!window.scrollY) return
    if (armed && buttons) { fire('scrollbar'); return }
    toTop()
  }
  const L = [
    ['wheel', onWheel], ['pointerdown', onDown], ['pointerup', onUp], ['mousedown', onDown], ['mouseup', onUp],
    ['touchstart', onTouchStart], ['touchmove', onTouchMove], ['touchend', onTouchEnd], ['touchcancel', onTouchEnd], ['scroll', onScroll],
  ]
  const opts = { capture: true, passive: true }
  L.forEach(([t, f]) => window.addEventListener(t, f, opts))
  return {
    arm: () => { armed = true },
    stop: () => { armed = false; L.forEach(([t, f]) => window.removeEventListener(t, f, opts)) },
  }
}
