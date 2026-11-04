// Ported from Siddharth's Vronte repo (apps/web/src/components/demo/vron.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
let lazy = null;
/** The sprite player and the core motion: one chunk, fetched once for every Vron on the page. */
export const loadVron = () => (lazy ??= import('./vron-lazy.js'));
/** Resolves once the page has loaded and the main thread has a quiet moment. */
export function whenCalm() {
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', () => r(), { once: true }));
    return loaded.then(() => new Promise((r) => {
        if ('requestIdleCallback' in window)
            requestIdleCallback(() => r(), { timeout: 1500 });
        else
            setTimeout(r, 200);
    }));
}
/** His frame inside the 60-point button (app points, like the CSS); his body fills about 80 % of it. */
export const FAB_FRAME = 58 / 60;
/** The 3D canvas is this many frames wide, so confetti and the "!" have room around him. */
const STAGE_3D = 2;
/** How he leaves the ground while acting a reaction out (app VronButton POP): lift in app points, and scale. */
const POP = {
    happy: [10, 1.1],
    celebrate: [14, 1.14],
    love: [8, 1.08],
    surprised: [12, 1.1],
    focused: [4, 1.05],
    sad: [-1, 0.96],
};
/** A bubble shows this long, then fades. */
const BUBBLE_MS = 1600;
/** Rough length of an enter clip (21 frames at 30 fps; celebrate is 42). */
const ENTER_MS = 700;
/** How long he keeps looking at a card before turning back. */
const GLANCE_MS = 1100;
/** The sprite player glances first and acts the reaction out after (its frames can't do both at once). */
const SPRITE_GLANCE_LAG = 1000;
/** Card state classes that mean "something is happening to this card". */
const CUES = ['tap', 'dragging', 'done', 'leave-l', 'leave-r', 'out-fade'];
/** His spot out of the box: the button's centre at the bottom right of Today (CSS: right 14, bottom 38, 60 wide). */
const HOME = { x: 316, y: 712 };
/** Let go, he snaps to the nearer side (the button's centre this far in), between these heights: under the tabs,
 *  above the home indicator. */
const SIDES = [44, 316];
const TOP = 188;
const BOTTOM = 712;
/** The bottom of his body below the button's centre (his frame is 58 points, his base at 0.46 of it), and from there
 *  to the tips of his ears. */
const BASE = 26.7;
const BODY = 50;
/** Without the guard's own `at`: the pile's card step (DemoPhone.astro .deck --card-h), card i's top edge i steps
 *  below the first. demo.ts always passes `at` (the hero's corner). */
const STEP = 80;
/** Perched on a card: this far in from its right edge (clear of its ↗, which sits lower), his base a little into
 *  its top edge, and turned toward its title. */
const PERCH_IN = 46;
const PERCH_SINK = 4;
const PERCH_LOOK = -0.5;
/** Under this many CSS px a press is a tap (it opens the chat), not a drag. */
const TAP_PX = 8;
const TUG_LINES = ['This one first.', 'Not until this is done.'];
/** Stubborn: he gives in on this tug. */
const GIVE_IN = 3;
/** Playful: about one drag in four dodges (and surely by the fourth), at most once every two minutes; the next grab
 *  within 10 s always works. */
