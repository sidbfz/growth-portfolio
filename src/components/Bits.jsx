import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInView, prefersReduced } from '../lib/motion.js'

// reveal as soon as a heading starts to enter (the reference never shows a blank title)
const REVEAL = { threshold: 0, rootMargin: '0px 0px -4% 0px' }

/** matchMedia as state. */
export function useMedia(query) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setOn(m.matches)
    h()
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return on
}

/**
 * Writes the element's scroll progress into a CSS custom property (no re-render):
 * 0 while its top is below `from` (fraction of the viewport, from the top), 1 once it reaches `to`.
 */
export function useScrollVar(ref, name = '--p', from = 1, to = 0.4) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReduced()) { el.style.setProperty(name, '1'); return }
    let id = 0
    let last = -1
    const read = () => {
      id = 0
      const vh = window.innerHeight
      const top = el.getBoundingClientRect().top
      const p = Math.min(1, Math.max(0, (vh * from - top) / (vh * (from - to))))
      if (Math.abs(p - last) > 0.002) { last = p; el.style.setProperty(name, p.toFixed(4)) }
    }
    const on = () => { if (!id) id = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(id) }
  }, [name, from, to])
}

/**
 * Signed offset of the element's centre from the viewport centre, in viewport heights
 * (clamped to -1..1), written to a CSS custom property for CSS-driven parallax.
 */
export function useCenterVar(ref, name = '--v') {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReduced()) { el.style.setProperty(name, '0'); return }
    let id = 0
    let last = 9
    const read = () => {
      id = 0
      const vh = window.innerHeight
      const r = el.getBoundingClientRect()
      const v = Math.min(1, Math.max(-1, (r.top + r.height / 2 - vh / 2) / vh))
      if (Math.abs(v - last) > 0.001) { last = v; el.style.setProperty(name, v.toFixed(4)) }
    }
    const on = () => { if (!id) id = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(id) }
  }, [name])
}

/** Joins line groups for narrow screens, e.g. merge(lines, [[0], [1], [2, 3]]). */
export function mergeLines(lines, groups) {
  return groups.map((g) => g.flatMap((i, k) => (k ? [{ t: ' ' }, ...lines[i]] : lines[i])))
}

/** Multi-line heading where each line slides up from a clip when it scrolls into view. */
export function Lines({ lines, as: Tag = 'h2', className = '', delay = 0 }) {
  const [ref, inView] = useInView(REVEAL)
  return (
    <Tag ref={ref} className={`lines ${inView ? 'is-in' : ''} ${className}`}>
      {lines.map((line, i) => (
        <span className="lines__clip" key={i}>
          <span className="lines__line" style={{ transitionDelay: `${delay + i * 90}ms` }}>
            {line.map((seg, j) => (
              <span key={j} className={seg.accent ? 'u-accent' : undefined}>{seg.t}</span>
            ))}
          </span>
        </span>
      ))}
    </Tag>
  )
}

/**
 * Two-line section title: first line white, second pink (or reversed).
 * Like the reference, the lines tilt apart slightly as the title scrolls up:
 * line 1 turns to -2deg while line 2 straightens from 2deg.
 */
export function SectionTitle({ title, reverse = false, className = '' }) {
  const [ref, inView] = useInView(REVEAL)
  useScrollVar(ref, '--tp', 1, 0.35)
  return (
    <h2 ref={ref} className={`stitle ${reverse ? 'stitle--reverse' : ''} ${inView ? 'is-in' : ''} ${className}`}>
      <span className="lines__clip stitle__l1"><span className="lines__line">{title[0]}</span></span>
      <span className="lines__clip stitle__l2"><span className="lines__line" style={{ transitionDelay: '90ms' }}>{title[1]}</span></span>
    </h2>
  )
}

export function Pill({ children, variant = 'light', big = false, onClick, href = '#' }) {
  return (
    <a className={`pill pill--${variant} ${big ? 'pill--big' : ''}`} href={href} onClick={onClick}>
      <span className="pill__label">{children}</span>
    </a>
  )
}

/** Gentle idle float, offset by a seed so items don't move in sync. */
export function Float({ children, seed = 0, amp = 10, className = '', style }) {
  return (
    <div className={`float ${className}`} style={{ '--amp': `${amp}px`, '--dur': `${5 + (seed % 4)}s`, '--delay': `${-seed * 0.7}s`, ...style }}>
      {children}
    </div>
  )
}

/** Stand-in for the reference's 3D mug: a small cream cup drawn in SVG. */
export function Mug({ className = '' }) {
  const id = useRef(`mug${Math.random().toString(36).slice(2, 7)}`).current
  return (
    <svg className={className} viewBox="0 0 128 104" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}b`} x1="0" x2="1">
          <stop offset="0" stopColor="#d9c38f" />
          <stop offset="0.28" stopColor="#f7ebc6" />
          <stop offset="0.55" stopColor="#fff6dc" />
          <stop offset="1" stopColor="#cbb07a" />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9ad74" />
          <stop offset="1" stopColor="#ecdcb0" />
        </linearGradient>
      </defs>
      <path d="M90 34c20-4 28 10 24 22s-14 18-27 17" fill="none" stroke="#c7aa72" strokeWidth="12" strokeLinecap="round" />
      <path d="M90 34c20-4 28 10 24 22s-14 18-27 17" fill="none" stroke="#f3e5bd" strokeWidth="7" strokeLinecap="round" />
      <path d="M12 24h84l-6 62c-1 8-8 13-16 13H34c-8 0-15-5-16-13z" fill={`url(#${id}b)`} />
      <ellipse cx="54" cy="24" rx="42" ry="10" fill="#fbf1d2" />
      <ellipse cx="54" cy="25" rx="35" ry="7" fill={`url(#${id}i)`} />
    </svg>
  )
}
