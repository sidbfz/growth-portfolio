import { useEffect, useState, useSyncExternalStore } from 'react'
import './SoundHint.css'
import { arrow } from './Marker.jsx'
import { useSound, setSound } from '../lib/sound.js'

/*
 * A marker note by the header's sound pill: "psst… sound on?" with a hand-drawn arrow curling to
 * the pill (the hero note's handwriting and pink arrow). It comes in once the sticker intro has
 * finished (the arrow draws itself in, the words fade up), stays while the hero is on screen, and
 * fades away when the header turns solid or as soon as sound goes on, and once sound has been on it
 * never comes back on this visit. It's also a button that turns sound on (the pill stays the main
 * control); only the words take clicks, never the arrow or the box around them.
 *
 * Wide screens: under the pill, in the right margin past the giant name's last letter, the arrow
 * hooking up into the pill. Phones (the stacked hero): one line left of the pill, above the name,
 * the arrow pointing right at it.
 */

// the intro's end, set by the hero (markIntroDone); the hint waits for it
let introDone = false
const subs = new Set()
export function markIntroDone() {
  if (introDone) return
  introDone = true
  subs.forEach((f) => f())
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const useIntroDone = () => useSyncExternalStore(subscribe, () => introDone, () => false)

// sound has been on at some point this visit: the hint is done for good
let soundWasOn = false

// up: from under the words' right end, hooking up and left into the pill's foot
const ARROW_UP = arrow([44, 46], [16, 8], -12, 10)
// side (phones): from the words' end, arcing up and right into the pill's left end
const ARROW_SIDE = arrow([3, 20], [33, 12], 7, 9)

export default function SoundHint({ away }) {
  const { supported, on } = useSound()
  const ready = useIntroDone()
  if (on) soundWasOn = true
  const show = supported && ready && !away && !on && !soundWasOn
  // mounted from the first time it shows, so the fade out (and the draw-in) can play
  const [mounted, setMounted] = useState(false)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { if (show) setMounted(true) }, [show])
  // one frame after mounting, so the draw-in starts from nothing
  useEffect(() => {
    if (!mounted) return
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [mounted])
  if (!mounted) return null
  const label = 'psst… sound on?'
  return (
    <div className={`shint ${show && drawn ? 'is-on' : ''}`}>
      <svg className="shint__arrow shint__arrow--up" viewBox="0 0 60 50" aria-hidden="true">
        {ARROW_UP.map((d, i) => <path key={i} d={d} pathLength="1" style={{ '--sub': i }} />)}
      </svg>
      <svg className="shint__arrow shint__arrow--side" viewBox="0 0 36 26" aria-hidden="true">
        {ARROW_SIDE.map((d, i) => <path key={i} d={d} pathLength="1" style={{ '--sub': i }} />)}
      </svg>
      <button type="button" className="shint__btn" aria-label={`${label} Turn sound on`} onClick={() => setSound(true)}>
        <span className="shint__a">psst…</span> <span className="shint__b">sound on?</span>
      </button>
    </div>
  )
}
