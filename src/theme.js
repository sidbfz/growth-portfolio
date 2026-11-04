// Colour themes. Every colour on the page comes from these few values, so a palette change is
// one edit here. Pick a theme with ?theme=<name> while comparing; DEFAULT_THEME is what ships.
//   bg     main section background        alt    second section background (between paper tears)
//   text   headings and body text          muted  secondary text
//   accent pink/accent words, giant name   onText text on solid pills/buttons (they use `text` as fill)
//   shadow the tone sticker/paper shadows are cast in (warm on paper, so they never read grey)
export const THEMES = {
  night: { bg: '#1d2440', bgDeep: '#171e39', alt: '#2b2b2b', text: '#f9fcf4', muted: 'rgba(249, 252, 244, 0.8)', accent: '#ff9bb4', onText: '#111111', lav: '#6f7ba9', shadow: '#05081a' },
  milk: { bg: '#f7f3ec', bgDeep: '#efe9df', alt: '#ffe3ea', text: '#1a1718', muted: 'rgba(26, 23, 24, 0.68)', accent: '#e2457a', onText: '#f7f3ec', lav: '#8a7f9e', shadow: '#4a2f22' },
  cobalt: { bg: '#f4f4f1', bgDeep: '#eaeae5', alt: '#e3e9ff', text: '#12141f', muted: 'rgba(18, 20, 31, 0.66)', accent: '#2b50e8', onText: '#f4f4f1', lav: '#6f7ba9', shadow: '#1c2238' },
}
export const DEFAULT_THEME = 'milk'

const pick = () => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null
  return THEMES[q] ? q : DEFAULT_THEME
}
export const themeName = pick()
export const theme = THEMES[themeName]

/** Map the theme onto the CSS custom properties the stylesheets already use. */
export function applyTheme(t = theme) {
  const r = document.documentElement.style
  r.setProperty('--navy', t.bg)
  r.setProperty('--navy-deep', t.bgDeep)
  r.setProperty('--charcoal', t.alt)
  r.setProperty('--pink', t.accent)
  r.setProperty('--white', t.text)
  r.setProperty('--cream', t.text)
  r.setProperty('--muted', t.muted)
  r.setProperty('--ink', t.onText)
  r.setProperty('--lav', t.lav)
  r.setProperty('--shadow', t.shadow)
  document.documentElement.dataset.theme = themeName
}
