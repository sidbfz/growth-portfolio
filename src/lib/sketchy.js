// sketchy.js: a tiny procedural "pencil" helper (no rough.js).
// Every shape becomes one or two wobbly SVG path strings, so a sketch reads as drawn
// by hand: lines bow and tremble a little, circles overshoot where the pen closes them,
// and outlines get a lighter second pass, which gives an uneven stroke weight.
// Output is deterministic per seed, so the drawings don't change between renders.

export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n) => Math.round(n * 10) / 10
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
const polyLen = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0)

/** Catmull-Rom through the points, as cubic Béziers. */
function smoothPath(pts) {
  if (pts.length < 2) return ''
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/** Resample a polyline every ~step units, keeping its corners. */
function resample(pts, step) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const n = Math.max(1, Math.round(dist(a, b) / step))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/**
 * Low-frequency wobble along the path (a gentle bow plus a slow tremor), never
 * a zigzag. `amt` is the amplitude in viewBox units.
 */
function wobble(pts, amt, r) {
  const total = polyLen(pts) || 1
  const bow = (r() - 0.5) * 2 * amt * Math.min(1.6, total / 60)
  const ph1 = r() * 6.28
  const ph2 = r() * 6.28
  const fr1 = 1.2 + r() * 1.4
  const fr2 = 3 + r() * 3
  let s = 0
  return pts.map((p, i) => {
    if (i) s += dist(pts[i - 1], p)
    const t = s / total
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const len = dist(a, b) || 1
    const nx = -(b[1] - a[1]) / len
    const ny = (b[0] - a[0]) / len
    const o = bow * Math.sin(Math.PI * t) + amt * 0.45 * Math.sin(ph1 + t * fr1 * 6.28) + amt * 0.2 * Math.sin(ph2 + t * fr2 * 6.28)
    return [p[0] + nx * o, p[1] + ny * o]
  })
}

/** Nudge the ends a touch past (or short of) where they should be, as a quick hand does. */
function overshoot(pts, amt, r) {
  if (pts.length < 2) return pts
  const out = pts.slice()
  const ext = (p, q, k) => {
    const l = dist(p, q) || 1
    return [p[0] + ((p[0] - q[0]) / l) * k, p[1] + ((p[1] - q[1]) / l) * k]
  }
  out[0] = ext(pts[0], pts[1], (r() - 0.35) * amt)
  out[out.length - 1] = ext(pts[pts.length - 1], pts[pts.length - 2], (r() - 0.35) * amt)
  return out
}

/**
 * A sketch is built with `pen(seed)`: call its shape methods, then read `pen.strokes`.
 * Each stroke: { d, len, w, c: 'ink' | 'pink', o (opacity), ghost (lighter second pass) }.
 */
export function pen(seed = 1) {
  const r = rng(seed)
  const strokes = []

  const push = (pts, o = {}, smooth = true) => {
    const { c = 'ink', w = 1.3, wob = 1, double = c === 'ink' && w >= 1.2, step = 7, op = 1 } = o
    const make = (amt, rr) => {
      let p = resample(pts, step)
      p = wobble(p, amt, rr)
      p = overshoot(p, amt * 1.4, rr)
      return smooth ? smoothPath(p) : 'M' + p.map((q) => `${f(q[0])} ${f(q[1])}`).join('L')
    }
    const len = polyLen(pts)
    strokes.push({ d: make(wob, r), len, w, c, op })
    if (double) strokes.push({ d: make(wob * 1.3, r), len, w: w * 0.5, c, op: 0.55, ghost: true })
  }

  const api = {
    strokes,
    r,
    /** Polyline through points; corners stay corners. */
    path(pts, o) { push(pts, o); return api },
    line(a, b, o) { push([a, b], o); return api },
    /** A smooth curve through the given points (for arrows, chart lines, swooshes). */
    curve(pts, o = {}) {
      const dense = []
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
        for (let k = 0; k < 8; k++) {
          const t = k / 8, t2 = t * t, t3 = t2 * t
          dense.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)))
        }
      }
      dense.push(pts[pts.length - 1])
      push(dense, { step: 5, ...o })
      return api
    },
    /** Hand-drawn ellipse: lumpy radius, and the pen runs past its start before lifting. */
    ellipse(cx, cy, rx, ry, o = {}) {
      const n = Math.max(10, Math.round((rx + ry) / 2.2))
      const a0 = r() * 6.28
      const over = 0.25 + r() * 0.35
      const pts = []
      const lump = o.lump ?? 0.05
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((6.28 + over) * i) / n
        const k = 1 + (r() - 0.5) * lump * 2 + (i / n) * 0.04
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
      }
      push(pts, { wob: 0.4, step: 4, ...o })
      return api
    },
    rect(x, y, w, h, o) { push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + 1.5]], o); return api },
    /** Rounded rectangle traced in one go, starting top-left. */
    rrect(x, y, w, h, rad, o) {
      const pts = [[x + rad, y + 0.3]]
      const arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (Math.PI / 2) * (i / 4); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]) } }
      arc(x + w - rad, y + rad, -Math.PI / 2)
      arc(x + w - rad, y + h - rad, 0)
      arc(x + rad, y + h - rad, Math.PI / 2)
      arc(x + rad, y + rad, Math.PI)
      pts.push([x + rad + 3, y - 0.4])
      push(pts, o)
      return api
    },
    /**
     * Pencil shading inside a polygon: one continuous back-and-forth stroke, the way a
     * pencil actually hatches. `angle` in degrees, `gap` between passes.
     */
    hatch(poly, o = {}) {
      const { angle = -50, gap = 5 } = o
      const t = (angle * Math.PI) / 180
      const dir = [Math.cos(t), Math.sin(t)]
      const nrm = [-dir[1], dir[0]]
      const proj = poly.map((p) => p[0] * nrm[0] + p[1] * nrm[1])
      const lo = Math.min(...proj) + gap * 0.6
      const hi = Math.max(...proj) - gap * 0.4
      const pts = []
      let flip = false
      for (let s = lo; s <= hi; s += gap * (0.85 + r() * 0.3)) {
        const hits = []
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length]
          const pa = a[0] * nrm[0] + a[1] * nrm[1], pb = b[0] * nrm[0] + b[1] * nrm[1]
          if ((pa - s) * (pb - s) <= 0 && pa !== pb) {
            const k = (s - pa) / (pb - pa)
            hits.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k])
          }
        }
        if (hits.length < 2) continue
        hits.sort((p, q) => (p[0] * dir[0] + p[1] * dir[1]) - (q[0] * dir[0] + q[1] * dir[1]))
        let [a, b] = [hits[0], hits[hits.length - 1]]
        const inset = 1.6
        const l = dist(a, b)
        if (l < inset * 2.5) continue
        a = [a[0] + dir[0] * inset * (0.5 + r()), a[1] + dir[1] * inset * (0.5 + r())]
        b = [b[0] - dir[0] * inset * (0.5 + r()), b[1] - dir[1] * inset * (0.5 + r())]
        if (flip) [a, b] = [b, a]
        pts.push(a, b)
        flip = !flip
      }
      if (pts.length) push(pts, { w: 0.7, wob: 0.5, step: 9, double: false, op: 0.8, ...o }, false)
      return api
    },
    /** A curve with a two-stroke arrowhead at its end. */
    arrow(pts, o = {}) {
      api.curve(pts, o)
      const b = pts[pts.length - 1]
      const a = pts[pts.length - 2]
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
      const L = o.head ?? 9
      const spread = 0.5 + r() * 0.1
      const h1 = [b[0] - Math.cos(ang - spread) * L, b[1] - Math.sin(ang - spread) * L]
      const h2 = [b[0] - Math.cos(ang + spread) * L * 0.95, b[1] - Math.sin(ang + spread) * L * 0.95]
      push([h1, b, h2], { ...o, wob: 0.3, step: 4, double: false })
      return api
    },
  }
  return api
}

/** Rotate points about (cx, cy) by deg. */
export const rot = (pts, cx, cy, deg) => {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t), s = Math.sin(t)
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
}

/** Regular polygon points (octagons, stars). */
export const ngon = (cx, cy, rad, n, deg = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((deg + (360 * i) / n) * Math.PI) / 180
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]
  })
