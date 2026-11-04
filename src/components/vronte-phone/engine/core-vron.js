// Ported from Siddharth's Vronte repo (apps/web/src/../../../packages/core/src/vron.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
// Vron, the Vronte mascot: the motion and effects a player draws on top of Vron's baked pose frames.
//
// The frames (apps/mobile/assets/vron, apps/web/public/vron; baked from design/vron/3d/vron.js) hold the face, the
// ears and the head turn of every mood. A player moves the whole frame (float, hops, squash, tilt) with the springs
// below and draws the effects (sparkles, tear, thought dots, Zzz, hearts, "!", confetti) from the shapes below, so the
// motion runs at the screen's frame rate and the frames stay small.
//
// Coordinates are world units with y up and the origin at the frame centre; a frame spans ±VRON_WORLD_HALF on both
// axes (vronToFrame converts to pixels). Angles are radians, counter-clockwise: on a y-down screen rotate by -roll.
// The functions are marked 'worklet' so Reanimated can run them on the UI thread; elsewhere the directive is inert.
export const VRON_MOODS = ['idle', 'happy', 'sad', 'thinking', 'surprised', 'sleepy', 'love', 'focused', 'listening', 'celebrate', 'curious'];
/** Half the width (and height) of a baked frame, in world units. */
export const VRON_WORLD_HALF = 1.25;
/** Squash and stretch pivot on Vron's feet (world y). */
export const VRON_FEET_Y = -1.15;
/** World point -> pixels inside a frame drawn `size` px wide (y down). */
export function vronToFrame(x, y, size) {
    'worklet';
    const k = size / (2 * VRON_WORLD_HALF);
    return [(x + VRON_WORLD_HALF) * k, (VRON_WORLD_HALF - y) * k];
}
// ---------- baked clips ----------
/**
 * The baked clips each mood uses (names in the frame manifest). `enter` runs from the idle pose into the mood; its
 * last frame is the mood's pose, and played backwards it is the way out (celebrate leaves through happy, whose pose
 * matches its end). `blink` starts and ends on the pose; `extras` are occasional idle moves (ear twitches, a wiggle).
 */
export const VRON_CLIPS = {
    idle: { enter: null, exit: null, blink: 'blink_idle', extras: ['twitch_l', 'twitch_r'] },
    happy: { enter: 'enter_happy', exit: 'enter_happy', blink: null, extras: [] },
    sad: { enter: 'enter_sad', exit: 'enter_sad', blink: 'blink_sad', extras: [] },
    thinking: { enter: 'enter_thinking', exit: 'enter_thinking', blink: 'blink_thinking', extras: ['wiggle_thinking'] },
    surprised: { enter: 'enter_surprised', exit: 'enter_surprised', blink: 'blink_surprised', extras: [] },
    sleepy: { enter: 'enter_sleepy', exit: 'enter_sleepy', blink: null, extras: [] },
    love: { enter: 'enter_love', exit: 'enter_love', blink: null, extras: [] },
    focused: { enter: 'enter_focused', exit: 'enter_focused', blink: 'blink_focused', extras: [] },
    listening: { enter: 'enter_listening', exit: 'enter_listening', blink: 'blink_listening', extras: [] },
    celebrate: { enter: 'enter_celebrate', exit: 'enter_happy', blink: null, extras: [] },
    curious: { enter: 'enter_curious', exit: 'enter_curious', blink: 'blink_curious', extras: [] },
};
/**
 * Turning toward something on screen (a finished card, the chat): baked clips from facing front to a three-quarter
 * view. Play forward to turn, backwards to face the viewer again. Live 3D players turn with `look(-1..1)` instead.
 */
