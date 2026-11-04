import { useEffect, useRef } from 'react'
import './VrontePhone.css'

// The phone's own type. @font-face can't be declared inside a shadow root, so the stylesheet goes on the document once.
const FONT = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400..800&display=swap'
function loadFont() {
  if (document.querySelector('link[data-vrp-font]')) return
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = FONT
  l.dataset.vrpFont = ''
  document.head.appendChild(l)
}

// Siddharth's real Vronte demo phone (vronte.com's homepage hero), ported from his Vronte repo.
//
// The phone is the site's own markup (phone.html), styles (phone.css) and vanilla engine (engine/*.js: swipe right =
// done, swipe left = "What happened?", tap = task detail, Calendar / Progress tabs, sync, new task, settings, the
// scripted Vron chat, autoplay until the visitor takes over). It renders into a shadow root, so its CSS can't leak
// into the portfolio and the portfolio's can't leak in. All of it (about 50 KB gzipped) is fetched only when the
// phone nears the viewport; Vron, the cat, is the baked sprite player (public/assets/vronte), never three.js.
//
//   <VrontePhone />                        vronte.com's size: clamp(268px, 23.5vw, 340px) wide
//   <VrontePhone caption={false} />        without the "Swipe or tap a card" line under it
//   size it from CSS with --vp-dw on the element (or any ancestor), e.g. .x { --vp-dw: min(340px, 82vw) }
export default function VrontePhone({ caption = true, className = '', ...rest }) {
  const host = useRef(null)

  useEffect(() => {
    const el = host.current
    if (!el || el.shadowRoot) return // already running (React StrictMode re-runs effects on the same node)
    let gone = false
    const load = async () => {
      loadFont()
      const [{ default: html }, { default: css }, { initDemo }] = await Promise.all([
        import('./phone.html?raw'),
        import('./phone.css?inline'),
        import('./engine/demo.js'),
      ])
      if (gone || el.shadowRoot) return
      const root = el.attachShadow({ mode: 'open' })
      root.innerHTML = `<style>${css}</style>${html}`
      initDemo(root.querySelector('[data-demo]'))
      el.dataset.ready = ''
    }
    if (!('IntersectionObserver' in window)) {
      load()
      return () => { gone = true }
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          load()
        }
      },
      { rootMargin: '900px 0px' },
    )
    io.observe(el)
    return () => {
      gone = true
      io.disconnect()
    }
  }, [])

  return (
    <div
      ref={host}
      className={`vrp-host ${caption ? '' : 'vrp-nocap'} ${className}`.trim()}
      data-caption={caption ? 'on' : 'off'}
      {...rest}
    />
  )
}
