import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PeelSurface, clamp01, smoothstep, subscribeFrame, useReducedMotion } from './Peel.jsx'
import './Peel.css'

/**
 * useScrollProgress(ref, { start, end })
 * 0..1 progress of an element through the viewport (rAF-throttled, shared loop).
 *   start: viewport fraction (0 = top, 1 = bottom) where the element's TOP sits at progress 0
 *   end:   viewport fraction where the element's BOTTOM sits at progress 1
 * Defaults (1, 0): from "top enters at the bottom" to "bottom leaves at the top".
 * For a tall section with a sticky stage use { start: 0, end: 1 }.
 */
export function useScrollProgress(ref, { start = 1, end = 0 } = {}) {
  const [value, setValue] = useState(0)
  const last = useRef(-1)
  const opts = useRef({ start, end })
  opts.current = { start, end }

  useEffect(() => {
    return subscribeFrame({
      read(dirty) {
        const el = ref.current
        if (!dirty || !el) return
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        const top0 = opts.current.start * vh
        const top1 = opts.current.end * vh - r.height
        const span = top0 - top1
        const p = span === 0 ? (r.top <= top0 ? 1 : 0) : clamp01((top0 - r.top) / span)
        if (Math.abs(p - last.current) > 0.0005) {
          last.current = p
          setValue(p)
        }
      },
      write: () => false,
    })
  }, [ref])

  return value
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

const INWARD = { tl: [1, 1], tr: [-1, 1], bl: [1, -1], br: [-1, -1] }
const ORIGIN = { tl: '85% 85%', tr: '15% 85%', bl: '85% 15%', br: '15% 15%' }

/**
 * PeelOff: a sticker that peels completely off the page.
 * progress 0 = flat, ~0.6 = corner peeled across, 1 = lifted away and gone.
 * If the only child is an <img>, its alpha is used as the sticker silhouette
 * (pass maskSrc to override, or maskSrc={false} for a plain rectangle).
 */
export default function PeelOff({
  progress = 0,
  corner = 'bl',
  backColor = '#f4f2ee',
  maskSrc,
  radius = 0,
  shadowStrength = 0.9,
  className = '',
  style,
  children,
}) {
  const only = Children.count(children) === 1 ? Children.only(children) : null
  const autoSrc = isValidElement(only) && only.type === 'img' ? only.props.src : undefined
  const src = maskSrc === false ? undefined : maskSrc || autoSrc

  const api = useRef(null)
  const bodyRef = useRef(null)
  const nearRef = useRef(null)
  const farRef = useRef(null)
  const reduced = useReducedMotion()
  const pRef = useRef(progress)
  pRef.current = progress

  const apply = useCallback(() => {
    const a = api.current
    const body = bodyRef.current
    if (!a || !body) return
    const p = clamp01(pRef.current)
    const { W, H, span } = a.size()
    const near = nearRef.current
    const far = farRef.current

    if (reduced) {
      a.render(0)
      body.style.transform = ''
      body.style.opacity = String(1 - smoothstep(0.35, 0.75, p))
      near.style.opacity = '0'
      far.style.opacity = '0'
      return
    }

    // 1) the corner lifts and the curl sweeps diagonally to about the middle,
    //    the flap standing up more steeply the further it goes
    const fp = easeInOutSine(clamp01((p - 0.02) / 0.7))
    a.render(fp * 0.5 * span, 1 - 0.5 * fp)

    // 2) the whole sticker lets go: up and out, with a little 3D tilt
    const lp = easeInOut(clamp01((p - 0.46) / 0.54))
    const [ix] = INWARD[corner] || INWARD.bl
    const tx = ix * lp * W * 0.32
    const ty = -lp * H * 0.95
    const rx = 16 * lp + 4 * fp
    const ry = -ix * (12 * lp + 3 * fp)
    const rz = ix * 7 * lp
    const sc = 1 + 0.1 * lp + 0.02 * fp
    body.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,${(lp * 60).toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(4)})`
    const fade = 1 - smoothstep(0.8, 1, p)
    body.style.opacity = fade.toFixed(3)

    // 3) ground shadow, only once it is airborne: a tighter shadow hands over
    //    to a wider, softer, fainter one that lags further behind as it rises
    //    Both are gone well before the sticker is, so no dark "ghost" of it is left behind.
    const lift = easeOut(lp)
    near.style.opacity = (0.16 * smoothstep(0, 0.08, lp) * (1 - smoothstep(0.08, 0.3, lp))).toFixed(3)
    near.style.transform = `translate3d(${(tx * 0.97).toFixed(2)}px,${(ty * 0.95 + 4 + H * 0.06 * lift).toFixed(2)}px,0) scale(${(1 + 0.03 * lift).toFixed(4)})`
    far.style.opacity = (0.12 * smoothstep(0.05, 0.3, lp) * (1 - smoothstep(0.3, 0.6, lp))).toFixed(3)
    far.style.transform = `translate3d(${(tx * 0.88).toFixed(2)}px,${(ty * 0.78 + H * 0.22 * lift).toFixed(2)}px,0) scale(${(1 + 0.18 * lift).toFixed(4)})`
  }, [corner, reduced])

  useLayoutEffect(() => {
    apply()
  }, [progress, apply])

  const groundMask = src
    ? { WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }
    : { borderRadius: radius }

  return (
    <div className={`peeloff ${className}`.trim()} style={style}>
      <div ref={nearRef} className="peeloff__ground peeloff__ground--near" style={groundMask} aria-hidden="true" />
      <div ref={farRef} className="peeloff__ground peeloff__ground--far" style={groundMask} aria-hidden="true" />
      <div ref={bodyRef} className="peeloff__body" style={{ transformOrigin: ORIGIN[corner] || ORIGIN.bl }}>
        <PeelSurface
          api={api}
          onSize={apply}
          corner={corner}
          radius={radius}
          backColor={backColor}
          maskSrc={src}
          depth={0.55}
          shadowStrength={shadowStrength}
        >
          {children}
        </PeelSurface>
      </div>
    </div>
  )
}
