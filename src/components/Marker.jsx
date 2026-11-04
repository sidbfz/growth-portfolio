import './Marker.css'

/*
 * Marker annotations drawn on screenshots: hand-drawn loops, arrows, brackets and notes.
 * Coordinates are in the screenshot's own pixels (the SVG's viewBox), so marks stay put at any size.
 * Each stroke draws in with stroke-dashoffset when an ancestor gets `.is-drawn` (see Marker.css);
 * `--i` orders them. Without an `.mk-scope` ancestor (no animation wanted) they're simply drawn.
 */

const f = (n) => Math.round(n * 10) / 10

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function through(pts) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/** A loose marker loop around (cx, cy) that overshoots its start, like a real circled number. */
export function loop(cx, cy, rx, ry, seed = 1) {
  const pts = []
  const n = 28
  const start = -2.5 + seed * 0.3
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const a = start + t * Math.PI * 2 * 1.13
    const wob = 1 + 0.035 * Math.sin(a * 3 + seed) + 0.07 * t
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob])
  }
  return [through(pts)]
}

/** A curved arrow from → to; bend pushes the curve sideways (in px, + is to the left of travel). */
export function arrow(from, to, bend = 40, head = 26) {
  const [x0, y0] = from
  const [x1, y1] = to
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = -(y1 - y0) / len
  const ny = (x1 - x0) / len
  const c = [mx + nx * bend, my + ny * bend]
  const shaft = `M${f(x0)} ${f(y0)} Q${f(c[0])} ${f(c[1])} ${f(x1)} ${f(y1)}`
  // the head follows the curve's end tangent
  const tl = Math.hypot(x1 - c[0], y1 - c[1]) || 1
  const tx = (x1 - c[0]) / tl
  const ty = (y1 - c[1]) / tl
  const side = (s) => {
    const a = (s * 28 * Math.PI) / 180
    const bx = -(tx * Math.cos(a) - ty * Math.sin(a))
    const by = -(tx * Math.sin(a) + ty * Math.cos(a))
    return [x1 + bx * head, y1 + by * head]
  }
  const [l, r] = [side(1), side(-1)]
  return [shaft, `M${f(l[0])} ${f(l[1])} L${f(x1)} ${f(y1)} L${f(r[0])} ${f(r[1])}`]
}

/** A bracket spanning x0..x1 at height y; its ends turn towards +depth (positive: down). */
export function bracket(x0, x1, y, depth = 22) {
  const m = (x0 + x1) / 2
  const k = Math.abs(depth) * 0.7
  return [
    `M${f(x0)} ${f(y + depth)} Q${f(x0)} ${f(y)} ${f(x0 + k)} ${f(y)} L${f(m - k)} ${f(y)} Q${f(m)} ${f(y)} ${f(m)} ${f(y - depth * 0.8)} Q${f(m)} ${f(y)} ${f(m + k)} ${f(y)} L${f(x1 - k)} ${f(y)} Q${f(x1)} ${f(y)} ${f(x1)} ${f(y + depth)}`,
  ]
}

/**
 * Marker strokes over a box of w × h px (the screenshot's pixel size).
 * marks: [[pathD, ...], ...]; mark k draws in step `start + k`, its extra paths (arrow heads) just after.
 */
export function Marks({ w, h, marks, start = 0, width = 7 }) {
  return (
    <svg className="mk" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {marks.map((paths, k) => paths.map((d, j) => (
        <path key={`${k}-${j}`} d={d} pathLength="1" strokeWidth={width} style={{ '--i': start + k, '--sub': j }} />
      )))}
    </svg>
  )
}

/** A handwritten note, placed in % of its box. */
export function Note({ children, at, className = '' }) {
  const [left, top, width] = at
  return (
    <span className={`mk-note ${className}`} style={{ left: `${left}%`, top: `${top}%`, width: width ? `${width}%` : undefined }}>
      {children}
    </span>
  )
}

/** A strip of translucent paper tape. at = [left %, top %, width in px-ish rem, angle deg]. */
export function Tape({ at, className = '' }) {
  const [left, top, w = 5.5, r = 0] = at
  return <i className={`tape ${className}`} aria-hidden="true" style={{ left: `${left}%`, top: `${top}%`, width: `${w}rem`, '--r': `${r}deg` }} />
}
