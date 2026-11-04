// Ported from Siddharth's Vronte repo (apps/web/src/components/vron/player.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
// Plays Vron on a <canvas>: baked pose frames from public/vron (face, ears, head turn), moved by the springs in
// packages/core/src/vron.ts (float, hops, squash, tilt) and topped with its vector effects. No libraries. This is
// the fallback for browsers without WebGL 2 (live 3D: @vronte/vron3d, mounted by ./live.ts) and the player for the
// small Vrons that never go 3D.
//
//   const vron = await VronPlayer.create(canvas, { size: 64, shadow: true });
//   vron.setMood('thinking'); vron.react('happy', 1600); vron.poke(); vron.look(-1); vron.look(0);
//   vron.nod(); vron.hop(); vron.shrug(); vron.talk(true); vron.talk(false);   // the chat's moves
//
// The canvas is a "stage" larger than the frame (STAGE x the frame) so hops and effects have room; centre it on the
// spot Vron should sit. Reduced motion shows each mood's still pose (no nods, hops, shrugs or talking bounce).
import { VRON_CLIPS, VRON_FEET_Y, VRON_FX_PATHS, VRON_LOOKS, VRON_SPRING_REST, VRON_WORLD_HALF, vronFx, vronHop, vronNod, vronPoke, vronShrug, vronStep, vronTalk, vronTarget, } from './core-vron.js';
/** The stage is this many frames wide, so hops, sparkles and the "!" fit around the body. */
export const STAGE = 1.5;
/** The contact shadow, as in the 3D model (@vronte/vron3d): a violet radial fade 2.4 x 0.5 world units, centred
 *  0.22 below his feet, that shrinks and fades as he lifts off. */
export const SHADOW = { y: VRON_FEET_Y - 0.22, rx: 1.2, ry: 0.25, rgb: '40, 10, 90' };
/** How long he keeps looking at something before a waiting mood change turns him back (seconds). The turn, the hold
 *  and the turn back take about a second in all (18-frame clips at 1.5x and 1.8x). */
