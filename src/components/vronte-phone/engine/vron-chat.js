// Ported from Siddharth's Vronte repo (apps/web/src/components/demo/vron-chat.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
import { activeEl } from './dom.js';
/** Frame sizes in app points (the phone's --u): the empty state's hero, and beside a reply. */
const HERO = 124;
const SMALL = 40;
/** The sheet's slide (Chat.astro): he's mounted after it so the slide stays smooth. */
const SHEET_MS = 420;
/** From the hero into place by the first reply; down from one reply to the next; along as his own row grows. */
const SHRINK_MS = 680;
const HOP_MS = 460;
const GLIDE_MS = 320;
/** How high those moves arc (app points). */
const SHRINK_LIFT = 16;
const HOP_LIFT = 14;
/** His centre in the hero's stage (app points from its top left), and beside a reply: this far above the gutter's
 *  bottom (feet on the bubble's bottom line). */
const HERO_AT = { x: 53, y: 68 };
const FEET = 19;
/** The visitor stops typing this long: he nods (once per pause). */
const PAUSE_MS = 700;
/** He keeps looking at the visitor's message this long, then faces you again to think. */
const LOOK_MS = 1000;
const clamp = (x, a) => Math.max(-a, Math.min(a, x));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;
export function createChatVron({ el, reduce }) {
    const hero = el.querySelector('[data-chat-hero]');
    const wrap = el.querySelector('[data-chat-vron]');
    const msgs = el.querySelector('[data-chat-msgs]');
    const log = el.querySelector('[data-chat-log]');
    const input = el.querySelector('[data-chat-input]');
    let vron = null;
    let gen = 0;
    let open = false;
    let state = 'idle';
    let mood = 'idle';
    let talking = false;
    let backTimer = 0;
    let lookTimer = 0;
    let pauseTimer = 0;
    let killTimer = 0;
    let flight = null;
    let marked = null;
    /** Where he stands: the hero's stage, or the gutter (.av) of the typing dots or of his newest reply. */
    let at = hero;
    const u = () => el.offsetWidth / 360; // one app point in CSS px
    const big = () => at === hero;
    const frame = () => (big() ? HERO : SMALL);
    /** Puts him over his spot (in the conversation's scrolling coordinates). Skipped while the sheet is hidden. */
    function place() {
        const m = msgs.getBoundingClientRect();
        const r = at.getBoundingClientRect();
        if (!m.width || (!r.width && !r.height))
            return;
        const k = u();
        const x = r.left - m.left + msgs.scrollLeft + (big() ? HERO_AT.x * k : r.width / 2);
        const y = r.top - m.top + msgs.scrollTop + (big() ? HERO_AT.y * k : r.height - FEET * k);
        wrap.style.left = `${x.toFixed(2)}px`;
        wrap.style.top = `${y.toFixed(2)}px`;
    }
    // The conversation grows, the phone resizes, the sheet shows: he stays on his spot.
    if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => place());
        ro.observe(msgs);
        ro.observe(log);
    }
    function show(s, m) {
        state = s;
        mood = m;
        wrap.dataset.state = s;
        wrap.dataset.mood = m;
        if (vron)
            wrap.dataset.mode = vron.mode; // 3D can hand over to the sprites on a slow device
        vron?.setMood(m);
    }
    show('idle', 'idle');
    async function mount() {
        const my = ++gen;
        const { mountVron } = await import('./live.js');
        if (my !== gen || !open)
            return;
        const canvas = document.createElement('canvas');
        wrap.replaceChildren(canvas);
        place();
        const v = await mountVron(canvas, {
            size: frame() * u(),
            shadow: true,
            // Big, he's there to play with: drag to spin him, tap to poke him (small, his canvas lets clicks through).
            drag: true,
            onTap: () => { },
            fx: 1.4,
            // The light, poses-only sheet: sharp big, and scaled down from it beside a reply.
            res: 384,
        });
        if (my !== gen || !open)
            return v.destroy();
        vron = v;
        wrap.dataset.mode = v.mode;
        v.setMood(mood);
        if (talking)
            v.talk(true);
        wrap.classList.add('on');
        // A wave when there's nothing to talk about yet.
        if (!log.childElementCount && state === 'idle')
            window.setTimeout(() => state === 'idle' && react('happy', 1100), reduce ? 0 : 200);
    }
    function unmount() {
        gen++;
        flight?.finish();
        vron?.destroy();
        vron = null;
        wrap.classList.remove('on');
        wrap.replaceChildren();
    }
    // ---------- moods ----------
    /** A reaction: `m`, held `ms`, then he settles (back to idle, or listening if the visitor is typing). */
    function react(m, ms) {
        window.clearTimeout(backTimer);
        show('reacting', m);
        backTimer = window.setTimeout(settle, ms);
    }
    function settle() {
        window.clearTimeout(backTimer);
        if (input.value.trim() && activeEl() === input)
            listen();
        else
            show('idle', 'idle');
    }
    /** He turns toward `target` (at most `max` of a full turn); `ms` > 0 turns him back after that long. */
    function lookAt(target, max, ms) {
        window.clearTimeout(lookTimer);
        if (!vron)
            return;
        // The sprites' baked turns start from the idle face: from any other pose he just keeps it.
        if (vron.mode === 'sprite' && mood !== 'idle')
            return;
        const r = target.getBoundingClientRect();
        const me = wrap.getBoundingClientRect();
        vron.look(clamp((r.left + r.width / 2 - me.left) / (el.offsetWidth * 0.35), max));
        if (ms)
            lookTimer = window.setTimeout(() => vron?.look(0), ms);
    }
    function faceFront() {
        window.clearTimeout(lookTimer);
        vron?.look(0);
    }
    /** Eyes down on the field and (in 3D) turned toward it, until the visitor sends or stops. */
    function listen() {
        if (state === 'listening')
            return;
        window.clearTimeout(backTimer);
        show('listening', 'listening');
        lookAt(input, 0.45, 0);
    }
    // ---------- moves (FLIP: note where he is, move him in the DOM, animate from there) ----------
    function spot() {
        const r = wrap.getBoundingClientRect(); // a 0 x 0 box at his centre (moved by any flight under way)
        const t = getComputedStyle(wrap).transform;
        const k = t && t !== 'none' ? new DOMMatrixReadOnly(t).a : 1;
        return { x: r.left, y: r.top, f: frame() * k };
    }
    function fly(a, how) {
        flight?.cancel();
        flight = null;
        const b = wrap.getBoundingClientRect();
        const f = frame();
        const k0 = a.f / f;
        const dx = a.x - b.left;
        const dy = a.y - b.top;
        const settled = () => vron?.resize(frame() * u());
        if (reduce || !open || (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(k0 - 1) < 0.01))
            return settled();
        const lift = (how === 'shrink' ? SHRINK_LIFT : how === 'hop' ? HOP_LIFT : 0) * u();
        const ease = how === 'glide' ? easeOut : easeInOut;
        // Sampled along an arc (straight keyframes between samples): it rises a little and lands where he belongs.
        const frames = [];
        for (let i = 0, n = 18; i <= n; i++) {
            const p = i / n;
            const e = ease(p);
            const s = k0 + (1 - k0) * (how === 'shrink' ? easeOut(p) : e);
            frames.push({ transform: `translate(${(dx * (1 - e)).toFixed(2)}px, ${(dy * (1 - e) - lift * 4 * p * (1 - p)).toFixed(2)}px) scale(${s.toFixed(4)})` });
        }
        flight = wrap.animate(frames, { duration: how === 'shrink' ? SHRINK_MS : how === 'hop' ? HOP_MS : GLIDE_MS, easing: 'linear' });
        // Takeoff and landing: a little squash as he lands.
        if (how !== 'glide')
            window.setTimeout(() => open && vron?.poke(), (how === 'shrink' ? SHRINK_MS : HOP_MS) - 60);
        flight.finished.then(settled, () => { });
    }
    /** To `slot` (the gutter of a reply or of the typing dots), from where he was marked (or stands). `then` runs before
     *  his new place is measured (e.g. the row he leaves goes). */
    function moveTo(slot, glide = false, then) {
        const a = marked ?? spot();
        marked = null;
        const wasBig = big();
        const same = at === slot;
        at.classList.remove('here');
        at = slot;
        slot.classList.add('here');
        wrap.classList.toggle('hero', slot === hero);
        then?.();
        place();
        fly(a, same || glide ? 'glide' : wasBig ? 'shrink' : 'hop');
    }
    // A tap on his gutter pokes him (the small canvas itself lets clicks through to the conversation).
    log.addEventListener('click', (e) => {
        const slot = e.target.closest?.('.av');
        if (slot && slot === at)
            vron?.poke();
    });
    return {
        get state() {
            return state;
        },
        opened() {
            open = true;
            window.clearTimeout(killTimer);
            place();
            if (vron) {
                vron.setMood(mood);
                if (!log.childElementCount)
                    react('happy', 1100);
                return;
            }
            window.setTimeout(() => open && !vron && void mount(), reduce ? 0 : SHEET_MS);
        },
        /** The sheet closed: once it's out of sight his view goes (WebGL contexts are few). */
        closed() {
            open = false;
            window.clearTimeout(backTimer);
            window.clearTimeout(pauseTimer);
            talking = false;
            vron?.talk(false);
            faceFront();
            if (state !== 'thinking' && state !== 'talking')
                show('idle', 'idle');
            window.clearTimeout(killTimer);
            killTimer = window.setTimeout(() => !open && unmount(), reduce ? 0 : SHEET_MS + 80);
        },
        /** Note where he stands now: the next move (think / follow) animates from here. Call it before changing the DOM. */
        mark() {
            marked = spot();
        },
        /** The field changed (`text` is its value): listening while there's text, a nod when the visitor pauses. */
        typed(text) {
            if (state === 'thinking' || state === 'talking')
                return; // he's on it; typing waits its turn
            window.clearTimeout(pauseTimer);
            if (!text.trim()) {
                if (state === 'listening') {
                    faceFront();
                    show('idle', 'idle');
                }
                return;
            }
            listen();
            pauseTimer = window.setTimeout(() => state === 'listening' && vron?.nod(), PAUSE_MS);
        },
        /** The field lost focus: he stops listening (a beat later: tapping Send blurs it just before the message goes). */
        blurred() {
            window.clearTimeout(pauseTimer);
            window.setTimeout(() => {
                if (state !== 'listening' || activeEl() === input)
                    return;
                faceFront();
                show('idle', 'idle');
            }, 160);
        },
        /** The visitor sent `said`: he goes beside the typing dots in `slot` (from the hero he shrinks into place) and
         *  thinks, with a look at their message as it lands. */
        think(slot, said) {
            window.clearTimeout(backTimer);
            window.clearTimeout(pauseTimer);
            moveTo(slot);
            // In 3D he turns and thinks at once; the sprites glance first (from idle) and think after.
            lookAt(said, 0.7, LOOK_MS);
            show('thinking', 'thinking');
        },
        /** His row was replaced or grew (his reply in place of the dots, a proposal under it): he moves along. `then`
         *  runs once he's in `slot` (remove the row he left there, not before). */
        follow(slot, then) {
            moveTo(slot, true, then);
        },
        /** His reply is coming in (true) or in (false). */
        talk(on) {
            talking = on;
            if (on) {
                window.clearTimeout(backTimer);
                faceFront();
                show('talking', 'idle');
            }
            vron?.talk(on);
        },
        /** How it turned out: `m` for `ms`, then idle. */
        react(m, ms = 1600) {
            react(m, ms);
        },
        /** Apply: a hop, then happy. */
        applied() {
            vron?.hop();
            react('happy', 1400);
        },
        /** Dismiss (the demo's undo of a proposal): a shrug, then idle. */
        dismissed() {
            window.clearTimeout(backTimer);
            vron?.shrug();
            show('idle', 'idle');
        },
    };
}
