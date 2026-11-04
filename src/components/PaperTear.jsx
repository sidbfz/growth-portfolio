import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './PaperTear.css'
import { scrubSound } from '../lib/sound.js'

gsap.registerPlugin(ScrollTrigger)

/*
 * PaperTear — a torn-paper band between two sections, with a page-peel curl.
 *
 * Everything is built in a "canonical" frame: the tear descends left → right
 * and is ripped from the left (high) end. direction="up" mirrors the whole
 * thing horizontally (tear rises to the right, ripped from the right).
 *
 * Layers (bottom → top):
 *   static  – torn strip (textured), the upper page (`from`) and its fibres.
 *   peel    – only while ripping. Clipped to the half-plane ahead of the fold:
 *             the still-attached lower page (`from`), the flap's cast shadow,
 *             a copy of the upper page (so the shadow only falls on the lower
 *             page), and the flap: the peeled part of the lower page,
 *             mirrored across the fold so its white backside shows.
 *
 * SVG geometry + textures are generated once per size; scroll only updates
 * one clip-path and a few transforms.
 */

const PAD = 24 // px each layer extends beyond the band horizontally / at the top
const SX = PAD + 140 // flap/shadow sheets get a wider margin so a reflected
const SY = PAD + 180 // sheet never shows its image boundary
const STEP = 3 // px between edge samples
// Fold angle (deg from vertical): [start, apex reaches far edge] for
// desktop / narrow screens, then it swings steep to clear the page away.
const THETA_D = [56, 45]
const THETA_M = [63, 53]
const THETA_END = 6
const P_APEX = 0.72 // share of the scrub during which the apex runs along the tear
// The rip plays while the seam crosses the middle of the viewport, so a skimmer sees it: it
// starts as the band's centre passes 78% of the viewport and is done at 28%. Tied to the
// viewport, not the band height, so a shorter band never turns the rip into a one-tick pop.
const START_AT = 0.78
const END_AT = 0.28
const SCROLL_START = `center ${START_AT * 100}%`
const SCROLL_END = `center ${END_AT * 100}%`