const LOOK_HOLD = 0.25;
const paths = Object.fromEntries(Object.entries(VRON_FX_PATHS).map(([k, d]) => [k, new Path2D(d)]));
const cache = new Map();
function load(base, res) {
    const key = `${base}/${res}`;
    if (!cache.has(key)) {
        cache.set(key, (async () => {
            const man = (await (await fetch(`${base}/vron-${res}.json`)).json());
            const img = new Image();
            img.decoding = 'async';
            img.src = `${base}/${man.sheet}`;
            await img.decode();
            return { img, man };
        })());
    }
    return cache.get(key);
}
export class VronPlayer {
    canvas;
    img;
    man;
    size;
    fxScale;
    shadow;
    ctx;
    spring = VRON_SPRING_REST;
    /** The mood the body and effects follow, and how long it has been on. */
    mood = 'idle';
    t = 0;
    /** The mood to return to after a reaction. */
    base = 'idle';
    play = null;
    acc = 0;
    nextBlink = 2.5;
    nextExtra = 6;
    holdTimer;
    raf = 0;
    last = 0;
    visible = true;
    io = null;
    reduced;
    shown = -1;
    prev = -1;
    fade = 1;
    /** The way he faces (a held look pose), the way he's been asked to face, and how long he still holds it. */
    looking = 0;
    lookWant = 0;
    lookHold = 0;
    /** A mood change that waits for a look to finish (he glances, turns back, then acts it out). */
    pending = null;
    shade = null;
    dead = false;
    /** Talking (his reply coming in): a soft bounce in the rhythm of speech on top of the mood, and its clock. */
    talking = false;
    talkT = 0;
    constructor(canvas, img, man, size, fxScale, shadow) {
        this.canvas = canvas;
        this.img = img;
        this.man = man;
        this.size = size;
        this.fxScale = fxScale;
        this.shadow = shadow;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const px = Math.round(size * STAGE);
        canvas.width = Math.round(px * dpr);
        canvas.height = Math.round(px * dpr);
        canvas.style.width = `${px}px`;
        canvas.style.height = `${px}px`;
        this.ctx = canvas.getContext('2d');
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (shadow) {
            const g = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            g.addColorStop(0, `rgba(${SHADOW.rgb}, 0.5)`);
            g.addColorStop(0.55, `rgba(${SHADOW.rgb}, 0.2)`);
            g.addColorStop(1, `rgba(${SHADOW.rgb}, 0)`);
            this.shade = g;
        }
        // The latest entry counts: moving the canvas in the DOM can deliver "out" and "in" together.
        this.io = new IntersectionObserver((es) => {
            this.visible = !!es[es.length - 1]?.isIntersecting;
            if (this.visible)
                this.start();
        });
        this.io.observe(canvas);
    }
    /**
     * `size` is the frame's CSS width (Vron's body fills about 80 % of it). Frames come from `/vron`: the 384 sheet once
     * the frame is over 200 device pixels, where the small one would blur (`res` picks one: 384 holds poses only and
     * crossfades between them, a light download for small Vrons that don't need every in-between). `fx` scales the
     * effects (bigger reads better on small buttons); `shadow` draws a soft contact shadow under his feet.
     */
    static async create(canvas, { size = 64, base = import.meta.env.BASE_URL + 'assets/vronte', fx = 1, shadow = false, res } = {}) {
        const r = res ?? (size * Math.min(window.devicePixelRatio || 1, 3) > 200 ? 384 : 192);
        const { img, man } = await load(base, r);
        const p = new VronPlayer(canvas, img, man, size, fx, shadow);
        p.start();
        return p;
    }
    get current() {
        return this.mood;
    }
    /** Switch moods: leave the current pose (played back, quickly), then enter the new one. */
    setMood(m) {
        window.clearTimeout(this.holdTimer);
        this.base = m;
        this.go(m);
    }
    /** A short reaction (e.g. happy for a done task), then back to the base mood. */
    react(m, ms = 1800) {
        window.clearTimeout(this.holdTimer);
        this.go(m, () => {
            this.holdTimer = window.setTimeout(() => this.go(this.base), ms);
        });
    }
    /** Straight back to the base mood (Undo). */
    calm() {
        window.clearTimeout(this.holdTimer);
        this.go(this.base);
    }
    poke() {
        if (!this.reduced)
            this.spring = vronPoke(this.spring);
        this.start();
    }
    /** A small nod ("got it", e.g. when the visitor pauses typing). */
    nod() {
        if (!this.reduced)
            this.spring = vronNod(this.spring);
        this.start();
    }
    /** A happy hop (a change applied). */
    hop() {
        if (!this.reduced)
            this.spring = vronHop(this.spring);
        this.start();
    }
    /** A little shrug (a change undone or dismissed). */
    shrug() {
        if (!this.reduced)
            this.spring = vronShrug(this.spring);
        this.start();
    }
    /** Talking on/off: a soft bounce in the rhythm of speech while his reply comes in. */
    talk(on) {
        const t = on && !this.reduced;
        if (t && !this.talking)
            this.talkT = 0;
        this.talking = t;
        this.start();
    }
    /**
     * Turn toward something on screen: -1 left, 1 right, 0 face the viewer again (the baked VRON_LOOKS clips, which
     * start from the idle face). From another mood the turn waits until he's idle again, and look(0) cancels it. A
     * mood change while he looks waits for the turn and a short hold, then he turns back and acts it out.
     */
    look(x) {
        const d = x < -0.15 ? -1 : x > 0.15 ? 1 : 0;
        // A reaction is waiting on this glance: it decides when he turns back, not another cue.
        if (this.pending && d)
            return;
        this.lookWant = d;
        if (this.reduced) {
            if (this.mood === 'idle' || !this.lookWant)
                this.looking = this.lookWant;
            this.redraw();
            return;
        }
        // A blink or an ear twitch gives way at once.
        if (this.play?.minor)
            this.play = null;
        this.start();
    }
    destroy() {
        this.dead = true;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.io?.disconnect();
        window.clearTimeout(this.holdTimer);
    }
    go(m, then) {
        if (this.reduced) {
            this.looking = this.lookWant = 0;
            this.pending = null;
        }
        else if (this.looking || this.pending || this.turning()) {
            // Looking at something (or turning to): finish the glance first.
            if (m === this.mood && !this.pending) {
                then?.();
                return;
            }
            this.pending = { m, then };
            this.lookWant = 0;
            this.start();
            return;
        }
        if (m === this.mood && !(this.play && !this.play.minor)) {
            then?.();
            return;
        }
        const from = this.mood;
        const enter = () => {
            this.mood = m;
            this.t = 0;
            const clip = VRON_CLIPS[m].enter;
            if (clip && !this.reduced)
                this.play = { frames: this.man.clips[clip] ?? [], i: 0, speed: 1, reverse: false, then };
            else {
                this.play = null;
                then?.();
            }
            this.start();
            this.redraw();
        };
        const exit = VRON_CLIPS[from].exit;
        if (exit && from !== 'idle' && !this.reduced) {
            this.mood = 'idle'; // the body relaxes while the face goes back to neutral
            this.t = 0;
            this.play = { frames: this.man.clips[exit] ?? [], i: 0, speed: 1.6, reverse: true, then: enter };
            this.start();
        }
        else
            enter();
    }
    /** A look clip is playing (turning toward something, or back). */
    turning() {
        const p = this.play;
        return !!p && !!p.frames.length && (p.frames === this.lookClip(-1) || p.frames === this.lookClip(1));
    }
    lookClip(d) {
        if (!d)
            return undefined;
        return this.man.clips[VRON_LOOKS[d < 0 ? 'left' : 'right']];
    }
    pose(m) {
        const look = this.lookClip(this.looking);
        if (look?.length)
            return look[look.length - 1];
        const clip = VRON_CLIPS[m].enter;
        // A mood a sheet doesn't hold yet (baked before it existed) shows the idle face; its motion and effects still play.
        const f = (clip && this.man.clips[clip]) || this.man.clips.idle;
        return f?.[f.length - 1] ?? 0;
    }
    /** Under reduced motion the loop sleeps between changes: draw the new still pose once. */
    redraw() {
        if (!this.reduced || this.raf || !this.visible || this.dead)
            return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.draw();
        });
    }
    start() {
        if (this.dead)
            return;
        if (this.reduced)
            return this.redraw();
        if (this.raf || !this.visible)
            return;
        this.last = performance.now();
        // `raf` stays set while a tick runs, so a clip ending inside update() (whose `then` may call start()) can't spin
        // up a second loop.
        const tick = (now) => {
            const dt = Math.min(0.1, (now - this.last) / 1000);
            this.last = now;
            this.update(dt);
            this.draw();
            this.raf = this.visible && !this.dead ? requestAnimationFrame(tick) : 0;
        };
        this.raf = requestAnimationFrame(tick);
    }
    update(dt) {
        this.t += dt;
        let target = vronTarget(this.mood, this.t);
        if (this.talking)
            target = vronTalk(target, (this.talkT += dt));
        this.spring = vronStep(this.spring, target, dt);
        if (this.play) {
            this.acc += dt * this.man.fps * this.play.speed;
            while (this.acc >= 1 && this.play) {
                this.acc -= 1;
                this.play.i++;
                if (this.play.i >= this.play.frames.length) {
                    const then = this.play.then;
                    this.play = null;
                    then?.();
                }
            }
            return;
        }
        this.acc = 0;
        if (this.lookStep(dt))
            return;
        const c = VRON_CLIPS[this.mood];
        this.nextBlink -= dt;
        this.nextExtra -= dt;
        if (this.nextBlink <= 0) {
            this.nextBlink = 2.5 + Math.random() * 3;
            if (c.blink)
                this.play = { frames: this.man.clips[c.blink] ?? [], i: 0, speed: 1, reverse: false, minor: true };
        }
        else if (this.nextExtra <= 0) {
            this.nextExtra = 4 + Math.random() * 5;
            const pick = c.extras[Math.floor(Math.random() * c.extras.length)];
            if (pick)
                this.play = { frames: this.man.clips[pick] ?? [], i: 0, speed: 1, reverse: false, minor: true };
        }
    }
    /** Turns toward (or back from) whatever he's asked to look at. True while a look holds the face. */
    lookStep(dt) {
        if (this.lookHold > 0)
            this.lookHold -= dt;
        if (this.looking !== this.lookWant && this.lookHold <= 0) {
            if (this.looking) {
                // Back to the viewer: the turn played backwards, a little quicker.
                const frames = this.lookClip(this.looking) ?? [];
                this.play = { frames, i: 0, speed: 1.8, reverse: true, then: () => (this.looking = 0) };
                return true;
            }
            if (this.mood === 'idle' && !this.pending) {
                const d = this.lookWant;
                this.play = { frames: this.lookClip(d) ?? [], i: 0, speed: 1.5, reverse: false, then: () => ((this.looking = d), (this.lookHold = LOOK_HOLD)) };
                return true;
            }
        }
        if (!this.looking && this.pending) {
            const { m, then } = this.pending;
            this.pending = null;
            this.go(m, then);
            return true;
        }
        return this.looking !== 0;
    }
    frame() {
        const p = this.play;
        if (!p || !p.frames.length)
            return this.pose(this.mood);
        const i = Math.min(p.i, p.frames.length - 1);
        return p.frames[p.reverse ? p.frames.length - 1 - i : i];
    }
    draw() {
        const { ctx, size, man, img } = this;
        const stage = size * STAGE;
        const ppu = size / (2 * VRON_WORLD_HALF);
        const s = this.reduced ? { ...VRON_SPRING_REST } : this.spring;
        ctx.clearRect(0, 0, stage, stage);
        ctx.save();
        ctx.translate(stage / 2, stage / 2);
        if (this.shade) {
            const h = Math.max(0, s.y);
            const k = 1 - h * 0.6;
            ctx.save();
            ctx.globalAlpha = Math.min(1, Math.max(0.3, 1 - h * 1.5));
            ctx.translate(0, -SHADOW.y * ppu);
            ctx.scale(SHADOW.rx * ppu * k, SHADOW.ry * ppu * k);
            ctx.fillStyle = this.shade;
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        const fx = this.reduced ? [] : vronFx(this.mood, this.t, s.y);
        // body: lift, tilt about the centre, squash about the feet
        ctx.save();
        ctx.translate(0, -s.y * ppu);
        ctx.rotate(-s.roll);
        const feet = -VRON_FEET_Y * ppu;
        ctx.translate(0, feet);
        ctx.scale(s.sx, s.sy);
        ctx.translate(0, -feet);
        const f = this.frame();
        if (f !== this.shown) {
            // Crossfade pose swaps on the large sheet (the loop stops under reduced motion, so swap there).
            this.prev = man.poses && !this.reduced ? this.shown : -1;
            this.shown = f;
            this.fade = 0;
        }
        this.fade = Math.min(1, this.fade + 1 / 7);
        const S = man.size;
        const blit = (i) => ctx.drawImage(img, (i % man.cols) * S, Math.floor(i / man.cols) * S, S, S, -size / 2, -size / 2, size, size);
        if (this.prev >= 0 && this.fade < 1) {
            // The old pose stays nearly solid underneath while the new one comes in on top: the body never turns
            // see-through mid-change (two complementary alphas would dip to ~75 % cover halfway).
            ctx.globalAlpha = 1 - this.fade ** 3;
            blit(this.prev);
            ctx.globalAlpha = Math.min(1, this.fade * 1.5);
            blit(f);
            ctx.globalAlpha = 1;
        }
        else
            blit(f);
        for (const e of fx)
            if (e.onBody)
                this.drawFx(e, ppu);
        ctx.restore();
        for (const e of fx)
            if (!e.onBody)
                this.drawFx(e, ppu);
        ctx.restore();
    }
    drawFx(e, ppu) {
        if (e.opacity <= 0.01 || e.scale <= 0.001)
            return;
        const { ctx } = this;
        ctx.save();
        ctx.globalAlpha = e.opacity;
        ctx.translate(e.x * ppu, -e.y * ppu);
        ctx.rotate(-e.rot);
        const k = e.scale * ppu * (e.kind === 'confetti' ? 1 : this.fxScale);
        ctx.scale(k, k * e.flip);
        ctx.fillStyle = e.color;
        ctx.fill(paths[e.kind]);
        ctx.restore();
    }
}
