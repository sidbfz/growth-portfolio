// Pencil drawings for the notebook (Notebook.jsx), built with the wobble pen in lib/sketchy.js.
// Every page is a 300 x 400 sheet: the drawing lives in roughly x 20..280, y 40..290 and the
// handwritten note sits on the ruled lines below it. Pink is the only highlight.
//
// The growth pages are hand-drawn charts of real numbers, read from site.notebook.pages[].chart
// in content.js: rough lines, exact values. Only known data points get a dot; months without
// data keep their label and a faint dashed join with a "?". Bars start at zero. The end value
// is written large and circled.
//
// A drawing returns { strokes, text }: pen strokes, and handwritten labels as SVG text
// ({ x, y, t, s: size, c: 'pink' | 'soft', a: anchor, r: rotation }).
import { pen, ngon } from '../../lib/sketchy.js'

const P = { c: 'pink' }
const arc = (cx, cy, rx, ry, a0, a1, n = 14) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
  })


// ---------- chart kit ----------
const X0 = 66 // y-axis
const Y0 = 248 // x-axis (zero)
const XR = 276 // right end of the x-axis
const span = (n, a = 100, b = 250) => Array.from({ length: n }, (_, i) => (n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1)))
const textW = (t, s) => String(t).length * s * 0.44

function axes(p, text, { x, xs, base, ticks, y, top = 72 }) {
  p.path([[X0, top], [X0 - 1, Y0], [XR, Y0 + 1]], { w: 2.2 })
  x.forEach((m, i) => {
    p.line([xs[i], Y0], [xs[i] + 0.5, Y0 + 7], { w: 1.5, double: false })
    text.push({ x: xs[i], y: Y0 + 28, t: m, s: 21, a: 'middle' })
  })
  ;(ticks || []).forEach(([v, t]) => {
    const yy = y(v)
    p.line([X0 - 7, yy], [X0, yy], { w: 1.5, double: false })
    p.line([X0 + 4, yy], [XR - 8, yy + 0.5], { w: 0.8, double: false, op: 0.3, wob: 0.6 })
    text.push({ x: X0 - 11, y: yy + 6, t, s: 19, a: 'end' })
  })
  // the index base, small, over the y-axis (a short one sits over the tick labels)
  if (base) text.push(base.length < 9 ? { x: X0 - 4, y: top - 10, t: base, s: 16, c: 'soft', a: 'end' } : { x: X0 - 4, y: top - 10, t: base, s: 16, c: 'soft', a: 'start' })
}

const dot = (p, x, y, o = {}) => p.ellipse(x, y, 4.4, 4.4, { w: 4.6, double: false, lump: 0.03, ...o })

/** Short pencil dashes from a to b (a join where the in-between isn't known). */
function dashed(p, a, b, o = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(2, Math.round(L / 13))
  for (let i = 0; i < n; i++) {
    const t0 = i / n + 0.12 / n
    const t1 = (i + 0.62) / n
    p.line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], { w: 1.7, double: false, wob: 0.3, op: 0.55, ...o })
  }
}

/** The end value: big pink handwriting with a rough circle round it. */
function circled(p, text, x, y, t, s) {
  const w = textW(t, s)
  text.push({ x, y, t, s, c: 'pink', a: 'middle', r: -4 })
  p.ellipse(x + 1, y - s * 0.3, w / 2 + 14, s * 0.5 + 6, { c: 'pink', w: 2.4, lump: 0.07 })
  return { w, h: s }
}

/** Vertical curly bracket from y a to y b at x, the point facing left. */
const brace = (x, a, b) => {
  const m = (a + b) / 2
  return [[x + 6, a], [x, a + 5], [x, m - 6], [x - 7, m], [x, m + 6], [x, b - 5], [x + 6, b]]
}

