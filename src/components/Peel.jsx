import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './Peel.css'

/* ------------------------------------------------------------------ *
 * Shared frame scheduler: one rAF loop for every peel on the page.
 * Each frame runs all `read` callbacks (layout reads) before any
 * `write` callback (style writes), so there is never layout thrash.
 * ------------------------------------------------------------------ */
const subs = new Set()
let rafId = 0
let lastT = 0
let scrollDirty = true
let listening = false

function onScrollOrResize() {
  scrollDirty = true
  kickFrame()
}

export function kickFrame() {
  if (!rafId && typeof window !== 'undefined') rafId = requestAnimationFrame(runFrame)
}

function runFrame(t) {
  rafId = 0
  const dt = lastT ? Math.min((t - lastT) / 1000, 1 / 20) : 1 / 60
  const dirty = scrollDirty
  scrollDirty = false
  const list = Array.from(subs)
  for (const s of list) if (s.read) s.read(dirty)
  let more = false
  for (const s of list) if (s.write && s.write(dt)) more = true
  if (more) {
    lastT = t
    kickFrame()
  } else {
    lastT = 0
  }
}

export function subscribeFrame(sub) {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
  }
  subs.add(sub)
  scrollDirty = true
  kickFrame()
  return () => subs.delete(sub)
}

/* ------------------------------------------------------------------ */

export function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setReduced(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return reduced
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const SQRT2 = Math.SQRT2
const CORNERS = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] }

/** Corner point K and the inward unit signs (ex, ey) for a W×H box. */
function cornerFrame(corner, W, H) {
  const [cx, cy] = CORNERS[corner] || CORNERS.tr
  return { Kx: cx * W, Ky: cy * H, ex: cx ? -1 : 1, ey: cy ? -1 : 1 }
}

/**
 * Clip the rect [x0,y0,x1,y1] against the 45° fold line
 *   ex·(x−Kx) + ey·(y−Ky) = f
 * side = +1 keeps the far (still stuck) side, −1 keeps the corner side.
 */
function clipHalf(x0, y0, x1, y1, fr, f, side) {
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const dist = (p) => side * (fr.ex * (p[0] - fr.Kx) + fr.ey * (p[1] - fr.Ky) - f)
  const out = []
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    const da = dist(a)
    const db = dist(b)
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }
  return out
}

const poly = (pts) =>
  pts.length < 3
    ? 'polygon(0 0, 0 0, 0 0)'
    : `polygon(${pts.map((p) => `${p[0].toFixed(2)}px ${p[1].toFixed(2)}px`).join(',')})`

const mix = (c, other, pct) => `color-mix(in srgb, ${c}, ${other} ${pct}%)`

/**
 * Silhouette prep for alpha stickers (cached per src):
 *  - a hard-alpha mask (drops baked-in soft drop shadows, keeps AA edge)
 *  - row extremes of the opaque area, so a fold can start where the
 *    silhouette actually begins instead of at the empty bbox corner.
 */
const silhouetteCache = new Map()
function loadSilhouette(src) {
  if (silhouetteCache.has(src)) return silhouetteCache.get(src)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        const pts = []
        for (let y = 0; y < h; y++) {
          let minX = -1
          let maxX = -1
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const a = px[i + 3]
            const v = Math.max(0, Math.min(255, ((a - 100) / 70) * 255))
            px[i] = px[i + 1] = px[i + 2] = 0
            px[i + 3] = v
            if (a > 135) {
              if (minX < 0) minX = x
              maxX = x
            }
          }
          if (minX >= 0) pts.push([minX / w, (y + 0.5) / h], [(maxX + 1) / w, (y + 0.5) / h])
        }
        ctx.putImageData(data, 0, 0)
        cv.toBlob((blob) => {
          resolve({ url: blob ? URL.createObjectURL(blob) : src, pts: pts.length ? pts : null })
        })
      } catch {
        resolve({ url: src, pts: null }) // tainted canvas (cross-origin): raw alpha, bbox corner
      }
    }
    img.onerror = () => resolve({ url: src, pts: null })
    img.src = src
  })
  silhouetteCache.set(src, job)
  return job
}

/** Distance along the fold normal from the bbox corner to the first opaque pixel. */
function silhouetteRange(pts, fr, W, H) {
  if (!pts) return [0, W + H]
  let min = Infinity
  let max = -Infinity
  for (const [x, y] of pts) {
    const d = fr.ex * (x * W - fr.Kx) + fr.ey * (y * H - fr.Ky)
    if (d < min) min = d
    if (d > max) max = d
  }
  return [Math.max(0, min - 1), max]
}

