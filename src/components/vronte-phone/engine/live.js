// Ported from Siddharth's Vronte repo (apps/web/src/components/vron/live.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
// One Vron on a <canvas>. vronte.com runs him live in 3D (three.js) where WebGL 2 works; the portfolio always uses
// the baked sprite player (./player.js), which answers to the same calls, so the bundle carries no three.js.
export async function mountVron(canvas, o) {
    return mountSprite(canvas, o);
}
async function mountSprite(canvas, o) {
    const { VronPlayer } = await import('./player.js');
    const p = await VronPlayer.create(canvas, { size: o.size, fx: o.fx ?? 1.6, shadow: o.shadow, res: o.res });
    // Taps poke him; a sideways drag turns his head that way (the baked look clips) until he's let go.
    const off = [];
    if (o.onTap || o.drag) {
        let down = null;
        const on = (type, fn) => {
            canvas.addEventListener(type, fn);
            off.push(() => canvas.removeEventListener(type, fn));
        };
        on('pointerdown', (e) => {
            down = { x: e.clientX, y: e.clientY, moved: 0 };
            canvas.setPointerCapture?.(e.pointerId);
        });
        on('pointermove', (e) => {
            if (!down)
                return;
            const dx = e.clientX - down.x;
            down.moved = Math.max(down.moved, Math.abs(dx) + Math.abs(e.clientY - down.y));
            if (o.drag && Math.abs(dx) > 8)
                p.look(Math.sign(dx));
        });
        const up = () => {
            if (!down)
                return;
            if (down.moved < 6) {
                p.poke();
                o.onTap?.();
            }
            else if (o.drag)
                p.look(0);
            down = null;
        };
        on('pointerup', up);
        on('pointercancel', up);
        if (o.drag)
            canvas.style.touchAction = 'none';
    }
    return {
        mode: 'sprite',
        setMood: (m) => p.setMood(m),
        react: (m, ms) => p.react(m, ms),
        calm: () => p.calm(),
        poke: () => p.poke(),
        nod: () => p.nod(),
        hop: () => p.hop(),
        shrug: () => p.shrug(),
        talk: (on) => p.talk(on),
        look: (x) => p.look(x),
        // The sprite stage is drawn at its first size; CSS scales it from there.
        resize: () => { },
        destroy: () => {
            off.forEach((f) => f());
            p.destroy();
        },
    };
}