/** 1. A line of known points: dots for real data, a dashed join with a "?" over unknown months. */
function line(c) {
  const p = pen(11)
  const text = []
  const max = c.max || c.ticks[c.ticks.length - 1][0]
  const y = (v) => Y0 - (v / max) * 150
  const xs = span(c.x.length, 98, 252)
  axes(p, text, { x: c.x, xs, base: c.base, ticks: c.ticks, y })
  const pts = c.points.map(([i, v]) => [xs[i], y(v)])
  for (let k = 1; k < pts.length; k++) {
    const gap = c.points[k][0] - c.points[k - 1][0] > 1
    if (gap) {
      dashed(p, pts[k - 1], pts[k])
      for (let i = c.points[k - 1][0] + 1; i < c.points[k][0]; i++) {
        const t = (xs[i] - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0])
        text.push({ x: xs[i] - 2, y: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t - 14, t: '?', s: 22, c: 'soft', a: 'middle' })
      }
    } else p.line(pts[k - 1], pts[k], { w: 3.2 })
  }
  pts.forEach(([px, py], k) => dot(p, px, py, k === pts.length - 1 ? { c: 'pink', w: 5 } : {}))
  // the end value, circled, with one arrow to its dot
  const [ex, ey] = pts[pts.length - 1]
  const cx = 138
  const cy = 118
  circled(p, text, cx, cy, c.callout, 62)
  p.arrow([[cx + 42, cy - 30], [cx + 72, cy - 42], [ex - 12, ey - 6]], { c: 'pink', w: 2.2, head: 10, double: false })
  return { strokes: p.strokes, text }
}

/** 2. Columns from zero, values on the bars, the last one circled; optional step arrows, a bracket. */
function columns(c) {
  const p = pen(37)
  const text = []
  const vals = c.bars.map((b) => b[0])
  const max = c.max || Math.max(...vals)
  const top = c.top || 100
  const y = (v) => Y0 - (v / max) * (Y0 - top)
  const n = c.bars.length
  const xs = span(n, n === 2 ? 122 : 108, n === 2 ? 226 : 242)
  const bw = n === 2 ? 58 : 44
  axes(p, text, { x: c.x, xs, base: c.base, ticks: c.ticks, y, top: c.axisTop || 72 })
  c.bars.forEach(([v, label], i) => {
    const x = xs[i] - bw / 2
    const yt = y(v)
    p.path([[x, Y0], [x, yt], [x + bw, yt - 0.5], [x + bw + 0.5, Y0]], { w: 2.1 })
    const last = i === n - 1
    if (last) {
      p.hatch([[x, yt], [x + bw, yt], [x + bw, Y0], [x, Y0]], { c: 'pink', angle: -45, gap: 8, w: 1.2, op: 0.8 })
      circled(p, text, xs[i], yt - 16, label, c.calloutSize || 40)
    } else text.push({ x: xs[i], y: yt - 10, t: label, s: 24, a: 'middle' })
  })
  // step arrows between neighbouring bars, each labelled with its multiple
  ;(c.steps || []).forEach((t, i) => {
    const a = [xs[i] + bw / 2 - 4, y(vals[i]) - 30]
    const b = [xs[i + 1] - bw / 2 - 4, y(vals[i + 1]) + 18]
    const m = [(a[0] + b[0]) / 2 - 8, Math.min(a[1], b[1]) + (Math.abs(a[1] - b[1]) * 0.25)]
    p.arrow([a, m, b], { c: 'pink', w: 1.9, head: 8, double: false })
    text.push({ x: m[0] - 8, y: m[1] - 8, t, s: 20, c: 'pink', a: 'end' })
  })
  // a bracket for the jump from the first bar's level to the last bar's top
  if (c.bracket) {
    const ya = y(vals[n - 1])
    const yb = y(vals[0])
    const bx = xs[n - 1] - bw / 2 - 16
    dashed(p, [xs[0] + bw / 2 + 2, yb], [xs[n - 1] - bw / 2 - 2, yb], { op: 0.45 })
    p.path(brace(bx, ya, yb), { c: 'pink', w: 2.2, double: false, wob: 0.4 })
    text.push({ x: bx - 12, y: (ya + yb) / 2 + 10, t: c.bracket, s: 30, c: 'pink', a: 'end' })
  }
  if (c.tag) {
    const tw = textW(c.tag, 17) + 18
    const tx = c.tagX ?? X0 + 14
    const ty = c.tagY ?? 56
    p.rrect(tx, ty, tw, 26, 7, { w: 1.4, double: false })
    p.ellipse(tx + 9, ty + 13, 2.2, 2.2, { w: 1.6, double: false })
    text.push({ x: tx + 17, y: ty + 19, t: c.tag, s: 17, a: 'start' })
  }
  return { strokes: p.strokes, text }
}