/* ------------------------------------------------------------------ *
 * PeelSurface: the renderer. Owns the DOM layers and exposes
 * api.current.render(foldPx). No animation logic here.
 *
 * Layers (all share the element box):
 *   content  – children, clip-path removes the peeled corner
 *   shadow   – reflected silhouette, blurred, cast onto the content
 *   flap     – reflected silhouette (paper backside) with crease shading
 * The flap is the corner triangle mirrored across the fold line, which
 * is a pure CSS matrix, so per-frame work is transform + clip-path only.
 * ------------------------------------------------------------------ */
export function PeelSurface({
  corner = 'tr',
  radius = 0,
  curledRadius,
  backColor = '#f1efe9',
  maskSrc,
  depth = 0.3,
  shadowStrength = 1,
  api,
  onSize,
  className = '',
  style,
  children,
  ...rest
}) {
  const rootRef = useRef(null)
  const contentRef = useRef(null)
  const flapRef = useRef(null)
  const flapStripRef = useRef(null)
  const shadowRef = useRef(null)
  const shadowStripRef = useRef(null)
  const st = useRef({ lift: 0.94, W: 0, H: 0, f: 0, G: 0, D: 0, B: 0, off: 0, span: 0, k: 12 })
  const [sil, setSil] = useState(null)
  const props = useRef(null)
  props.current = { corner, depth, backColor, shadowStrength, onSize, sil }

  useEffect(() => {
    if (!maskSrc) {
      setSil(null)
      return
    }
    let alive = true
    loadSilhouette(maskSrc).then((r) => alive && setSil(r))
    return () => {
      alive = false
    }
  }, [maskSrc])

  const render = useCallback((fIn, liftIn = 0.94) => {
    const s = st.current
    s.f = fIn
    s.lift = liftIn
    const { W, H } = s
    const content = contentRef.current
    const flap = flapRef.current
    const shadow = shadowRef.current
    if (!W || !H || !content || !flap || !shadow) return
    const fr = cornerFrame(props.current.corner, W, H)
    if (fIn < 0.75) {
      content.style.clipPath = ''
      flap.style.visibility = 'hidden'
      shadow.style.visibility = 'hidden'
      return
    }
    const f = Math.min(fIn + s.off, W + H)

    // Content ends just *under* the flap so the crease has no AA seam.
    content.style.clipPath = poly(clipHalf(-1, -1, W + 1, H + 1, fr, f + 0.6, 1))

    const sgn = fr.ex * fr.ey
    const e = fr.Kx + fr.ex * f + sgn * fr.Ky
    const g = fr.Ky + fr.ey * f + sgn * fr.Kx
    // Reflection across the fold, then foreshortening toward the crease
    // (lift < 1 reads as the flap standing up off the surface).
    const lift = Math.max(0.2, Math.min(1, liftIn))
    const Lx = fr.Kx + fr.ex * f
    const Ly = fr.Ky
    const toMatrix = (k, dx, dy) => {
      const c = 1 - k
      const c11 = 1 - c / 2
      const c12 = (-c * sgn) / 2
      const nl = (c * (fr.ex * Lx + fr.ey * Ly)) / 2
      // C·A with A = [[0,-s],[-s,0]]
      const a = -sgn * c12
      const cc = -sgn * c11
      const b = -sgn * c11
      const d = -sgn * c12
      const tx = c11 * e + c12 * g + fr.ex * nl + dx
      const ty = c12 * e + c11 * g + fr.ey * nl + dy
      return `matrix(${a.toFixed(5)},${b.toFixed(5)},${cc.toFixed(5)},${d.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`
    }
    const M = toMatrix(lift, 0, 0)

    flap.style.visibility = 'visible'
    flap.style.transform = M
    flap.style.clipPath = poly(clipHalf(-1, -1, W + 1, H + 1, fr, f, -1))

    const q = f / 2 + s.G / SQRT2 - s.D
    const strip = `translate(${fr.Kx}px,${fr.Ky}px) scale(${fr.ex},${fr.ey}) translate(${q.toFixed(2)}px,${q.toFixed(2)}px)`
    flapStripRef.current.style.transform = strip
    shadowStripRef.current.style.transform = strip

    // Shadow: same silhouette, pushed inward (and a touch down, light from above).
    // The higher the flap stands (lower lift), the longer and further its shadow.
    const k = Math.min(fIn, s.k * 1.6)
    const up = 1 - lift
    const d = (0.8 + k * 0.07 + up * fIn * 0.12) / SQRT2
    const drop = 0.6 + k * 0.035 + up * fIn * 0.05
    shadow.style.visibility = 'visible'
    shadow.style.opacity = String(1 - up * 0.45)
    shadow.style.transform = toMatrix(Math.min(1, lift + up * 0.55), fr.ex * d, fr.ey * d + drop)
    shadow.style.clipPath = poly(clipHalf(-s.B, -s.B, W + s.B, H + s.B, fr, f, -1))
  }, [])

  const setup = useCallback(
    (W, H) => {
      const s = st.current
      s.W = W
      s.H = H
      if (!W || !H) return
      const p = props.current
      const m = Math.min(W, H)
      const [lo, hi] = silhouetteRange(p.sil && p.sil.pts, cornerFrame(p.corner, W, H), W, H)
      s.off = lo
      s.span = hi - lo
      const depthPx = p.depth <= 1 ? p.depth * m : p.depth
      const k = Math.max(12, depthPx / SQRT2) // typical flap depth (crease → tip)
      s.k = k
      s.G = (W + H) / SQRT2 + 4
      s.D = W + H + 12
      const blur = Math.max(2.5, Math.min(14, m * 0.028 + k * 0.05))
      s.B = blur * 3 + 6
      const G = s.G
      const bc = p.backColor
      const px = (v) => `${(G + v).toFixed(2)}px`
      const flapGrad = `linear-gradient(315deg,
        ${bc} 0px, ${bc} ${px(0)},
        ${mix(bc, '#000', 26)} ${px(0)},
        ${mix(bc, '#fff', 85)} ${px(1.1)},
        ${mix(bc, '#fff', 60)} ${px(2.6)},
        ${mix(bc, '#000', 15)} ${px(Math.max(6, k * 0.16))},
        ${mix(bc, '#000', 6)} ${px(k * 0.42)},
        ${mix(bc, '#fff', 55)} ${px(k * 0.85)},
        ${bc} ${px(k * 1.25)},
        ${mix(bc, '#000', 8)} ${px(k * 2.2)})`
      const a = 0.55 * p.shadowStrength
      const shadowGrad = `linear-gradient(315deg,
        rgba(6,8,22,0) 0px, rgba(6,8,22,0) ${px(0)},
        rgba(6,8,22,${(a * 0.35).toFixed(3)}) ${px(Math.max(4, k * 0.12))},
        rgba(6,8,22,${(a * 0.85).toFixed(3)}) ${px(k * 0.7)},
        rgba(6,8,22,${a.toFixed(3)}) ${px(k * 1.4)})`
      for (const [el, bg] of [
        [flapStripRef.current, flapGrad],
        [shadowStripRef.current, shadowGrad],
      ]) {
        el.style.width = `${s.D}px`
        el.style.height = `${s.D}px`
        el.style.backgroundImage = bg
      }
      shadowRef.current.style.setProperty('--peel-blur', `${blur.toFixed(2)}px`)
      render(s.f, s.lift)
      if (p.onSize) p.onSize(W, H)
    },
    [render],
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    setup(root.offsetWidth, root.offsetHeight)
    const ro = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect
      if (Math.abs(r.width - st.current.W) > 0.5 || Math.abs(r.height - st.current.H) > 0.5)
        setup(r.width, r.height)
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [setup])

  // Re-run setup when appearance inputs change.
  useLayoutEffect(() => {
    setup(st.current.W, st.current.H)
  }, [setup, corner, depth, backColor, shadowStrength, sil])

  useLayoutEffect(() => {
    if (!api) return
    api.current = {
      render,
      size: () => ({ W: st.current.W, H: st.current.H, off: st.current.off, span: st.current.span }),
      root: rootRef,
    }
    return () => {
      api.current = null
    }
  }, [api, render])

  const masked = !!maskSrc
  const cr = curledRadius ?? Math.max(radius * 1.5, Math.min(radius, 6))
  const flapRadius = masked
    ? undefined
    : {
        borderTopLeftRadius: corner === 'tl' ? cr : radius,
        borderTopRightRadius: corner === 'tr' ? cr : radius,
        borderBottomLeftRadius: corner === 'bl' ? cr : radius,
        borderBottomRightRadius: corner === 'br' ? cr : radius,
      }
  const maskUrl = (sil && sil.url) || maskSrc
  const maskStyle = masked
    ? { WebkitMaskImage: `url("${maskUrl}")`, maskImage: `url("${maskUrl}")` }
    : undefined

  return (
    <div
      ref={rootRef}
      className={`peel ${masked ? 'peel--mask' : ''} ${className}`.trim()}
      style={{ '--peel-radius': `${radius}px`, '--peel-back': backColor, ...style }}
      {...rest}
    >
      <div ref={contentRef} className="peel__content">
        {children}
      </div>
      <div ref={shadowRef} className="peel__shadow" aria-hidden="true">
        <div className="peel__fill" style={{ ...flapRadius, ...maskStyle }}>
          <div ref={shadowStripRef} className="peel__strip" />
        </div>
      </div>
      <div ref={flapRef} className="peel__flap" aria-hidden="true" style={{ ...flapRadius, ...maskStyle }}>
        <div ref={flapStripRef} className="peel__strip" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Peel: sticker card with a corner that lifts on hover / scroll.
 *
 * Fold values are px; values <= 1 are treated as a fraction of the
 * card's shorter side (so one config works from 120px to 600px cards).
 * ------------------------------------------------------------------ */
export default function Peel({
  corner = 'tr',
  foldRest = 0.12,
  foldHover = 0.34,
  radius = 16,
  curledRadius,
  scrollPeel = false,
  progress,
  backColor = '#f1efe9',
  maskSrc,
  maxRatio = 0.85,
  className = '',
  style,
  children,
  ...rest
}) {
  const api = useRef(null)
  const reduced = useReducedMotion()
  const st = useRef({ f: null, v: 0, hover: false, scrollT: 0, inView: false, timer: 0, rendered: -1 })
  const cfg = useRef(null)
  cfg.current = { foldRest, foldHover, scrollPeel, progress, reduced, maxRatio }

  const target = useCallback(() => {
    const a = api.current
    if (!a) return 0
    const { W, H } = a.size()
    const c = cfg.current
    const m = Math.min(W, H)
    const lim = c.maxRatio * m
    const px = (v) => Math.min(lim, v <= 1 ? v * m : v)
    const rest = px(c.foldRest)
    const hov = Math.max(rest, px(c.foldHover))
    if (c.reduced) return rest
    if (c.progress != null) return rest + clamp01(c.progress) * (hov - rest)
    const s = st.current
    let t = c.scrollPeel ? rest + s.scrollT * (hov - rest) : rest
    if (s.hover) t = Math.min(lim, Math.max(hov, t + (hov - rest) * 0.3))
    return t
  }, [])

  useEffect(() => {
    const s = st.current
    const unsub = subscribeFrame({
      read(dirty) {
        const c = cfg.current
        if (!dirty || !c.scrollPeel || c.reduced || c.progress != null || !s.inView) return
        const root = api.current && api.current.root.current
        if (!root) return
        const r = root.getBoundingClientRect()
        const vh = window.innerHeight
        // 0 when the top edge enters the viewport, 1 when its centre reaches the viewport centre
        const raw = clamp01((vh - r.top) / ((vh + r.height) / 2))
        s.scrollT = smoothstep(0, 1, raw)
      },
      write(dt) {
        const a = api.current
        if (!a) return false
        const c = cfg.current
        const t = target()
        if (s.f == null || c.reduced || c.progress != null) {
          s.f = t
          s.v = 0
          if (Math.abs(s.rendered - t) > 0.01) {
            a.render(t)
            s.rendered = t
          }
          return false
        }
        // Slightly under-damped spring: paper settles with a hint of bounce.
        const K = 210
        const C = 23
        let steps = Math.max(1, Math.ceil(dt / (1 / 120)))
        const h = dt / steps
        while (steps--) {
          const acc = K * (t - s.f) - C * s.v
          s.v += acc * h
          s.f += s.v * h
        }
        const done = Math.abs(t - s.f) < 0.05 && Math.abs(s.v) < 0.5
        if (done) {
          s.f = t
          s.v = 0
        }
        if (Math.abs(s.rendered - s.f) > 0.01) {
          a.render(s.f)
          s.rendered = s.f
        }
        return !done
      },
    })
    return () => {
      unsub()
      clearTimeout(s.timer)
    }
  }, [target])

  // Track visibility so off-screen cards skip scroll reads and drop will-change.
  useEffect(() => {
    const root = api.current && api.current.root.current
    if (!root) return
    const io = new IntersectionObserver(
      ([entry]) => {
        st.current.inView = entry.isIntersecting
        root.classList.toggle('is-live', entry.isIntersecting && !cfg.current.reduced)
        onScrollOrResize()
      },
      { rootMargin: '10% 0px' },
    )
    io.observe(root)
    return () => io.disconnect()
  }, [])

  // Controlled progress: render synchronously so parent scroll-scrubbing is exact.
  useLayoutEffect(() => {
    if (progress == null || !api.current) return
    const t = target()
    st.current.f = t
    st.current.rendered = t
    api.current.render(t)
  }, [progress, foldRest, foldHover, reduced, target])

  useEffect(() => {
    kickFrame()
  }, [foldRest, foldHover, scrollPeel, reduced, maxRatio])

  const setHover = (on) => {
    st.current.hover = on
    kickFrame()
  }
  const onSize = useCallback(() => {
    st.current.rendered = -1
    onScrollOrResize()
  }, [])

  return (
    <PeelSurface
      api={api}
      onSize={onSize}
      corner={corner}
      radius={radius}
      curledRadius={curledRadius}
      backColor={backColor}
      maskSrc={maskSrc}
      depth={foldHover}
      className={className}
      style={style}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setHover(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') setHover(false)
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'touch') return
        const s = st.current
        clearTimeout(s.timer)
        setHover(!s.hover)
        if (s.hover) s.timer = setTimeout(() => setHover(false), 1500)
      }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      {...rest}
    >
      {children}
    </PeelSurface>
  )
}
