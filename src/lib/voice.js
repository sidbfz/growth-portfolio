/*
 * The one voice-note controller. A single <audio> element and a single state, shared by every
 * control on the page (the header pill, the hero button), so they can never double-play or drift.
 *
 * Captions run on the audio's clock; if the audio can't play (blocked, missing, silent placeholder
 * with no duration), they run on their own clock for `site.voiceNote.seconds`, so the pitch still
 * reads through with the sound off.
 */
import { useSyncExternalStore } from 'react'
import { site } from '../content.js'

/** Fired on window whenever playback starts or stops: detail = { playing }. */
export const VOICE_EVENT = 'voicenote:state'

const v = site.voiceNote || {}
let audio = null
let state = { status: 'idle', t: 0, total: v.seconds || 20 } // status: idle | playing | paused | done
const subs = new Set()
const clock = { base: 0, start: 0, fallback: false }
let raf = 0

const emit = (next) => {
  state = { ...state, ...next }
  subs.forEach((f) => f())
}

function announce(playing) {
  document.documentElement.toggleAttribute('data-voice-playing', playing)
  window.dispatchEvent(new CustomEvent(VOICE_EVENT, { detail: { playing } }))
}

function el() {
  if (audio || typeof Audio === 'undefined') return audio
  audio = new Audio()
  audio.preload = 'metadata'
  audio.src = v.src
  audio.addEventListener('loadedmetadata', () => {
    const d = audio.duration
    if (Number.isFinite(d) && d > 1) emit({ total: d })
  })
  audio.addEventListener('ended', () => { if (!clock.fallback) finish() })
  audio.addEventListener('error', () => {
    if (clock.fallback) return
    clock.fallback = true
    clock.base = state.t
    clock.start = performance.now()
  })
  return audio
}

const now = () => (clock.fallback || !audio ? clock.base + (performance.now() - clock.start) / 1000 : audio.currentTime)

function tick() {
  raf = 0
  if (state.status !== 'playing') return
  const t = now()
  if (t >= state.total) { finish(); return }
  if (Math.abs(t - state.t) > 0.03) emit({ t })
  raf = requestAnimationFrame(tick)
}

function finish() {
  if (state.status === 'done') return // the clock and the audio's `ended` can both get here
  audio?.pause()
  cancelAnimationFrame(raf)
  raf = 0
  emit({ status: 'done', t: state.total })
  announce(false)
  window.dispatchEvent(new CustomEvent('track', { detail: { name: 'voice_complete' } }))
}

export function play() {
  const a = el()
  const from = state.status === 'done' ? 0 : state.t
  clock.base = from
  clock.start = performance.now()
  clock.fallback = !a
  emit({ status: 'playing', t: from })
  announce(true)
  if (!raf) raf = requestAnimationFrame(tick)
  if (!a) return
  try { a.currentTime = from } catch { /* not seekable yet */ }
  const p = a.play()
  if (p && p.catch) p.catch(() => { clock.fallback = true; clock.start = performance.now() })
}

export function pause() {
  if (state.status !== 'playing') return
  const t = now()
  audio?.pause()
  cancelAnimationFrame(raf)
  raf = 0
  clock.base = t
  emit({ status: 'paused', t })
  announce(false)
}

export const toggle = () => (state.status === 'playing' ? pause() : play())

const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const snap = () => state

/** { status, t, total, playing, progress, caption } — re-renders while playing. */
export function useVoice() {
  const s = useSyncExternalStore(subscribe, snap)
  const caps = v.captions || []
  let ci = -1
  for (let i = 0; i < caps.length; i++) if (caps[i].at <= s.t) ci = i
  return {
    ...s,
    playing: s.status === 'playing',
    progress: Math.min(1, s.t / s.total),
    caption: ci >= 0 ? caps[ci].text : '',
    captionIndex: ci,
  }
}

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`