/** 3. Revenue held: the same scale as page 1, a flat line through a hatched "ads off" band. */
function held(c) {
  const p = pen(53)
  const text = []
  const max = c.ticks[c.ticks.length - 1][0]
  const y = (v) => Y0 - (v / max) * 150
  const xs = span(c.x.length, 98, 236)
  axes(p, text, { x: c.x, xs, base: c.base, ticks: c.ticks, y })
  // the band: part of the last month
  const bx0 = xs[xs.length - 1] - 12
  const bx1 = Math.min(XR - 4, bx0 + 42)
  p.hatch([[bx0, 76], [bx1, 76], [bx1, Y0 - 2], [bx0, Y0 - 2]], { c: 'pink', angle: -50, gap: 7, w: 1.1, op: 0.6 })
  p.line([bx0, 74], [bx0 - 0.5, Y0 - 2], { c: 'pink', w: 1.3, double: false, op: 0.8 })
  p.line([bx1, 74], [bx1 + 0.5, Y0 - 2], { c: 'pink', w: 1.3, double: false, op: 0.8 })
  text.push({ x: bx1 + 2, y: 66, t: c.band, s: 19, c: 'pink', a: 'end' })
  // context dot (faint), then the known points joined by the flat line, run on through the band
  const pts = c.points.map(([i, v, faint]) => ({ x: xs[i], y: y(v), faint }))
  const solid = pts.filter((q) => !q.faint)
  for (let k = 1; k < solid.length; k++) p.line([solid[k - 1].x, solid[k - 1].y], [solid[k].x, solid[k].y], { w: 3.2 })
  const last = solid[solid.length - 1]
  p.line([last.x, last.y], [bx1 - 2, last.y + 0.5], { w: 3.2 })
  pts.forEach((q, k) => dot(p, q.x, q.y, q.faint ? { op: 0.35 } : k === pts.length - 1 ? { c: 'pink', w: 5 } : {}))
  const cx = 150
  const cy = 186
  circled(p, text, cx, cy, c.callout, 46)
  p.arrow([[cx + 34, cy - 30], [cx + 56, cy - 58], [last.x - 6, last.y + 12]], { c: 'pink', w: 2.1, head: 9, double: false })
  return { strokes: p.strokes, text }
}

const puzzle = (x, y, s) => {
  const k = s / 80
  const pts = [[x, y], [x + 28 * k, y]]
  pts.push(...arc(x + 40 * k, y - 4 * k, 13 * k, 13 * k, 160, 380, 10))
  pts.push([x + 52 * k, y], [x + 80 * k, y], [x + 80 * k, y + 28 * k])
  pts.push(...arc(x + 84 * k, y + 40 * k, 13 * k, 13 * k, 250, 470, 10))
  pts.push([x + 80 * k, y + 52 * k], [x + 80 * k, y + 80 * k], [x, y + 80 * k], [x, y + 52 * k])
  pts.push(...arc(x + 4 * k, y + 40 * k, 12 * k, 12 * k, 110, -110, 10))
  pts.push([x, y + 28 * k], [x, y - 1])
  return pts
}