// Lenis moves the page from its own rAF; tell ScrollTrigger on each Lenis tick so the scrub
// follows the smoothed position in the same frame. (App creates Lenis after child effects run.)
let lenisHooked = null
function hookLenis() {
  const l = typeof window !== 'undefined' ? window.__lenis : null
  if (!l || l === lenisHooked || typeof l.on !== 'function') return
  lenisHooked = l
  l.on('scroll', ScrollTrigger.update)
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (t) => t * t * (3 - 2 * t)
const f1 = (n) => Math.round(n * 10) / 10
const shadeW = (k) => Math.round(900 * clamp(k, 0.38, 1.2)) // flap lighting falloff (px)
const f3 = (n) => Math.round(n * 1000) / 1000

/* ------------------------------------------------------------------ */
/* Palette: the paper is drawn differently on dark and light pages     */
/* ------------------------------------------------------------------ */

const hexRgb = (c) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const luma = (c) => {
  const v = hexRgb(c)
  return v ? (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255 : 0
}
// a + (b - a) * t, as a hex colour
const mix = (a, b, t) => {
  const x = hexRgb(a)
  const y = hexRgb(b)
  if (!x || !y) return a
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

// Dark pages: a mid-grey fibrous strip, white backside, deep shadows.
// Light pages: the torn core is a warm off-white (lighter than both pages), so its shape is drawn
// by a darker fibrous edge, darker hairs and a soft shadow tinted with the page it falls on.
function makePalette(tone, from, to) {
  const light = tone === 'light' || (tone !== 'dark' && (luma(from) + luma(to)) / 2 > 0.55)
  if (!light) {
    return {
      light,
      texRG: '0.66 0.71 0.745 0.77 0.79 0.808 0.825 0.845 0.87',
      texB: '0.665 0.715 0.75 0.775 0.795 0.813 0.83 0.85 0.875',
      dropInk: '#000', dropOp: 0.14,
      edgeInk: '#6e6e6e', edgeOp: 0.4,
      lipOp: 0.12,
      rim: '#f6f6f6', rimOp: 0.9, glowOp: 0.45,
      hairs: ['#cfcfcf', '#d9d9d9', '#e4e4e4'], hairOps: [0.35, 0.55, 0.75],
      fringe: '#f2f2f2',
      back: '#f6f6f6', backEdge: '#8a8a8a', backEdgeOp: 0.28,
      castInk: '#000', castOp: [0.5, 0.5],
      shade: 1,
    }
  }
  return {
    light,
    texRG: '0.865 0.9 0.922 0.938 0.951 0.962 0.972 0.982 0.992',
    texB: '0.83 0.868 0.893 0.912 0.927 0.94 0.952 0.964 0.976',
    dropInk: mix(to, '#1a0f12', 0.72), dropOp: 0.2,
    edgeInk: mix(to, '#3a2c2e', 0.78), edgeOp: 0.42,
    lipOp: 0.09,
    rim: '#ffffff', rimOp: 0.85, glowOp: 0.5,
    hairs: [mix(to, '#5c4d4f', 0.55), mix(to, '#5c4d4f', 0.45), mix(to, '#5c4d4f', 0.35)], hairOps: [0.35, 0.5, 0.65],
    fringe: '#ffffff',
    back: '#fffdfa', backEdge: mix(from, '#3a2c2e', 0.75), backEdgeOp: 0.34,
    castInk: mix(from, '#1a0f12', 0.7), castOp: [0.3, 0.34],
    shade: 0.75,
  }
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Smooth 1D value noise in [-1, 1] with the given period (px).
function makeNoise(rand, span, period) {
  const n = Math.ceil(span / period) + 3
  const v = Array.from({ length: n }, () => rand() * 2 - 1)
  return (x) => {
    const f = Math.max(0, x) / period
    const i = Math.floor(f)
    const s = smooth(f - i)
    return v[i] * (1 - s) + v[i + 1] * s
  }
}

/* ------------------------------------------------------------------ */
/* Geometry (canonical: high at the left, descending to the right)     */
/* ------------------------------------------------------------------ */

function buildGeometry(W, H, seed, rise = [0.06, 0.74], align = 0.5) {
  const rand = mulberry32(seed * 9973 + 17)
  const span = W + PAD * 2 + 10
  const k = clamp(W / 1440, 0.27, 1.25) // overall scale (1 at desktop)

  const big = makeNoise(rand, span, Math.max(220, W / 2.3))
  const mid = makeNoise(rand, span, Math.max(70, 170 * k))
  const small = makeNoise(rand, span, Math.max(16, 42 * k))
  const tooth = makeNoise(rand, span, Math.max(5, 12 * k))
  const thickA = makeNoise(rand, span, Math.max(110, 330 * k))
  const thickB = makeNoise(rand, span, Math.max(45, 120 * k))
  const lobeA = makeNoise(rand, span, Math.max(24, 70 * k))
  const lobeB = makeNoise(rand, span, Math.max(10, 26 * k))

  const tMin = Math.max(9, 30 * k)
  const tMax = Math.min(H * 0.44, Math.max(26, 104 * k))
  const wob = H * 0.065
  const lobe = Math.max(2.5, 11 * k)
  const jag = Math.max(0.9, 2.2 * Math.sqrt(k))

  const yHigh = H * rise[0]
  const yLow = H * rise[1]

  const xs = []
  const up = []
  const lo = []
  let walkU = 0
  let walkL = 0
  for (let x = -PAD; x <= W + PAD + STEP; x += STEP) {
    const u = clamp(x / W, 0, 1)
    const base = yHigh + (yLow - yHigh) * u
    const xx = x + PAD

    // upper edge: crisp rip with fine serrations and the odd splinter
    walkU = walkU * 0.55 + (rand() - 0.5) * jag
    if (rand() < 0.04) walkU += (rand() - 0.5) * jag * 3.2
    // lower edge: softer, lobed
    walkL = walkL * 0.75 + (rand() - 0.5) * jag * 0.9
    if (rand() < 0.025) walkL += (rand() - 0.5) * jag * 3

    const yu = base + big(xx) * wob + mid(xx) * wob * 0.35 + small(xx) * Math.max(1.5, 4 * k) + tooth(xx) * Math.max(0.8, 2.8 * k) + walkU
    const tn = clamp(0.5 + thickA(xx) * 0.62 + thickB(xx) * 0.3, 0, 1)
    const t = tMin + (tMax - tMin) * smooth(tn)
    let yl = yu + t + lobeA(xx) * lobe + lobeB(xx) * lobe * 0.35 + walkL
    yl = Math.max(yu + tMin * 0.8, yl)
    xs.push(x)
    up.push(yu)
    lo.push(yl)
  }

  // Fit vertically: strip + its soft shadow fully inside the band.
  {
    const topLim = Math.max(8, H * 0.07)
    const botLim = H - Math.max(10, 18 * k)
    let minU = Infinity
    let maxU = -Infinity
    let maxD = 0
    for (let i = 0; i < up.length; i++) {
      minU = Math.min(minU, up[i])
      maxU = Math.max(maxU, up[i])
      maxD = Math.max(maxD, lo[i] - up[i])
    }
    const s = clamp((botLim - topLim - maxD) / Math.max(1, maxU - minU), 0.15, 1)
    const nu = up.map((y) => topLim + (y - minU) * s)
    let maxL = -Infinity
    for (let i = 0; i < up.length; i++) maxL = Math.max(maxL, nu[i] + lo[i] - up[i])
    const shift = Math.max(0, botLim - maxL) * align
    for (let i = 0; i < up.length; i++) {
      const d = lo[i] - up[i]
      up[i] = nu[i] + shift
      lo[i] = up[i] + d
    }
  }

  // Fibres: hanging off the lower (soft) edge, and tiny ones off the upper rim.
  const hairsDown = []
  const hairsUp = []
  for (let i = 0; i < xs.length; i++) {
    if (rand() < 0.35) {
      const x = xs[i] + rand() * STEP
      const y = lo[i] - 1 - rand() * 2
      const len = (1 + Math.pow(rand(), 2.4) * 5) * Math.max(0.55, Math.sqrt(k))
      const ang = Math.PI / 2 + (rand() - 0.5) * 1.6
      hairsDown.push([x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, rand()])
    }
    if (rand() < 0.3) {
      const x = xs[i] + rand() * STEP
      const y = up[i] + 0.8
      const len = (0.8 + Math.pow(rand(), 2.5) * 4) * Math.max(0.6, Math.sqrt(k))
      const ang = -Math.PI / 2 + (rand() - 0.5) * 1.5
      hairsUp.push([x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, rand()])
    }
  }

  // End slopes, used to extrapolate the tear beyond the band.
  const n = up.length
  const m = Math.min(20, n - 1)
  const slopeL = (up[m] - up[0]) / (m * STEP)
  const slopeR = (up[n - 1] - up[n - 1 - m]) / (m * STEP)

  return { xs, up, lo, hairsDown, hairsUp, k, slopeL, slopeR }
}

function upAt(geo, x) {
  const { up, slopeL, slopeR } = geo
  const f = (x + PAD) / STEP
  if (f <= 0) return up[0] + f * STEP * slopeL
  if (f >= up.length - 1) return up[up.length - 1] + (f - up.length + 1) * STEP * slopeR
  const i = Math.floor(f)
  const t = f - i
  return up[i] * (1 - t) + up[i + 1] * t
}

/* ------------------------------------------------------------------ */
/* SVG images                                                          */
/* ------------------------------------------------------------------ */

const line = (xs, ys, rev = false, dy = 0) => {
  let s = ''
  if (!rev) for (let i = 0; i < xs.length; i++) s += `L${f1(xs[i])} ${f1(ys[i] + dy)}`
  else for (let i = xs.length - 1; i >= 0; i--) s += `L${f1(xs[i])} ${f1(ys[i] + dy)}`
  return 'M' + s.slice(1)
}
const edge = (xs, ys, dy = 0) => line(xs, ys, false, dy)
// Area between two curves (a on top, b below).
const band = (xs, a, b, da = 0, db = 0) => line(xs, a, false, da) + line(xs, b, true, db).replace('M', 'L') + 'Z'
// Area below a curve down to `bottom`.
const below = (xs, a, bottom, da = 0) => {
  const n = xs.length
  return line(xs, a, false, da) + `L${f1(xs[n - 1])} ${bottom}L${f1(xs[0])} ${bottom}Z`
}

const svgDoc = (W, Hs, body, mx = PAD, my = PAD) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W + mx * 2}" height="${Hs + my + PAD}" viewBox="${-mx} ${-my} ${W + mx * 2} ${Hs + my + PAD}">${body}</svg>`

const toUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

function hairPaths(hairs, buckets) {
  // group into opacity buckets to keep the DOM small
  const ds = buckets.map(() => '')
  for (const h of hairs) {
    const b = Math.min(buckets.length - 1, Math.floor(h[4] * buckets.length))
    ds[b] += `M${f1(h[0])} ${f1(h[1])}L${f1(h[2])} ${f1(h[3])}`
  }
  return ds
}

// The paper texture filter: mottled, clumpy, fibrous light grey with a
// displaced (fuzzy) outline. Applied to a black silhouette.
function paperFilter(id, W, y0, y1, k, s, pal) {
  const kk = clamp(k, 0.5, 1.2)
  const fz = clamp(k, 0.4, 1.2)
  // feTurbulence output is premultiplied by its (noisy) alpha: force A=1 first.
  const opaque = (inp, out) =>
    `<feColorMatrix in="${inp}" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1" result="${out}"/>`
  const lin = (sl, ic) => `<feFuncR type="linear" slope="${sl}" intercept="${ic}"/><feFuncG type="linear" slope="${sl}" intercept="${ic}"/><feFuncB type="linear" slope="${sl}" intercept="${ic}"/>`
  const tbl = (r, b) => `<feFuncR type="table" tableValues="${r}"/><feFuncG type="table" tableValues="${r}"/><feFuncB type="table" tableValues="${b}"/>`
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-PAD}" y="${f1(y0)}" width="${W + PAD * 2}" height="${f1(y1 - y0)}" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${f3(0.009 / kk)} ${f3(0.016 / kk)}" numOctaves="3" seed="${s}" result="t1"/>${opaque('t1', 'n1')}
<feTurbulence type="fractalNoise" baseFrequency="${f3(0.04 / kk)} ${f3(0.055 / kk)}" numOctaves="3" seed="${s + 1}" result="t2"/>${opaque('t2', 'n2')}
<feTurbulence type="fractalNoise" baseFrequency="${f3(0.55 / kk)} ${f3(0.2 / kk)}" numOctaves="2" seed="${s + 2}" result="t3"/>${opaque('t3', 'n3')}
<feComposite in="n1" in2="n2" operator="arithmetic" k2="0.75" k3="0.6" k4="-0.175" result="n12"/>
<feComposite in="n12" in2="n3" operator="arithmetic" k2="1" k3="0.6" k4="-0.3" result="n"/>
<feColorMatrix in="n" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1"/>
<feComponentTransfer>${lin(1.4, -0.2)}</feComponentTransfer>
<feComponentTransfer result="tex">${tbl(pal.texRG, pal.texB)}</feComponentTransfer>
<feComposite in="tex" in2="SourceAlpha" operator="in" result="paper"/>
<feTurbulence type="fractalNoise" baseFrequency="${f3(0.55 / fz)} ${f3(0.3 / fz)}" numOctaves="2" seed="${s + 5}" result="t5"/>${opaque('t5', 'fz')}
<feDisplacementMap in="paper" in2="fz" scale="${f1(1.5 + 3.5 * fz)}" xChannelSelector="R" yChannelSelector="G"/>
<feGaussianBlur stdDeviation="0.45"/>
</filter>`
}

function buildImages(W, H, Hs, geo, from, seed, pal) {
  const { xs, up, lo, hairsDown, hairsUp, k } = geo
  const s = (seed % 997) + 1
  let minU = Infinity
  let maxL = -Infinity
  for (let i = 0; i < up.length; i++) {
    minU = Math.min(minU, up[i])
    maxL = Math.max(maxL, lo[i])
  }
  const under = Math.max(6, 12 * k) // strip continues under the upper page
  const blurS = (v) => f1(v)

  /* ---- strip (static) ---- */
  const stripPath = band(xs, up, lo, -under, 0)
  const [hd0, hd1, hd2] = hairPaths(hairsDown, [0, 1, 2])
  const stripSvg = svgDoc(
    W,
    H,
    `<defs>
${paperFilter('paper', W, minU - under - 20, maxL + 24, k, s, pal)}
<filter color-interpolation-filters="sRGB" id="sh" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="${blurS(3 + 5 * k)}"/></filter>
<filter color-interpolation-filters="sRGB" id="soft" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="${blurS(1 + 2.2 * k)}"/></filter>
<filter color-interpolation-filters="sRGB" id="fib" x="-2%" y="-50%" width="104%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.8 0.12" numOctaves="2" seed="${s + 11}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${f1(2 + 2.5 * k)}" xChannelSelector="R" yChannelSelector="G"/></filter>
<clipPath id="sc"><path d="${stripPath}"/></clipPath>
</defs>
<path d="${band(xs, lo, lo, -4, Math.max(5, 10 * k))}" fill="${pal.dropInk}" opacity="${pal.dropOp}" filter="url(#sh)" transform="translate(0 ${f1(1 + 2 * k)})"/>
<path d="${stripPath}" fill="#000" filter="url(#paper)"/>
<g clip-path="url(#sc)" fill="none">
<path d="${edge(xs, lo)}" stroke="${pal.edgeInk}" stroke-width="${f1(3 + 7 * k)}" opacity="${pal.edgeOp}" filter="url(#soft)"/>
<path d="${edge(xs, up, 2 + 3 * k)}" stroke="#000" stroke-width="${f1(2 + 5 * k)}" opacity="${pal.lipOp}" filter="url(#soft)"/>
</g>
<g fill="none" clip-path="url(#sc)"><path d="${edge(xs, up, 1)}" stroke="#fff" stroke-width="${f1(3 + 6 * k)}" opacity="${pal.glowOp}" filter="url(#soft)"/></g>
<path d="${edge(xs, up, 0.4)}" fill="none" stroke="${pal.rim}" stroke-width="${f1(1.4 + 1.4 * k)}" opacity="${pal.rimOp}"/>
<g filter="url(#fib)" fill="none" stroke-linecap="round">
<path d="${hd0}" stroke="${pal.hairs[0]}" stroke-width="0.7" opacity="${pal.hairOps[0]}"/>
<path d="${hd1}" stroke="${pal.hairs[1]}" stroke-width="0.8" opacity="${pal.hairOps[1]}"/>
<path d="${hd2}" stroke="${pal.hairs[2]}" stroke-width="0.9" opacity="${pal.hairOps[2]}"/>
</g>`,
  )

  /* ---- upper page (static; also reused inside the peel) ---- */
  const L = -PAD - 6
  const R = W + PAD + 6
  const pieceSvg = svgDoc(
    W,
    H,
    `<defs><filter color-interpolation-filters="sRGB" id="rip" filterUnits="userSpaceOnUse" x="${L}" y="${-PAD - 6}" width="${R - L}" height="${H + PAD * 2 + 12}">
<feTurbulence type="fractalNoise" baseFrequency="${f3(0.28 / clamp(k, 0.5, 1.2))} ${f3(0.5 / clamp(k, 0.5, 1.2))}" numOctaves="2" seed="${s + 21}" result="t"/>
<feDisplacementMap in="SourceGraphic" in2="t" scale="${f1(1.5 + 2.5 * k)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
<path d="${line(xs, up)}L${R} ${f1(up[up.length - 1])}L${R} ${-PAD - 6}L${L} ${-PAD - 6}L${L} ${f1(up[0])}Z" fill="${from}" filter="url(#rip)"/>`,
  )

  /* ---- tiny white fibres poking up into the upper page (static) ---- */
  const [hu0, hu1] = hairPaths(hairsUp, [0, 1])
  const fringeSvg = svgDoc(
    W,
    H,
    `<g fill="none" stroke-linecap="round" stroke="${pal.fringe}"><path d="${hu0}" stroke-width="0.6" opacity="0.4"/><path d="${hu1}" stroke-width="0.8" opacity="0.75"/></g>`,
  )

  /* ---- flap: backside of the lower page, with the torn fibre strip on its edge ---- */
  const bottom = Hs + PAD + 8
  const backTop = up.map((y, i) => y + (lo[i] - y) * 0.45)
  const flapSvg = svgDoc(
    W,
    Hs,
    `<defs>${paperFilter('paper', W, minU - 20, maxL + 24, k, s, pal)}
<filter color-interpolation-filters="sRGB" id="soft" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="${blurS(1 + 2.2 * k)}"/></filter>
<clipPath id="sc"><path d="${band(xs, up, lo)}"/></clipPath></defs>
<path d="${below(xs, backTop, bottom)}" fill="${pal.back}"/>
<path d="${band(xs, up, lo, 0, 1)}" fill="#000" filter="url(#paper)"/>
<g clip-path="url(#sc)" fill="none"><path d="${edge(xs, lo)}" stroke="${pal.backEdge}" stroke-width="${f1(3 + 6 * k)}" opacity="${pal.backEdgeOp}" filter="url(#soft)"/></g>`,
    SX,
    SY,
  )

  /* ---- flap shadow: silhouette of the lower page, pushed "outwards" (up,
     which the reflection turns into "away from the flap edge"), blurred ---- */
  const o1 = 3 + 5 * k
  const o2 = 16 + 46 * k
  const shadowSvg = svgDoc(
    W,
    Hs,
    `<defs>
<filter color-interpolation-filters="sRGB" id="b1" filterUnits="userSpaceOnUse" x="${-SX}" y="${-SY}" width="${W + SX * 2}" height="${Hs + SY + PAD}"><feGaussianBlur stdDeviation="${blurS(2 + 5 * k)}"/></filter>
<filter color-interpolation-filters="sRGB" id="b2" filterUnits="userSpaceOnUse" x="${-SX}" y="${-SY}" width="${W + SX * 2}" height="${Hs + SY + PAD}"><feGaussianBlur stdDeviation="${blurS(14 + 46 * k)}"/></filter>
</defs>
<path d="${below(xs, up, bottom + 200, -o2)}" fill="${pal.castInk}" opacity="${pal.castOp[0]}" filter="url(#b2)"/>
<path d="${below(xs, up, bottom + 200, -o1)}" fill="${pal.castInk}" opacity="${pal.castOp[1]}" filter="url(#b1)"/>`,
    SX,
    SY,
  )

  // Static clip for the flap's lighting overlay, in the sheet's own box
  // (origin at -SX,-SY). Grown a little so the fuzzy edge survives; the
  // overlay is ~transparent out there anyway.
  const grow = Math.max(3, 5 * k)
  let clip = ''
  for (let i = 0; i < xs.length; i += 2) clip += `L${f1(xs[i] + SX)} ${f1(up[i] - grow + SY)}`
  const lastI = xs.length - 1
  clip += `L${f1(xs[lastI] + SX)} ${f1(up[lastI] - grow + SY)}L${f1(xs[lastI] + SX)} ${f1(bottom + SY)}L${f1(xs[0] + SX)} ${f1(bottom + SY)}Z`
  const flapClip = `path('M${clip.slice(1)}')`

  return {
    flapClip,
    strip: toUrl(stripSvg),
    piece: toUrl(pieceSvg),
    fringe: toUrl(fringeSvg),
    flap: toUrl(flapSvg),
    shadow: toUrl(shadowSvg),
  }
}

/* ------------------------------------------------------------------ */
/* Affine helpers ([a b c d e f] as in CSS matrix())                   */
/* ------------------------------------------------------------------ */

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const css = (m) => `matrix(${m.map((v, i) => (i < 4 ? v.toFixed(5) : v.toFixed(2))).join(',')})`

// Content above a tear (lazy images, fonts) can change the page height after
// the trigger was measured. One shared observer refreshes ScrollTrigger then.
let layoutWatchers = 0
let layoutRO = null
function watchPageLayout() {
  if (typeof ResizeObserver === 'undefined') return () => {}
  if (layoutWatchers++ === 0) {
    let t
    let lastH = document.documentElement.scrollHeight
    layoutRO = new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight
      if (Math.abs(h - lastH) < 2) return
      lastH = h
      clearTimeout(t)
      t = setTimeout(() => ScrollTrigger.refresh(), 200)
    })
    layoutRO.observe(document.body)
  }
  return () => {
    if (--layoutWatchers === 0 && layoutRO) {
      layoutRO.disconnect()
      layoutRO = null
    }
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PaperTear({
  from = '#1d2440',
  to = '#2b2b2b',
  direction = 'up',
  seed = 1,
  height = 'clamp(150px, 27vw, 400px)',
  rise = [0.06, 0.74], // tear line height (fraction of the band) at its high and low ends
  align = 0.5, // where the strip sits in the band's spare height (0 top, 0.5 centred, 1 bottom)
  scrub = true,
  progress, // optional: number 0..1 to drive the rip manually (disables scroll)
  tone = 'auto', // 'auto' (from the colours' lightness) | 'light' | 'dark': how the paper is drawn
  className = '',
}) {
  const rootRef = useRef(null)
  const peelRef = useRef(null)
  const clipRef = useRef(null)
  const flapRef = useRef(null)
  const shadeRef = useRef(null)
  const shadowRef = useRef(null)
  const progressRef = useRef(0)
  const sizeRef = useRef({ W: 0, H: 0, ext: 0 })
  const [size, setSize] = useState({ W: 0, H: 0, ext: 0 })

  const mirror = direction !== 'down'
  const controlled = typeof progress === 'number'

  const geo = useMemo(
    () => (size.W > 0 && size.H > 0 ? buildGeometry(size.W, size.H, seed, rise, align) : null),
    [size.W, size.H, seed, rise[0], rise[1], align], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const Hs = size.H + size.ext // peel stage height (extends below the band)
  const pal = useMemo(() => makePalette(tone, from, to), [tone, from, to])
  const imgs = useMemo(
    () => (geo ? buildImages(size.W, size.H, Hs, geo, from, seed, pal) : null),
    [geo, size.W, size.H, Hs, from, seed, pal],
  )

  // p (0..1) → fold position/angle. Only clip-path + transforms are touched.
  const applyRef = useRef(() => {})
  applyRef.current = (p) => {
    progressRef.current = p
    const { W, H, ext } = sizeRef.current
    const peel = peelRef.current
    if (!geo || !W || !peel) return
    const done = p >= 1
    const hidden = done || p < 0
    peel.style.visibility = hidden ? 'hidden' : ''
    if (hidden) return

    const k = geo.k
    const narrow = clamp((1 - k) / 0.7, 0, 1)
    const th0 = lerp(THETA_D[0], THETA_M[0], narrow)
    const th1 = lerp(THETA_D[1], THETA_M[1], narrow)
    const F0 = -PAD - 2
    const FA = W + PAD
    let F
    let thDeg
    if (p <= P_APEX) {
      const u = p / P_APEX
      F = lerp(F0, FA, u)
      thDeg = lerp(th0, th1, smooth(u))
    } else {
      // apex is past the edge: swing the fold steep so it wipes the rest of
      // the lower page (and the flap) out of view
      const v = (p - P_APEX) / (1 - P_APEX)
      const depth = H + ext + PAD - geo.up[geo.up.length - 1]
      const F1 = FA + depth * Math.tan(THETA_END * Math.PI / 180) + 24
      F = lerp(FA, F1, v)
      thDeg = lerp(th1, THETA_END, 1 - (1 - v) * (1 - v))
    }
    const theta = thDeg * Math.PI / 180
    const Ax = F
    const Ay = upAt(geo, F)
    const sn = Math.sin(theta)
    const cs = Math.cos(theta)
    const dx = -sn // fold direction (downwards, leaning back)
    const dy = cs
    const nx = cs // normal pointing ahead (not yet torn side)
    const ny = sn

    // 1) clip everything in the peel to the half-plane ahead of the fold
    const B = (W + H + ext) * 3
    const pts = [
      [Ax - dx * B, Ay - dy * B],
      [Ax - dx * B + nx * B, Ay - dy * B + ny * B],
      [Ax + dx * B + nx * B, Ay + dy * B + ny * B],
      [Ax + dx * B, Ay + dy * B],
    ]
    clipRef.current.style.clipPath = `polygon(${pts.map(([x, y]) => `${f1(x)}px ${f1(y)}px`).join(',')})`

    // 2) reflection across the fold line (stage coords). Layers sit at
    // (-PAD,-PAD) with origin 0 0, so shift into/out of their local frame.
    const c2 = Math.cos(2 * theta)
    const s2 = Math.sin(2 * theta)
    const Rm = [-c2, -s2, -s2, c2, 0, 0]
    const refl = [Rm[0], Rm[1], Rm[2], Rm[3], Ax - (Rm[0] * Ax + Rm[2] * Ay), Ay - (Rm[1] * Ax + Rm[3] * Ay)]
    const toStage = [1, 0, 0, 1, -SX, -SY]
    const fromStage = [1, 0, 0, 1, SX, SY]
    const flapM = mul(fromStage, mul(refl, toStage))
    flapRef.current.style.transform = css(flapM)
    shadowRef.current.style.transform = css(flapM)

    // 3) shading on the flap (in the flap's own, pre-reflection frame):
    // bright crease, slowly greying away from the fold.
    const G = shadeW(k)
    shadeRef.current.style.transform = `translate(${f1(Ax + SX)}px, ${f1(Ay + SY)}px) rotate(${(theta * 180 / Math.PI).toFixed(3)}deg) translate(${-G}px, ${-Math.round(60 * k + 20)}px)`
  }

  // Measure + debounced re-measure on resize.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const W = Math.round(r.width)
      const H = Math.round(r.height)
      const vh = window.innerHeight || 800
      // the still-attached page reaches the viewport bottom until the rip ends
      const ext = Math.max(90, Math.round(vh * (1 - END_AT) - H / 2 + 90))
      const cur = sizeRef.current
      if (W !== cur.W || H !== cur.H || Math.abs(ext - cur.ext) > vh * 0.15) {
        sizeRef.current = { W, H, ext }
        setSize({ W, H, ext })
      }
    }
    measure()
    let t
    const kick = () => {
      clearTimeout(t)
      t = setTimeout(measure, 160)
    }
    const ro = new ResizeObserver(kick)
    ro.observe(el)
    window.addEventListener('resize', kick)
    return () => {
      clearTimeout(t)
      ro.disconnect()
      window.removeEventListener('resize', kick)
    }
  }, [])

  // Re-apply current progress whenever the geometry is regenerated.
  useLayoutEffect(() => {
    applyRef.current(progressRef.current)
    if (geo && !controlled) ScrollTrigger.refresh()
  }, [geo, imgs, controlled])

  // Controlled mode.
  useLayoutEffect(() => {
    if (controlled) applyRef.current(clamp(progress, 0, 1))
  }, [controlled, progress, imgs])

  // Scroll animation.
  useEffect(() => {
    const el = rootRef.current
    if (!el || controlled) return
    const unwatch = watchPageLayout()
    const proxy = { p: 0 }
    const tearSound = scrubSound('tear', { pan: mirror ? -1 : 1 }) // the rip's crackle, panned along it (src/lib/sound.js)
    const set = () => { applyRef.current(proxy.p); tearSound(proxy.p) }
    let raf = 0
    const mm = gsap.matchMedia()
    mm.add(
      { reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
      (ctx) => {
        if (ctx.conditions.reduce) {
          proxy.p = 1
          set()
          return
        }
        proxy.p = 0
        set()
        if (scrub) {
          raf = requestAnimationFrame(hookLenis)
          gsap.to(proxy, {
            p: 1,
            ease: 'none',
            onUpdate: set,
            // Lenis already smooths the scroll: a short scrub just softens wheel steps
            scrollTrigger: { trigger: el, start: SCROLL_START, end: SCROLL_END, scrub: 0.3 },
          })
        } else {
          gsap.to(proxy, {
            p: 1,
            duration: 1.6,
            ease: 'power1.inOut',
            onUpdate: set,
            scrollTrigger: { trigger: el, start: 'top 75%', toggleActions: 'play none none none' },
          })
        }
      },
    )
    return () => {
      cancelAnimationFrame(raf)
      unwatch()
      mm.revert()
    }
  }, [scrub, controlled])

  const flipStyle = mirror ? { transform: 'scaleX(-1)' } : undefined
  const sheet = { left: -SX, top: -SY, width: size.W + SX * 2, height: Hs + SY + PAD }

  return (
    <div
      ref={rootRef}
      className={`paper-tear ${className}`.trim()}
      style={{ height, background: to, '--pt-pad': `${PAD}px` }}
      aria-hidden="true"
      data-direction={direction}
      data-tone={pal.light ? 'light' : 'dark'}
    >
      {imgs && (
        <>
          <div className="paper-tear__static" style={flipStyle}>
            <img className="paper-tear__img" src={imgs.strip} alt="" draggable="false" />
            <img className="paper-tear__img" src={imgs.piece} alt="" draggable="false" />
            <img className="paper-tear__img" src={imgs.fringe} alt="" draggable="false" />
          </div>
          <div ref={peelRef} className="paper-tear__peel" style={{ ...flipStyle, height: Hs }}>
            <div ref={clipRef} className="paper-tear__clip">
              <div className="paper-tear__lower" style={{ background: from }} />
              <div ref={shadowRef} className="paper-tear__sheet paper-tear__shadow" style={sheet}>
                <img src={imgs.shadow} alt="" draggable="false" />
              </div>
              <img className="paper-tear__img paper-tear__piece" src={imgs.piece} alt="" draggable="false" style={{ height: size.H + PAD * 2 }} />
              <div
                ref={flapRef}
                className="paper-tear__sheet paper-tear__flap"
                style={{ ...sheet, clipPath: imgs.flapClip }}
              >
                <img src={imgs.flap} alt="" draggable="false" />
                <div ref={shadeRef} className="paper-tear__shade" style={{ width: shadeW(geo.k), height: (Hs + SY) * 2, opacity: pal.shade }} />
              </div>
            </div>
          </div>
        </>
      )}
      {!imgs && <div style={{ position: 'absolute', inset: 0, background: from }} />}
    </div>
  )
}
