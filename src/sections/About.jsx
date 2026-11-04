import { useEffect, useRef, useState } from 'react'
import { site, links } from '../content.js'
import { track } from '../lib/analytics.js'
import FaceTracker from '../components/FaceTracker.jsx'
import './About.css'

/* Screen 4: the quote, then one line of who he is; then the footer. */

export function About() {
  const q = site.quote
  return (
    <section className="about" id="about">
      <figure className="aq">
        <blockquote className="aq__text">
          <p>
            {q.lines.map((line, i) => (
              <span className="aq__line" key={i}>
                {line.map((seg, j) => (seg.accent ? <span className="u-accent" key={j}>{seg.t}</span> : seg.t))}
                {' '}
              </span>
            ))}
          </p>
        </blockquote>
        <figcaption className="aq__who">{q.who}, <cite>{q.where}</cite> ({q.when})</figcaption>
      </figure>
      <p className="about__bio"><b>{site.fullName}.</b> {site.about.bio}</p>
    </section>
  )
}

/* ---------- footer ---------- */

const HREF = { email: () => `mailto:${links.email}`, linkedin: () => links.linkedin, github: () => links.github }

/** Web Share where there is one, else copy the link and say so. */
function useShare(copiedText) {
  const [toast, setToast] = useState('')
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const say = (msg) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 2200)
  }
  const share = async (text) => {
    // tag shared links, so visits from them show up as their own source
    const url = `${location.origin}${location.pathname}?utm_source=share`
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, text, url })
        track('share_done', { method: 'native' })
        return
      } catch (err) {
        if (err && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing else to try */ }
      ta.remove()
    }
    track('share_done', { method: 'copy' })
    say(copiedText)
  }
  return [share, toast]
}

export function Footer() {
  const f = site.footer
  const [share, toast] = useShare(f.copied || 'Link copied')
  return (
    <footer className="foot" id="contact">
      <div className="foot__head">
        <FaceTracker frames={site.heroFrames} expressions={site.heroExpressions} anchor={site.heroEyeAnchor} size="100%" bubble={f.bubble} bubbleSide="right" />
      </div>
      <div className="foot__main">
        <nav className="foot__links" aria-label="Contact">
          {f.socials.map((s) => {
            const k = s.toLowerCase()
            const href = HREF[k] && HREF[k]()
            if (!href) return null
            const ext = !href.startsWith('mailto:')
            return (
              <a key={s} href={href} data-track="social" data-track-network={k} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{s}</a>
            )
          })}
          {f.share && <button type="button" onClick={() => share(f.shareText || '')} data-track="share">{f.share}</button>}
        </nav>
        <p className="foot__legal">{f.copyright}. {f.rights}.</p>
      </div>
      <div className={`foot__toast ${toast ? 'is-on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </footer>
  )
}