const DODGE_CHANCE = 0.25;
const DODGE_EVERY = 120_000;
const CATCH_MS = 10_000;
const SPOT_KEY = 'vr_vron_spot';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;
/** Kept inside the safe area, on the nearer side. */
const snapSpot = (p) => ({ x: p.x < 180 ? SIDES[0] : SIDES[1], y: clamp(p.y, TOP, BOTTOM) });
function loadSpot() {
    try {
        const v = JSON.parse(sessionStorage.getItem(SPOT_KEY) ?? 'null');
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y))
            return snapSpot(v);
    }
    catch {
        /* storage blocked: the default spot */
    }
    return null;
}
function saveSpot(p) {
    try {
        sessionStorage.setItem(SPOT_KEY, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
    }
    catch {
        /* storage blocked: remembered for this page only */
    }
}
export function createVronFab({ fab, near, reduce, onDrag }) {
    const btn = fab.querySelector('[data-vron-btn]');
    const body = fab.querySelector('.vbody');
    const goo = fab.querySelector('.vgoo') ?? body;
    const bubble = fab.querySelector('[data-vron-say]');
    const bubbleText = bubble.querySelector('span');
    const app = fab.closest('[data-app]') ?? fab.parentElement;
    /** What his position is relative to (.app, the whole screen): he stands over every screen, pushed ones too. */
    const stage = fab.parentElement;
    let vron = null;
    let busy = false;
    let away = false;
    let hover = false;
    /** A reaction being acted out, and his will's own mood (in your hand, dodging, sighing), which beats everything. */
    let act = null;
    let actAt = 0;
    let will = null;
    let backTimer = 0;
    let hopTimer = 0;
    let sayTimer = 0;
    let goneTimer = 0;
    let glanceTimer = 0;
    let willTimer = 0;
    let decideTimer = 0;
    let glancedAt = -1e9;
    let follow = null;
    let followRaf = 0;
    // His will
    let guardOn = null;
    let perched = false;
    const tugs = new Map();
    const gaveIn = new Set();
    const greeted = new Set();
    let carried = 0; // drags that carried him (the first never dodges)
    let sinceDodge = 0;
    let lastDodge = -DODGE_EVERY;
    let catchUntil = 0;
    const u = () => stage.offsetWidth / 360 || 1; // one app point in CSS px
    const guarding = () => (guardOn && !gaveIn.has(guardOn.id) ? guardOn : null);
    const rest = () => (busy ? 'thinking' : hover ? 'listening' : guarding() ? 'focused' : 'idle');
    function show() {
        const m = will ?? act ?? rest();
        fab.dataset.vronMood = m;
        vron?.setMood(m);
    }
    /** What his will is doing, on the wrapper (data-vron-state) for tests: idle, walking, perched, resisting,
     *  carried or dodging. */
    const setState = (s) => (fab.dataset.vronState = s);
    setState('idle');
    const restLook = () => (perched ? PERCH_LOOK : 0);
    const frameSize = () => btn.offsetWidth * FAB_FRAME; // layout size, unscaled
    // ---------- position: his spot, where he is now, and the layers that move ----------
    let spot = loadSpot() ?? { ...HOME };
    const pos = { ...spot };
    let lift = 0;
    function place() {
        fab.style.setProperty('--vx', (pos.x - HOME.x).toFixed(2));
        fab.style.setProperty('--vy', (pos.y - HOME.y).toFixed(2));
        fab.style.setProperty('--lift', lift.toFixed(2));
        // His line goes on his open side (decided as it starts, so it doesn't jump sides while he moves).
        if (!bubble.classList.contains('show'))
            fab.classList.toggle('left', pos.x < 180);
    }
    place();
    // .vgoo, about the bottom of his body: c leans his top sideways (a shear, so his base stays flat on the spot),
    // d stretches him up (or squashes), w thins him, r swings him about the point you hold. Springs, so letting go
    // wobbles back like jelly.
    const g = { c: 0, d: 1, w: 1, r: 0 };
    const gv = { c: 0, d: 0, w: 0, r: 0 };
    const gTo = { c: 0, d: 1, w: 1, r: 0 };
    let stiff = 520;
    let damp = 12;
    let pivot = -BASE; // the roll's pivot above his base (points)
    let shakeAt = -1;
    const KEYS = ['c', 'd', 'w', 'r'];
    function setSpring(k, z) {
        stiff = k;
        damp = z;
    }
    function gooAt(c, d, w, r) {
        gTo.c = c;
        gTo.d = d;
        gTo.w = w;
        gTo.r = r;
    }
    function stepGoo(dt) {
        const n = Math.max(1, Math.ceil(dt / 0.004));
        const h = dt / n;
        for (let i = 0; i < n; i++)
            for (const k of KEYS) {
                gv[k] += (stiff * (gTo[k] - g[k]) - damp * gv[k]) * h;
                g[k] += gv[k] * h;
            }
    }
    const gooResting = () => KEYS.every((k) => Math.abs(g[k] - gTo[k]) < 0.002 && Math.abs(gv[k]) < 0.01) && gTo.c === 0 && gTo.d === 1 && gTo.w === 1 && gTo.r === 0;
    function drawGoo(now) {
        const k = u();
        let c = g.c;
        // A quick "no, no": his top wags while his base stays put.
        if (shakeAt >= 0) {
            const t = (now - shakeAt) / 1000;
            if (t < 0.55)
                c += 0.16 * Math.sin(t * Math.PI * 2 * 6.5) * (1 - t / 0.55);
            else
                shakeAt = -1;
        }
        const still = Math.abs(c) < 0.001 && Math.abs(g.d - 1) < 0.001 && Math.abs(g.w - 1) < 0.001 && Math.abs(g.r) < 0.01 && lift < 0.01;
        if (still) {
            goo.style.transform = '';
            return;
        }
        const p = (pivot * k).toFixed(2);
        goo.style.transform =
            `translateY(${(-lift * k).toFixed(2)}px) translateY(${p}px) rotate(${g.r.toFixed(2)}deg) translateY(${(-pivot * k).toFixed(2)}px) ` +
                `matrix(${g.w.toFixed(4)}, 0, ${c.toFixed(4)}, ${g.d.toFixed(4)}, 0, 0)`;
    }
    /** A squash as he lands (or a stretch as he takes off: negative). */
    function squash(s = 1) {
        if (reduce)
            return;
        gv.d -= 3.6 * s;
        gv.w += 2.2 * s;
    }
    let legs = [];
    let leg = null;
    let arrived = null;
    const moving = () => !!leg || legs.length > 0;
    /** Hops to `to` (2-3 small ones for a long way), then `then`. Under reduced motion he's simply there. */
    function walk(to, then, o = {}) {
        stopMoves();
        const d = dist(pos, to);
        if (reduce || d < 1.5) {
            pos.x = to.x;
            pos.y = to.y;
            place();
            then?.();
            return;
        }
        const n = o.hops ?? clamp(Math.round(d / 150), 1, 3);
        const from = { ...pos };
        for (let i = 0; i < n; i++) {
            const a = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n };
            const b = { x: from.x + ((to.x - from.x) * (i + 1)) / n, y: from.y + ((to.y - from.y) * (i + 1)) / n };
            const l = dist(a, b);
            legs.push({ from: a, to: b, t0: 0, ms: clamp(240 + l * 0.9, 280, 430) * (o.quick ? 0.78 : 1), h: clamp(10 + l * 0.12, 12, 30), glide: false });
        }
        arrived = then ?? null;
        if (!drag)
            setState('walking');
        if (vron?.mode === '3d')
            vron.look(clamp((to.x - pos.x) / 120, -0.8, 0.8));
        kick();
    }
    /** A short ease to `to`, low to the ground (a drop snapping to the side). */
    function glide(to, then) {
        stopMoves();
        if (reduce) {
            pos.x = to.x;
            pos.y = to.y;
            lift = 0;
            place();
            then?.();
            return;
        }
        legs.push({ from: { ...pos }, to, t0: 0, ms: clamp(180 + dist(pos, to) * 0.8, 200, 380), h: lift, glide: true });
        arrived = then ?? null;
        kick();
    }
    function stopMoves() {
        legs = [];
        leg = null;
        arrived = null;
        lift = 0;
    }
    /** Out of sight (the chat opens): he's where he was going at once. */
    function finishMoves() {
        const last = legs[legs.length - 1] ?? leg;
        const then = arrived;
        if (last) {
            pos.x = last.to.x;
            pos.y = last.to.y;
        }
        stopMoves();
        place();
        then?.();
    }
    function stepLeg(now) {
        if (!leg) {
            leg = legs.shift() ?? null;
            if (!leg)
                return;
            leg.t0 = now;
            if (!leg.glide)
                squash(-0.8); // takes off: a stretch up
        }
        const p = Math.min(1, (now - leg.t0) / leg.ms);
        const e = leg.glide ? easeOut(p) : easeInOut(p);
        pos.x = leg.from.x + (leg.to.x - leg.from.x) * e;
        pos.y = leg.from.y + (leg.to.y - leg.from.y) * e;
        lift = leg.glide ? leg.h * (1 - e) : leg.h * Math.sin(Math.PI * p);
        if (p < 1)
            return;
        lift = 0;
        squash(leg.glide ? 0.9 : 1);
        leg = null;
        if (!legs.length) {
            const then = arrived;
            arrived = null;
            then?.();
        }
    }
    // One frame loop for all of it, running only while something moves.
    let raf = 0;
    let last = 0;
    function kick() {
        if (raf)
            return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }
    function tick(now) {
        raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        if (leg || legs.length)
            stepLeg(now);
        if (drag?.mode === 'carry') {
            lift += ((reduce ? 0 : 12) - lift) * Math.min(1, dt * 14);
            // He swings on your finger with the drag's speed, and settles as you slow down.
            drag.vx *= Math.exp(-dt * 7);
            gTo.r = reduce ? 0 : clamp(drag.vx * 0.05, -26, 26);
        }
        if (reduce) {
            Object.assign(g, gTo);
            KEYS.forEach((k) => (gv[k] = 0));
        }
        else
            stepGoo(dt);
        drawGoo(now);
        place();
        if (leg || legs.length || drag || shakeAt >= 0 || !gooResting() || lift > 0.01)
            raf = requestAnimationFrame(tick);
    }
    // ---------- boot ----------
    async function boot() {
        const { mountVron } = await import('./live.js');
        fab.hidden = false;
        const canvas = body.querySelector('canvas');
        vron = await mountVron(canvas, { size: frameSize(), stage: STAGE_3D, fx: 1.8 });
        body.style.setProperty('--vs', String(vron.mode === '3d' ? STAGE_3D : 1.5));
        fab.dataset.vronMode = vron.mode;
        show();
        requestAnimationFrame(() => fab.classList.add('on'));
        // Keep the 3D drawing buffer matched to the phone's size.
        if (vron.mode === '3d' && 'ResizeObserver' in window) {
            let last = frameSize();
            new ResizeObserver(() => {
                const s = frameSize();
                if (s > 0 && Math.abs(s - last) > 1)
                    vron?.resize((last = s));
            }).observe(btn);
        }
        watchCards();
        // Something urgent: he notices it once he's in, and goes to it. Otherwise a first hello, so he reads as someone
        // to talk to (and not a sticker).
        if (guarding())
            decide(reduce ? 0 : 700);
        else
            window.setTimeout(() => {
                if (!act && !away && !guarding() && !drag)
                    speak('Hi! Ask me anything');
            }, 900);
    }
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            if (!entries.some((e) => e.isIntersecting))
                return;
            io.disconnect();
            whenCalm()
                .then(boot)
                .catch((err) => {
                console.info('Vron: no AI button.', err);
                fab.hidden = true; // nothing loaded: no button, nothing broken
            });
        }, { rootMargin: '200px 0px' });
        io.observe(near);
    }
    function speak(text) {
        window.clearTimeout(sayTimer);
        bubbleText.textContent = text;
        bubble.classList.remove('show');
        fab.classList.toggle('left', pos.x < 180);
        void bubble.offsetWidth;
        bubble.classList.add('show');
        sayTimer = window.setTimeout(() => bubble.classList.remove('show'), BUBBLE_MS);
    }
    /** His will's mood for `ms` (or until cleared with null). */
    function setWill(m, ms = 0, then = null) {
        window.clearTimeout(willTimer);
        will = m;
        show();
        if (m && ms)
            willTimer = window.setTimeout(() => {
                will = then;
                show();
            }, ms);
    }
    // ---------- his will: guard, perch, go home ----------
    /** Where he perches on `el` (a card of the deck): on its top edge near the right, clear of its ↗ and its text. */
    function perchFor(gd) {
        if (gd.at)
            return gd.at();
        const el = gd.el;
        const deck = el.parentElement ?? el;
        const k = u();
        const s = stage.getBoundingClientRect();
        const r = deck.getBoundingClientRect(); // the slots' box: no transform, unlike the cards gliding in it
        const i = Number(el.style.getPropertyValue('--i')) || 0;
        return { x: (r.right - s.left) / k - PERCH_IN, y: (r.top - s.top) / k + i * STEP + PERCH_SINK - BASE };
    }
    /** Goes where he belongs now: perched by the urgent card, or his spot. Waits for a reaction or a drag to finish. */
    function decide(delay = 0) {
        window.clearTimeout(decideTimer);
        decideTimer = window.setTimeout(() => {
            if (!vron || away || drag)
                return;
            // A reaction gets a moment to land first (then he takes it along: a happy hop home after a done).
            if ((act && performance.now() - actAt < 800) || moving())
                return decide(250);
            const gd = guarding();
            const target = gd ? perchFor(gd) : spot;
            if (dist(pos, target) < 1.5)
                return arrive(gd);
            const wasPerched = perched;
            perched = false;
            show();
            const go = () => {
                const now = guarding();
                walk(now ? perchFor(now) : spot, () => arrive(guarding()));
            };
            // A new urgent card: he notices it (a glance and a "!") the first time, then goes.
            if (gd && !wasPerched && !reduce && !greeted.has(gd.id)) {
                lookAtEl(gd.el, 900);
                setWill('surprised', 520);
                decideTimer = window.setTimeout(() => !drag && !away && go(), 560);
            }
            else
                go();
        }, delay);
    }
    function arrive(gd) {
        perched = !!gd && dist(pos, perchFor(gd)) < 3;
        if (gd && !perched)
            return decide(200); // the card moved while he was on his way
        setState(perched ? 'perched' : 'idle');
        show();
        vron?.look(restLook());
        if (gd && perched && gd.line && !greeted.has(gd.id)) {
            greeted.add(gd.id);
            speak(gd.line);
        }
    }
    function lookAtEl(el, ms) {
        if (!vron)
            return;
        vron.look(dirTo(el));
        window.clearTimeout(glanceTimer);
        glanceTimer = window.setTimeout(() => vron?.look(restLook()), ms);
    }
    let press = null;
    let drag = null;
    let suppress = 0;
    /** Client px to app points relative to his stage. */
    function toPt(x, y) {
        const s = stage.getBoundingClientRect();
        const k = u();
        return { x: (x - s.left) / k, y: (y - s.top) / k };
    }
    function onDown(e) {
        if (e.button > 0 || !vron || away)
            return;
        if (drag?.auto)
            letGo(); // the tour was tugging him: you win
        if (drag)
            return;
        press = { pid: e.pointerId, x: e.clientX, y: e.clientY };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
    }
    function onMove(e) {
        if (drag && e.pointerId === drag.pid) {
            if (e.cancelable)
                e.preventDefault();
            return moveTo(e.clientX, e.clientY, e.timeStamp);
        }
        if (!press || e.pointerId !== press.pid)
            return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_PX)
            return;
        const p = press;
        press = null;
        begin(p.pid, p.x, p.y, false);
        // From here the pointer is his (captured on the wrapper, not the button, so no click reaches the button).
        try {
            fab.setPointerCapture(p.pid);
        }
        catch {
            /* a synthetic pointer */
        }
        if (drag)
            moveTo(e.clientX, e.clientY, e.timeStamp);
    }
    function onUp(e) {
        if (press && e.pointerId === press.pid)
            press = null; // a tap: the click opens the chat
        if (drag && e.pointerId === drag.pid)
            end(e.type === 'pointercancel');
        if (!press && !drag) {
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', onUp, true);
            document.removeEventListener('pointercancel', onUp, true);
        }
    }
    btn.addEventListener('pointerdown', onDown);
    // After a drag, the click that may follow isn't a tap.
    fab.addEventListener('click', (e) => {
        if (performance.now() - suppress > 400)
            return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    /** A drag starts at (x, y): his will decides what happens. */
    function begin(pid, x, y, auto) {
        const now = performance.now();
        const at = toPt(x, y);
        drag = { pid, mode: 'carry', auto, gx: at.x - pos.x, gy: at.y - pos.y, lx: at.x, lt: now, vx: 0, lookDir: 0, shook: false };
        window.clearTimeout(decideTimer);
        window.clearTimeout(backTimer);
        act = null;
        fab.classList.remove('hop');
        fab.classList.add('held');
        const gd = guarding();
        if (gd) {
            const n = auto ? 1 : (tugs.get(gd.id) ?? 0) + 1;
            if (!auto)
                tugs.set(gd.id, n);
            if (n < GIVE_IN)
                return resist(n);
            return giveIn(gd);
        }
        if (!auto)
            onDrag?.();
        const caught = now < catchUntil;
        const dodge = !caught && !reduce && carried > 0 && now - lastDodge > DODGE_EVERY && (Math.random() < DODGE_CHANCE || sinceDodge >= 3);
        if (dodge)
            return slip(at);
        carry(caught);
    }
    /** Stubborn: his base stays stuck where he is, the rest of him stretches after your finger. */
    function resist(n) {
        if (!drag)
            return;
        if (!drag.auto)
            onDrag?.();
        drag.mode = 'resist';
        setState('resisting');
        stopMoves(); // grabbed on his way there: he digs in where he is
        speak(TUG_LINES[Math.min(n, TUG_LINES.length) - 1]);
        setWill('focused');
        setSpring(700, 48);
        pivot = -BASE;
        kick();
    }
    /** The 3rd tug: a sigh, sad for a moment, and he lets you move him (he won't guard this one again). */
    function giveIn(gd) {
        gaveIn.add(gd.id);
        perched = false;
        onDrag?.();
        speak('Fine, you win');
        carry(false, 'sad');
        squash(0.6);
    }
    /** He comes along: dangling from your finger, swinging with its speed. */
    function carry(caught, mood = caught ? 'love' : 'happy') {
        if (!drag)
            return;
        drag.mode = 'carry';
        setState('carried');
        stopMoves();
        perched = false;
        carried++;
        sinceDodge++;
        catchUntil = 0;
        if (caught)
            speak('You got me!');
        // Sad (giving in) or in love (caught) for a moment, then just happy to be along.
        setWill(mood, mood === 'happy' ? 0 : 1100, 'happy');
        setSpring(160, 7);
        pivot = clamp(drag.gy - BASE, -BODY, -6);
        if (!reduce)
            gooAt(0, 1.05, 0.97, 0);
        kick();
    }
    /** Playful: he slips out of your hand and hops off to another edge, far from your finger. */
    function slip(finger) {
        if (!drag)
            return;
        drag.mode = 'dodged';
        fab.classList.remove('held');
        setState('dodging');
        const now = performance.now();
        lastDodge = now;
        catchUntil = now + CATCH_MS;
        sinceDodge = 0;
        perched = false;
        const x = pos.x < 180 ? SIDES[1] : SIDES[0];
        const to = [TOP + 20, 330, 470, 610, BOTTOM].map((y) => ({ x, y })).sort((a, b) => dist(b, finger) - dist(a, finger))[0];
        setWill('happy', 1900);
        walk(to, () => {
            spot = to;
            saveSpot(spot);
            setState('idle');
            vron?.look(0);
            speak('Catch me!'); // from over there
        }, { hops: 2, quick: true });
        setState('dodging');
    }
    function moveTo(x, y, t) {
        if (!drag)
            return;
        const at = toPt(x, y);
        if (drag.mode === 'resist') {
            if (reduce)
                return; // he just stays put, with his line
            // Your finger from the bottom of his body (points). His axis turns from straight up toward it (at most ~55°,
            // as a shear: his base stays flat on the spot) and he stretches along it with diminishing returns, up to ~1.6x,
            // thinning as he goes. Pulled down and aside he leans over toward you; pulled straight down he squashes.
            const fx = at.x - pos.x;
            const fy = at.y - (pos.y + BASE);
            const D = Math.hypot(fx, fy);
            const k = 1 - Math.exp(-D / 90);
            const nx = D ? fx / D : 0;
            const ny = D ? fy / D : -1;
            const b = Math.min(1, k * 1.25);
            const ang = clamp(Math.atan2(nx * b, 1 - (ny + 1) * b * 0.5), -0.95, 0.95);
            const down = Math.max(0, ny);
            const side = Math.abs(nx);
            const L = 1 + k * (0.6 * (1 - down) + 0.3 * down * side - 0.2 * down * (1 - side));
            gooAt(-Math.sin(ang) * L, clamp(Math.cos(ang) * L, 0.7, 1.6), clamp(1 / Math.sqrt(L), 0.72, 1.1), 0);
            // Past a point he shakes his head (once a tug).
            if (k > 0.42 && !drag.shook) {
                drag.shook = true;
                shakeAt = performance.now();
            }
            kick();
            return;
        }
        if (drag.mode !== 'carry')
            return;
        const dt = Math.max(1, t - drag.lt) / 1000;
        const v = (at.x - drag.lx) / dt;
        drag.vx = drag.vx * 0.6 + v * 0.4;
        drag.lx = at.x;
        drag.lt = t;
        pos.x = clamp(at.x - drag.gx, 30, 330);
        pos.y = clamp(at.y - drag.gy + lift, 70, 750);
        // He looks the way he's going.
        const dir = Math.abs(drag.vx) > 80 ? Math.sign(drag.vx) : 0;
        if (dir && dir !== drag.lookDir) {
            drag.lookDir = dir;
            vron?.look(dir * 0.8);
        }
        kick();
    }
    /** Let go (or the pointer was cancelled). */
    function end(cancelled = false) {
        const d = drag;
        if (!d)
            return;
        drag = null;
        suppress = performance.now();
        fab.classList.remove('held');
        try {
            if (fab.hasPointerCapture(d.pid))
                fab.releasePointerCapture(d.pid);
        }
        catch {
            /* already released */
        }
        if (d.mode === 'resist') {
            // He snaps back with a springy wobble.
            setSpring(420, 7.5);
            gooAt(0, 1, 1, 0);
            vron?.look(restLook());
            setWill(null);
            setState(perched ? 'perched' : 'idle');
            kick();
            if (!perched)
                decide(500); // grabbed on his way: he carries on
            return;
        }
        if (d.mode === 'dodged')
            return;
        // Dropped (or the pointer was cancelled, e.g. the page scrolled): a squash landing, on the nearer side, and
        // that's his spot now.
        void cancelled;
        spot = snapSpot(pos);
        saveSpot(spot);
        setSpring(520, 11);
        gooAt(0, 1, 1, 0);
        vron?.look(0);
        setState('idle');
        glide(spot, () => {
            setWill(will === 'happy' || will === 'love' ? 'happy' : will, 700, null);
            decide(400);
        });
    }
    // ---------- looking at cards ----------
    /** Where `el` is, seen from him: -1 far left … 1 far right. */
    function dirTo(el) {
        const r = el.getBoundingClientRect();
        const me = btn.getBoundingClientRect();
        const w = app.getBoundingClientRect().width || 1;
        const dx = r.left + r.width / 2 - (me.left + me.width / 2);
        const x = Math.max(-1, Math.min(1, dx / (w * 0.4)));
        // Cards are mostly up and to his left; even one straight above gets a visible turn.
        return Math.abs(x) < 0.35 ? (x < 0 ? -0.35 : 0.35) : x;
    }
    function glance(card) {
        if (!vron || away || drag || app.querySelector('.home.covered'))
            return;
        const face = card.querySelector('.face') ?? card;
        vron.look(dirTo(face));
        glancedAt = performance.now();
        window.clearTimeout(glanceTimer);
        // While a card is being dragged he follows it, then turns back a moment after it's let go.
        if (card.classList.contains('dragging'))
            startFollow(card, face);
        else
            glanceTimer = window.setTimeout(() => vron?.look(restLook()), GLANCE_MS);
    }
    function startFollow(card, face) {
        follow = card;
        if (followRaf || vron?.mode !== '3d' || reduce)
            return;
        const step = () => {
            followRaf = 0;
            if (!follow || !follow.classList.contains('dragging'))
                return;
            vron?.look(dirTo(face));
            followRaf = requestAnimationFrame(step);
        };
        followRaf = requestAnimationFrame(step);
    }
    function stopFollow() {
        follow = null;
        cancelAnimationFrame(followRaf);
        followRaf = 0;
        window.clearTimeout(glanceTimer);
        glanceTimer = window.setTimeout(() => vron?.look(restLook()), GLANCE_MS * 0.6);
    }
    function watchCards() {
        const isCard = (n) => n instanceof HTMLElement && n.classList.contains('slot');
        new MutationObserver((records) => {
            for (const r of records) {
                if (!isCard(r.target))
                    continue;
                const was = new Set((r.oldValue ?? '').split(/\s+/));
                const now = r.target.classList;
                if (CUES.some((c) => now.contains(c) && !was.has(c)))
                    glance(r.target);
                else if (was.has('dragging') && !now.contains('dragging') && follow === r.target)
                    stopFollow();
            }
        }).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        // A visitor's own touch on a card (a tap to open it, or the start of a swipe).
        app.addEventListener('pointerdown', (e) => {
            const card = e.target.closest('.slot');
            if (card)
                glance(card);
        }, { capture: true, passive: true });
    }
    // ---------- hover and focus: he perks up ----------
    const perk = (on) => {
        hover = on;
        if (vron && !away)
            show();
    };
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        btn.addEventListener('pointerenter', () => perk(true));
        btn.addEventListener('pointerleave', () => perk(false));
    }
    btn.addEventListener('focus', () => btn.matches(':focus-visible') && perk(true));
    btn.addEventListener('blur', () => hover && perk(false));
    function hop(mood, hold) {
        if (reduce)
            return;
        const [y, s] = POP[mood] ?? [6, 1.06];
        fab.style.setProperty('--hop', String(y));
        fab.style.setProperty('--hs', String(s));
        fab.classList.add('hop');
        window.clearTimeout(hopTimer);
        hopTimer = window.setTimeout(() => fab.classList.remove('hop'), hold);
    }
    /** The tour's tug ends (or yours, if the tour was holding him when you grabbed). */
    function letGo() {
        if (drag?.auto)
            end();
    }
    return {
        get ready() {
            return !!vron && !away;
        },
        /** The visitor has him in hand (the tour waits). */
        get handling() {
            return !!drag && !drag.auto;
        },
        /** Guarding a card and sitting by it, ready for the tour to show off his stubbornness. */
        get perched() {
            return !!vron && !away && perched && !moving() && !drag && !!guarding();
        },
        /** Something urgent he means to guard (and hasn't given up on). */
        get guarding() {
            return !!guarding();
        },
        /** Booted, and not on his way anywhere. */
        get settled() {
            return !!vron && !moving() && !act;
        },
        /** What's urgent right now (demo.ts: the #1 card if it's a Manager's and due today), or null. */
        guard(gd) {
            const same = gd?.id === guardOn?.id;
            guardOn = gd;
            if (!same)
                perched = false;
            if (!vron || away)
                return;
            if (!same || !gd)
                decide(gd ? 360 : 200);
            else if (perched && dist(pos, perchFor(gd)) > 2)
                decide(360);
        },
        /** The tour's tug: he resists toward (x, y) (client px) until letGo(). Doesn't count toward giving in. */
        pull(x, y) {
            if (!drag) {
                if (!guarding() || !perched || away)
                    return;
                begin(-1, x, y, true);
            }
            if (drag?.auto)
                moveTo(x, y, performance.now());
        },
        letGo,
        /** A short reaction: the mood (held `ms` once it lands), a hop and an optional line. */
        react(mood, say, ms = 1200) {
            if (!vron || away)
                return;
            window.clearTimeout(backTimer);
            if (say)
                speak(say);
            if (drag && !drag.auto)
                return; // he's in your hand: the line is enough
            // Let a card's cue from this same moment reach him first (it's queued as a microtask), so he can glance at it.
            window.setTimeout(() => {
                if (!vron || away)
                    return;
                const lag = vron.mode === 'sprite' && !reduce && performance.now() - glancedAt < 120 ? SPRITE_GLANCE_LAG : 0;
                act = mood;
                actAt = performance.now();
                show();
                if (lag)
                    window.clearTimeout(glanceTimer); // the mood change turns him back by itself
                const hold = ms + (mood === 'celebrate' ? ENTER_MS * 2 : ENTER_MS);
                backTimer = window.setTimeout(() => {
                    act = null;
                    show();
                }, hold + lag);
                if (lag)
                    hopTimer = window.setTimeout(() => hop(mood, hold), lag);
                else
                    hop(mood, hold);
            }, 0);
        },
        /** Undo: back down, the line goes too. */
        calm() {
            window.clearTimeout(backTimer);
            window.clearTimeout(hopTimer);
            window.clearTimeout(sayTimer);
            act = null;
            fab.classList.remove('hop');
            bubble.classList.remove('show');
            show();
            vron?.look(restLook());
        },
        /** Work in progress (a sync): he thinks until it's done. */
        setBusy(on) {
            busy = on;
            window.clearTimeout(backTimer);
            act = null;
            show();
        },
        /** Hidden while a sheet covers him (the chat has its own Vron); pops back in when it closes. Hidden, he stops
         *  drawing. */
        setAway(on) {
            away = on;
            fab.classList.toggle('away', on);
            fab.inert = on;
            window.clearTimeout(goneTimer);
            if (on) {
                if (drag)
                    end();
                finishMoves();
                bubble.classList.remove('show');
                fab.classList.remove('hop');
                hover = false;
                goneTimer = window.setTimeout(() => fab.classList.add('gone'), reduce ? 0 : 320);
            }
            else {
                fab.classList.remove('gone');
                show();
                vron?.look(restLook());
                decide(420); // the list may have changed while he was away
            }
        },
        poke() {
            vron?.poke();
        },
    };
}