export const VRON_LOOKS = { left: 'look_left', right: 'look_right' };
export const VRON_REST = { y: 0, sx: 1, sy: 1, roll: 0 };
/** Where each mood wants the body `t` seconds after it started. The springs chase this. */
export function vronTarget(mood, t) {
    'worklet';
    const PI = Math.PI;
    switch (mood) {
        case 'happy': {
            const p = (t % 0.62) / 0.62;
            const h = 4 * p * (1 - p);
            const land = Math.exp(-((Math.min(p, 1 - p) / 0.09) ** 2));
            return { y: 0.03 + h * 0.17, sx: 1 - 0.03 * h + 0.07 * land, sy: 1 + 0.06 * h - 0.11 * land, roll: 0.06 * Math.sin((t * PI) / 0.62) };
        }
        case 'sad':
            return { y: -0.06 + 0.01 * Math.sin(t * 1.6), sx: 1.04, sy: 0.94, roll: 0.025 * Math.sin(t * 1.1) };
        case 'thinking':
            return { y: 0.02 * Math.sin(t * 1.4), sx: 1, sy: 1, roll: 0.12 };
        case 'surprised': {
            const jump = t < 0.5 ? Math.sin((t / 0.5) * PI) : 0;
            return {
                y: 0.2 * jump,
                sx: 1 - 0.04 * jump,
                sy: 1 + 0.1 * jump - (t > 0.45 && t < 0.7 ? 0.07 : 0),
                roll: t > 0.5 ? 0.012 * Math.sin(t * 40) * Math.exp(-(t - 0.5) * 3) : 0,
            };
        }
        case 'sleepy': {
            const w = (t * PI * 2) / 4;
            return { y: -0.04 + 0.015 * Math.sin(w), sx: 1 - 0.01 * Math.sin(w), sy: 1 + 0.025 * Math.sin(w), roll: 0.1 };
        }
        case 'celebrate': {
            const q = (((t - 1) % 0.62) + 0.62) % 0.62 / 0.62;
            const hop = t < 1 ? Math.sin(t * PI) : 4 * q * (1 - q) * 0.6;
            return { y: 0.15 * hop, sx: 1 - 0.025 * hop, sy: 1 + 0.05 * hop, roll: 0 };
        }
        case 'love':
            return { y: 0.03 * Math.sin(t * 2.2), sx: 1 + 0.022 * Math.sin(t * 4.4), sy: 1 - 0.022 * Math.sin(t * 4.4), roll: 0.08 * Math.sin(t * 1.6) };
        case 'focused':
            return { y: 0.012 * Math.sin(t * 2), sx: 1, sy: 1, roll: 0.006 * Math.sin(t * 9) };
        case 'curious':
            return { y: 0.02 * Math.sin(t * 1.8), sx: 1, sy: 1, roll: 0.16 };
        case 'listening':
            return { y: 0.02 * Math.sin(t * 2.2), sx: 1, sy: 1, roll: 0 };
        default: {
            const w = (t * PI * 2) / 3.2;
            return { y: 0.035 * Math.sin(w), sx: 1, sy: 1 + 0.01 * Math.sin(w + 1), roll: 0.02 * Math.sin(w / 2) };
        }
    }
}
export const VRON_SPRING_REST = { ...VRON_REST, vy: 0, vsx: 0, vsy: 0, vroll: 0 };
// Stiffness per channel and damping ratio, as in the 3D model.
const KY = 60;
const KS = 120;
const KR = 40;
const ZETA = 0.95;
/** Advances the springs by `dt` seconds toward `target` (sub-stepped, so any frame time is stable). */
export function vronStep(s, target, dt) {
    'worklet';
    const n = Math.max(1, Math.ceil(Math.min(dt, 0.1) * 120));
    const h = Math.min(dt, 0.1) / n;
    let { y, sx, sy, roll, vy, vsx, vsy, vroll } = s;
    const cy = 2 * Math.sqrt(KY) * ZETA;
    const cs = 2 * Math.sqrt(KS) * ZETA;
    const cr = 2 * Math.sqrt(KR) * ZETA;
    for (let i = 0; i < n; i++) {
        vy += ((target.y - y) * KY - vy * cy) * h;
        y += vy * h;
        vsx += ((target.sx - sx) * KS - vsx * cs) * h;
        sx += vsx * h;
        vsy += ((target.sy - sy) * KS - vsy * cs) * h;
        sy += vsy * h;
        vroll += ((target.roll - roll) * KR - vroll * cr) * h;
        roll += vroll * h;
    }
    return { y, sx, sy, roll, vy, vsx, vsy, vroll };
}
/** A tap: a quick squash and bounce on top of whatever the mood is doing. */
export function vronPoke(s) {
    'worklet';
    return { ...s, vsy: s.vsy - 2.4, vsx: s.vsx + 1.5, vy: s.vy + 0.7 };
}
// ---------- chat moves (impulses and the talking rhythm; the 3D model has the same, with real head turns) ----------
/** A small nod ("got it", e.g. when the user pauses typing). Flat frames can't pitch, so it's a dip and squash. */
export function vronNod(s) {
    'worklet';
    return { ...s, vy: s.vy - 0.9, vsy: s.vsy - 0.9, vsx: s.vsx + 0.4 };
}
/** A happy hop (a change applied). */
export function vronHop(s) {
    'worklet';
    return { ...s, vy: s.vy + 1.7, vsy: s.vsy + 0.9, vsx: s.vsx - 0.45 };
}
/** A little shrug (Undo): a lift and a wobble. */
export function vronShrug(s) {
    'worklet';
    return { ...s, vy: s.vy + 0.45, vroll: s.vroll + 0.7 };
}
/** Speech-like rhythm, 0..1: ~4.5 beats a second, uneven strength, short gaps between "phrases". */
export function vronTalkPulse(t) {
    'worklet';
    const beat = Math.max(0, Math.sin(t * Math.PI * 2 * 4.5)) ** 2;
    const phrase = 0.55 + 0.45 * Math.sin(t * 1.9) * Math.sin(t * 0.7 + 1);
    const gap = Math.sin(t * 1.3) > -0.8 ? 1 : 0.15;
    return beat * Math.max(0.2, phrase) * gap;
}
/** While his reply comes in: add this to the mood's target (a soft bounce in the rhythm of speech). */
export function vronTalk(target, t) {
    'worklet';
    const p = vronTalkPulse(t);
    return { y: target.y + 0.03 * p, sx: target.sx - 0.025 * p, sy: target.sy + 0.045 * p, roll: target.roll };
}
/** Shape outlines in world units at scale 1, SVG path syntax with y down, centred on the effect's position. */
export const VRON_FX_PATHS = (() => {
    const f = (n) => +n.toFixed(4);
    const poly = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(-y)}`).join('L')}Z`;
    const r = 0.1;
    const k = 0.22 * r;
    const sparkle = `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
    const h = 0.17;
    const w = h * 0.85;
    const t = h * 0.2;
    const z = poly([
        [-w / 2, h / 2], [w / 2, h / 2], [w / 2, h / 2 - t], [-w / 2 + t * 1.6, -h / 2 + t], [w / 2, -h / 2 + t],
        [w / 2, -h / 2], [-w / 2, -h / 2], [-w / 2, -h / 2 + t], [w / 2 - t * 1.6, h / 2 - t], [-w / 2, h / 2 - t],
    ]);
    const hr = 0.08;
    const heart = `M0 ${f(hr)}C${f(-hr * 1.6)} ${f(hr * 0.1)} ${f(-hr * 1.1)} ${f(-hr * 1.2)} 0 ${f(-hr * 0.45)}C${f(hr * 1.1)} ${f(-hr * 1.2)} ${f(hr * 1.6)} ${f(hr * 0.1)} 0 ${f(hr)}Z`;
    const tr = 0.05;
    const tear = `M0 ${f(-tr * 2.3)}C${f(tr * 0.4)} ${f(-tr * 1.4)} ${tr} ${f(-tr * 0.6)} ${tr} 0A${tr} ${tr} 0 0 1 ${-tr} 0C${-tr} ${f(-tr * 0.6)} ${f(-tr * 0.4)} ${f(-tr * 1.4)} 0 ${f(-tr * 2.3)}Z`;
    const bh = 0.3;
    const bw = bh * 0.2;
    const dotR = bw * 0.55;
    const bang = `${poly([[-bw / 2, bh / 2], [bw / 2, bh / 2], [bw * 0.32, -bh * 0.12], [-bw * 0.32, -bh * 0.12]])}M${f(dotR)} ${f(bh * 0.36)}A${f(dotR)} ${f(dotR)} 0 1 1 ${f(-dotR)} ${f(bh * 0.36)}A${f(dotR)} ${f(dotR)} 0 1 1 ${f(dotR)} ${f(bh * 0.36)}Z`;
    // "?": the stroked hook and stem from the 3D model (qmarkOutline in vron.js, height 0.46) plus its dot.
    const qh = 0.46;
    const qr = qh * 0.2;
    const qw = qh * 0.075;
    const qcy = qh * 0.28;
    const centre = [];
    for (let i = 0; i <= 14; i++) {
        const a = Math.PI * 0.95 - (i / 14) * Math.PI * 1.45;
        centre.push([Math.cos(a) * qr, qcy + Math.sin(a) * qr]);
    }
    const qe = centre[centre.length - 1];
    centre.push([qe[0] * 0.35, qe[1] - qh * 0.07], [0, -qh * 0.1]);
    const sideA = [];
    const sideB = [];
    centre.forEach((p, i) => {
        const q = centre[Math.min(i + 1, centre.length - 1)];
        const o = centre[Math.max(i - 1, 0)];
        const dx = q[0] - o[0];
        const dy = q[1] - o[1];
        const l = Math.hypot(dx, dy) || 1;
        sideA.push([p[0] - (dy / l) * qw, p[1] + (dx / l) * qw]);
        sideB.push([p[0] + (dy / l) * qw, p[1] - (dx / l) * qw]);
    });
    const qd = qw * 1.25;
    const qdy = -qh * 0.36;
    const qmark = `${poly([...sideA, ...sideB.reverse()])}M${f(qd)} ${f(-qdy)}A${f(qd)} ${f(qd)} 0 1 1 ${f(-qd)} ${f(-qdy)}A${f(qd)} ${f(qd)} 0 1 1 ${f(qd)} ${f(-qdy)}Z`;
    return {
        dot: 'M1 0A1 1 0 1 1 -1 0A1 1 0 1 1 1 0Z',
        qmark,
        z,
        sparkle,
        heart,
        tear,
        bang,
        confetti: 'M-0.03 -0.015L0.03 -0.015L0.03 0.015L-0.03 0.015Z',
    };
})();
export const VRON_FX_COLORS = {
    dot: '#5B35E8',
    z: '#5B35E8',
    sparkle: '#FFC83D',
    heart: '#FF5C93',
    tear: '#8FD0FF',
    bang: '#FFB020',
    qmark: '#5B35E8',
    confetti: ['#FFC83D', '#C6DD8C', '#FF8F6B', '#7CC8F8', '#F5A8D4', '#FFFFFF'],
};
const DOT_R = [0.045, 0.065, 0.09];
// The sad pose's tear runs down from under the right eye (body coordinates, baked pose).
const TEAR = [
    [0.1614, -0.7831],
    [0.1922, -0.9146],
    [0.2229, -1.0358],
];
// Confetti launch values, fixed so every celebration looks the same: [vx, vy, spin] per piece.
const CONFETTI = (() => {
    let a = 7;
    const rnd = () => {
        a = (a * 16807) % 2147483647;
        return (a - 1) / 2147483646;
    };
    return Array.from({ length: 24 }, () => {
        const ang = rnd() * Math.PI * 2;
        const sp = 1.4 + rnd() * 1.4;
        return [Math.cos(ang) * sp * 0.55, 1.9 + rnd() * 1.5, (rnd() - 0.5) * 14];
    });
})();
/**
 * The effects to draw `t` seconds into `mood`, with the body lifted by `bodyY` (the spring's y).
 * Thinking: three thought dots. Sleepy: rising Zzz. Happy and celebrate: sparkles (and confetti for celebrate).
 * Love: floating hearts. Sad: a tear. Surprised: a "!" for two seconds. Curious: a "?".
 */
export function vronFx(mood, t, bodyY) {
    'worklet';
    const out = [];
    const PI = Math.PI;
    const top = bodyY + 1.12;
    const fx = (kind, i, x, y, scale, rot, opacity, color, onBody = false, flip = 1) => ({
        kind,
        i,
        x,
        y,
        scale,
        flip,
        rot,
        opacity,
        color,
        onBody,
    });
    if (mood === 'thinking') {
        for (let i = 0; i < 3; i++) {
            const start = 0.25 + i * 0.3;
            if (t <= start)
                continue;
            const s = Math.min(1, (t - start) / 0.25);
            out.push(fx('dot', i, 0.86 + i * 0.17, top - 0.02 + i * 0.16 + 0.025 * Math.sin(t * 3 + i), DOT_R[i] * s, 0, 1, VRON_FX_COLORS.dot));
        }
    }
    if (mood === 'sleepy') {
        for (let i = 0; i < 3; i++) {
            const p = (t * 0.32 + i / 3) % 1;
            out.push(fx('z', i, 0.82 + p * 0.38 + 0.05 * Math.sin(p * 6), top - 0.15 + p * 0.55, 0.55 + p * 0.6, 0, Math.sin(p * PI), VRON_FX_COLORS.z));
        }
    }
    if (mood === 'happy' || mood === 'celebrate') {
        for (let i = 0; i < 5; i++) {
            const ph = (t * 1.1 + i * 0.37) % 1;
            const a = (i / 5) * PI * 2 + 0.6;
            out.push(fx('sparkle', i, Math.cos(a) * 1.3, bodyY + Math.sin(a) * 1.15, Math.sin(ph * PI) * 1.1, ph * 2, 1, VRON_FX_COLORS.sparkle));
        }
    }
    if (mood === 'love') {
        for (let i = 0; i < 4; i++) {
            const p = (t * 0.4 + i / 4) % 1;
            out.push(fx('heart', i, (i % 2 ? 1.2 : -1.22) + 0.06 * Math.sin(p * 9 + i), bodyY - 0.4 + p * 1.6, 0.6 + 0.5 * Math.sin(p * PI), 0, Math.sin(p * PI), VRON_FX_COLORS.heart));
        }
    }
    if (mood === 'sad') {
        const p = (t % 2.6) / 2.6;
        const s = Math.min(1, p / 0.9);
        const a = TEAR[0];
        const b = TEAR[1];
        const c = TEAR[2];
        const u = s < 0.5 ? s * 2 : (s - 0.5) * 2;
        const x = s < 0.5 ? a[0] + (b[0] - a[0]) * u : b[0] + (c[0] - b[0]) * u;
        const y = s < 0.5 ? a[1] + (b[1] - a[1]) * u : b[1] + (c[1] - b[1]) * u;
        out.push(fx('tear', 0, x, y, Math.min(1, p * 5), 0, p < 0.85 ? 1 : (1 - p) / 0.15, VRON_FX_COLORS.tear, true));
    }
    if (mood === 'surprised' && t < 2.2) {
        const k = Math.min(1, t / 0.18);
        out.push(fx('bang', 0, 1.0, top + 0.05 + 0.03 * Math.sin(t * 6), k * (1 + 0.15 * Math.exp(-t * 4)), -0.25, 1, VRON_FX_COLORS.bang));
    }
    if (mood === 'curious') {
        const k = Math.min(1, t / 0.25);
        out.push(fx('qmark', 0, 1.0, top + 0.05 + 0.04 * Math.sin(t * 2.4), k * (1 + 0.12 * Math.exp(-t * 4)), 0.18 + 0.08 * Math.sin(t * 1.7), 1, VRON_FX_COLORS.qmark));
    }
    if (mood === 'celebrate' && t < 2.6) {
        for (let i = 0; i < CONFETTI.length; i++) {
            const [vx, vy, spin] = CONFETTI[i];
            const x = (vx * (1 - Math.exp(-0.8 * t))) / 0.8;
            const y = 0.8 + vy * t - 2.1 * t * t;
            out.push(fx('confetti', i, x, y, 1, spin * t, Math.min(1, Math.max(0, 2.6 - t)), VRON_FX_COLORS.confetti[i % 6], false, Math.cos(spin * 0.7 * t)));
        }
    }
    return out;
}
