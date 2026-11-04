import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'

export const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Smooth scrolling for the whole page. */
export function useLenis() {
  useEffect(() => {
    if (prefersReduced()) return
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    let id
    const raf = (t) => { lenis.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)
    window.__lenis = lenis
    return () => { cancelAnimationFrame(id); lenis.destroy() }
  }, [])
}

/** Adds `is-in` once the element enters the viewport (used for line reveals and pops). */
export function useInView(options = { threshold: 0.25 }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReduced()) { setInView(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect() }
    }, options)
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView]
}

/**
 * Scroll progress (0..1) of a tall element: 0 when its top hits the viewport top,
 * 1 when its bottom reaches the viewport bottom. Used for sticky scenes.
 */
export function useStickyProgress() {
  const ref = useRef(null)
  const [p, setP] = useState(0)
  useEffect(() => {
    let id = 0
    const tick = () => {
      id = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = r.height - window.innerHeight
      const v = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0
      setP((old) => (Math.abs(old - v) > 0.001 ? v : old))
    }
    const on = () => { if (!id) id = requestAnimationFrame(tick) }
    tick()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(id) }
  }, [])
  return [ref, p]
}

/** Signed position of an element's centre relative to the viewport centre (-1..1), for parallax. */
export function useParallax() {
  const ref = useRef(null)
  const [v, setV] = useState(0)
  useEffect(() => {
    let id = 0
    const tick = () => {
      id = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const c = r.top + r.height / 2 - window.innerHeight / 2
      const n = Math.max(-1, Math.min(1, c / window.innerHeight))
      setV((o) => (Math.abs(o - n) > 0.002 ? n : o))
    }
    const on = () => { if (!id) id = requestAnimationFrame(tick) }
    tick()
    window.addEventListener('scroll', on, { passive: true })
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(id) }
  }, [])
  return [ref, v]
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x))
/** Map p from [a,b] to [0,1]. */
export const range = (p, a, b) => clamp01((p - a) / (b - a))
