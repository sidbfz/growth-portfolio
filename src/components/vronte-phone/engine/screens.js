// Ported from Siddharth's Vronte repo (apps/web/src/components/demo/screens.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
import { activeEl } from './dom.js';
// Pushed screens in the hero demo (markup + styles: ./Screens.astro, wired up by src/lib/demo.ts).
// A native-style stack over Today: a screen slides in from the right while the one below eases left and dims;
// Back (or Escape) slides it out again. Covered layers are inert, so keyboard and screen readers stay on top.
import { GOALS, SOURCE_LABEL, SOURCE_PILL, TIER_ONE, avatarColors, defaultReminder, initials, person, reminderText, startsIn, } from './demo-data.js';
/** Push / pop duration, matching .scr and .home in the CSS. */
export const PUSH_MS = 440;
/** What the source row's Open would do in the app. */
const OPEN_IN = {
    gmail: 'Opens the email in Gmail',
    google_calendar: 'Opens the event in Google Calendar',
    wispr: 'Opens the note in Wispr Flow',
    manual: '',
};
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function createScreens(o) {
    const { app, home, reduce } = o;
    const get = (name) => app.querySelector(`[data-scr="${name}"]`);
    const detail = get('detail');
    const $d = (sel) => detail.querySelector(sel);
    // Astro scopes component styles with a data attribute; copy it onto runtime-created nodes.
    const scope = Array.from(detail.attributes).find((a) => a.name.startsWith('data-astro-cid'))?.name;
    const stamp = (host) => {
        if (scope)
            host.querySelectorAll('*').forEach((n) => n.setAttribute(scope, ''));
    };
    const hero = $d('[data-d-hero]');
    const goalBtn = $d('[data-d-goal-btn]');
    const goalsEl = $d('[data-d-goals]');
    const remBtn = $d('[data-d-rem]');
    const todo = $d('[data-d-todo]');
    const saidBtn = $d('[data-d-said-btn]');
    const quoteEl = $d('[data-d-quote]');
    const openBtn = $d('[data-d-open]');
    const actBtns = [$d('[data-d-done]'), $d('[data-d-notmine]')];
    const stack = [];
    const layer = (i) => (i < 0 ? home : stack[i].el);
    /** Reminders by task id (on = a time; off = not in the map). */
    const reminders = new Map();
    let current = null;
    let currentRank = '';
    // ---------- stack ----------
    function push(name, opener) {
        const el = get(name);
        if (stack.some((e) => e.el === el))
            return;
        const below = layer(stack.length - 1);
        stack.push({ name, el, opener });
        el.hidden = false;
        el.querySelector('.scr-in').scrollTop = 0;
        void el.offsetWidth;
        el.classList.add('on');
        below.classList.add('covered');
        // Focus the new screen's title (screen readers announce where they are; Tab goes on from there).
        if (!o.auto())
            el.querySelector('h3')?.focus({ preventScroll: true });
        below.inert = true;
        o.onChange();
    }
    /** Back one screen; resolves once the slide has finished. */
    function pop(restoreFocus = true) {
        const top = stack.pop();
        if (!top)
            return Promise.resolve();
        const below = layer(stack.length - 1);
        below.inert = false;
        below.classList.remove('covered');
        top.el.classList.remove('on');
        o.onChange();
        const f = top.opener;
        if (restoreFocus && !o.auto() && f?.isConnected && !f.closest('[inert], .out'))
            f.focus({ preventScroll: true });
        return new Promise((res) => setTimeout(() => {
            if (!top.el.classList.contains('on'))
                top.el.hidden = true;
            res();
        }, reduce ? 0 : PUSH_MS));
    }
    function popAll() {
        while (stack.length)
            void pop(false);
    }
    // ---------- task detail ----------
    function setGoal(goal) {
        $d('[data-d-goal]').textContent = goal ? GOALS[goal] : 'Not linked to a goal';
        goalBtn.textContent = goal ? 'Change' : 'Add';
        goalsEl.querySelectorAll('[data-goal]').forEach((c) => c.setAttribute('aria-checked', String((c.dataset.goal || undefined) === goal)));
    }
    /** The switch and its line: off, or the time it will nudge you ("Today, 3:30 PM · 30 min before"). */
    function paintReminder() {
        const r = current ? reminders.get(current.id) : undefined;
        remBtn.setAttribute('aria-checked', String(!!r));
        if (!current || !r)
            return void ($d('[data-d-rem-sub]').textContent = 'Off');
        const { when, note } = reminderText(current, r);
        $d('[data-d-rem-sub]').textContent = note ? `${when} · ${note}` : when;
    }
    function togglePicker(open = goalsEl.hidden) {
        goalsEl.hidden = !open;
        goalBtn.setAttribute('aria-expanded', String(open));
    }
    function showSaid(open) {
        saidBtn.setAttribute('aria-expanded', String(open));
        if (!todo.classList.contains('quote-only'))
            quoteEl.hidden = !open;
    }
    /** The title, its pills and the reason line ("#1 because Sarah (Manager) asked, due today"). */
    function paintHero(t, rank) {
        $d('[data-d-title]').textContent = t.title;
        $d('[data-d-src]').textContent = SOURCE_PILL[t.src];
        // A meeting inside the hour: "In 34 min" instead of "Today" (it counts down: tick).
        $d('[data-d-tag]').textContent = startsIn(t) ?? t.tag;
        const asker = person(t.from);
        const who = asker ? `${asker.name.split(' ')[0]} (${TIER_ONE[asker.tier]}) ${t.kind === 'Event' ? 'invited you' : 'asked'}` : 'you added it';
        const why = $d('[data-d-why]');
        why.innerHTML = `<b>${esc(rank)}</b> because ${esc(who)}, ${esc(t.due)}`;
        stamp(why);
    }
    /** A row lights up for a moment: what just changed on this screen. */
    function glow(which) {
        const el = which === 'goal' ? $d('[data-d-goal-card]') : which === 'rem' ? $d('[data-d-rem-card]') : which === 'todo' ? todo : $d('[data-d-tag]');
        el.classList.remove('glow');
        void el.offsetWidth;
        el.classList.add('glow');
        setTimeout(() => el.classList.remove('glow'), reduce ? 0 : 1200);
    }
    /** Fill the detail screen for a task and push it. `rank` is "#1" (the hero) … "#4". */
    function openDetail(t, rank, opener) {
        current = t;
        currentRank = rank;
        hero.classList.remove('struck', 'out');
        actBtns.forEach((b) => (b.disabled = false));
        paintHero(t, rank);
        const asker = person(t.from);
        const names = asker ? [asker.name, ...(t.cc ?? []).map((id) => person(id)?.name ?? '').filter(Boolean)] : ['You'];
        const peopleEl = $d('[data-d-people]');
        peopleEl.setAttribute('aria-label', names.join(', '));
        peopleEl.innerHTML = names
            .slice(0, 3)
            // The first avatar sits on top, like the app's AvatarStack.
            .map((n, i) => {
            if (n === 'You')
                return `<span class="av me" style="z-index:${3 - i}">AM</span>`;
            const c = avatarColors(n);
            return `<span class="av" style="--c:${c.bg};--f:${c.fg};z-index:${3 - i}">${esc(initials(n))}</span>`;
        })
            .join('');
        stamp(peopleEl);
        // What to do (its details), with the sentence that created it behind "What was said". Without details (an older
        // task), the sentence itself; a task you added yourself has neither.
        const lines = t.details ?? [];
        const list = $d('[data-d-details]');
        list.innerHTML = lines.map((l) => `<li>${esc(l)}</li>`).join('');
        stamp(list);
        quoteEl.textContent = t.quote ? `“${t.quote}”` : '';
        todo.hidden = !lines.length && !t.quote;
        todo.classList.toggle('quote-only', !lines.length && !!t.quote);
        $d('[data-d-todo-h]').textContent = lines.length ? 'What to do' : 'What was said';
        saidBtn.hidden = !lines.length || !t.quote;
        quoteEl.hidden = !!lines.length || !t.quote;
        saidBtn.setAttribute('aria-expanded', 'false');
        $d('[data-d-logo]').innerHTML = o.tpl(t.src);
        $d('[data-d-origin]').textContent = t.src === 'manual' ? 'Added by you' : `${t.origin} · ${t.src === 'google_calendar' ? 'Calendar' : SOURCE_LABEL[t.src]}`;
        $d('[data-d-at]').textContent = t.at;
        openBtn.hidden = t.src === 'manual';
        openBtn.dataset.soon = OPEN_IN[t.src];
        openBtn.setAttribute('aria-label', `Open in ${SOURCE_LABEL[t.src]}`);
        setGoal(t.goal);
        paintReminder();
        togglePicker(false);
        push('detail', opener);
    }
    /** Done: the title is struck through (then the caller pops back and the card leaves). */
    function strike() {
        actBtns.forEach((b) => (b.disabled = true));
        hero.classList.add('struck');
    }
    /** Not mine: the title tilts and slides out to the left. */
    function slideOut() {
        actBtns.forEach((b) => (b.disabled = true));
        hero.classList.add('out');
    }
    /** The switch: on at the default time (30 min before it's due, else tomorrow 9 AM), or off. */
    function toggleReminder() {
        if (!current)
            return;
        const on = !reminders.has(current.id);
        if (on)
            reminders.set(current.id, defaultReminder(current));
        else
            reminders.delete(current.id);
        paintReminder();
        o.onReminder?.(current, on);
    }
    // ---------- changes from the chat (Vron, focused on this task) ----------
    const isOpen = (t) => current === t && top() === 'detail';
    function top() {
        return stack[stack.length - 1]?.name ?? null;
    }
    /** Links the open task to a goal: the goal row fills. */
    function linkGoal(t, goal) {
        t.goal = goal;
        if (!isOpen(t))
            return;
        setGoal(goal);
        glow('goal');
    }
    /** Sets (or with null, clears) a task's reminder: the switch turns on and shows the time. */
    function remind(t, r) {
        if (r)
            reminders.set(t.id, r);
        else
            reminders.delete(t.id);
        if (!isOpen(t))
            return;
        paintReminder();
        glow('rem');
    }
    /** The open task's date changed (and maybe its rank): its pills and reason line update. */
    function redate(t, rank = currentRank) {
        currentRank = rank;
        if (!isOpen(t))
            return;
        paintHero(t, rank);
        paintReminder();
        glow('hero');
    }
    // ---------- clicks ----------
    app.addEventListener('click', (e) => {
        const t = e.target;
        if (!t.closest('[data-scr]') || o.locked())
            return;
        if (t.closest('[data-back]'))
            return void pop();
        const row = t.closest('[data-push]');
        if (row)
            return push(row.dataset.push, row);
        const soon = t.closest('[data-soon]');
        if (soon)
            return o.onSoon(soon.dataset.soon);
        if (t.closest('[data-d-goal-btn]'))
            return togglePicker();
        const chip = t.closest('[data-goal]');
        if (chip && current) {
            current.goal = (chip.dataset.goal || undefined);
            setGoal(current.goal);
            togglePicker(false);
            goalBtn.focus({ preventScroll: true });
            return;
        }
        if (t.closest('[data-d-rem]'))
            return toggleReminder();
        if (t.closest('[data-d-said-btn]'))
            return showSaid(saidBtn.getAttribute('aria-expanded') !== 'true');
        if (t.closest('[data-d-done]'))
            return o.onDone();
        if (t.closest('[data-d-notmine]'))
            return o.onNotMine();
    });
    // Goal chips are a radio group: arrow keys move between them.
    goalsEl.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key))
            return;
        e.preventDefault();
        const chips = Array.from(goalsEl.querySelectorAll('[data-goal]'));
        const i = chips.indexOf(activeEl());
        chips[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + chips.length) % chips.length].focus();
    });
    return {
        push,
        pop,
        popAll,
        openDetail,
        strike,
        slideOut,
        toggleReminder,
        linkGoal,
        remind,
        redate,
        glow,
        reminder: (t) => reminders.get(t.id) ?? null,
        /** The demo clock moved on a minute: the open task's "In N min". */
        tick: () => {
            if (current)
                $d('[data-d-tag]').textContent = startsIn(current) ?? current.tag;
        },
        depth: () => stack.length,
        top,
        current: () => current,
        setSynced: (text) => app.querySelectorAll('[data-synced]').forEach((n) => (n.textContent = text)),
    };
}
