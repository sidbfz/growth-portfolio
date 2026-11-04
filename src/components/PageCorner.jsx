import { useEffect, useId, useState } from 'react'
import { clamp01, useReducedMotion } from './Peel.jsx'
import './Peel.css'

function useMaxSize(maxSize) {
  const q = '(max-width: 640px)'
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const h = () => setMobile(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  if (typeof maxSize === 'number') return maxSize
  return mobile ? 140 : 260
}

const POS = {
  tl: { left: 0, top: 0, transformOrigin: '0 0', flip: [1, 1] },
  tr: { right: 0, top: 0, transformOrigin: '100% 0', flip: [-1, 1] },
  bl: { left: 0, bottom: 0, transformOrigin: '0 100%', flip: [1, -1] },
  br: { right: 0, bottom: 0, transformOrigin: '100% 100%', flip: [-1, -1] },
}

/**
 * PageCorner: the corner of a full-width section curling up like a page.
 * Place inside a `position: relative` (ideally overflow: hidden) section.
 *   size     – fold size in px (distance along each edge). Takes priority.
 *   progress – 0..1, mapped to 0 → maxSize (260px desktop / 140px ≤640px wide).
 *   color    – paper backside colour; revealColor – what shows underneath.
 */
export default function PageCorner({
  corner = 'bl',
  size,
  progress,
  maxSize,
  color = '#f4f2ee',
  revealColor = '#2b2b2b',
  className = '',
  style,
}) {
  const uid = useId().replace(/:/g, '')
  const M = useMaxSize(maxSize)
  const reduced = useReducedMotion()
  // reduced motion: no growing curl, just the end state once the scene is past halfway
  const px = size != null ? size : progress != null ? (reduced ? (progress >= 0.5 ? 1 : 0) : clamp01(progress)) * M : M
  const pos = POS[corner] || POS.bl
  const s = px / M
  const [fx, fy] = pos.flip
  const id = (n) => `pc-${uid}-${n}`
  const mixc = (pct, other = '#000') => `color-mix(in srgb, ${color}, ${other} ${pct}%)`

  return (
    <div
      className={`page-corner ${className}`.trim()}
      aria-hidden="true"
      style={{
        left: pos.left,
        right: pos.right,
        top: pos.top,
        bottom: pos.bottom,
        width: M,
        height: M,
        transformOrigin: pos.transformOrigin,
        transform: `scale(${s.toFixed(4)})`,
        visibility: px < 0.5 ? 'hidden' : 'visible',
        ...style,
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ transform: `scale(${fx},${fy})` }}>
        <defs>
          {/* paper backside: crease highlight → underside shade → lit belly → slightly darker tip */}
          <linearGradient id={id('flap')} gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="80" y2="80">
            <stop offset="0" style={{ stopColor: mixc(30) }} />
            <stop offset="0.025" style={{ stopColor: mixc(80, '#fff') }} />
            <stop offset="0.07" style={{ stopColor: mixc(55, '#fff') }} />
            <stop offset="0.24" style={{ stopColor: mixc(16) }} />
            <stop offset="0.55" style={{ stopColor: color }} />
            <stop offset="0.78" style={{ stopColor: mixc(50, '#fff') }} />
            <stop offset="1" style={{ stopColor: mixc(9) }} />
          </linearGradient>
          {/* cross-light along the fold so the curl reads as a cylinder, not a flat triangle */}
          <linearGradient id={id('side')} gradientUnits="userSpaceOnUse" x1="100" y1="0" x2="0" y2="100">
            <stop offset="0" stopColor="#000" stopOpacity="0.10" />
            <stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id={id('gap')} gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="36" y2="36">
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <filter id={id('blur')} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <clipPath id={id('beyond')}>
            <path d="M100 0 L140 0 L140 140 L0 140 L0 100 Z" />
          </clipPath>
        </defs>

        {/* what the lifted corner reveals */}
        <path d="M0 0 L100.4 0 L0 100.4 Z" fill={revealColor} />
        <path d="M0 0 L100.4 0 L0 100.4 Z" fill={`url(#${id('gap')})`} />

        {/* shadow the curl casts on the page */}
        <g clipPath={`url(#${id('beyond')})`}>
          <path
            d="M100 0 C96 28 90 54 82 72 Q78 80 70 83 C52 90 28 96 0 100 Z"
            transform="translate(4 6)"
            fill="#05070f"
            fillOpacity="0.55"
            filter={`url(#${id('blur')})`}
          />
        </g>

        {/* the curled flap */}
        <path d="M100 0 C95 26 88 52 79 69 Q75 76 68 79 C52 88 26 95 0 100 Z" fill={`url(#${id('flap')})`} />
        <path d="M100 0 C95 26 88 52 79 69 Q75 76 68 79 C52 88 26 95 0 100 Z" fill={`url(#${id('side')})`} />
        <path
          d="M100 0 L0 100"
          stroke="#fff"
          strokeOpacity="0.85"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
