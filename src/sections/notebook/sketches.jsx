// Hand-drawn pieces for the flip notebook (Notebook.jsx): the drawings, the notes, the handwriting.
import { SKETCHES, swoosh } from './drawings.js'
import './sketches.css'
import { links, site } from '../../content.js'
import { pen } from '../../lib/sketchy.js'

// Handwriting face (loaded once, only where the notebook is used).
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap'
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${FONT_HREF}"]`)) {
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = FONT_HREF
  document.head.appendChild(l)
}

// The drawings are plain ink on the page, built once each (no draw-on animation). A page's
// drawing reads its numbers from the page's `chart` in content.js.
const built = new Map()
export function art(name, data) {
  const key = data || name
  if (!built.has(key)) built.set(key, SKETCHES[name](data || {}))
  return built.get(key)
}
export const SWOOSH = swoosh()

/** The strokes of one sketch. `weight` thickens the pen when a sketch is drawn smaller. */
export function Ink({ strokes, weight = 1 }) {
  return strokes.map((s, i) => (
    <path key={i} d={s.d} className={'nb-s' + (s.c === 'pink' ? ' nb-s--pink' : '')} style={{ strokeWidth: s.w * weight, opacity: s.op }} />
  ))
}

/** A drawing's handwritten labels: axis months and ticks, values, the circled end value. */
export function Labels({ text }) {
  return text.map((l, i) => (
    <text
      key={i}
      x={l.x}
      y={l.y}
      textAnchor={l.a || 'start'}
      className={'nb-lbl' + (l.c ? ' nb-lbl--' + l.c : '')}
      style={{ fontSize: l.s + 'px' }}
      transform={l.r ? `rotate(${l.r} ${l.x} ${l.y})` : undefined}
    >
      {l.t}
    </text>
  ))
}

/** Split a note into handwritten lines: at sentence ends, and a long sentence into two even halves. */
export function wrapNote(note, max = 24) {
  const lines = []
  for (const part of note.split(/(?<=\.)\s+/)) {
    if (part.length <= max) {
      lines.push(part)
      continue
    }
    const w = part.split(' ')
    let best = null
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i).join(' ')
      const b = w.slice(i).join(' ')
      const m = Math.max(a.length, b.length)
      if (!best || m < best.m) best = { a, b, m }
    }
    lines.push(best.a, best.b)
  }
  return lines
}

export function Hi({ text, hi }) {
  const at = hi ? text.indexOf(hi) : -1
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <tspan className="nb-hi">{hi}</tspan>
      {text.slice(at + hi.length)}
    </>
  )
}

export const RULE0 = 48
export const RULE = 28
export const RULES = Array.from({ length: 13 }, (_, i) => RULE0 + i * RULE)

export function Rules() {
  return (
    <g className="nb-rules">
      {RULES.map((y) => (
        <line key={y} x1="0" x2="300" y1={y} y2={y} />
      ))}
    </g>
  )
}

/** One ruled page: the sketch above, the note handwritten on the lines below (a list page is all lines). */
export function Page({ page, n, side }) {
  if (page.list) return <ListPage page={page} n={n} side={side} />
  const drawing = art(page.sketch, page.chart)
  const lines = wrapNote(page.note)
  // a page with a link writes its note a line higher, so the link sits on the line under it
  const first = lines.length > 2 || page.link ? 300 : 328
  return (
    <svg className="nb-paper" viewBox="0 0 300 400" role={page.link ? 'group' : 'img'} aria-label={page.note + (page.aside ? ' ' + page.aside : '')}>
      <Rules />
      <g className="nb-ink" aria-hidden="true">
        <Ink strokes={drawing.strokes} />
        <Labels text={drawing.text} />
      </g>
      <g className="nb-note" transform="rotate(-1.2 150 340)" aria-hidden="true">
        {lines.map((l, i) => (
          <text key={i} x="26" y={first + i * RULE - 5}>
            <Hi text={l} hi={page.hi} />
          </text>
        ))}
        {page.aside && (
          <text className="nb-aside" x="272" y={first + lines.length * RULE - 6} textAnchor="end" transform={`rotate(-4 272 ${first + lines.length * RULE})`}>
            {page.aside}
          </text>
        )}
      </g>
      <text className="nb-pnum" x={side === 'left' ? 20 : 280} y="392" textAnchor={side === 'left' ? 'start' : 'end'} aria-hidden="true">
        {n}
      </text>
      {page.link && links[page.link.href] && <PageLink link={page.link} y={first + lines.length * RULE} />}
    </svg>
  )
}

/** A list page: `list` names a block of content.js whose `items[].idea` are written as a numbered list. */
const lists = new WeakMap()
function ListPage({ page, n, side }) {
  if (!lists.has(page)) lists.set(page, { title: page.title, items: site[page.list].items.map((it) => wrapNote(it.idea, 20)) })
  const data = lists.get(page)
  const drawing = art('list', data)
  const label = [page.title, ...site[page.list].items.map((it, i) => `${i + 1}. ${it.idea}`)].join(' ')
  return (
    <svg className="nb-paper" viewBox="0 0 300 400" role="img" aria-label={label}>
      <Rules />
      <g className="nb-ink" aria-hidden="true">
        <Ink strokes={drawing.strokes} />
        <Labels text={drawing.text} />
      </g>
      <text className="nb-pnum" x={side === 'left' ? 20 : 280} y="392" textAnchor={side === 'left' ? 'start' : 'end'} aria-hidden="true">
        {n}
      </text>
    </svg>
  )
}

/**
 * A link on a page: blue ballpoint in a hand-drawn pill, on the ruled line under the note (its
 * baseline rule is `y`), so it reads as something to tap. A tap on it doesn't turn the page.
 */
const pills = new Map()
function pill(label) {
  if (!pills.has(label)) {
    const w = label.length * 21 * 0.36 + 26
    const p = pen(label.length * 7 + 3)
    p.rrect(0, 0, w, 30, 13, { c: 'link', w: 1.7, double: false, lump: 0.04 })
    pills.set(label, { w, strokes: p.strokes })
  }
  return pills.get(label)
}
function PageLink({ link, y }) {
  const { w, strokes } = pill(link.label)
  const x = 24
  const top = y - 19
  return (
    <a className="nb-link" href={links[link.href]} target="_blank" rel="noopener noreferrer" aria-label={link.name || link.label}
      data-track="notebook_link" data-track-where={link.href} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <g transform={`rotate(-1.2 ${x} ${top}) translate(${x} ${top})`}>
        {/* a bigger, invisible tap target than the pill itself */}
        <rect className="nb-link__hit" x="-8" y="-9" width={w + 16} height="48" rx="12" />
        <rect className="nb-link__bg" x="1" y="1" width={w - 2} height="28" rx="13" />
        {strokes.map((st, i) => <path key={i} d={st.d} className="nb-link__pen" style={{ strokeWidth: st.w }} />)}
        <text x={w / 2} y="21.5" textAnchor="middle">{link.label}</text>
      </g>
    </a>
  )
}

/** A blank ruled page. */
export function Blank() {
  return (
    <svg className="nb-paper" viewBox="0 0 300 400" aria-hidden="true">
      <Rules />
    </svg>
  )
}