/** 5. A timeline: users on day 1, the ban, users after. */
function timeline(c) {
  const p = pen(67)
  const text = []
  const yl = 196
  p.arrow([[30, yl], [150, yl + 1], [276, yl - 1]], { w: 2.2, head: 11 })
  const [a, ban, z] = c.steps
  // day 1
  dot(p, 62, yl)
  text.push({ x: 62, y: yl - 22, t: a[0], s: 38, a: 'middle' })
  text.push({ x: 62, y: yl + 32, t: a[1], s: 20, c: 'soft', a: 'middle' })
  // the ban
  p.line([140, yl - 16], [164, yl + 16], { c: 'pink', w: 3.6, double: false })
  p.line([164, yl - 16], [140, yl + 16], { c: 'pink', w: 3.6, double: false })
  text.push({ x: 152, y: yl + 42, t: ban, s: 20, c: 'pink', a: 'middle' })
  // after
  dot(p, 232, yl, { c: 'pink', w: 5 })
  circled(p, text, 216, yl - 36, z[0], 50)
  text.push({ x: 232, y: yl + 32, t: z[1], s: 20, c: 'soft', a: 'middle' })
  // a small extension piece, for what this is
  p.path(puzzle(42, 70, 46), { w: 1.8 })
  return { strokes: p.strokes, text }
}

/** 6. A waitlist count over a two-week bracket, then a stop sign. */
function waitlist(c) {
  const p = pen(79)
  const text = []
  circled(p, text, 100, 150, c.count, 60)
  text.push({ x: 100, y: 186, t: c.what, s: 22, a: 'middle' })
  // the two weeks
  p.path([[38, 204], [42, 214], [94, 214], [100, 222], [106, 214], [158, 214], [162, 204]], { w: 1.6, double: false, wob: 0.4 })
  text.push({ x: 100, y: 248, t: c.time, s: 22, a: 'middle' })
  // stop sign
  const sx = 236, sy = 128
  const o = ngon(sx, sy, 38, 8, 22.5)
  p.path([...o, o[0]], { c: 'pink', w: 2.6 })
  const oi = ngon(sx, sy, 30, 8, 22.5)
  p.hatch(oi, { c: 'pink', angle: -40, gap: 6.5, w: 1.1, op: 0.7 })
  p.path([[232, 166], [231, 250]], { w: 2 })
  p.path([[240, 166], [241, 250]], { w: 2 })
  p.line([212, 251], [262, 250], { w: 1.6, double: false })
  p.arrow([[174, 128], [186, 116], [196, 118]], { w: 1.8, head: 8, double: false })
  return { strokes: p.strokes, text }
}

/** 7. Three tiny plans (campus, a creator filming, a paywall door) joined by an arrow. */
function plan() {
  const p = pen(97)
  // campus: a columned college building
  p.path([[22, 112], [60, 84], [98, 112], [22, 112]], { w: 2 })
  p.line([28, 160], [92, 160], { w: 2 })
  p.line([24, 168], [96, 168], { w: 1.4, double: false })
  ;[36, 52, 68, 84].forEach((x) => p.line([x, 116], [x, 158], { w: 1.5, double: false }))
  p.path([[60, 84], [60, 66], [74, 70], [60, 74]], { ...P, w: 1.7, double: false })
  // creator holding up a phone
  p.ellipse(140, 110, 13, 14, { w: 1.9 })
  p.path([[140, 125], [140, 168]], { w: 1.9 })
  p.path([[140, 168], [128, 196]], { w: 1.8, double: false })
  p.path([[140, 168], [152, 196]], { w: 1.8, double: false })
  p.path([[140, 138], [162, 128], [170, 108]], { w: 1.8, double: false })
  p.path([[140, 140], [120, 152]], { w: 1.8, double: false })
  p.rrect(163, 82, 18, 28, 3, { w: 1.7, double: false })
  p.ellipse(172, 89, 2.2, 2.2, { ...P, w: 2.2, double: false })
  p.curve(arc(150, 108, 8, 8, -40, 40, 5), { ...P, w: 1.4, double: false })
  p.curve(arc(150, 108, 15, 15, -40, 40, 5), { ...P, w: 1.4, double: false })
  // paywall door, ajar, light spilling out
  p.path([[212, 196], [212, 96], [266, 96], [266, 196]], { w: 2 })
  p.path([[212, 96], [240, 104], [240, 190], [212, 196]], { w: 1.9 })
  p.ellipse(233, 150, 2.6, 2.6, { w: 1.6, double: false })
  p.line([248, 112], [262, 104], { ...P, w: 1.6, double: false })
  p.line([248, 146], [264, 146], { ...P, w: 1.6, double: false })
  p.line([248, 180], [262, 188], { ...P, w: 1.6, double: false })
  p.line([206, 197], [274, 196], { w: 1.4, double: false })
  // the arrow through all three
  p.arrow([[30, 222], [80, 252], [130, 228], [150, 214], [190, 240], [236, 248], [272, 226]], { ...P, w: 2.4, head: 13 })
  return { strokes: p.strokes, text: [] }
}

