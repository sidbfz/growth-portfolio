// All site copy, links and media paths live here, so content changes are single-file edits.
// tap / idle expressions (public/assets/me/expressions). Also cut but not wired: smirk (reads as a
// second smile) and impressed (reads as neutral at hero size).
const EXPR = ['smile', 'laugh', 'wink', 'happy-surprise', 'thinking', 'confused'].map((n) => `/assets/me/expressions/${n}.webp`)

export const links = {
  email: 'siddharthfarkade12@gmail.com',
  linkedin: 'https://www.linkedin.com/in/siddharth-farkade/',
  github: 'https://github.com/sidbfz',
  vronte: 'https://vronte.com/',
  vronteBeta: 'mailto:siddharthfarkade12@gmail.com?subject=Vronte%20beta%20seat',
  unhider: 'https://chromewebstore.google.com/detail/unhider-for-reddit/ikcadejmgkijfldlndckdbmkkaimlmel',
  sowser: 'https://sowser-waitlist.vercel.app/',
}

export const site = {
  name: 'Siddharth',
  fullName: 'Siddharth Farkade',

  // ---------- hero ----------
  // DRAFT copy, being refined by research. Accent segments render pink.
  heroLine: [
    { t: 'Helped grow a cat food brand ' }, { t: '4×', accent: true }, { t: ' in 3 months. ' },
    { t: 'Built ' }, { t: 'Vronte', accent: true }, { t: ' on Wispr Flow.' },
  ],
  voiceNote: {
    label: 'Hear my 20-sec pitch', // hero button; the header pill shows only the time
    // the voice buttons only show once there is a recording: drop it in public/assets/me/ and set the path
    src: '', // e.g. '/assets/me/pitch.mp3'
    seconds: 20,
    pauseLabel: 'Pause',
    replayLabel: 'Play again',
    // captions shown while it plays (judges skim with sound off). TODO: real transcript
    captions: [
      { at: 0, text: 'Hi, main Siddharth. Bangalore se, growth at a cat food brand.' },
      { at: 4, text: 'With the team, we grew revenue 4× in three months.' },
      { at: 8, text: 'My bit? A new channel that brings customers back.' },
      { at: 13, text: 'On the side, I built Vronte, on top of Wispr Flow’s MCP.' },
      { at: 17, text: 'Baaki sab site pe hai. Milte hain?' },
    ],
  },
  // Siddharth's own sticker heads, one per gaze (built from one shared cut-out mask, so only the
  // eyes move). Key names match FaceTracker's DIRS; `cross` shows when the pointer sits between the eyes.
  heroFrames: {
    center: '/assets/me/eyes/center.webp',
    up: '/assets/me/eyes/up.webp',
    down: '/assets/me/eyes/down.webp',
    left: '/assets/me/eyes/left.webp',
    right: '/assets/me/eyes/right.webp',
    upLeft: '/assets/me/eyes/up-left.webp',
    upRight: '/assets/me/eyes/up-right.webp',
    downLeft: '/assets/me/eyes/down-left.webp',
    downRight: '/assets/me/eyes/down-right.webp',
    cross: '/assets/me/eyes/cross.webp',
  },
  // the point between the pupils, as a fraction of the sticker image (measured off the center frame)
  heroEyeAnchor: [0.497, 0.51],
  // tap / idle expressions and the scroll peel-off's surprised face: his own stickers, each cut
  // separately (the face shape changes) and registered to the center frame on the glasses, forehead and ears
  heroExpressions: EXPR,
  heroSurprised: '/assets/me/expressions/surprised.webp',
  // mobile hero carousel: the pill under the head cycles through these
  heroLabels: ['Growth', 'Builder', 'Voice'],
  // objects sitting in the torn-open head (3D icons, see public/assets/3d/README)
  heroProps: {
    mic: '/assets/3d/mic.webp',
    book: '/assets/3d/book.webp',
    camera: '/assets/3d/camera.webp',
    laptop: '/assets/3d/laptop.webp',
    heart: '/assets/3d/heart.webp',
  },

  // ---------- everything below the hero ----------
  // Copy is sentence case and short on purpose: judges skim on phones. Longer lines sit behind a tap.

  // "Built on Wispr Flow": the live Vronte phone (VronteTry.jsx). Whole section ≤ 30 visible words.
  // `title` renders `accent` in pink; `notes` is the Wispr Flow card feeding the phone; `href` is a key of `links`.
  vronte: {
    title: 'Built on Wispr Flow.',
    accent: 'Wispr Flow',
    line: 'Vronte reads your Wispr Flow notes and ranks your day by who asked.',
    // the doodle beside the phone: one dictated Wispr Flow note (a drawn speech bubble with the W mark and a
    // waveform), handwritten, the same task the phone shows. `who` is underlined in pink; `head` is for screen readers.
    note: {
      head: 'A Wispr Flow note',
      text: 'Sarah wants the client deck reviewed by 11 tomorrow.',
      who: 'Sarah',
      via: 'via the Wispr Flow MCP',
    },
    // the doodle by the phone, pointing at it (a click nudges the phone): `live` in bold, `liveHint` under it with
    // `liveAccent` in pink. Both gestures work with a mouse and on touch.
    live: 'it’s live!',
    liveHint: 'swipe or tap a card',
    liveAccent: 'swipe',
    href: 'vronte',
    linkLabel: 'vronte.com',
  },

  // The scroll-flip notebook (sections/Notebook.jsx). One drawing per page, a note of ≤ 6
  // handwritten words below it. `hi` (optional) is the part of `note` inked in pink; `aside` is a
  // tiny pencilled extra; `link` (optional, `href` a key of `links`) is a blue pill on the line under
  // the note (`label` ≤ 20 characters). A page with `list` (a key of `site`) and `title` is instead
  // a handwritten numbered list of that block's `items[].idea`. `sketch` names a drawing in
  // sections/notebook/drawings.js, and `chart` holds its numbers: plot only known points (multiples are indexed to the month named in
  // `base`; no rupee amounts). Ticks are [value, label]; points are [month index, value].
  notebook: {
    hint: 'scroll to flip',
    hintStill: 'tap a page to flip',
    cover: ['Siddharth’s', 'notebook'],
    back: 'Siddharth Farkade',
    label: 'Siddharth’s notebook. Tap the right page for the next one, the left page to go back.',
    labelPad: 'Siddharth’s notebook. Tap the page for the next one, the top edge to go back.',
    pages: [
      {
        sketch: 'line', note: 'revenue in 3 months', aside: '(team win)',
        chart: { x: ['Jun', 'Jul', 'Aug', 'Sep'], base: '× June', ticks: [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], points: [[0, 1], [3, 4]], callout: '4×' },
      },
      {
        sketch: 'columns', note: 'channel I built. 7.8×', hi: '7.8×',
        chart: { x: ['Jul', 'Aug', 'Sep'], base: '× July', ticks: [[4, '4×'], [8, '8×']], max: 8, bars: [[1, '1×'], [3.9, '3.9×'], [7.8, '7.8×']], steps: ['3.9×', '2×'], tag: '≈11% of revenue', top: 124, axisTop: 104 },
      },
      {
        sketch: 'columns', note: 'customers kept coming back', hi: 'kept coming back',
        chart: { x: ['Jun', 'Sep'], base: 'orders / month', bars: [[380, '380+'], [1200, '1,200+']], bracket: '3.2×', top: 110, calloutSize: 38 },
      },
      {
        sketch: 'held', note: 'ads paused. revenue held.', hi: 'revenue held.',
        chart: { x: ['Jun', 'Sep', 'Oct'], base: '× June', ticks: [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], points: [[0, 1, true], [1, 4], [2, 4]], band: 'ads off, 2 wks', callout: '≈4×' },
      },
      {
        sketch: 'timeline', note: 'my extension. banned, still grew.', hi: 'still grew.',
        chart: { steps: [['400', 'day 1'], 'banned', ['550+', 'users']] },
        link: { href: 'unhider', label: 'on the Chrome store ↗', name: 'Unhider for Reddit on the Chrome Web Store' },
      },
      {
        sketch: 'waitlist', note: 'waitlist test. then I stopped.', hi: 'stopped.',
        chart: { count: '200+', what: 'on the waitlist', time: 'in 2 weeks' },
        link: { href: 'sowser', label: 'see the page ↗', name: 'the Sowser waitlist page' },
      },
      { sketch: 'plan', note: 'first 30 days at Wispr', hi: 'Wispr' },
      // the last page, facing the back cover: the plan's ideas as a numbered list
      { list: 'plan', title: 'what I’d test first:' },
    ],
  },

  // First 30 days at Wispr: the notebook's last page lists the `idea`s (≤ 8 words, ≤ 2 short lines each).
  plan: {
    title: 'First 30 days at Wispr India',
    own: 'I’d own:',
    items: [
      { idea: 'A campus dare beats a campus ad.', metric: 'week-one activation', how: 'A 5-day Hinglish dictation challenge at 3 Bangalore colleges, run by student reps with referral links.' },
      { idea: 'Hinglish typing-vs-talking races sell themselves.', metric: 'cost per install', how: '20 micro-creators race typing against speaking on camera. One tracked link each; cut the bottom half in week two.' },
      { idea: 'Offer the upgrade at the word limit.', metric: 'free-to-paid, India', how: 'With product, test the annual offer at the exact moment a free user hits the weekly limit.' },
      // the long game, last: story-led brand content alongside the UGC (it faces the back cover's camera)
      { idea: 'Brand stories, not just UGC.', metric: 'ad recall, branded search', how: 'A short brand film: a founder buried in typing gets their hours back with Flow. Emotion first, product second; more story-led spots if it lands.' },
    ],
    more: 'How',
  },

  // Screen 4: about + contact
  quote: {
    lines: [
      [{ t: 'You do the thing you’re' }],
      [{ t: 'scared sh*tless of, and you' }],
      [{ t: 'get the courage ' }, { t: 'after', accent: true }],
      [{ t: 'you do it, not before.' }],
    ],
    who: 'Archie Gates',
    where: 'Three Kings',
    when: '1999',
  },
  about: {
    // ≤ 15 words, shown after the bold full name
    bio: 'Growth at a D2C cat food brand, Bangalore. B.Tech, Pune, 2027.',
  },

  // ---------- footer ----------
  footer: {
    bubble: 'Leaving so soon?',
    copyright: '© 2026 Siddharth Farkade',
    rights: 'Written with Wispr Flow',
    // plain text links, in this order; `share` is the last one (Web Share, else copies the link)
    socials: ['Email', 'LinkedIn', 'GitHub'],
    share: 'Share',
    copied: 'Link copied',
  },

  // analytics: cookieless, set the id when the account exists
  analytics: { provider: 'umami', src: '', websiteId: '' },
}
