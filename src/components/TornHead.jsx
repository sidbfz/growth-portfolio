import { useMemo } from 'react'
import './TornHead.css'

function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Ragged tear line: big slow wobble + small random jaggies. Values are % offsets around 0. */
function tearPoints(seed, n = 56) {
  const r = rng(seed)
  const pts = []
  let walk = 0
  for (let i = 0; i <= n; i++) {
    const x = -2 + (i * 104) / n
    walk = (walk + (r() - 0.5) * 1.8) * 0.82
    const big = Math.sin((i / n) * Math.PI * 2.3 + seed) * 2.4
    const fine = (r() - 0.5) * (i % 3 === 0 ? 2.2 : 0.9)
    pts.push([x, big + walk + fine])
  }
  return pts
}

const tearCache = new Map()
/** The tear line (in % of the box) for a given openness; shared with content that must stay above it. */
export function tearLine(open, base, seed) {
  if (!tearCache.has(seed)) tearCache.set(seed, tearPoints(seed))
  const y0 = -14 + (base + 14) * open
  return tearCache.get(seed).map(([x, y]) => [x, y0 + y * open])
}

/** Clip-path keeping only what lies above the tear line (plus `drop` %), e.g. objects sinking into the head. */
export function aboveTearClip(open, base, seed, drop = 0) {
  const line = tearLine(open, base, seed)
  const pts = [[-60, -120], ...line.map(([x, y]) => [x, y + drop]), [160, line[line.length - 1][1] + drop], [160, -120]]
  pts.splice(1, 0, [-60, line[0][1] + drop])
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`
}

/**
 * Wraps a head image and tears its top off along a ragged paper edge.
 * open = 1 → top torn away at `base`% of the height; open = 0 → whole head, no tear.
 */
export default function TornHead({ open = 1, base = 30, seed = 3, maskSrc, children }) {
  const line = useMemo(() => tearLine(open, base, seed), [open, base, seed])
  const clip = open <= 0.001 ? 'none' : `polygon(${line.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 102% 102%, -2% 102%)`
  const poly = (dy) => line.map(([x, y]) => `${x},${y + dy}`).join(' ')
  return (
    <div className="torn">
      <div className="torn__clip" style={{ clipPath: clip, WebkitClipPath: clip }}>{children}</div>
      {open > 0.4 && (
        <svg className="torn__edge" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: Math.min(1, Math.max(0, (open - 0.4) / 0.3)), ...(maskSrc ? { WebkitMaskImage: `url(${maskSrc})`, maskImage: `url(${maskSrc})` } : null) }} aria-hidden="true">
          <defs>
            <filter id={`tornFiber${seed}`} x="-5%" y="-30%" width="110%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency="0.7 2.4" numOctaves="2" seed={seed} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <polyline points={poly(0.9)} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="10" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points={poly(0)} fill="none" stroke="#f4f2ed" strokeWidth="9" vectorEffect="non-scaling-stroke" strokeLinejoin="round" filter={`url(#tornFiber${seed})`} />
          <polyline points={poly(-0.25)} fill="none" stroke="#ffffff" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity="0.8" />
        </svg>
      )}
    </div>
  )
}