/**
 * 8. The plan, continued: a short handwritten list on the ruled lines. A title underlined in
 * pink, then each idea (one or two lines, `items`) with its number circled in pink. Baselines
 * sit just above the page's rules (48 + 28k).
 */
function list(c) {
  const p = pen(101)
  const text = []
  const base = (k) => 48 + k * 28 - 5
  // A blank line under the title and between ideas; the last rule is 12. When the ideas need
  // more room (four two-line ideas), everything moves up a line: the title goes on the top rule.
  const need = c.items.reduce((s, lines) => s + lines.length + 1, -1)
  let k = Math.max(2, Math.min(3, 13 - need))
  const tk = k - 2
  const tw = String(c.title).length * 28 * 0.34
  text.push({ x: 26, y: base(tk), t: c.title, s: 28, r: -1.2 })
  p.curve([[24, base(tk) + 9], [26 + tw * 0.5, base(tk) + 5], [30 + tw, base(tk) + 2]], { c: 'pink', w: 2.2, double: false })
  c.items.forEach((lines, i) => {
    const y = base(k)
    text.push({ x: 38, y: y + 1, t: String(i + 1), s: 26, c: 'pink', a: 'middle' })
    p.ellipse(38.5, y - 7.5, 11, 12, { c: 'pink', w: 2, lump: 0.08 })
    lines.forEach((t, j) => text.push({ x: 60, y: base(k + j), t, s: 24, r: -1.2 }))
    k += lines.length + 1
  })
  return { strokes: p.strokes, text }
}

/**
 * Back cover: someone filming, in profile: a film camera (two reels on top, lens and matte box)
 * on a tripod, the operator's eye to the eyepiece, one hand on the pan handle and one on the
 * camera. Pink for the REC dot and the shot leaving the lens. Fits x 12..236, y 78..264.
 */
