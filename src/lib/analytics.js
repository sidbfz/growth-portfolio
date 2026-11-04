/*
 * Analytics: tiny, cookieless, provider-agnostic. Initialised once from main.jsx.
 *
 * SETUP (Umami, free tier is enough)
 *   1. Sign up at https://cloud.umami.is, then Settings → Websites → Add website (the deployed domain).
 *   2. Copy the Website ID and the tracking script URL (https://cloud.umami.is/script.js) into
 *      `site.analytics` in src/content.js:  { provider: 'umami', src: '<script url>', websiteId: '<id>' }
 *   3. Deploy. While either field is empty this module is a no-op (it logs events to the console in dev).
 *
 * WHAT IS TRACKED
 *   - page view (Umami does this itself), with the UTM params of the landing URL in its query string
 *   - any click on an element with data-track="<event>"; extra data-track-<key>="<value>" attributes
 *     become event props (e.g. data-track="social" data-track-network="email")
 *   - window.dispatchEvent(new CustomEvent('track', { detail: { name, props } })) from anywhere
 *   - scroll depth: scroll_50 and scroll_90, once per page load
 *   - every event carries the session's UTM params (kept in sessionStorage, so they survive reloads)
 *
 * UTM LINKS (use one per place the link is shared, so Umami shows which one brought each visit)
 *   Application form:   https://<domain>/?utm_source=wispr&utm_medium=application&utm_campaign=growth_intern_india
 *   Video description:  https://<domain>/?utm_source=youtube&utm_medium=video&utm_campaign=growth_intern_india
 *   LinkedIn post:      https://<domain>/?utm_source=linkedin&utm_medium=social&utm_campaign=growth_intern_india
 *   LinkedIn DM / bio:  https://<domain>/?utm_source=linkedin&utm_medium=dm&utm_campaign=growth_intern_india&utm_content=<person>
 *   In Umami: Website → Events for clicks, and filter any report by "Query" (utm_source etc.).
 */
import { site } from '../content.js'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
const STORE = 'sf_utm'
const DEV = import.meta.env.DEV

let utm = {}
let queue = []
let started = false

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(STORE) || '{}') } catch { return {} } },
  set(v) { try { sessionStorage.setItem(STORE, JSON.stringify(v)) } catch { /* private mode: keep it in memory */ } },
}

function captureUtm() {
  const q = new URLSearchParams(location.search)
  const fresh = {}
  for (const k of UTM_KEYS) { const v = q.get(k); if (v) fresh[k.slice(4)] = v.slice(0, 100) }
  // a new campaign link replaces the old one; a plain reload keeps what we had
  utm = Object.keys(fresh).length ? fresh : store.get()
  store.set(utm)
}

const umami = () => (typeof window !== 'undefined' && window.umami && typeof window.umami.track === 'function' ? window.umami : null)

function send(name, props) {
  const u = umami()
  if (u) { u.track(name, props); return }
  if (enabled()) { if (queue.length < 50) queue.push([name, props]); return }
  if (DEV) console.info('[analytics]', name, props)
}

function enabled() {
  const a = site.analytics || {}
  return Boolean(a.src && a.websiteId)
}

/** Record an event. Props are flat key → string/number pairs; UTM params are added automatically. */
export function track(name, props = {}) {
  if (!name) return
  send(String(name).slice(0, 50), { ...props, ...utm })
}

function injectUmami() {
  const a = site.analytics
  const s = document.createElement('script')
  s.defer = true
  s.src = a.src
  s.dataset.websiteId = a.websiteId
  s.onload = () => {
    // flush anything tracked before the script arrived
    const q = queue
    queue = []
    q.forEach(([n, p]) => send(n, p))
  }
  document.head.appendChild(s)
}

function propsFrom(el) {
  const p = {}
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k.startsWith('track') && k.length > 5) p[k[5].toLowerCase() + k.slice(6)] = v
  }
  return p
}

function watchClicks() {
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-track]') : null
    if (el) track(el.dataset.track, propsFrom(el))
  }, { capture: true, passive: true })
  window.addEventListener('track', (e) => {
    const d = e.detail || {}
    track(d.name, d.props)
  })
}

function watchScrollDepth() {
  const marks = [50, 90]
  let id = 0
  const check = () => {
    id = 0
    const doc = document.documentElement
    const max = doc.scrollHeight - window.innerHeight
    if (max <= 0) return
    const pct = ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100
    while (marks.length && pct >= marks[0]) track(`scroll_${marks.shift()}`)
    if (!marks.length) window.removeEventListener('scroll', on)
  }
  const on = () => { if (!id) id = requestAnimationFrame(check) }
  window.addEventListener('scroll', on, { passive: true })
}

/** Call once at startup. */
export function initAnalytics() {
  if (started || typeof window === 'undefined') return
  started = true
  captureUtm()
  if (enabled()) injectUmami()
  else if (DEV) console.info('[analytics] no site.analytics.src / websiteId: events are logged here only', utm)
  watchClicks()
  watchScrollDepth()
}
