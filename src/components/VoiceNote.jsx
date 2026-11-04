import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { site } from '../content.js'
import { useVoice, toggle, fmtTime } from '../lib/voice.js'
import './VoiceNote.css'

/*
 * Views of the one voice note (state lives in src/lib/voice.js):
 *   VoiceButton  – the hero's pill (play/pause, label, progress fill)
 *   HeaderVoice  – the compact header pill (play/pause, waveform, time)
 *   VoiceCaption – the caption bubble under whichever of the two is on screen, while the note plays
 *
 * Only one of the two buttons shows at a time: the header pill stays hidden while the hero button
 * is in view, and fades in (already in the right state) once it has scrolled away.
 */

// is the hero button on screen? (shared by the header pill and both caption spots)
let heroInView = false
const viewSubs = new Set()
function setHeroInView(on) {
  if (on === heroInView) return
  heroInView = on
  viewSubs.forEach((f) => f())
}
const subscribeView = (f) => { viewSubs.add(f); return () => viewSubs.delete(f) }
const useHeroInView = () => useSyncExternalStore(subscribeView, () => heroInView)

/** Tracks `ref` with an IntersectionObserver; the strip under the fixed header counts as out of view. */
function useWatchInView(ref) {
  // assume it's on screen until the observer says otherwise, so the header pill never flashes on load
  useLayoutEffect(() => { setHeroInView(true); return () => setHeroInView(false) }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setHeroInView(e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
}

const BARS = [0.5, 0.85, 1, 0.65, 0.8]
const NAME = site.fullName || site.name

const Icon = ({ playing }) => (
  <span className="vnote__icon" aria-hidden="true">
    {playing ? (
      <svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>
    ) : (
      <svg viewBox="0 0 24 24"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z" /></svg>
    )}
  </span>
)

const Wave = ({ className = '' }) => (
  <span className={`vnote__wave ${className}`} aria-hidden="true">
    {BARS.map((h, i) => <i key={i} style={{ '--h': h, '--d': `${(i * 0.13).toFixed(2)}s` }} />)}
  </span>
)

function ariaLabel(status, total) {
  const v = site.voiceNote
  const what = `${NAME}'s ${Math.round(total)}-second voice note`
  if (status === 'playing') return `${v.pauseLabel || 'Pause'} ${what}`
  if (status === 'done') return `${v.replayLabel || 'Play again'}: ${what}`
  return `Play ${what}`
}

/** The hero's voice CTA. */
export function VoiceButton({ className = '' }) {
  const { status, playing, progress, total } = useVoice()
  const ref = useRef(null)
  useWatchInView(ref)
  return (
    <button
      ref={ref}
      type="button"
      className={`vnote vnote__btn ${playing ? 'is-playing' : ''} ${className}`}
      onClick={toggle}
      aria-pressed={playing}
      aria-label={ariaLabel(status, total)}
      data-track={playing ? 'voice_pause' : 'voice_play'}
      data-track-where="hero"
    >
      <span className="vnote__fill" style={{ transform: `scaleX(${progress.toFixed(4)})` }} aria-hidden="true" />
      <Icon playing={playing} />
      <span className="vnote__label">{site.voiceNote.label}</span>
    </button>
  )
}

/** The header's compact player; hidden while the hero button is on screen. */
export function HeaderVoice() {
  const { status, playing, progress, t, total } = useVoice()
  const away = useHeroInView()
  const left = status === 'idle' || status === 'done' ? total : total - t
  return (
    <button
      type="button"
      className={`hvoice ${playing ? 'is-playing' : ''} ${status !== 'idle' ? 'is-open' : ''} ${away ? 'is-away' : ''}`}
      tabIndex={away ? -1 : undefined}
      aria-hidden={away || undefined}
      onClick={toggle}
      aria-pressed={playing}
      aria-label={ariaLabel(status, total)}
      data-track={playing ? 'voice_pause' : 'voice_play'}
      data-track-where="header"
    >
      <Icon playing={playing} />
      <Wave />
      <span className="hvoice__time">{fmtTime(Math.ceil(left - 0.05))}</span>
      <span className="hvoice__bar" aria-hidden="true"><span style={{ transform: `scaleX(${progress.toFixed(4)})` }} /></span>
    </button>
  )
}

/**
 * The caption bubble, shown only while the note plays: `where` is 'header' (under the header pill)
 * or 'hero' (under the hero button). Only the one beside the visible button shows, so the
 * captions move with the controls as the hero scrolls away.
 */
export function VoiceCaption({ where = 'header' }) {
  const { playing, caption, captionIndex } = useVoice()
  const heroShown = useHeroInView()
  const on = playing && caption && heroShown === (where === 'hero')
  return (
    <div className={`vcap vcap--${where} ${on ? 'is-on' : ''}`} role="status" aria-live="polite">
      {on && <p className="vcap__text" key={captionIndex}>{caption}</p>}
    </div>
  )
}

export default VoiceButton