function camera() {
  const p = pen(7)
  const G = 262
  // tripod
  p.rrect(98, 164, 28, 9, 2, { w: 1.8, double: false })
  p.line([112, 173], [112, 188], { w: 2 })
  p.line([110, 186], [64, G], { w: 2.2 })
  p.line([113, 187], [116, G + 1], { w: 2.2 })
  p.line([115, 186], [154, G - 1], { w: 2.2 })
  // camera body, lens, matte box
  p.rrect(72, 124, 74, 40, 5, { w: 2.4 })
  p.path([[72, 132], [52, 133], [52, 156], [72, 156]], { w: 2.2 })
  p.line([62, 133], [62, 156], { w: 1.3, double: false })
  p.path([[52, 130], [34, 120], [34, 168], [52, 159]], { w: 2.2 })
  // reels
  ;[[94, 100, 22], [133, 104, 18]].forEach(([x, y, r]) => {
    p.ellipse(x, y, r, r, { w: 2.2 })
    p.ellipse(x, y, 2.4, 2.4, { w: 1.6, double: false })
    ;[0, 120, 240].forEach((a) => {
      const t = ((a - 90) * Math.PI) / 180
      p.ellipse(x + Math.cos(t) * r * 0.52, y + Math.sin(t) * r * 0.52, r * 0.2, r * 0.2, { w: 1.2, double: false })
    })
  })
  // eyepiece
  p.path([[146, 128], [151, 128], [151, 124], [158, 123], [158, 134], [151, 133], [151, 130]], { w: 1.8, double: false })
  // REC dot, and the shot going out of the lens
  ;[[[28, 128], [16, 121]], [[27, 144], [12, 144]], [[28, 160], [16, 167]]].forEach(([a, b]) => p.line(a, b, { ...P, w: 2, double: false }))
  p.ellipse(84, 135, 2.6, 2.6, { ...P, w: 4.4, double: false })
  // pan handle, back to the operator's hand
  p.line([126, 170], [174, 175], { w: 2.2 })
  // the operator, in profile, eye to the eyepiece
  // head (eye to the eyecup), hair, ear
  p.ellipse(172, 127, 11, 13, { w: 2.2 })
  const hair = [[160.5, 122], [163, 113], [172, 108.5], [182, 111], [186, 120], [184.5, 131], [181, 126], [177, 119], [169, 118], [163, 122]]
  p.path(hair.slice(0, 6), { w: 2.2 })
  p.hatch(hair, { angle: 60, gap: 3.2, w: 1.1, op: 0.9 })
  p.curve(arc(178, 128, 3.2, 4.2, -80, 110, 5), { w: 1.4, double: false })
  // neck and back, hunched over the camera
  p.line([175, 139.5], [176, 145], { w: 1.8, double: false })
  p.curve([[184, 138], [197, 144], [204, 158], [204, 166]], { w: 2.2 })
  p.path([[201, 177], [205, 188]], { w: 2.2 })
  // chest
  p.curve([[176, 145], [168, 146], [166, 152]], { w: 2.2 })
  p.path([[167, 165], [170, 176], [174, 188]], { w: 2.2 })
  p.line([174, 188], [206, 188], { w: 1.8 })
  // far arm: forearm forward, hand on the back of the camera
  p.line([167, 152], [155, 151], { w: 2 })
  p.line([167, 165], [155, 162], { w: 2 })
  p.ellipse(151, 156, 5, 6.5, { w: 2 })
  // near arm: down along the back, then forward to the pan handle
  p.curve([[189, 151], [192, 158], [189, 165], [183, 168]], { w: 2 })
  p.curve([[204, 160], [202, 170], [194, 176], [184, 177]], { w: 2 })
  p.ellipse(178, 172.5, 6, 5.5, { w: 2 })
  // legs, a relaxed stance
  p.curve([[180, 188], [179, 222], [176, 254]], { w: 2.1 })
  p.curve([[192, 188], [191, 222], [188, 254]], { w: 2.1 })
  p.curve([[196, 188], [202, 222], [204, 254]], { w: 2.1 })
  p.curve([[206, 188], [213, 222], [216, 254]], { w: 2.1 })
  // shoes
  p.path([[189, 254], [190, 262], [164, 262], [166, 256], [176, 254]], { w: 2 })
  p.path([[217, 254], [218, 262], [192, 262], [194, 256], [204, 254]], { w: 2 })
  p.line([50, 264], [236, 263], { w: 1.4, double: false, op: 0.5 })
  return { strokes: p.strokes, text: [] }
}

export const SKETCHES = { line, columns, held, timeline, waitlist, plan, list, camera }

/** Underline swoosh for the cover title. */
export function swoosh() {
  const p = pen(5)
  p.curve([[6, 18], [80, 10], [170, 8], [230, 14]], { c: 'pink', w: 4, double: false })
  p.curve([[40, 24], [120, 18], [196, 20]], { c: 'pink', w: 2.4, double: false })
  return p.strokes
}
