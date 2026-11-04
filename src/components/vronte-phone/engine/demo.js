// Ported from Siddharth's Vronte repo (apps/web/src/lib/demo.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
import { activeEl } from './dom.js';
// Hero demo logic (markup + styles: src/components/DemoPhone.astro). Vanilla TS, no dependencies.
// - Today (briefs 23, 24): one ranked pile. The black "Do this first" hero (#1) is in front at the top; #2 tucks
//   behind it, #3 behind #2, #4 behind #3. Every card is one .slot ranked by --i; #1 carries .hero, so when the hero
//   leaves, #2 slides forward into its place and turns black (one CSS transition; instant under reduced motion), the
//   others move up one and the next task joins at the back. A meeting inside the hour of the demo clock (3:41 PM when
//   the page opens, a minute on for every minute it stays open) reads "In 34 min", counting down.
//   Swipe right = done (strike-through, slide out, the rest glide up, a new card arrives), swipe left = "What
//   happened?" sheet, on the hero and the stack alike. The source chip is Done and "?" is What happened.
// - Tap a card (or its ↗) = task detail, pushed like a native screen (src/components/demo/screens.ts); its Done / Not
//   mine go back to Today and the card leaves the same way a swipe does.
// - Alex = Settings → People & tiers, Connections. Refresh = sync: a new task drops into its ranked spot.
// - Vron, the AI button (src/components/demo/vron.ts), stands over every screen (Today, Calendar, Progress, a task,
//   Settings…), hidden only while a sheet covers him. He reacts to what happens (done, snoozed, not mine, sync…) with
//   a hop and a short line; tapping him opens a scripted chat (src/components/demo/chat.ts) that knows the screen: from
//   a task it offers that task's changes (goal, reminder, date, what to do) and Apply makes them on the open screen;
//   elsewhere its Apply changes the list. He can be dragged and has a will of his own: while the #1 card is urgent
//   (isUrgent) and Today shows, he guards it (syncGuard).
// - Calendar (week strip + timeline), Progress (goal rings + a chart), + (New task sheet).
// - Auto-plays until the visitor hovers, touches or focuses the phone; resumes after ~8 s idle.
//   prefers-reduced-motion: no autoplay and no motion. While Vron guards a card the tour first tries to drag him off
//   it (he won't go), then completes it; it never runs while the visitor has him in hand.
import { TASKS, DECK_START, DECK_SIZE, COLORS, SYNC_TASK, SOURCE_PILL, TIER_ONE, WEEK_ITEMS, isUrgent, TODAY_EVENTS, GOALS, DAY_NAMES, person, initials, avatarColors, minutes, reschedule, usePersona, PERSONA, reminderText, heroReason, whenText, tickDemoClock, clock, DEMO_NOW, } from './demo-data.js';
import { createScreens, PUSH_MS } from './screens.js';
import { createVronFab } from './vron.js';
import { createChat } from './chat.js';
const STOP = Symbol('stop');
const IDLE_MS = 8000;
/** Longer while a pushed screen is open: there is more to read. */
const IDLE_SCREEN_MS = 16000;
const WHAT_TOAST = {
    notmine: 'Not yours. Noted for next time.',
    later: 'Snoozed until tomorrow, 9 AM',
    notneeded: 'Removed from your list',
    lower: 'Moved down for today',
};
const WHAT_VRON = {
    notmine: ['surprised', 'Oh! Not yours'],
    later: ['sad', 'Later, then'],
    notneeded: ['sad', 'Off the list'],
    lower: ['sad', 'Down it goes'],
};
export function initDemo(root) {
    // The persona the page rendered (DemoPhone's data-persona): every list, name and tier below reads it.
    usePersona(root.dataset.persona);
    const $ = (sel, el = root) => el.querySelector(sel);
    const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));
    const app = $('[data-app]');
    const device = $('[data-device]');
    const deckEl = $('[data-deck]');
    const slotsEl = $('[data-slots]');
    const toastEl = $('[data-toast]');
    const toastText = $('[data-toast-text]');
    const undoBtn = $('[data-undo]');
    const scrim = $('[data-scrim]');
    const touch = $('[data-touch]');
    const live = $('[data-live]');
    const home = $('[data-home]');
    const whoBtn = $('[data-who]');
    const syncBtn = $('[data-sync]');
    const syncIc = $('[data-sync-ic]');
    const syncMeta = $('[data-sync-meta]');
    const syncDot = $('[data-sync-dot]');
    const tabInd = $('[data-tab-ind]');
    const tabs = $$('[data-tab]');
    const plusBtn = $('[data-plus]');
    const sheets = { what: $('[data-sheet="what"]'), new: $('[data-sheet="new"]'), chat: $('[data-sheet="chat"]') };
    const newForm = $('[data-new-form]');
    const newInput = $('[data-new-input]');
    const newAdd = $('[data-new-add]');
    const weekEl = $('[data-week]');
    const timelineEl = $('[data-timeline]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches)
        app.classList.add('can-hover');
    const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
    const tpl = (name) => $(`template[data-tpl="${name}"]`)?.innerHTML ?? '';
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    // ---------- state ----------
    let uid = 100;
    let deck = DECK_START.map((t) => ({ ...t }));
    let queue = TASKS.slice(DECK_START.length).map((t) => ({ ...t }));
    let open = 9;
    let doneToday = 3;
    let ga = 2; // goal a: Ship Q4 client deck, of 6
    let gb = 1; // goal b: Hire 2 designers, of 4
    let demoted = new Set(); // cards moved down for today (Lower priority): they stay at the bottom
    let pinned = new Set(); // cards moved to #1 from the chat: they stay on top
    let streak = 0; // tasks done toward today's top 3 (Vron: "Nice! 2 left", then "All clear!")
    let syncPending = true; // the refresh dot: a new task is waiting on the server
    let syncing = false;
    let detailId = null; // the deck task whose detail is open
    let leaving = false; // a task detail is animating out (Done / Not mine)
    let snap = null;
    /** Undo for a change Vron made on the open task (its goal, reminder or date); a list change clears it. */
    let focusUndo = null;
    let busy = false;
    let tab = 'today';
    let sheet = null;
    let whatId = null;
    let returnFocus = null;
    let auto = false;
    let userMode = false;
    let token = { stop: true };
    const els = new Map();
    $$('.slot', slotsEl).forEach((li) => els.set(li.dataset.id, li));
    const announce = (msg) => {
        if (!auto)
            live.textContent = msg;
    };
    /** Tells the page what the visitor did (src/lib/analytics.ts turns it into a GA4 event); the autoplay never counts. */
    const emit = (action) => {
        if (!auto)
            root.dispatchEvent(new CustomEvent('demo:action', { bubbles: true, detail: { action } }));
    };
    const screens = createScreens({
        app,
        home,
        reduce,
        auto: () => auto,
        locked: () => leaving,
        tpl,
        onDone: () => void detailDone(),
        onNotMine: () => void detailNotMine(),
        onSoon: (message) => toast(message, false),
        onChange: () => screenChanged(),
        onReminder: (t, on) => {
            emit('reminder');
            focusUndo = null;
            if (on)
                vron.react('focused', 'I’ll nudge you', 1000);
            announce(on ? `Reminder on: ${remLine(t)}.` : 'Reminder off.');
        },
    });
    const vronBtn = $('[data-vron-btn]');
    const vron = createVronFab({ fab: $('[data-vron]'), near: device, reduce, onDrag: () => emit('vron_drag') });
    const chat = createChat({
        el: sheets.chat,
        reduce,
        auto: () => auto,
        deck: () => deck,
        progress: () => ({ a: [ga, 6], b: [gb, 4] }),
        todayIdx: (new Date().getDay() + 6) % 7,
        reminder: (t) => screens.reminder(t),
        canApply: (op) => (isFocusOp(op) ? screens.top() === 'detail' && screens.current()?.id === op.id : deck.some((t) => t.id === op.id)),
        onApply: (op) => void applyChatOp(op),
    });
    const remLine = (t) => {
        const r = screens.reminder(t);
        return r ? reminderText(t, r).when : 'off';
    };
    // ---------- deck rendering ----------
    /**
     * Each task keeps its colour, but no colour repeats within 3 cards in a row; a card that would borrows, for that
     * spot only, the colour clear of its neighbours that was shown longest ago. Same rule as stackColors in @vronte/core.
     */
    function displayColors(list) {
        const out = [];
        list.forEach((t, i) => {
            const recent = out.slice(Math.max(0, i - 2), i);
            if (!recent.includes(t.color))
                return void out.push(t.color);
            const upcoming = list.slice(i + 1, i + 3).map((x) => x.color);
            const pick = COLORS.filter((c) => !recent.includes(c)).sort((a, b) => Number(upcoming.includes(a)) - Number(upcoming.includes(b)) || out.lastIndexOf(a) - out.lastIndexOf(b))[0];
            out.push(pick ?? t.color);
        });
        return out;
    }
    /** A new task's colour: the one today's open tasks use least, ties in palette order (pickTaskColor in @vronte/core). */
    function freshColor() {
        const count = (c) => [...deck, ...queue].filter((d) => d.color === c).length;
        return COLORS.reduce((best, c) => (count(c) < count(best) ? c : best), COLORS[0]);
    }
    function srcHtml(t) {
        return tpl(t.src);
    }
    /** The visible layout's Done / ↗ (the hero and the colored card each have their own). */
    const layoutOf = (el) => el.querySelector(el.classList.contains('hero') ? '.hf' : '.cf') ?? el;
    const doneBtn = (el) => (el ? layoutOf(el).querySelector('.act-done') : null);
    const openBtn = (el) => layoutOf(el).querySelector('[data-act="open"]');
    /** One card, with both layouts (the same markup DemoPhone.astro renders): the colored card's and the hero's. */
    function createSlot(t) {
        const li = document.createElement('li');
        li.className = 'slot';
        li.dataset.id = t.id;
        const title = esc(t.title);
        const logo = (size) => (t.src === 'manual' ? '' : srcHtml(t));
        li.innerHTML = `<div class="under" aria-hidden="true"><span class="u-done">${tpl('check-lg')}<b>Done</b></span><span class="u-what">${tpl('help-lg')}<b>What happened?</b></span></div>
      <div class="face"><div class="cf"><button class="src act-done" type="button" data-act="done" aria-label="Done: ${title}">${logo('lg')}<span class="chk">${tpl('check-chk')}</span></button>
      <span class="txt"><span class="t"><span class="t-text">${title}</span><i class="strike"></i></span><span class="m">${esc(t.meta)}</span></span>
      <span class="acts"><button class="act act-what" type="button" data-act="what" aria-label="What happened with ${title}?">${tpl('help')}</button>
      <button class="open" type="button" data-act="open" aria-label="Open ${title}">${tpl('open')}</button></span></div>
      <div class="hf"><span class="h-head"><button class="src sm act-done" type="button" data-act="done" aria-label="Done: ${title}">${logo('sm')}<span class="chk">${tpl('check-chk')}</span></button>
      <span class="h-label" data-h-label></span></span>
      <span class="h-t"><span class="h-text">${title}</span></span>
      <span class="h-why" data-h-why></span>
      <span class="h-foot"><span class="a-pill tc" data-h-src>${esc(SOURCE_PILL[t.src])}</span><span class="a-pill line" data-h-tag></span><span class="h-av" data-h-av></span>
      <button class="hbtn act-what" type="button" data-act="what" aria-label="What happened with ${title}?">${tpl('help')}</button>
      <button class="hbtn" type="button" data-act="open" aria-label="Open ${title}">${tpl('open')}</button></span></div></div>`;
        // Astro scopes component styles with a data attribute; copy it onto runtime-created nodes.
        const scope = Array.from(slotsEl.attributes).find((a) => a.name.startsWith('data-astro-cid'));
        if (scope)
            li.querySelectorAll('*').forEach((n) => n.setAttribute(scope.name, '')), li.setAttribute(scope.name, '');
        return li;
    }
    /** What a card shows for its rank: the hero's label, reason, pills and avatar (#1), its colour and meta. */
    function paintSlot(el, t, i, color) {
        el.style.setProperty('--i', String(i));
        el.classList.toggle('hero', i === 0);
        el.dataset.c = color;
        el.dataset.fg = color === 'violet' || color === 'blue' ? 'light' : 'dark';
        const set = (sel, text) => {
            const n = el.querySelector(sel);
            if (n && n.textContent !== text)
                n.textContent = text;
        };
        set('.m', whenText(t));
        set('[data-h-label]', `Do this first · ${whenText(t)}`);
        set('[data-h-why]', heroReason(t));
        set('[data-h-tag]', t.tag);
        // The hero's source pill wears the task's own colour (the card stays black): white text on violet and blue.
        const pill = el.querySelector('[data-h-src]');
        pill?.style.setProperty('--pc', `var(--${t.color})`);
        pill?.style.setProperty('--pf', `var(--${t.color === 'violet' || t.color === 'blue' ? 'white' : 'ink'})`);
        const p = person(t.from);
        const av = el.querySelector('[data-h-av]');
        if (av) {
            const c = avatarColors(p?.name ?? '');
            av.style.setProperty('--c', c.bg);
            av.style.setProperty('--f', c.fg);
            av.textContent = p ? initials(p.name) : 'AM';
        }
    }
    /** The demo clock moves on a minute for every minute the page stays open: the status bar and every "In N min" follow
     *  (a meeting inside the hour counts down on its card, the hero and its task screen). */
    function tick() {
        tickDemoClock();
        $('[data-clock]').textContent = clock(DEMO_NOW).replace(/ (AM|PM)$/, '');
        deck.forEach((t) => {
            const el = els.get(t.id);
            if (!el)
                return;
            const m = el.querySelector('.m');
            if (m)
                m.textContent = whenText(t);
            const label = el.querySelector('[data-h-label]');
            if (label)
                label.textContent = `Do this first · ${whenText(t)}`;
        });
        screens.tick();
    }
    window.setInterval(tick, 60_000);
    /** `dropIn`: a new card that drops into its spot from above, a beat after the others make room. */
    function render(glowIds = [], dropIn = null) {
        // The hero is black (its own colour shows on its pill); the stack's neighbours never share a colour.
        const colors = [deck[0]?.color ?? 'violet', ...displayColors(deck.slice(1))];
        deck.forEach((t, i) => {
            let el = els.get(t.id);
            if (!el) {
                el = createSlot(t);
                els.set(t.id, el);
                paintSlot(el, t, i, colors[i]);
                const cls = t.id === dropIn ? 'entering-top' : 'entering';
                el.classList.add(cls);
                slotsEl.appendChild(el);
                void el.offsetWidth;
                const node = el;
                if (cls === 'entering-top' && !reduce)
                    setTimeout(() => node.classList.remove(cls), 170);
                else
                    requestAnimationFrame(() => node.classList.remove(cls));
            }
            paintSlot(el, t, i, colors[i]);
            if (glowIds.includes(t.id)) {
                el.classList.remove('glow');
                void el.offsetWidth;
                el.classList.add('glow');
                const node = el;
                setTimeout(() => node.classList.remove('glow'), 950);
            }
        });
        $('[data-open]').textContent = String(open);
        // Keep DOM (= tab) order in rank order once the glide has finished.
        setTimeout(syncDomOrder, reduce ? 0 : 520);
        syncGuard();
    }
    /** What Vron guards: the #1 card while it's urgent and Today shows, with no screen over it (one source of truth:
     *  isUrgent). */
    function syncGuard() {
        const t = deck[0];
        const el = t && els.get(t.id);
        const who = t && person(t.from);
        const onToday = tab === 'today' && !screens.depth();
        vron.guard(onToday && t && el && who && isUrgent(t) ? { id: t.id, el, line: `${who.name.split(' ')[0]} needs this today`, at: perchAt } : null);
    }
    /** Where Vron perches on the hero (app points, his button's centre): inside its top-right corner, at the end of the
     *  label row (the label and the title keep room for him), well above where #2 tucks under the hero's bottom.
     *  Measured from the deck's own box, which never moves with the cards. */
    function perchAt() {
        const s = app.getBoundingClientRect();
        const r = slotsEl.getBoundingClientRect();
        const k = s.width / 360 || 1;
        return { x: (r.right - s.left) / k - 36, y: (r.top - s.top) / k + 30 };
    }
    /** What's on screen: Today, Calendar, Progress, or the pushed screen on top (on [data-app] for the page and tests). */
    const screenName = () => screens.top() ?? tab;
    let guardTimer = 0;
    /** A screen was pushed or popped: Vron follows (he stays, his label says what he'd help with) and leaves his guard
     *  while a screen covers Today; back on Today he returns to it once the slide is over. */
    function screenChanged() {
        const name = screenName();
        app.dataset.screen = name;
        const t = screens.top() === 'detail' ? screens.current() : null;
        vronBtn.setAttribute('aria-label', t ? `Ask Vron about “${t.title}”` : 'Ask Vron, the AI assistant');
        clearTimeout(guardTimer);
        if (screens.depth())
            syncGuard();
        else
            guardTimer = window.setTimeout(syncGuard, reduce ? 0 : PUSH_MS);
    }
    function syncDomOrder() {
        const active = activeEl();
        const keep = active && slotsEl.contains(active) ? active : null;
        let changed = false;
        deck.forEach((t, i) => {
            const el = els.get(t.id);
            if (el && slotsEl.children[i] !== el && !el.classList.contains('out')) {
                slotsEl.insertBefore(el, slotsEl.children[i] ?? null);
                changed = true;
            }
        });
        if (changed && keep)
            keep.focus({ preventScroll: true });
    }
    function removeEl(id, delay = 420) {
        const el = els.get(id);
        els.delete(id);
        if (el)
            setTimeout(() => el.remove(), reduce ? 0 : delay);
    }
    function recycle(t, front = false) {
        const copy = { ...t, id: `${t.id.split('-')[0]}-${uid++}` };
        if (copy.src === 'manual')
            return; // added tasks don't come back
        if (front)
            queue.unshift(copy);
        else
            queue.push(copy);
    }
    /** Where a card sits for newcomers: moved to #1 stays on top, moved down stays at the bottom, else its rank. */
    const placeKey = (d) => (pinned.has(d.id) ? -Infinity : demoted.has(d.id) ? Infinity : rankKey(d));
    /** The next task from Later joins the pile at the back (brief 24: Later is ranked below the pile), above any card
     *  moved down with "Lower priority", which stays at the bottom. */
    function arrive() {
        const next = queue.shift();
        if (!next)
            return null;
        const pos = deck.findIndex((d) => demoted.has(d.id));
        deck.splice(pos < 0 ? deck.length : pos, 0, next);
        return next.id;
    }
    function takeSnapshot() {
        focusUndo = null;
        snap = {
            deck: deck.map((t) => ({ ...t })),
            queue: queue.map((t) => ({ ...t })),
            open,
            doneToday,
            ga,
            gb,
            demoted: [...demoted],
            pinned: [...pinned],
            streak,
        };
    }
    /** A card's element, and the part that moves when it's swiped. */
    const cardEl = (id) => els.get(id) ?? null;
    function faceOf(id) {
        return els.get(id)?.querySelector('.face') ?? null;
    }
    // ---------- toast ----------
    let toastTimer = 0;
    function toast(text, undoable = true) {
        toastText.textContent = text;
        undoBtn.hidden = !undoable;
        toastEl.classList.add('show');
        toastEl.setAttribute('aria-hidden', 'false');
        undoBtn.tabIndex = 0;
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(hideToast, 3600);
    }
    function hideToast() {
        if (toastEl.contains(activeEl())) {
            toastTimer = window.setTimeout(hideToast, 1500);
            return;
        }
        toastEl.classList.remove('show');
        toastEl.setAttribute('aria-hidden', 'true');
        undoBtn.tabIndex = -1;
    }
    // ---------- actions ----------
    /** `fromDetail`: Done on the task's detail screen; the card is already checked off when Today slides back. */
    async function complete(id, fromDetail = false) {
        if (busy)
            return;
        const t = deck.find((x) => x.id === id);
        const el = els.get(id);
        if (!t || !el)
            return;
        busy = true;
        takeSnapshot();
        emit('done');
        const hadFocus = el.contains(activeEl());
        const rank = deck.indexOf(t);
        const face = faceOf(id);
        face.style.transform = '';
        el.classList.remove('dragging', 'armed');
        el.classList.add('done');
        vronDone();
        await wait(fromDetail ? 220 : 560); // strike draws (280ms), then hold so it reads as done
        el.classList.add('leave-r', 'out');
        await wait(160);
        deck = deck.filter((x) => x.id !== id);
        recycle(t);
        const nid = arrive();
        open = Math.max(3, open - 1);
        doneToday++;
        if (t.goal === 'a')
            ga = Math.min(6, ga + 1);
        if (t.goal === 'b')
            gb = Math.min(4, gb + 1);
        render(nid ? [nid] : []);
        removeEl(id);
        renderProgress(false);
        // Keyboard users keep their place: focus moves to the card that took this rank.
        if (hadFocus)
            setTimeout(() => doneBtn(els.get(deck[Math.min(rank, deck.length - 1)]?.id ?? ''))?.focus({ preventScroll: true }), reduce ? 0 : 480);
        toast(`Done: ${t.title}`);
        const arrived = deck.find((x) => x.id === nid);
        const first = rank === 0 && deck[0] ? ` Do this first: ${deck[0].title}.` : '';
        announce(`Marked ${t.title} done.${first}${arrived ? ` ${arrived.title} joined your list.` : ''}`);
        busy = false;
    }
    function openWhat(id, focusFirst) {
        if (busy || sheet)
            return;
        const t = deck.find((x) => x.id === id);
        const el = cardEl(id);
        if (!t || !el)
            return;
        whatId = id;
        el.classList.remove('dragging');
        el.classList.add('held', 'armed');
        el.dataset.dir = 'l';
        faceOf(id).style.transform = 'translateX(-36%) rotate(-1.5deg)';
        $('[data-what-task]').textContent = t.title;
        showSheet('what', focusFirst ? $('[data-opt]', sheets.what) : null);
        announce(`What happened with ${t.title}? Choose an option.`);
    }
    function releaseHeld(id) {
        if (!id)
            return;
        const el = cardEl(id);
        if (!el)
            return;
        faceOf(id).style.transform = '';
        el.classList.remove('armed');
        setTimeout(() => el.classList.remove('held'), reduce ? 0 : 420);
    }
    async function choose(kind) {
        const id = whatId;
        if (!id || busy || !deck.some((x) => x.id === id))
            return;
        whatId = null;
        hideSheet(false);
        await resolve(id, kind);
        restoreFocus();
    }
    /** "What happened?" answers (from the sheet, or Not mine on the detail screen). */
    async function resolve(id, kind) {
        const t = deck.find((x) => x.id === id);
        if (!t || busy)
            return;
        busy = true;
        takeSnapshot();
        emit(kind === 'notmine' ? 'not_mine' : kind);
        const rank = deck.indexOf(t);
        const el = els.get(id);
        const msgs = WHAT_TOAST;
        const [vm, say] = WHAT_VRON[kind] ?? ['idle', ''];
        vron.react(vm, say, vm === 'sad' ? 1300 : 1100);
        if (kind === 'lower') {
            releaseHeld(id);
            await wait(260);
            deck = deck.filter((x) => x.id !== id).concat(t);
            demoted.add(id);
            pinned.delete(id);
            render();
        }
        else {
            el.classList.remove('armed');
            if (kind === 'notneeded') {
                faceOf(id).style.transform = '';
                el.classList.add('out', 'out-fade');
            }
            else {
                el.classList.add('leave-l', 'out');
            }
            await wait(160);
            deck = deck.filter((x) => x.id !== id);
            if (kind === 'later' || kind === 'notmine')
                recycle(t);
            const nid = arrive();
            open = Math.max(3, open - 1);
            render(nid ? [nid] : []);
            removeEl(id);
            // Focus was on the card that left (Not mine from its detail screen): move to the card that took its rank.
            const a = activeEl();
            if (a instanceof HTMLElement && a.closest('.slot.out'))
                doneBtn(els.get(deck[Math.min(rank, deck.length - 1)]?.id ?? ''))?.focus({ preventScroll: true });
        }
        toast(msgs[kind] ?? 'Updated');
        announce(`${t.title}: ${msgs[kind].replace(/\.$/, '')}.`);
        busy = false;
    }
    // ---------- task detail ----------
    function openDetail(id) {
        if (busy || sheet || leaving || screens.depth())
            return;
        const i = deck.findIndex((x) => x.id === id);
        const el = els.get(id);
        if (i < 0 || !el || el.classList.contains('out') || el.classList.contains('done'))
            return;
        detailId = id;
        emit('card_open');
        screens.openDetail(deck[i], `#${i + 1}`, openBtn(el));
    }
    async function detailDone() {
        const id = detailId;
        if (!id || leaving || busy)
            return;
        leaving = true;
        screens.strike();
        await wait(620); // the strike draws across the title (280ms), then a beat so it reads as done
        els.get(id)?.classList.add('done');
        await screens.pop();
        await complete(id, true);
        detailId = null;
        leaving = false;
    }
    async function detailNotMine() {
        const id = detailId;
        if (!id || leaving || busy)
            return;
        leaving = true;
        screens.slideOut();
        await wait(260);
        await screens.pop();
        await resolve(id, 'notmine');
        detailId = null;
        leaving = false;
    }
    // ---------- Vron ----------
    /** A task done: "Nice! 2 left", "Nice! One to go", then the third of today's top 3 is a celebration. */
    function vronDone() {
        streak++;
        const left = 3 - streak;
        if (left > 0)
            vron.react('happy', left === 1 ? 'Nice! One to go' : `Nice! ${left} left`, 1000);
        else {
            streak = 0;
            vron.react('celebrate', 'All clear!', 1400);
        }
    }
    /** Vron's chat, from any screen: it knows what's on it (a task's screen focuses it on that task). */
    function openChat() {
        if (busy || sheet || leaving)
            return;
        const t = screens.top() === 'detail' ? screens.current() : null;
        const focus = t ? { screen: 'detail', task: t } : { screen: screenName() };
        vron.poke();
        chat.opened(focus);
        showSheet('chat', auto ? null : chat.firstFocus());
        announce(t ? `Chat with Vron about ${t.title}. Pick a suggestion.` : 'Chat with Vron. Pick a suggestion.');
    }
    const isFocusOp = (op) => op.kind === 'goal' || op.kind === 'remind' || op.kind === 'date';
    /** Apply in the chat: the sheet closes, then the change happens where you can see it: on the open task's screen,
     *  or on Today's list (any screen over it slides away first). */
    async function applyChatOp(op) {
        emit('chat_apply');
        if (sheet === 'chat')
            hideSheet(false);
        await pause(reduce ? 0 : 480);
        while (busy || drag)
            await pause(100);
        if (isFocusOp(op)) {
            applyToTask(op);
            restoreFocus();
            return;
        }
        if (screens.depth()) {
            screens.popAll();
            await pause(reduce ? 0 : PUSH_MS);
        }
        if (tab !== 'today') {
            setTab('today');
            await wait(300);
        }
        if (op.kind === 'notmine')
            await resolve(op.id, 'notmine');
        else
            await pinTop(op.id);
        restoreFocus();
    }
    /** The open task's card on Today, if it's in the deck. */
    const deckIndex = (t) => deck.indexOf(t);
    /** A change from the chat, on the open task's screen: its goal row fills, its reminder turns on with a time, or its
     *  date moves (and it re-ranks on Today underneath). Vron reacts; Undo puts it back. */
    function applyToTask(op) {
        const t = screens.current();
        if (!t || t.id !== op.id || screens.top() !== 'detail')
            return;
        snap = null;
        if (op.kind === 'goal') {
            const was = t.goal;
            screens.linkGoal(t, op.goal);
            vron.react('happy', 'Linked!', 1000);
            toast(`Linked to ${GOALS[op.goal]}`);
            announce(`${t.title} is linked to ${GOALS[op.goal]}.`);
            focusUndo = () => screens.linkGoal(t, was);
            return;
        }
        if (op.kind === 'remind') {
            const was = screens.reminder(t);
            screens.remind(t, { before: op.before });
            const when = reminderText(t, { before: op.before }).when;
            vron.react('focused', 'I’ll nudge you', 1000);
            toast(`Reminder: ${when}`);
            announce(`Reminder set for ${when}.`);
            focusUndo = () => screens.remind(t, was);
            return;
        }
        const was = { tag: t.tag, meta: t.meta, due: t.due, why: t.why, reason: t.reason };
        const order = deck.slice();
        const moveTo = (tag) => {
            reschedule(t, tag);
            rerank(t);
        };
        moveTo(op.tag);
        const day = op.tag === 'Tomorrow' ? 'tomorrow' : op.tag;
        vron.react('happy', `Moved to ${day}`, 1000);
        toast(`Moved to ${day}`);
        announce(`${t.title} moved to ${day}.`);
        focusUndo = () => {
            Object.assign(t, was);
            deck = order.filter((x) => deck.includes(x));
            rerank(t, false);
        };
    }
    /** After a date change: the task's card shows its new date, the deck re-sorts (who asked, then how soon), and the
     *  detail screen's rank and pills follow. */
    function rerank(t, sort = true) {
        const i = deckIndex(t);
        if (i >= 0) {
            if (sort && !pinned.has(t.id) && !demoted.has(t.id)) {
                deck = deck.filter((x) => x !== t);
                const pos = deck.findIndex((d) => placeKey(d) > rankKey(t));
                deck.splice(pos < 0 ? deck.length : pos, 0, t);
            }
            const m = els.get(t.id)?.querySelector('.m');
            if (m)
                m.textContent = t.meta;
            render();
        }
        const j = deckIndex(t);
        screens.redate(t, `#${j >= 0 ? j + 1 : deck.length + 1}`);
    }
    /** Move a card to #1 (from the chat). It stays on top until it's done or moved down. */
    async function pinTop(id) {
        const t = deck.find((x) => x.id === id);
        if (!t || busy)
            return;
        busy = true;
        takeSnapshot();
        pinned.add(id);
        demoted.delete(id);
        deck = [t, ...deck.filter((x) => x.id !== id)];
        render([id]);
        vron.react('focused', 'Top priority', 1000);
        toast('Moved to #1');
        announce(`${t.title} moved to #1.`);
        busy = false;
    }
    function openSettings() {
        if (busy || sheet || leaving || screens.depth())
            return;
        emit('settings');
        screens.push('settings', whoBtn);
    }
    // ---------- refresh (sync) ----------
    const setSyncText = (text) => {
        syncMeta.textContent = `Pro · ${text}`;
        screens.setSynced(text);
    };
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    /** Rank order: who asked (tier), then how soon it's due. */
    const dayOf = (tag) => {
        if (tag === 'Today')
            return 0;
        if (tag === 'Tomorrow')
            return 1;
        const d = dayNames.indexOf(tag);
        return d >= 0 ? 1 + ((d - todayIdx + 6) % 7) : 9;
    };
    const rankKey = (t) => (person(t.from)?.tier ?? 3) * 100000 + dayOf(t.tag) * 1440 + minutes(t.time);
    async function sync() {
        if (syncing)
            return;
        syncing = true;
        emit('refresh');
        syncBtn.setAttribute('aria-label', 'Syncing');
        syncBtn.setAttribute('aria-busy', 'true');
        setSyncText('Syncing…');
        vron.setBusy(true);
        let spin = null;
        if (!reduce && typeof syncIc.animate === 'function') {
            spin = syncIc.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 900, iterations: Infinity });
        }
        await pause(reduce ? 700 : 1100);
        if (spin) {
            // Ease out of the spin at the end of the current turn, like the app.
            spin.effect?.updateTiming({ iterations: Math.max(1, Math.ceil((Number(spin.currentTime) || 0) / 900)) });
            await spin.finished.catch(() => { });
            spin.cancel();
        }
        syncBtn.classList.add('ok');
        setTimeout(() => syncBtn.classList.remove('ok'), 700);
        setSyncText('Synced just now');
        syncBtn.setAttribute('aria-label', 'Sync now');
        syncBtn.removeAttribute('aria-busy');
        const fresh = syncPending;
        syncPending = false;
        syncDot.classList.add('gone');
        vron.setBusy(false);
        if (fresh)
            await arriveSynced();
        else
            announce('Synced just now. Nothing new.');
        syncing = false;
    }
    /** The waiting task lands in its ranked spot: the cards below it make room, it drops in and glows. */
    async function arriveSynced() {
        // Let the visitor be back on Today with nothing else moving, so they see it land.
        while (busy || sheet || leaving || drag || screens.depth())
            await pause(150);
        busy = true;
        if (tab !== 'today') {
            setTab('today');
            await wait(300);
        }
        snap = null;
        const t = { ...SYNC_TASK, id: `sync-${uid++}`, color: freshColor() };
        const pos = deck.findIndex((d) => placeKey(d) > rankKey(t));
        const from = person(t.from);
        open++;
        if (pos < 0 || pos >= DECK_SIZE) {
            queue.unshift(t);
            $('[data-open]').textContent = String(open);
        }
        else {
            deck.splice(pos, 0, t);
            const last = deck.length > DECK_SIZE ? deck.pop() : null;
            if (last) {
                els.get(last.id)?.classList.add('out', 'out-down');
                recycle(last, true);
                removeEl(last.id);
            }
            render([t.id], t.id);
        }
        const rank = (pos < 0 || pos >= DECK_SIZE ? deck.length : pos) + 1;
        vron.react('surprised', `New from ${from.name.split(' ')[0]}, #${rank}`, 1200);
        toast('1 new task found', false);
        announce(`Synced. New task from ${from.name.split(' ')[0]} (${TIER_ONE[from.tier]}): ${t.title}, ranked #${rank}.`);
        busy = false;
    }
    async function addTask(title, when) {
        if (busy)
            return;
        busy = true;
        takeSnapshot();
        emit('new_task');
        if (tab !== 'today') {
            setTab('today');
            await wait(300);
        }
        const color = freshColor();
        const t = {
            id: `n-${uid++}`,
            title,
            meta: `${when} · added by you`,
            src: 'manual',
            color,
            time: '5:30 PM',
            kind: 'Due',
            why: 'Added by you',
            from: '',
            due: when === 'Today' ? 'due today' : when === 'Tomorrow' ? 'due tomorrow' : 'due this week',
            tag: when,
            origin: 'Added by you',
            at: 'Just now',
            quote: '',
        };
        // It joins at the top of the stack ("Then", #2): the hero stays what to do first.
        const last = deck.length >= DECK_SIZE ? deck[deck.length - 1] : null;
        deck = deck.length ? [deck[0], t, ...deck.slice(1, last ? -1 : undefined)] : [t];
        open++;
        if (last) {
            const lel = els.get(last.id);
            lel?.classList.add('out', 'out-down');
            recycle(last, true);
            removeEl(last.id);
        }
        render([t.id]);
        vron.react('happy', 'Got it!', 1000);
        toast('Added to your list');
        announce(`Added ${title} to your list.`);
        busy = false;
    }
    function undo() {
        if (busy)
            return;
        if (focusUndo) {
            const f = focusUndo;
            focusUndo = null;
            emit('undo');
            f();
            vron.calm();
            hideToast();
            toastEl.classList.remove('show');
            announce('Undone.');
            if (!auto)
                vronBtn.focus({ preventScroll: true });
            return;
        }
        if (!snap)
            return;
        emit('undo');
        const s = snap;
        snap = null;
        // Clear what's on screen, then rebuild the previous deck.
        els.forEach((el, id) => {
            if (!s.deck.some((t) => t.id === id)) {
                el.classList.add('out', 'out-fade');
                removeEl(id, 300);
            }
            else {
                el.classList.remove('done', 'leave-l', 'leave-r', 'out', 'out-fade', 'out-down', 'held', 'armed');
                el.querySelector('.face').style.transform = '';
            }
        });
        deck = s.deck;
        queue = s.queue;
        open = s.open;
        doneToday = s.doneToday;
        ga = s.ga;
        gb = s.gb;
        demoted = new Set(s.demoted);
        pinned = new Set(s.pinned);
        streak = s.streak;
        vron.calm();
        render();
        renderProgress(false);
        hideToast();
        toastEl.classList.remove('show');
        announce('Undone.');
        plusBtn.focus({ preventScroll: true });
    }
    // ---------- sheets ----------
    function showSheet(which, focusEl) {
        const el = sheets[which];
        sheet = which;
        if (activeEl() instanceof HTMLElement && root.contains(activeEl()))
            returnFocus = activeEl();
        el.hidden = false;
        void el.offsetWidth;
        el.classList.add('show');
        scrim.classList.add('show');
        // A sheet covers him: Vron steps away until it closes (the chat has its own Vron).
        vron.setAway(true);
        // A short delay so the sheet is rendered (and focusable) first, with or without motion. Its contents turn visible
        // a frame or two after the sheet does (reduced motion still gives every property a 0.01 ms transition, visibility
        // included), so on a busy main thread the first try can miss: it tries again while the sheet is open.
        if (focusEl)
            focusSoon(el, focusEl);
    }
    function focusSoon(host, target, tries = 25) {
        setTimeout(() => {
            if (!host.classList.contains('show') || activeEl() === target)
                return;
            target.focus({ preventScroll: true });
            if (activeEl() !== target && tries > 1)
                focusSoon(host, target, tries - 1);
        }, 60);
    }
    function hideSheet(restore = true) {
        if (!sheet)
            return;
        const el = sheets[sheet];
        if (sheet === 'what') {
            releaseHeld(whatId);
            whatId = null;
        }
        if (sheet === 'chat')
            chat.closed();
        vron.setAway(false);
        sheet = null;
        el.classList.remove('show');
        scrim.classList.remove('show');
        setTimeout(() => {
            if (!el.classList.contains('show'))
                el.hidden = true;
        }, reduce ? 0 : 420);
        if (restore)
            restoreFocus();
    }
    function restoreFocus() {
        const f = returnFocus;
        returnFocus = null;
        if (!f || !f.isConnected || auto)
            return;
        // A card's own button may be gone (the card left); fall back to the first card.
        const slot = f.closest('.slot');
        // The card may have changed layout (promoted to the hero): the same button in the layout it shows now.
        if (slot && !slot.classList.contains('out'))
            (layoutOf(slot).querySelector(`[data-act="${f.dataset.act}"]`) ?? f).focus({ preventScroll: true });
        else if (f.closest('.slot'))
            doneBtn($('.slot:not(.out)', slotsEl))?.focus({ preventScroll: true });
        else
            f.focus({ preventScroll: true });
    }
    function openNew(focus) {
        if (busy || sheet)
            return;
        newInput.value = '';
        newAdd.disabled = true;
        showSheet('new', focus ? newInput : null);
    }
    // ---------- tabs ----------
    function placeIndicator(animate = true) {
        const b = tabs.find((x) => x.dataset.tab === tab);
        if (!animate)
            tabInd.style.transition = 'none';
        tabInd.style.setProperty('--tx', `${b.offsetLeft}px`);
        tabInd.style.setProperty('--tw', `${b.offsetWidth}px`);
        if (!animate) {
            void tabInd.offsetWidth;
            tabInd.style.transition = '';
        }
    }
    function setTab(name, focus = false) {
        if (name === tab && !focus)
            return;
        const changed = name !== tab;
        tab = name;
        if (!screens.depth())
            app.dataset.screen = name;
        tabs.forEach((b) => {
            const on = b.dataset.tab === name;
            b.setAttribute('aria-selected', String(on));
            b.tabIndex = on ? 0 : -1;
            if (on && focus)
                b.focus({ preventScroll: true });
        });
        placeIndicator();
        if (!changed)
            return;
        emit(`tab_${name}`);
        syncGuard(); // he guards a card only while Today shows
        $$('[data-panel]').forEach((p) => {
            const on = p.dataset.panel === name;
            p.hidden = !on;
            p.classList.remove('enter');
            if (on) {
                void p.offsetWidth;
                p.classList.add('enter');
            }
        });
        if (name === 'calendar')
            selectDay(todayIdx, false);
        if (name === 'progress')
            renderProgress(true);
    }
    // ---------- calendar ----------
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - todayIdx);
    const dayNames = DAY_NAMES;
    const longFmt = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });
    $('[data-cal-month]').textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now);
    weekEl.innerHTML =
        '<span class="wk-ind" aria-hidden="true"></span>' +
            dayNames
                .map((d, i) => {
                const date = new Date(monday);
                date.setDate(monday.getDate() + i);
                return `<button type="button" class="day${i === todayIdx ? ' today' : ''}" data-day="${i}" aria-pressed="${i === todayIdx}" aria-label="${longFmt.format(date)}${i === todayIdx ? ', today' : ''}"><span class="dn">${d}</span><span class="dd">${date.getDate()}</span><span class="dot"></span></button>`;
            })
                .join('');
    const scopeAttr = Array.from(weekEl.attributes).find((a) => a.name.startsWith('data-astro-cid'));
    if (scopeAttr)
        weekEl.querySelectorAll('*').forEach((n) => n.setAttribute(scopeAttr.name, ''));
    function selectDay(i, announceIt = true) {
        weekEl.style.setProperty('--di', String(i));
        $$('[data-day]', weekEl).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.day) === i)));
        let items;
        if (i === todayIdx) {
            // Today: the deck's tasks that are due today, then the day's events.
            const colors = displayColors(deck);
            items = deck
                .map((t, k) => ({ time: t.time, kind: t.kind, title: t.title, why: t.why, color: colors[k], today: t.meta.startsWith('Today') }))
                .filter((x) => x.today);
            for (const extra of TODAY_EVENTS)
                if (items.length < 4 && !items.some((x) => x.title === extra.title))
                    items.push(extra);
        }
        else {
            const n = i >= 5 ? 2 : i % 2 ? 3 : 4;
            items = Array.from({ length: n }, (_, k) => WEEK_ITEMS[(i * 3 + k * 2) % WEEK_ITEMS.length]);
        }
        items = items.sort((a, b) => minutes(a.time) - minutes(b.time)).slice(0, 4);
        timelineEl.innerHTML = items
            .map((it, k) => `<li style="--k:${k}"><span class="tl-time"><b>${esc(it.time)}</b><span>${it.kind}</span></span><span class="tl-card" style="--c:var(--${it.color === 'violet' ? 'violet' : it.color})"><i class="tl-bar"></i><span class="tl-txt"><b>${esc(it.title)}</b><span>${esc(it.why)}</span></span></span></li>`)
            .join('');
        const scope = Array.from(timelineEl.attributes).find((a) => a.name.startsWith('data-astro-cid'));
        if (scope)
            timelineEl.querySelectorAll('*').forEach((n) => n.setAttribute(scope.name, ''));
        $('[data-cal-count]').textContent = `${items.length} items on this day`;
        if (announceIt)
            announce(`${items.length} items on ${dayNames[i]}.`);
    }
    // ---------- progress ----------
    const barsEl = $('[data-bars]');
    const barDays = $('[data-bar-days]');
    // "Last 7 days", ending today (rightmost bar).
    const past = [6, 8, 5, 7, 4, 2];
    const lastDays = Array.from({ length: 7 }, (_, k) => dayNames[(todayIdx - 6 + k + 7) % 7]);
    function countUp(el, to, suffix = '') {
        if (reduce) {
            el.textContent = `${to}${suffix}`;
            return;
        }
        const from = 0;
        const t0 = performance.now();
        const tick = (t) => {
            const p = Math.min(1, (t - t0) / 900);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = `${Math.round(from + (to - from) * e)}${suffix}`;
            if (p < 1)
                requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
    function renderProgress(animate) {
        const rings = [
            ['a', ga, 6],
            ['b', gb, 4],
        ];
        rings.forEach(([k, v, of]) => {
            const pct = Math.round((v / of) * 100);
            const ring = $(`[data-ring="${k}"]`);
            const n = $(`[data-ring-n="${k}"]`);
            $(`[data-goal-sub="${k}"]`).textContent = `${v} of ${of} tasks`;
            if (animate) {
                ring.style.transition = 'none';
                ring.style.setProperty('--off', '100');
                void ring.getBoundingClientRect();
                ring.style.transition = '';
                requestAnimationFrame(() => ring.style.setProperty('--off', String(100 - pct)));
                countUp(n, pct, '%');
            }
            else {
                ring.style.setProperty('--off', String(100 - pct));
                n.textContent = `${pct}%`;
            }
        });
        const values = [...past, doneToday];
        const total = values.reduce((a, b) => a + b, 0);
        barsEl.innerHTML = values
            .map((v, i) => `<i class="${i === 6 ? 'now' : ''}" style="--h:${Math.max(4, Math.min(100, (v / 10) * 100))}%;--k:${i}"></i>`)
            .join('');
        barDays.innerHTML = lastDays.map((d, i) => `<span class="${i === 6 ? 'now' : ''}">${i === 6 ? 'Today' : d[0]}</span>`).join('');
        [barsEl, barDays].forEach((host) => {
            const scope = Array.from(host.attributes).find((a) => a.name.startsWith('data-astro-cid'));
            if (scope)
                host.querySelectorAll('*').forEach((n) => n.setAttribute(scope.name, ''));
        });
        if (animate) {
            barsEl.classList.remove('grow');
            void barsEl.offsetWidth;
            barsEl.classList.add('grow');
            countUp($('[data-week-total]'), total);
        }
        else
            $('[data-week-total]').textContent = String(total);
    }
    renderProgress(false);
    let drag = null;
    let suppressClick = false;
    function setDrag(el, face, dx, w) {
        face.style.transform = `translateX(${dx}px) rotate(${(dx / w) * 3}deg)`;
        el.dataset.dir = dx >= 0 ? 'r' : 'l';
        el.classList.toggle('armed', Math.abs(dx) > w * 0.3);
    }
    function release(el, face, id, dx, w, v) {
        const thr = w * 0.3;
        if (dx > thr || (v > 0.5 && dx > 40)) {
            complete(id);
        }
        else if (dx < -thr || (v < -0.5 && dx < -40)) {
            openWhat(id, false);
        }
        else {
            el.classList.remove('dragging', 'armed');
            el.classList.add('held');
            face.style.transform = '';
            setTimeout(() => el.classList.remove('held'), reduce ? 0 : 420);
        }
    }
    // The hero and the colored cards swipe alike.
    deckEl.addEventListener('pointerdown', (e) => {
        const target = e.target;
        // Drags may start anywhere on the card, including its Done / What happened buttons (a plain click still clicks them).
        if (e.button > 0)
            return;
        const face = target.closest('.face');
        const el = face?.closest('.slot');
        if (!face || !el || busy || sheet || ['out', 'leave-r', 'leave-l', 'out-fade', 'arrive'].some((c) => el.classList.contains(c)))
            return;
        drag = {
            el,
            face,
            id: el.dataset.id,
            x0: e.clientX,
            y0: e.clientY,
            w: face.getBoundingClientRect().width,
            dx: 0,
            active: false,
            pid: e.pointerId,
            hist: [{ x: e.clientX, t: e.timeStamp }],
        };
    });
    deckEl.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pid)
            return;
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (!drag.active) {
            if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                drag.active = true;
                drag.el.classList.add('dragging');
                // Capture only once it's a drag, so a plain click on a button still lands on the button.
                try {
                    drag.face.setPointerCapture(e.pointerId);
                }
                catch {
                    /* synthetic pointers */
                }
            }
            else if (Math.abs(dy) > 10) {
                drag = null;
                return;
            }
            else
                return;
        }
        e.preventDefault();
        drag.dx = dx;
        drag.hist.push({ x: e.clientX, t: e.timeStamp });
        if (drag.hist.length > 6)
            drag.hist.shift();
        setDrag(drag.el, drag.face, dx, drag.w);
    });
    const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.pid)
            return;
        const d = drag;
        drag = null;
        if (!d.active)
            return;
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 50);
        const first = d.hist[0];
        const last = d.hist[d.hist.length - 1];
        const v = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
        if (e.type === 'pointercancel')
            release(d.el, d.face, d.id, 0, d.w, 0);
        else
            release(d.el, d.face, d.id, d.dx, d.w, v);
    };
    deckEl.addEventListener('pointerup', endDrag);
    deckEl.addEventListener('pointercancel', endDrag);
    // ---------- clicks + keys ----------
    app.addEventListener('click', (e) => {
        if (suppressClick)
            return;
        const t = e.target;
        const act = t.closest('[data-act]');
        if (act) {
            const id = act.closest('.slot').dataset.id;
            if (act.dataset.act === 'done')
                complete(id);
            else if (act.dataset.act === 'open')
                openDetail(id);
            else {
                returnFocus = act;
                openWhat(id, e.detail === 0);
            }
            return;
        }
        // A tap anywhere else on a card opens it (a swipe never gets here: suppressClick).
        const face = t.closest('.face');
        if (face)
            return openDetail(face.closest('.slot').dataset.id);
        if (t.closest('[data-who]'))
            return openSettings();
        if (t.closest('[data-sync]'))
            return void sync();
        if (t.closest('[data-vron-btn]'))
            return openChat();
        const tb = t.closest('[data-tab]');
        if (tb)
            return setTab(tb.dataset.tab);
        if (t.closest('[data-plus]'))
            return openNew(true);
        if (t.closest('[data-close]') || t === scrim)
            return hideSheet();
        const opt = t.closest('[data-opt]');
        if (opt)
            return void choose(opt.dataset.opt);
        if (t.closest('[data-undo]'))
            return undo();
        const day = t.closest('[data-day]');
        if (day)
            return selectDay(Number(day.dataset.day));
    });
    app.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sheet) {
            e.preventDefault();
            hideSheet();
            return;
        }
        if (e.key === 'Escape' && screens.depth() && !leaving) {
            e.preventDefault();
            void screens.pop();
            return;
        }
        const tb = e.target.closest('[data-tab]');
        if (tb && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End')) {
            e.preventDefault();
            const i = tabs.indexOf(tb);
            const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            setTab(tabs[n].dataset.tab, true);
        }
    });
    newInput.addEventListener('input', () => (newAdd.disabled = !newInput.value.trim()));
    newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = newInput.value.trim();
        if (!title)
            return;
        const when = newForm.querySelector('input[name="demo-when"]:checked')?.value ?? 'Today';
        returnFocus = auto ? null : plusBtn;
        hideSheet();
        void addTask(title, when);
    });
    // ---------- autoplay ----------
    function moveTouch(el, fx = 0.5, fy = 0.5) {
        const r = el.getBoundingClientRect();
        const a = app.getBoundingClientRect();
        touch.style.setProperty('--tx', `${r.left - a.left + r.width * fx}px`);
        touch.style.setProperty('--ty', `${r.top - a.top + r.height * fy}px`);
        touch.classList.add('show');
    }
    const hideTouch = () => touch.classList.remove('show', 'down', 'track');
    async function runAuto(tk) {
        const step = async (ms) => {
            await wait(ms);
            if (tk.stop)
                throw STOP;
        };
        const tap = async (el, fx = 0.5, fy = 0.5) => {
            if (!el)
                throw STOP;
            moveTouch(el, fx, fy);
            await step(650);
            touch.classList.add('down');
            el.classList.add('tap');
            await step(150);
            touch.classList.remove('down');
            el.classList.remove('tap');
        };
        const fakeDrag = async (id, dir) => {
            const el = els.get(id);
            const face = faceOf(id);
            if (!el || !face)
                throw STOP;
            const w = face.getBoundingClientRect().width;
            const fx = dir > 0 ? 0.3 : 0.72;
            moveTouch(face, fx, 0.3);
            await step(700);
            touch.classList.add('down');
            await step(160);
            const r = face.getBoundingClientRect();
            const a = app.getBoundingClientRect();
            const sx = r.left - a.left + r.width * fx;
            touch.classList.add('track');
            el.classList.add('dragging');
            const dist = w * 0.5 * dir;
            const dur = 620;
            const t0 = performance.now();
            await new Promise((res, rej) => {
                const frame = (t) => {
                    if (tk.stop) {
                        el.classList.remove('dragging', 'armed');
                        face.style.transform = '';
                        return rej(STOP);
                    }
                    const p = Math.min(1, (t - t0) / dur);
                    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                    const dx = dist * ease;
                    setDrag(el, face, dx, w);
                    touch.style.setProperty('--tx', `${sx + dx}px`);
                    if (p < 1)
                        requestAnimationFrame(frame);
                    else
                        res();
                };
                requestAnimationFrame(frame);
            });
            touch.classList.remove('down', 'track');
            release(el, face, id, dist, w, 0);
            await step(250);
            touch.classList.remove('show');
        };
        /** Vron guards the urgent card: the finger tries to drag him off it; he stretches, says no and snaps back. */
        const tugVron = async () => {
            const b = $('[data-vron-btn]');
            moveTouch(b, 0.5, 0.42);
            await step(700);
            touch.classList.add('down');
            await step(150);
            touch.classList.add('track');
            const r = b.getBoundingClientRect();
            const a = app.getBoundingClientRect();
            const k = a.width / 360;
            const sx = r.left + r.width / 2;
            const sy = r.top + r.height * 0.42;
            const t0 = performance.now();
            await new Promise((res, rej) => {
                const frame = (t) => {
                    if (tk.stop) {
                        vron.letGo();
                        return rej(STOP);
                    }
                    const p = Math.min(1, (t - t0) / 820);
                    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                    const x = sx - 92 * k * e;
                    const y = sy - 58 * k * e;
                    touch.style.setProperty('--tx', `${x - a.left}px`);
                    touch.style.setProperty('--ty', `${y - a.top}px`);
                    vron.pull(x, y);
                    if (p < 1)
                        requestAnimationFrame(frame);
                    else
                        res();
                };
                requestAnimationFrame(frame);
            });
            await step(420);
            vron.letGo();
            touch.classList.remove('down', 'track');
            await step(450);
            touch.classList.remove('show');
            await step(650);
        };
        await step(1100);
        for (let round = 0;; round++) {
            if (screens.depth())
                screens.popAll();
            if (tab !== 'today')
                setTab('today');
            // 0. Vron guards an urgent #1 card (he hops over to it once he's in): try to drag him off it first.
            if (round === 0)
                for (let i = 0; i < 40 && !vron.ready; i++)
                    await step(100);
            if (vron.ready && vron.guarding) {
                for (let i = 0; i < 40 && !vron.perched; i++)
                    await step(100);
                if (vron.perched)
                    await tugVron();
            }
            // 1. Swipe right: done.
            await fakeDrag(deck[0].id, 1);
            await step(2100);
            // 2. Swipe left: "What happened?" → Lower priority.
            await fakeDrag(deck[1].id, -1);
            await step(900);
            await tap($('[data-opt="lower"]'), 0.4);
            void choose('lower');
            hideTouch();
            await step(2000);
            // 3. Tap the top card: its details slide in (What to do). Vron is right there: ask him for a reminder an hour
            //    before, Apply, and the switch turns on with its time. Then back. (Before he's loaded: the switch itself.)
            await tap(faceOf(deck[0].id), 0.45, 0.32);
            openDetail(deck[0].id);
            hideTouch();
            await step(2400);
            const open = screens.current();
            if (open && !screens.reminder(open)) {
                if (vron.ready) {
                    for (let i = 0; i < 30 && !vron.settled; i++)
                        await step(100);
                    await tap($('[data-vron-btn]'), 0.5, 0.45);
                    openChat();
                    hideTouch();
                    await step(1100);
                    const chip = $$('[data-chat-chips] .chip').find((b) => b.textContent?.startsWith('Remind me'));
                    const applies = () => $$('[data-chat-log] [data-op-apply]');
                    const before = applies().length;
                    if (chip) {
                        await tap(chip, 0.3);
                        chip.click();
                        hideTouch();
                        for (let i = 0; i < 50 && applies().length <= before; i++)
                            await step(100);
                        await step(1000);
                    }
                    const apply = applies().length > before ? applies().pop() : null;
                    if (apply) {
                        await tap(apply);
                        apply.click();
                        hideTouch();
                        await step(2800);
                    }
                    else {
                        hideSheet(false);
                        await step(700);
                    }
                }
                else {
                    await tap($('[data-d-rem]'));
                    screens.toggleReminder();
                    await step(1300);
                }
            }
            await tap($('[data-scr="detail"] [data-back]'));
            void screens.pop();
            hideTouch();
            await step(1500);
            // 4. Calendar: look at tomorrow, then back to today.
            await tap(tabs[1]);
            setTab('calendar');
            await step(1300);
            const other = todayIdx < 6 ? todayIdx + 1 : todayIdx - 1;
            await tap($(`[data-day="${other}"] .dd`, weekEl));
            selectDay(other);
            await step(1500);
            await tap($(`[data-day="${todayIdx}"] .dd`, weekEl));
            selectDay(todayIdx);
            await step(1100);
            // 5. Progress.
            await tap(tabs[2]);
            setTab('progress');
            await step(2600);
            // 6. Today, then + New task.
            await tap(tabs[0]);
            setTab('today');
            await step(800);
            await tap(plusBtn);
            openNew(false);
            hideTouch();
            await step(600);
            const titles = PERSONA.autoTitles;
            const title = titles[round % titles.length];
            for (const ch of title) {
                newInput.value += ch;
                newAdd.disabled = false;
                await step(45 + Math.random() * 50);
            }
            await step(350);
            await tap(newAdd);
            newForm.requestSubmit();
            hideTouch();
            await step(2400);
            // 7. Swipe left on the top card → Not needed.
            await fakeDrag(deck[1].id, -1);
            await step(900);
            await tap($('[data-opt="notneeded"]'), 0.4);
            void choose('notneeded');
            hideTouch();
            await step(2600);
        }
    }
    let visible = false;
    function startAuto() {
        if (reduce || auto || userMode || !visible || document.hidden)
            return;
        auto = true;
        const tk = { stop: false };
        token = tk;
        runAuto(tk)
            .catch(() => { })
            .finally(() => {
            if (token === tk)
                auto = false;
            hideTouch();
        });
    }
    function stopAuto() {
        token.stop = true;
        auto = false;
        hideTouch();
    }
    // Hand control to the visitor the moment they hover, touch or focus the phone.
    let idleTimer = 0;
    let hovering = false;
    /** The caption under the phone crossfades to "Your turn" (CSS on .demo.user). */
    const setHint = (user) => root.classList.toggle('user', user);
    function takeover() {
        if (!userMode) {
            userMode = true;
            stopAuto();
            setHint(true);
        }
        armIdle();
    }
    function armIdle() {
        clearTimeout(idleTimer);
        if (reduce)
            return;
        idleTimer = window.setTimeout(tryResume, screens.depth() || sheet === 'chat' ? IDLE_SCREEN_MS : IDLE_MS);
    }
    let lastInput = 'pointer';
    document.addEventListener('keydown', () => (lastInput = 'key'), true);
    document.addEventListener('pointermove', () => (lastInput = 'pointer'), { capture: true, passive: true });
    document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
    function tryResume() {
        const a = activeEl();
        // Never yank the demo away from a keyboard user who is still inside it.
        const keyboardInside = a instanceof HTMLElement && root.contains(a) && lastInput === 'key';
        if (hovering || keyboardInside || drag || vron.handling || busy || leaving || syncing)
            return armIdle();
        userMode = false;
        if (sheet)
            hideSheet(false);
        if (screens.depth())
            screens.popAll();
        if (a instanceof HTMLElement && root.contains(a))
            a.blur();
        setTab('today');
        setHint(false);
        startAuto();
    }
    device.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') {
            hovering = true;
            takeover();
        }
    });
    device.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') {
            hovering = false;
            if (userMode)
                armIdle();
        }
    });
    device.addEventListener('pointerdown', takeover);
    device.addEventListener('focusin', takeover);
    device.addEventListener('keydown', () => userMode && armIdle());
    device.addEventListener('input', () => userMode && armIdle());
    let lastMove = 0;
    device.addEventListener('pointermove', (e) => {
        if (userMode && e.timeStamp - lastMove > 500) {
            lastMove = e.timeStamp;
            armIdle();
        }
    });
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible)
                startAuto();
            else if (!userMode)
                stopAuto();
        }, { threshold: 0.35 }).observe(device);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            stopAuto();
        else
            startAuto();
    });
    // What Vron guards from the start (he goes to it once he's loaded).
    app.dataset.screen = 'today';
    syncGuard();
    // Keep the tab indicator aligned when the device resizes.
    placeIndicator(false);
    if ('ResizeObserver' in window)
        new ResizeObserver(() => placeIndicator(false)).observe(device);
}
