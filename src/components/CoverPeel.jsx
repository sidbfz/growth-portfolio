import { useLayoutEffect, useState } from 'react'
import './CoverPeel.css'

// The intro's lid: only the top of the head (hair and upper forehead, down to the ragged tear) is a
// separate sticker on top. It comes loose at the left end of the tear and peels up and over towards the
// top-right along a straight crease leaning like "\\". N is the unit normal of that crease, pointing at
// the part still stuck down (to the right and up): everything that peels is flipped towards +N, i.e.
// further up, so the loose paper never comes down over the face.
const LID_TILT = 16 // deg above horizontal
export const N = [Math.cos((LID_TILT * Math.PI) / 180), -Math.sin((LID_TILT * Math.PI) / 180)]
const ANGLE = (Math.atan2(N[0], -N[1]) * 180) / Math.PI // CSS gradient angle whose direction equals N

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Clip a polygon by the half-plane x·n <= d (keep = 'peeled') or >= d (keep = 'stuck'). */
export function clipHalf(pts, d, keep, n = N) {
  const side = (p) => (p[0] * n[0] + p[1] * n[1] - d) * (keep === 'peeled' ? -1 : 1)
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const sa = side(a), sb = side(b)
    if (sa >= 0) out.push(a)
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}
export const toClip = (pts) => (pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`)

/**
 * Silhouette of a sticker image: the left/right extremes of the opaque area per row, normalised
 * to 0..1 of the image box. Lets the fold start exactly where the head begins and end where it
 * ends, instead of wasting time sweeping across the empty corners of the box. Cached per src.
 */
const silCache = new Map()
export function loadSilhouette(src) {
  if (!src) return Promise.resolve(null)
  if (silCache.has(src)) return silCache.get(src)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = 120
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const px = ctx.getImageData(0, 0, w, h).data
        const pts = []
        for (let y = 0; y < h; y++) {
          let lo = -1, hi = -1
          for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 110) {
              if (lo < 0) lo = x
              hi = x
            }
          }
          if (lo >= 0) pts.push([lo / w, y / h], [(hi + 1) / w, (y + 1) / h])
        }
        resolve(pts.length ? pts : null)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  silCache.set(src, job)
  return job
}

/**
 * A hard-alpha copy of a sticker image (as a blob URL), for masks: the soft glow some of the
 * images carry around their outline would otherwise show up as a pale halo on a paper flap.
 */
const hardCache = new Map()
export function loadHardMask(src) {
  if (!src) return Promise.resolve(null)
  if (hardCache.has(src)) return hardCache.get(src)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = Math.min(img.naturalWidth, 1000) // full res: a smaller mask shows as stair-steps on 2x screens
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        for (let i = 0; i < px.length; i += 4) {
          px[i] = px[i + 1] = px[i + 2] = 0
          px[i + 3] = Math.max(0, Math.min(255, ((px[i + 3] - 100) / 70) * 255))
        }
        ctx.putImageData(data, 0, 0)
        cv.toBlob((b) => resolve(b ? URL.createObjectURL(b) : src))
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
  hardCache.set(src, job)
  return job
}

export function useHardMask(src) {
  const [url, setUrl] = useState(null)
  useLayoutEffect(() => {
    let alive = true
    loadHardMask(src).then((u) => {
      if (alive) setUrl(u)
      if (u) preloadPaper(u) // a hard mask is usually wanted for a paper flap: get its back and shadows ready
    })
    return () => { alive = false }
  }, [src])
  return url
}

/**
 * A blurred copy of a sticker's alpha (as a blob URL), blurred once on load, for masking shadows:
 * a shadow then follows the paper's real outline but with a penumbra, so it never ends in a hard
 * cut. Blurring here instead of with CSS `filter` keeps the big layers filter-free (Chrome drops
 * filtered full-sticker layers) and costs nothing per frame. `w` is the working width and R the box
 * radius (three passes each way ≈ a gaussian): (200, 2) gives a penumbra of ~1.2% of the sticker's width.
 */
const blurCache = new Map()
function loadBlurMask(src, w, R) {
  if (!src) return Promise.resolve(null)
  const key = `${w}:${R}:${src}`
  if (blurCache.has(key)) return blurCache.get(key)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        const a = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) a[i] = Math.max(0, Math.min(1, (px[i * 4 + 3] - 100) / 70))
        boxBlur(a, w, h, R, 3)
        for (let i = 0; i < w * h; i++) {
          px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0
          px[i * 4 + 3] = Math.round(a[i] * 255)
        }
        ctx.putImageData(data, 0, 0)
        cv.toBlob((bl) => resolve(bl ? URL.createObjectURL(bl) : null))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  blurCache.set(key, job)
  return job
}

/** In-place box blur of a w×h float image, `passes` times each way (edges clamped). */
function boxBlur(a, w, h, R, passes) {
  const b = new Float32Array(w * h)
  const n = 2 * R + 1
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      let s = 0
      for (let k = -R; k <= R; k++) s += a[row + Math.min(w - 1, Math.max(0, k))]
      for (let x = 0; x < w; x++) {
        b[row + x] = s / n
        s += a[row + Math.min(w - 1, x + R + 1)] - a[row + Math.max(0, x - R)]
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let k = -R; k <= R; k++) s += b[Math.min(h - 1, Math.max(0, k)) * w + x]
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n
        s += b[Math.min(h - 1, y + R + 1) * w + x] - b[Math.max(0, y - R) * w + x]
      }
    }
  }
}

export const loadSoftMask = (src) => loadBlurMask(src, 200, 2)

function useAsync(load, src) {
  const [url, setUrl] = useState(null)
  useLayoutEffect(() => {
    let alive = true
    load(src).then((u) => alive && setUrl(u))
    return () => { alive = false }
  }, [load, src])
  return url
}
export const useSoftMask = (src) => useAsync(loadSoftMask, src)

/**
 * The back of the sticker, as an image (blob URL) the size of the sticker: a matte, slightly cool
 * off-white (the adhesive side, a shade greyer than the printed white border, so it never melts into
 * the cream page), with a fine paper grain, a faint mottle, and a thin darker rim along the die-cut
 * edge (where the paper's thickness catches the shade), transparent outside the outline.
 */
export const BACK = [239, 237, 233]
const backCache = new Map()
export function loadBackTex(src) {
  if (!src) return Promise.resolve(null)
  if (backCache.has(src)) return backCache.get(src)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = Math.min(img.naturalWidth, 640)
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        const a = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) a[i] = Math.max(0, Math.min(1, (px[i * 4 + 3] - 100) / 70))
        const e = a.slice()
        boxBlur(e, w, h, Math.max(1, Math.round(w / 320)), 2)
        // a faint low-frequency mottle: a coarse random grid, bilinear
        const G = 14
        const gw = Math.ceil(w / G) + 2
        const gh = Math.ceil(h / G) + 2
        let seed = 7
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        const grid = Array.from({ length: gw * gh }, () => rnd() - 0.5)
        for (let y = 0; y < h; y++) {
          const gy = y / G, y0 = Math.floor(gy), fy = gy - y0
          for (let x = 0; x < w; x++) {
            const i = y * w + x
            const al = a[i]
            if (al <= 0) { px[i * 4 + 3] = 0; continue }
            const gx = x / G, x0 = Math.floor(gx), fx = gx - x0
            const m = (grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x0 + 1] * fx) * (1 - fy) + (grid[(y0 + 1) * gw + x0] * (1 - fx) + grid[(y0 + 1) * gw + x0 + 1] * fx) * fy
            const rim = Math.max(0, Math.min(1, (1 - e[i]) * 2.2))
            const f = 1 - 0.2 * rim * rim + 0.012 * m + 0.014 * (rnd() - 0.5)
            px[i * 4] = Math.round(BACK[0] * f)
            px[i * 4 + 1] = Math.round(BACK[1] * f)
            px[i * 4 + 2] = Math.round(BACK[2] * f)
            px[i * 4 + 3] = Math.round(al * 255)
          }
        }
        ctx.putImageData(data, 0, 0)
        cv.toBlob((bl) => resolve(bl ? URL.createObjectURL(bl) : null))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  backCache.set(src, job)
  return job
}
const useBackTex = (src) => useAsync(loadBackTex, src)

/** Make a sticker's paper back and shadow masks ahead of time, when the page is idle (not when the peel starts). */
export function preloadPaper(src) {
  if (!src || typeof window === 'undefined') return
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200))
  idle(() => { loadSoftMask(src); loadBackTex(src) })
}

export function useSilhouette(src) {
  const [pts, setPts] = useState(null)
  useLayoutEffect(() => {
    let alive = true
    loadSilhouette(src).then((p) => alive && setPts(p))
    return () => { alive = false }
  }, [src])
  return pts
}

/**
 * Measure an element's size (px), live. `vis` is how much of its height is inside the viewport
 * when measured (by layout, ignoring transforms), so the intro can sweep the part
 * people can actually see.
 */
export function useBoxSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0, vis: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      // layout position, not the painted one: the box may be mid-transform (the intro's rise)
      let top = -window.scrollY
      for (let n = el; n; n = n.offsetParent) top += n.offsetTop
      const vis = Math.min(h, Math.max(h * 0.35, window.innerHeight - top))
      setSize((o) => (Math.abs(o.w - w) < 0.5 && Math.abs(o.h - h) < 0.5 && Math.abs(o.vis - vis) < 1 ? o : { w, h, vis }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return size
}
/**
 * The lid's outlines (px, in the head box), from the tear line (`tear`, in % of the box, as TornHead's
 * tearLine) and the head's silhouette (`pts`, see loadSilhouette):
 *  - cover: what lies stuck down before the peel: everything above the tear plus `ov` below it, so
 *    the face's torn white edge and its shadow stay hidden under it (it is the same drawing as the
 *    face there, so the overlap never shows);
 *  - paper: the loose paper's outline, which ends at the tear itself (the white fibres belong to
 *    the face's torn edge, which the lid uncovers as it lifts).
 * Both are trimmed to the hair's extent, so the paper's free end is where the paper really ends.
 * d0/d1: the crease positions (along N) where the lid starts to come loose and where it is all loose.
 */
const lidCache = new WeakMap()
export function lidGeom(w, h, tear, pts) {
  if (!w || !tear) return null
  let byTear = lidCache.get(tear)
  if (!byTear) lidCache.set(tear, (byTear = new Map()))
  const key = `${w.toFixed(1)}|${h.toFixed(1)}|${pts ? pts.length : 0}`
  if (byTear.has(key)) return byTear.get(key)
  const ov = 0.016 * h + 6
  const line = tear.map(([x, y]) => [(x * w) / 100, (y * h) / 100])
  const tearAt = (x) => {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i], [bx, by] = line[i + 1]
      if (x >= ax && x <= bx) return ay + ((by - ay) * (x - ax)) / Math.max(1e-6, bx - ax)
    }
    return x < line[0][0] ? line[0][1] : line[line.length - 1][1]
  }
  // the silhouette's rows above the tear: the hair's extent, and the lid's real outline points
  let xl = 0, xr = w, yt = 0
  const real = []
  if (pts) {
    xl = Infinity; xr = -Infinity; yt = Infinity
    const rows = []
    for (let i = 0; i + 1 < pts.length; i += 2) rows.push([pts[i][1] * h, pts[i][0] * w, pts[i + 1][0] * w])
    for (const [y, lo, hi] of rows) {
      if (y <= tearAt(lo) + 1) { xl = Math.min(xl, lo); yt = Math.min(yt, y); real.push([lo, y]) }
      if (y <= tearAt(hi) + 1) { xr = Math.max(xr, hi); yt = Math.min(yt, y); real.push([hi, y]) }
    }
    // ...and the tear itself, where it runs across the head
    for (const [x, y] of line) {
      const row = rows.reduce((b, r) => (Math.abs(r[0] - y) < Math.abs(b[0] - y) ? r : b), rows[0])
      if (row && x >= row[1] && x <= row[2]) real.push([x, y])
    }
    if (!(xl < xr)) { xl = 0; xr = w; yt = 0 }
  }
  const pad = 0.012 * w + 3
  const mk = (dy) => {
    const poly = [[line[0][0], yt - pad], [line[line.length - 1][0], yt - pad], ...line.slice().reverse().map(([x, y]) => [x, y + dy])]
    return clipHalf(clipHalf(poly, xl - pad, 'stuck', [1, 0]), xr + pad, 'peeled', [1, 0])
  }
  const paper = mk(1)
  const src = real.length ? real : paper
  let d0 = Infinity, d1 = -Infinity
  for (const [x, y] of src) {
    const v = x * N[0] + y * N[1]
    d0 = Math.min(d0, v)
    d1 = Math.max(d1, v)
  }
  const out = { cover: mk(ov), paper, d0: d0 - 3, d1: d1 + 3 }
  byTear.set(key, out)
  return out
}

/**
 * The whole peel, as a pure function of intro progress t (0..1, linear in time). The lid is thin
 * paper: where it has come loose it rolls over a small cylinder (radius r) at the crease d and lies
 * back, upside down and bending up off the roll, over the part still stuck down (see PaperFlap) —
 * always further up the head, never down over the face.
 *  0.00–SWEEP_END  the crease sweeps across the lid from the left end of the tear to its top-right,
 *                  starting slow and speeding up; the curl starts tight and loosens to its full radius
 *  SWEEP_END–1     the last of it lets go without a pause and the loose lid is thrown off: the crease
 *                  runs on past the head, which slides the flipped lid away up and to the right (along
 *                  N, about twice as fast as the line moves), accelerating, with a little spin
 */
export const SWEEP_END = 0.64
const SWEEP_V = 0.8 // the sweep's speed as it ends, in (d1 - d0) per unit of its own time: the throw carries on from it
export function coverState(t, w, h, pts, tear) {
  const g = lidGeom(w, h, tear, pts)
  const d0 = g ? g.d0 : -4
  const d1 = g ? g.d1 : w * N[0] + 4
  const x = clamp01(t / SWEEP_END)
  const s = x * x * (3 - SWEEP_V - (2 - SWEEP_V) * x) // 0 → 1, slope 0 → SWEEP_V
  const u = clamp01((t - SWEEP_END) / (1 - SWEEP_END)) // the throw
  const vw = typeof window !== 'undefined' ? Math.max(window.innerWidth, window.innerHeight) : 2000
  const throwBy = 0.55 * vw + 0.5 * w // the lid moves ~2× this: off the screen
  const carry = ((d1 - d0) * SWEEP_V * (1 - SWEEP_END)) / SWEEP_END
  const d = d0 + s * (d1 - d0) + carry * u + throwBy * u * u * u
  const R = 0.05 * w
  const r = Math.max(0.5, Math.min(R, (d - d0) / (Math.PI * 1.6)))
  // the loose paper comes up off the roll level and bends up as it goes (see PaperFlap)
  return { d, d0, d1, r, k: 1, bend: 0.3 * w, s, u, spin: -12 * u * u * u, geom: g }
}

/**
 * Where the lifting lid is at intro progress t, for the eyes to look at: the middle of its loose
 * part as it lies flipped up off the roll (px, in the head box). null before it starts.
 */
export function peelTip(t, w, h, pts, tear) {
  if (!w || t <= 0) return null
  const { d, r, k, bend, geom } = coverState(t, w, h, pts, tear)
  if (!geom) return null
  const loose = clipHalf(geom.paper, d, 'peeled')
  if (loose.length < 3) return null
  let A = 0, cx = 0, cy = 0
  for (let i = 0; i < loose.length; i++) {
    const [ax, ay] = loose[i], [bx, by] = loose[(i + 1) % loose.length]
    const c = ax * by - bx * ay
    A += c; cx += (ax + bx) * c; cy += (ay + by) * c
  }
  if (Math.abs(A) < 1) return null
  cx /= 3 * A; cy /= 3 * A
  const v = cx * N[0] + cy * N[1]
  const T = d - Math.PI * r
  const at = v >= T ? d - r : d + flapProfile(k, bend).prof(T - v)[1]
  return [cx + (at - v) * N[0], cy + (at - v) * N[1]]
}

/** Clip-path for content that should only show where the lid has already come loose (e.g. the objects). */
export function peeledClip(t, w, h, pts, tear) {
  if (t >= 1) return 'none'
  if (!w) return 'polygon(0 0, 0 0, 0 0)'
  const { d } = coverState(t, w, h, pts, tear)
  const big = [[-w, -h * 1.2], [w * 2, -h * 1.2], [w * 2, h * 2], [-w, h * 2]]
  return toClip(clipHalf(big, d, 'peeled'))
}

/**
 * The profile of a loose flap (see PaperFlap): it leaves the top of the roll at an angle acos(k) and
 * bends up with radius `bend` until it stands at PHI_MAX. prof(s) = [tilt, screen offset along n past
 * the crease, height above the roll's top] for the paper s past the top of the roll.
 */
export function flapProfile(k, bend) {
  const ph0 = Math.acos(Math.max(0.05, Math.min(1, k)))
  const phM = bend > 0 ? Math.min(1.43, Math.max(ph0, PHI_MAX)) : ph0
  const sCap = bend > 0 ? bend * (phM - ph0) : 0
  const prof = (s) => {
    if (s <= sCap && sCap > 0) return [ph0 + s / bend, bend * (Math.sin(ph0 + s / bend) - Math.sin(ph0)), bend * (Math.cos(ph0) - Math.cos(ph0 + s / bend))]
    const [, p, z] = sCap > 0 ? prof(sCap) : [0, 0, 0]
    return [phM, p + (s - sCap) * Math.cos(phM), z + (s - sCap) * Math.sin(phM)]
  }
  return { ph0, phM, sCap, prof }
}

/**
 * The flap transform: reflection across the crease x·n = d, foreshortened by k towards it.
 * `lift` = [L, h0, g, T] adds a shadow's offset: each point moves by L·height, where the paper's
 * height above the surface is h0 + g·(T − x·n) (affine, so it stays one matrix).
 */
export function foldMatrix(n, d, k, lift) {
  const [nx, ny] = n
  const c = 1 + k
  let a = 1 - c * nx * nx, b = -c * nx * ny, cc = -c * nx * ny, dd = 1 - c * ny * ny, e = c * d * nx, f = c * d * ny
  if (lift) {
    const [[lx, ly], h0, g, T] = lift
    a -= g * lx * nx; cc -= g * lx * ny; e += lx * (h0 + g * T)
    b -= g * ly * nx; dd -= g * ly * ny; f += ly * (h0 + g * T)
  }
  return `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${cc.toFixed(5)}, ${dd.toFixed(5)}, ${e.toFixed(2)}, ${f.toFixed(2)})`
}

// Light comes from above and a little to the left (as for the head's own drop shadow): a shadow
// lands this far away on screen (px) per px of height above the page.
const LIGHT = [0.14, 0.42]
const LN = Math.hypot(LIGHT[0], LIGHT[1], 1)
// a shadow in the theme's warm tone, at alpha a (multiplied onto whatever is underneath)
const shadowAt = (a) => (a <= 0.001 ? 'transparent' : `color-mix(in srgb, var(--shadow) ${(a * 100).toFixed(1)}%, transparent)`)

// Lighting of the paper's back. `t` is how far the light comes from the uncovered side (x·n of the
// light's slope; > 0 for the cover). Lambert terms for the roll's outer surface at angle θ (π/2 = its
// outer side, π = its top) and for the lifted flap tilted up by φ (0 = lying flat), continuous at
// the top of the roll; then a brightness (1 = the back texture as drawn) and the overlay that makes it.
const lamCurl = (th, t) => (t * Math.sin(th) - Math.cos(th)) / LN
const lamFlap = (ph, t) => (t * Math.sin(ph) + Math.cos(ph)) / LN
// (plus the light from the whole sky above: a part tilted up by `tilt` sees less of it)
const lightOf = (lam, tilt = 0) => 0.6 + 0.44 * lam + 0.05 * Math.pow(Math.max(0, lam), 40) - 0.16 * (1 - Math.cos(tilt))
// (the shade saturates softly: paper turned well away from the light still reads as light paper, not grey plastic)
const tone = (b) => (b >= 1 ? `rgba(255, 255, 255, ${Math.min(0.6, (b - 1) * 2.5).toFixed(3)})` : `rgba(48, 40, 36, ${(0.42 * (1 - Math.exp(-2.8 * (1 - b)))).toFixed(3)})`)
const CURL_TH = Array.from({ length: 17 }, (_, i) => 1 - i / 32) // π → π/2, the visible quarter

// the flap leaves the top of the roll and bends up (radius `bend`) until it stands at PHI_MAX
const PHI_MAX = 1.2 // rad, ~69°
const SEGS = 5 // the bend is drawn as this many flat facets (its shading is smooth regardless)

/**
 * A loose part of a thin paper sticker, peeling up. In the sticker box (px), the paper `poly` (masked
 * to the sticker's alpha by `mask`) is glued down where x·n >= d; past that line it rolls over a
 * cylinder of radius r (seen from above: a band r wide just on the loose side of the line, its back
 * shaded like a cylinder, brightest along the top) and then comes back up over the stuck part, upside
 * down: leaving the roll at an angle acos(k) (k = 1: level) and bending further up with radius
 * `bend` (px; 0 = straight) until it stands at ~69°, like a sticker held by its free end. Seen from
 * above it is foreshortened accordingly (drawn as SEGS facets, each an affine squeeze).
 * The back (`back`, see loadBackTex: matte off-white, paper grain, darker die-cut rim) is shaded
 * by its angle to the light: brightest along the top of the roll and just after it, darkening as
 * the flap turns up and away. No crease line: the paper has no thickness.
 *
 * Shadows, all drawn in the paper's own coordinates (so they take the shape of the paper that
 * casts them, never a geometric band), masked by `soft` (the sticker's alpha, pre-blurred):
 *  - at the base of the roll, on what it is uncovering: darkest against the roll, gone within about
 *    half a radius (a bit more when the light throws it that way);
 *  - under the flap near the roll, where it is still low: the flap's outline moved by the light by
 *    its height, fairly dark, fading out as the flap rises;
 *  - under the whole flap: the same, lighter, its offset kept short (a broad light), so it shows as
 *    a soft shadow just past the flap's free end and sides, on the head and on the page beside it.
 * `face` (the sticker's printed image, drawn object-fit: contain) shows on the inside of the roll's
 * lower quarter where the paper leaves the page: seen from above wherever the roll's top doesn't
 * cover it, e.g. at its ends, so the sticker visibly bends up there instead of stopping in a cut.
 * `ang`/`o` lay CSS gradients along n (o = the x·n of the box corner where a gradient at `ang`
 * starts). `spin` turns the loose paper (deg) about its middle, e.g. while it's being pulled away;
 * `away` (0..1) is how far it has been pulled off the page (its shadow lifts and fades).
 */
export function PaperFlap({ n, d, r, k = 1, bend = 0, poly, mask, soft, back, face, ang, o = 0, spin = 0, away = 0, className = '' }) {
  const [nx, ny] = n
  const PI = Math.PI
  const loose = clipHalf(poly, d, 'peeled', n)
  if (loose.length < 3) return null
  const T = d - PI * r // the paper at the top of the roll (it lands on screen at d)
  let lo = Infinity
  loose.forEach(([x, y]) => { lo = Math.min(lo, x * nx + y * ny) })
  const L = Math.max(1, T - lo) // paper from the top of the roll to the free end
  const towards = LIGHT[0] * nx + LIGHT[1] * ny // how far the light pushes shadows onto the stuck side (<0: onto the uncovered side)

  // the flap's profile: angle, screen offset along n past d, height above the roll's top, by paper s past T
  const { sCap, prof } = flapProfile(k, bend)
  // facets: SEGS over the bend (as far as the paper reaches), then one straight to the free end
  const cuts = [0]
  const sB = Math.min(L, sCap)
  if (sB > 0) for (let i = 1; i <= SEGS; i++) cuts.push((sB * i) / SEGS)
  if (L > sB + 0.5) cuts.push(L + 2)
  const facets = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const sa = cuts[i], sb = cuts[i + 1]
    const pa = prof(sa)[1]
    const kk = (prof(sb)[1] - pa) / (sb - sa)
    const hi = i === 0 ? T + Math.min(1.5, r) : T - sa + 0.8 // a hair into the roll / the previous facet: no seam
    let fp = clipHalf(poly, hi, 'peeled', n)
    if (i + 2 < cuts.length) fp = clipHalf(fp, T - sb, 'stuck', n)
    if (fp.length >= 3) facets.push({ m: foldMatrix(n, (d + pa + kk * (T - sa)) / (1 + kk), kk), clip: toClip(fp) })
  }

  const pos = (xn) => `${(xn + o).toFixed(1)}px`
  // the roll's visible (upper) half, paper from PI·r/2 to PI·r past the line, drawn as an affine
  // squeeze onto the band [d - r, d]: projected = d - 2r + m·s
  const m = 2 / PI
  const bandPoly = clipHalf(clipHalf(poly, d - (PI * r) / 2, 'peeled', n), d - PI * r, 'stuck', n)
  const bandM = foldMatrix(n, (d * (1 + m) - 2 * r) / (1 + m), m)
  // cylinder shading in the band's own (paper) coordinates, placed so the squeeze lands each
  // shade where the true (sine) projection would: s = r·(2 - sinθ)·PI/2
  const curlStops = CURL_TH.map((f) => {
    const th = f * PI
    return `${tone(lightOf(lamCurl(th, towards), (PI - th) * 0.6))} ${pos(d - r * (2 - Math.sin(th)) * (PI / 2))}`
  })
  const curlShade = `linear-gradient(${ang}deg, ${curlStops.join(', ')})`
  // the flap's shading, by its tilt, from the free end (low x·n) to the top of the roll
  // (just past the roll the paper is still turning from level to the flap's angle: ease into it
  // over a few radii, so a flap that leaves the roll steeply doesn't start in a hard step)
  const ease = 3 * r + 10
  const tiltAt = (s) => prof(s)[0] * (s >= ease ? 1 : Math.sin((s / ease) * (PI / 2)))
  const ss = []
  for (let i = 0; i <= 4; i++) ss.push(Math.min(L, (ease * i) / 4))
  for (let i = 1; i <= 10; i++) ss.push(ease + ((L - ease) * i) / 10)
  const flapStops = ss.filter((s, i) => s <= L && (i === 0 || s > ss[i - 1])).reverse().map((s) => {
    const ph = tiltAt(s)
    return `${tone(lightOf(lamFlap(ph, towards), ph))} ${pos(T - s)}`
  })
  const flatShade = `linear-gradient(${ang}deg, ${flapStops.join(', ')})`
  const backImg = back ? `, url(${back})` : ''
  // the roll's lower quarter, printed side up (paper from the line to PI·r/2 past it, squeezed onto
  // [d - r, d], not mirrored), in shade as it turns away from the light into the curl
  const underPoly = face && r > 0.5 ? clipHalf(clipHalf(poly, d + 0.75, 'peeled', n), d - (PI * r) / 2, 'stuck', n) : []
  const underM = foldMatrix(n, d, -m)
  const underShade = `linear-gradient(${ang}deg, ${shadowAt(0.42)} ${pos(d - (PI * r) / 2)}, ${shadowAt(0.2)} ${pos(d - PI * r * 0.3)}, transparent ${pos(d)})`

  const fade = clamp01(1 - away)
  // 1) the roll's shadow on the surface it is uncovering, just past its outer edge (screen d - r).
  // Drawn through the roll's own squeeze, continued past its side (paper s0 → s0 + E lands on screen
  // d - r → d - r - reach), so it is exactly as long as the roll and follows its outline.
  const reach = 3 + r * (0.35 + 1.3 * Math.max(0, -towards))
  const s0 = d - (PI * r) / 2
  const E = reach / m
  // (it starts under the roll, transparent, so no edge of it is ever a straight cut)
  const sIn = s0 - (PI * r) / 4
  const aoPoly = r > 0.5 ? clipHalf(clipHalf(poly, s0 + E, 'peeled', n), sIn, 'stuck', n) : []
  const grow = clamp01(r / 8) // a hairline roll casts next to nothing
  const aoA = 0.3 * fade * grow
  const ao = `linear-gradient(${ang}deg, transparent ${pos(sIn)}, ${shadowAt(aoA)} ${pos(s0)}, ${shadowAt(aoA * 0.42)} ${pos(s0 + E * 0.3)}, ${shadowAt(aoA * 0.12)} ${pos(s0 + E * 0.65)}, transparent ${pos(s0 + E)})`
  // 2) + 3) the flap's shadow on what lies under it: the flap (as a chord of its bend) moved by the
  // light by its height, which is h0 at the top of the roll and rises with the bend
  const h0 = r * (1.4 + 6 * away)
  const castOf = (sf, lift = 1) => {
    const kk = Math.max(0.02, prof(sf)[1] / sf)
    return foldMatrix(n, (d + kk * T) / (1 + kk), kk, [LIGHT, h0, (lift * prof(sf)[2]) / sf, T])
  }
  // (past T it folds back under the roll: let it die out there instead of ending in a cut)
  const castPoly = clipHalf(poly, T + r, 'peeled', n)
  const sN = Math.min(L, 3 * r + 0.12 * (bend || 300))
  const castM = castOf(sN, 0.55)
  const Q = sN + 14
  const castA = 0.26 * fade * grow
  const cast = `linear-gradient(${ang}deg, transparent ${pos(T - Q)}, ${shadowAt(castA * 0.12)} ${pos(T - Q * 0.6)}, ${shadowAt(castA * 0.45)} ${pos(T - Q * 0.28)}, ${shadowAt(castA)} ${pos(T)}, transparent ${pos(T + r)})`
  // the whole flap's: it lands just past the free end and the sides, where it reads as "lifted". (Its
  // offset is kept to ~40% of what the flap's height would give: the light is broad, and further
  // out it would be too faint to read.)
  const farM = castOf(L, 0.4)
  const farA = 0.28 * fade * clamp01(prof(L)[2] / 25) // only once the flap is up off the page
  const far = `linear-gradient(${ang}deg, ${shadowAt(farA * 0.8)} ${pos(T - L)}, ${shadowAt(farA)} ${pos(T - L * 0.6)}, ${shadowAt(farA * 0.5)} ${pos(T - Math.min(L, 2 * sN))}, transparent ${pos(T)})`
  const softMask = soft || mask
  // the loose paper's middle, for the spin (roughly where it lands once flipped)
  let cx = 0, cy = 0
  loose.forEach(([x, y]) => { cx += x; cy += y })
  cx /= loose.length
  cy /= loose.length
  const cv = cx * nx + cy * ny
  const shift = d + prof(Math.max(0, T - cv))[1] - cv
  const turn = spin ? { transform: `rotate(${spin.toFixed(2)}deg)`, transformOrigin: `${(cx + shift * nx).toFixed(1)}px ${(cy + shift * ny).toFixed(1)}px` } : null
  const layer = (key, m, clip, cls, style) => (
    <div key={key} className="pflap__xf" style={{ transform: m }}>
      <div className="pflap__clip" style={{ clipPath: clip, WebkitClipPath: clip }}>
        <div className={`pflap__fill ${cls}`.trim()} style={style} />
      </div>
    </div>
  )
  return (
    <div className={`pflap ${className}`.trim()} aria-hidden="true">
      {fade > 0 && (
        <div className="pflap__shade" style={turn || undefined}>
          {farA > 0.004 && castPoly.length >= 3 && layer('far', farM, toClip(castPoly), '', { ...(softMask || null), background: far })}
          {castPoly.length >= 3 && layer('cast', castM, toClip(castPoly), '', { ...(softMask || null), background: cast })}
          {aoPoly.length >= 3 && layer('ao', bandM, toClip(aoPoly), '', { ...(softMask || null), background: ao })}
        </div>
      )}
      <div className="pflap__paper" style={turn || undefined}>
        {underPoly.length >= 3 && layer('under', underM, toClip(underPoly), 'pflap__face', { ...(mask || null), backgroundImage: `${underShade}, url(${face})` })}
        {facets.map((f, i) => layer(`f${i}`, f.m, f.clip, 'pflap__back', { ...(mask || null), backgroundImage: flatShade + backImg }))}
        {bandPoly.length >= 3 && layer('band', bandM, toClip(bandPoly), 'pflap__back', { ...(mask || null), backgroundImage: curlShade + backImg })}
      </div>
    </div>
  )
}

/** The sticker image(s), drawn like the head underneath (object-fit: contain) so the hand-over is pixel-identical. */
function Faces({ face, faces }) {
  const list = faces && faces.includes(face) ? faces : [face]
  return list.map((u) => <img key={u} src={u} alt="" draggable="false" style={{ visibility: u === face ? 'visible' : 'hidden' }} />)
}

/**
 * The lid: the top of the head (hair and upper forehead, see lidGeom) as a sticker of its own lying
 * on top of the torn head, so before the peel the head looks whole. As `progress` goes 0 → 1 it
 * peels off from the left end of the tear. This draws the part still stuck down; place it in the
 * head's box (it fills it, inset: 0). `src` is the sticker (its silhouette); `face` is the drawing
 * shown on it (default `src`): any of `faces`, which share its cut-out, so it always matches the
 * face below while the eyes move. `tear` is the tear line (% of the box, TornHead's tearLine).
 * The loose paper is drawn separately by <CoverFlap> (outside the head's shadow filter).
 */
export default function CoverPeel({ src, face = src, faces, progress, w, h, tear }) {
  const pts = useSilhouette(src)
  useLayoutEffect(() => { preloadPaper(src); loadHardMask(src) }, [src]) // ready before the peel starts
  if (progress >= 1 || !tear) return null
  let clip
  if (!w) {
    // not measured yet: the same outline in % (the overlap below the tear as a fixed share)
    clip = `polygon(-2% -2%, 102% -2%, ${tear.slice().reverse().map(([x, y]) => `${x.toFixed(2)}% ${(y + 3).toFixed(2)}%`).join(', ')})`
  } else {
    const g = lidGeom(w, h, tear, pts)
    clip = toClip(progress <= 0 ? g.cover : clipHalf(g.cover, coverState(progress, w, h, pts, tear).d, 'stuck'))
  }
  return (
    <div className="cpeel" aria-hidden="true">
      <div className="cpeel__stuck" style={{ clipPath: clip, WebkitClipPath: clip }}><Faces face={face} faces={faces} /></div>
    </div>
  )
}

/** The lid's loose paper (see CoverPeel): place it in a box the same size and position as the head. */
export function CoverFlap({ src, face, progress, w, h, tear }) {
  const pts = useSilhouette(src)
  const hard = useHardMask(src)
  const softUrl = useSoftMask(src)
  const back = useBackTex(src)
  if (!w || !tear || progress <= 0 || progress >= 1) return null
  const { d, r, k, bend, spin, u, geom } = coverState(progress, w, h, pts, tear)
  const msrc = hard || src
  const mask = { WebkitMaskImage: `url(${msrc})`, maskImage: `url(${msrc})` }
  const soft = softUrl ? { WebkitMaskImage: `url(${softUrl})`, maskImage: `url(${softUrl})` } : null
  return <PaperFlap n={N} d={d} r={r} k={k} poly={geom.paper} bend={bend} mask={mask} soft={soft} back={back} face={face || src} ang={ANGLE} o={-N[1] * h} spin={spin} away={u} className="cpeel__flap" />
}

/**
 * The scroll-driven peel-off: the same thin paper (PaperFlap), along any crease direction n.
 * The part of `poly` (px, in the sticker box) on the x·n <= d side has come loose, rolled over at
 * d and lies back over the rest, flattened by k (1 = lying flat, smaller = standing up). Pair it with
 * clipHalf(poly, d, 'stuck', n) on the sticker itself. `src` masks the paper to the sticker's alpha.
 */
export function FoldFlap({ d, d0, k, n, w, h, poly, src, face, className = '' }) {
  const softUrl = useSoftMask(src)
  const back = useBackTex(src)
  if (!w || d <= d0) return null
  const [nx, ny] = n
  // gradient runs along n; position 0 is the box corner with the smallest x·n
  const o = -Math.min(0, nx * w) - Math.min(0, ny * h)
  const ang = ((Math.atan2(nx, -ny) * 180) / Math.PI).toFixed(1)
  const mask = src ? { WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` } : null
  const soft = softUrl ? { WebkitMaskImage: `url(${softUrl})`, maskImage: `url(${softUrl})` } : null
  const r = Math.max(0.5, Math.min(0.05 * w, (d - d0) / (Math.PI * 1.6)))
  return <PaperFlap n={n} d={d} r={r} k={Math.max(0.15, k)} poly={poly} mask={mask} soft={soft} back={back} face={face} ang={ang} o={o} className={`ffold ${className}`.trim()} />
}
