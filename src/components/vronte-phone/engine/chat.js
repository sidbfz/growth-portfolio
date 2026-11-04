// Ported from Siddharth's Vronte repo (apps/web/src/components/demo/chat.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
import { activeEl } from './dom.js';
// The demo phone's chat with Vron (markup + styles: ./Chat.astro; opened and closed by src/lib/demo.ts like the
// other sheets). Fully scripted, no network: a suggestion, or anything typed, plays an exchange. Your bubble, Vron
// thinks beside the typing dots for about a second, then his reply comes in word by word while he talks, he reacts
// to how it turned out and, where it makes sense, proposes a change. Apply really changes the list: the sheet closes
// and the card leaves, or moves to #1 (onApply). Typed messages find the suggestion they ask for; a hello or thanks
// gets love, other questions about the list a pointer to the suggestions, anything else a curious "I'm built for
// your tasks". Vron himself (one live Vron and his states): ./vron-chat.ts.
//
// The chat knows what you're looking at (the app's AiChatRequest.focus, brief 20 D): opened from a task's screen it
// offers what fits that task (link it to a goal, a reminder an hour before, push it a day, what exactly to do) and
// its Apply changes that screen; elsewhere a question that fits the screen comes first, then the list's own.
import { GOALS, LONG_DAY, PEOPLE, PERSONA, TIER_ONE, defaultReminder, dueAt, minutes, minutesLeft, nextTag, person, reminderText, } from './demo-data.js';
import { createChatVron } from './vron-chat.js';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const base = (t) => t.id.split('-')[0];
/** He thinks this long after you send (the typing dots). */
const THINK_MS = 1150;
/** His reply comes in a word every ~30 ms, all of it within 1.5 s; each word fades in over WORD_FADE. */
const WORD_MS = 30;
const REVEAL_MAX = 1500;
const WORD_FADE = 180;
/** How long he holds his reaction before settling back to idle. */
const REACT_MS = 1700;
// What typed messages are about.
const GREETING = /^\s*(hi|hey|hello|hiya|howdy|yo|hola|good (morning|afternoon|evening))\b/i;
const THANKS = /\b(thanks|thank you|thx|ty|cheers|appreciate it)\b/i;
const NOT_MINE = /\bnot (mine|my|for me)\b|\bisn[’']?t (mine|my)\b|\bsomeone else|\bbelongs to\b|\bnot my (job|task)\b/i;
const PIN = /#\s?1\b|\bto the top\b|\bmove\b|\bpin\b|\bbump\b|\btop priority\b/i;
const FIRST = /\b(first|next|start|begin|priorit\w*|most important|focus on)\b|\bwhat should i\b/i;
// …and, on a task's screen, what they want done to it.
const REMIND = /\b(remind\w*|nudge|alert|ping me)\b/i;
const GOAL = /\b(goals?|okrs?|link\w*)\b/i;
const DATE = /\b(tomorrow|push|postpone|reschedul\w*|later|delay)\b/i;
const WHAT = /\bexactly\b|\bdetails?\b|\bwhat (do|should) i (need to )?do\b|\bwhat('s| is) (this|it) about\b|\bwhat does (it|this) need\b/i;
const TASKY = /\b(tasks?|list|to-?dos?|today|tomorrow|tonight|week|deadlines?|due|urgent|important|meetings?|calendar|emails?|inbox|mail|schedul\w*|plans?|projects?|work|rank\w*|top|mine|owns?|owner|assign\w*|delegat\w*|snooze|remind\w*|done|finish\w*|complet\w*|busy|focus|boss|manager|client|team|sync|deck|numbers|invoice|wiki|agenda|budget|hiring|checklist|research|review|help)\b/i;
/** "Today, 3 PM" → "today at 3 PM"; "Wed, 11 AM" → "Wednesday at 11 AM". */
const spoken = (when) => {
    const [day, time] = when.split(', ');
    return `${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : (LONG_DAY[day] ?? day)} at ${time}`;
};
const sentence = (lines) => lines.map((l) => l.replace(/[.\s]+$/, '')).join('. ') + '.';
export function createChat({ el, reduce, auto, deck, progress, todayIdx, reminder, canApply, onApply }) {
    const $ = (sel) => el.querySelector(sel);
    const msgs = $('[data-chat-msgs]');
    const log = $('[data-chat-log]');
    const chipsEl = $('[data-chat-chips]');
    const empty = $('.c-empty');
    const form = $('[data-chat-form]');
    const input = $('[data-chat-input]');
    const sendBtn = $('[data-chat-send]');
    const tpl = (name) => $(`template[data-chat-tpl="${name}"]`)?.innerHTML ?? '';
    const headSub = $('#dc-chat-sub');
    const emptySub = $('.c-empty .c-sub');
    const HEAD_SUB = headSub.textContent ?? '';
    const EMPTY_SUB = emptySub.textContent ?? '';
    const PLACEHOLDER = input.placeholder;
    let busy = false;
    const used = new Set();
    let focus = { screen: 'today' };
    /** The focus the conversation was last about (a task, or the list), for the "About …" line between them. */
    let about = 'list';
    const focusTask = () => (focus.screen === 'detail' ? focus.task : null);
    // ---------- Vron ----------
    const vron = createChatVron({ el, reduce });
    // ---------- the script ----------
    const who = (t) => {
        const p = person(t.from);
        return p ? `${p.name.split(' ')[0]} (${TIER_ONE[p.tier]}) ${t.kind === 'Event' ? 'invited you' : 'asked'}` : 'you added it';
    };
    const short = (t) => t.short ?? `“${t.title}”`;
    const is = (t) => (/\b(numbers|notes|answers|invoices|moodboards|studies)$/.test(t.short ?? '') ? 'are' : 'is');
    /** Someone the task can belong to instead. */
    const other = (t) => (t.from === 'jonas' ? 'Sam' : 'Jonas');
    const gone = { mood: 'sad', text: 'That one is already off your list.' };
    function replyFirst() {
        const [a, b] = deck();
        if (!a)
            return null;
        return { mood: 'focused', text: `Start with “${a.title}”: ${who(a)}, ${a.due}.${b ? ` Then “${b.title}”.` : ''}` };
    }
    function replyNotMine(id, owner) {
        const t = deck().find((x) => x.id === id);
        if (!t)
            return gone;
        return {
            mood: 'surprised',
            text: `Oh! Got it, that’s ${owner ?? other(t)}’s. I’ll take it off your list.`,
            op: { kind: 'notmine', id, title: `Mark “${t.title}” as not mine` },
        };
    }
    function replyPin(id) {
        const d = deck();
        const t = d.find((x) => x.id === id);
        if (!t)
            return gone;
        if (d[0] === t)
            return { mood: 'happy', text: `“${t.title}” is already your #1.` };
        return { mood: 'happy', text: `Sure. “${t.title}” goes to #1 for today.`, op: { kind: 'pin', id, title: `Move “${t.title}” to #1` } };
    }
    /** The cards a suggestion would pick right now. */
    function targets() {
        const d = deck();
        // Move a card up: the client deck when it's not already on top, else the last card.
        const pin = used.has('pin') ? null : (d.find((t, i) => i > 0 && base(t) === 't2') ?? d[d.length - 1] ?? null);
        // Not mine: the lowest card that isn't the one to move, preferably not your manager's.
        const rest = [...d].reverse().filter((t) => t !== pin);
        const notmine = rest.find((t) => person(t.from)?.tier !== 1) ?? rest[0] ?? d[d.length - 1] ?? null;
        return { pin, notmine };
    }
    /** The list's own suggestions (Today, and after a screen's own question elsewhere). */
    function listSuggestions() {
        if (deck().length < 2)
            return [];
        const { pin, notmine } = targets();
        const out = [];
        if (!used.has('first'))
            out.push({ key: 'first', text: 'What should I do first?', reply: replyFirst });
        if (!used.has('notmine') && notmine) {
            const id = notmine.id;
            out.push({ key: 'notmine', text: `${cap(short(notmine))} ${is(notmine)} ${other(notmine)}’s, not mine`, reply: () => replyNotMine(id) });
        }
        if (pin) {
            const id = pin.id;
            out.push({ key: 'pin', text: `Move ${short(pin)} to #1`, reply: () => replyPin(id) });
        }
        // Everything tried: "what first?" again (its answer follows the list).
        if (!out.length) {
            used.delete('first');
            return listSuggestions();
        }
        return out;
    }
    function suggestions() {
        const t = focusTask();
        if (t)
            return taskSuggestions(t);
        const info = infoSuggestion(focus.screen);
        return [...(info && !used.has(info.key) ? [info] : []), ...listSuggestions()].slice(0, 4);
    }
    // ---------- on a task's screen ----------
    const k = (t, what) => `${t.id}:${what}`;
    const dateTag = (t) => nextTag(t.tag, todayIdx);
    const dayWord = (tag) => (tag === 'Tomorrow' ? 'tomorrow' : (LONG_DAY[tag] ?? tag));
    function dateChip(t) {
        if (t.tag === 'Today')
            return 'Push this to tomorrow';
        if (t.tag === 'Tomorrow')
            return `Push this to ${LONG_DAY[dateTag(t)]}`;
        return t.tag in LONG_DAY ? 'Move this to tomorrow' : 'Do this tomorrow';
    }
    function taskSuggestions(t) {
        const out = [];
        const add = (what, text, reply) => !used.has(k(t, what)) && out.push({ key: k(t, what), text, reply });
        add('goal', t.goal ? 'Which goal is this for?' : 'Link this to a goal', () => (t.goal ? replyGoalInfo(t) : replyGoal(t)));
        add('remind', remindChip(t), () => replyRemind(t));
        add('date', dateChip(t), () => replyDate(t));
        add('what', 'What exactly do I need to do?', () => replyWhat(t));
        // Everything tried: what it needs, again.
        if (!out.length) {
            used.delete(k(t, 'what'));
            return taskSuggestions(t);
        }
        return out;
    }
    function replyGoal(t) {
        const g = t.fit ?? 'a';
        return { mood: 'happy', text: `It moves “${GOALS[g]}” forward. Link it?`, op: { kind: 'goal', id: t.id, goal: g, title: `Link it to “${GOALS[g]}”` } };
    }
    function replyGoalInfo(t) {
        return { mood: 'happy', text: `It counts toward “${GOALS[t.goal]}”. Once it’s done, that goal is a step closer.` };
    }
    /** Minutes until it's due (or starts) today when that's within the hour of the demo clock, else null. */
    const soon = (t) => {
        const left = minutesLeft(t);
        return left !== null && left > 0 && left <= 60 ? left : null;
    };
    /** No deadline, or it's already past: tomorrow morning. */
    const later = (t) => !dueAt(t) || (minutesLeft(t) ?? 0) <= 0;
    const remindChip = (t) => later(t) ? 'Remind me tomorrow morning' : soon(t) ? (t.kind === 'Event' ? 'Remind me before it starts' : 'Remind me before it’s due') : 'Remind me an hour before';
    function replyRemind(t) {
        // An hour before, unless that's already past: then closer to it (the switch's own default), never a time gone by.
        const left = soon(t);
        const before = later(t) ? null : left ? defaultReminder(t).before : 60;
        const { when } = reminderText(t, { before });
        if (reminder(t)?.before === before)
            return { mood: 'happy', text: `It’s already set: I’ll nudge you ${spoken(when)}.` };
        const due = t.kind === 'Event' ? 'it starts' : 'it’s due';
        const op = { kind: 'remind', id: t.id, before, title: `Remind me ${spoken(when)}` };
        if (left) {
            const verb = t.kind === 'Event' ? 'It starts' : 'It’s due';
            const at = before ? `, so I’ll nudge you ${spoken(when)}` : `. I’ll nudge you when ${due}`;
            return { mood: 'focused', text: `${verb} in ${left} minutes${at}.`, op };
        }
        const lead = before ? `, an hour before ${due}` : '';
        return { mood: 'focused', text: `Sure. I’ll nudge you ${spoken(when)}${lead}.`, op };
    }
    function replyDate(t) {
        const tag = dateTag(t);
        const day = dayWord(tag);
        const asker = person(t.from);
        const op = { kind: 'date', id: t.id, tag, title: `Move it to ${day}${dueAt(t) || t.tag === 'No deadline' ? `, ${t.time}` : ''}` };
        if (t.kind === 'Event')
            return { mood: 'focused', text: `It’s a meeting, so the invite stays put. I’ll move it on your list to ${day}.`, op };
        if (asker?.tier === 1 && t.tag === 'Today')
            return { mood: 'focused', text: `${asker.name.split(' ')[0]} asked for it today, so a heads-up might help. I’ll move it to ${day}, same time.`, op };
        return { mood: 'happy', text: `Sure, ${day}${dueAt(t) ? ', same time' : ''}.`, op };
    }
    function replyWhat(t) {
        if (t.details?.length)
            return { mood: 'focused', text: `In short: ${sentence(t.details)}` };
        if (t.quote)
            return { mood: 'curious', text: `All I have is what was said: “${t.quote}”` };
        return { mood: 'curious', text: 'You added this one yourself, so all I know is its title.' };
    }
    // ---------- elsewhere: one question that fits the screen ----------
    function infoSuggestion(screen) {
        const key = `info:${screen === 'settings' ? 'people' : screen}`;
        if (screen === 'calendar')
            return { key, text: 'What’s on my calendar today?', reply: replyCalendar };
        if (screen === 'progress')
            return { key, text: 'How are my goals going?', reply: replyGoals };
        if (screen === 'settings' || screen === 'people')
            return { key, text: PERSONA.outrank.q, reply: () => ({ mood: 'focused', text: PERSONA.outrank.a }) };
        if (screen === 'connections')
            return { key, text: 'What do you read in my email?', reply: () => ({ mood: 'love', text: 'Only the asks meant for you, in new mail, events and Wispr notes. I keep the task, never the email.' }) };
        return null;
    }
    function replyCalendar() {
        const today = deck()
            .filter((t) => t.tag === 'Today')
            .sort((a, b) => minutes(a.time) - minutes(b.time));
        if (!today.length)
            return { mood: 'happy', text: 'Nothing else from your list today. Enjoy it.' };
        const [a] = today;
        return { mood: 'focused', text: `${today.length === 1 ? 'One thing' : `${today.length} things`} from your list today. First: “${a.title}” at ${a.time}.` };
    }
    function replyGoals() {
        const p = progress();
        const next = deck().find((t) => t.goal);
        const tip = next ? ` Finishing “${next.title}” moves “${GOALS[next.goal]}”.` : '';
        return { mood: 'happy', text: `“${GOALS.a}”: ${p.a[0]} of ${p.a[1]} done. “${GOALS.b}”: ${p.b[0]} of ${p.b[1]}.${tip}` };
    }
    /** The card a typed message names ("the client deck", "Q4 numbers"), if any. */
    function named(s) {
        let best;
        let score = 0;
        for (const t of deck()) {
            const words = (t.short ?? t.title).toLowerCase().split(/[^a-z0-9:]+/).filter((w) => w && w !== 'the' && (w.length > 2 || /\d/.test(w)));
            const n = words.filter((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(s)).length;
            if (n > score)
                [best, score] = [t, n];
        }
        return best;
    }
    /** Something typed: the suggestion it asks for, a hello or thanks, another question about the list, or off-topic. */
    function answer(text) {
        const s = text.toLowerCase();
        const ft = focusTask();
        if (ft) {
            const pick = (what, reply) => {
                used.add(k(ft, what));
                return reply;
            };
            if (REMIND.test(s))
                return pick('remind', () => replyRemind(ft));
            if (GOAL.test(s))
                return pick('goal', () => (ft.goal ? replyGoalInfo(ft) : replyGoal(ft)));
            if (DATE.test(s))
                return pick('date', () => replyDate(ft));
            if (WHAT.test(s))
                return pick('what', () => replyWhat(ft));
        }
        // On a task's screen, "this" is that task (when it's on the list).
        const t = named(s) ?? (ft && deck().includes(ft) ? ft : undefined);
        const { pin, notmine } = targets();
        if (NOT_MINE.test(s) && (t ?? notmine)) {
            used.add('notmine');
            const owner = PEOPLE.map((p) => p.name.split(' ')[0]).find((n) => new RegExp(`\\b${n.toLowerCase()}\\b`).test(s));
            const id = (t ?? notmine).id;
            return () => replyNotMine(id, owner);
        }
        if (PIN.test(s) && (t ?? pin)) {
            used.add('pin');
            const id = (t ?? pin).id;
            return () => replyPin(id);
        }
        if (FIRST.test(s)) {
            used.add('first');
            return replyFirst;
        }
        if (THANKS.test(s))
            return () => ({ mood: 'love', text: 'Anytime! And you approve every change I make.' });
        if (GREETING.test(s) && !TASKY.test(s))
            return () => ({ mood: 'love', text: 'Hi! I’m Vron. I rank your day and fix who owns what.' });
        if (TASKY.test(s) || t)
            return () => ({ mood: 'focused', text: 'Good one for the beta: there you can ask me anything about your day. Here, try a suggestion below.' });
        return () => ({ mood: 'curious', text: 'Hmm, I’m built for your tasks. Ask me what to do first, or who owns what.' });
    }
    function renderChips() {
        chipsEl.replaceChildren(...suggestions().map((s, k) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            b.style.setProperty('--k', String(k));
            b.textContent = s.text;
            b.addEventListener('click', () => {
                used.add(s.key);
                void exchange(s.text, s.reply);
            });
            return b;
        }));
    }
    // ---------- messages ----------
    const scroll = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    /** `node` leaves the layout at once, but a copy of it fades out where it was (Vron, meanwhile, moves on). */
    function fadeOut(node) {
        if (reduce || !node.offsetHeight)
            return;
        const ghost = node.cloneNode(true);
        ghost.removeAttribute('data-chat-chips');
        ghost.querySelector('[data-chat-hero]')?.removeAttribute('data-chat-hero');
        ghost.classList.add('ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.inert = true;
        Object.assign(ghost.style, { position: 'absolute', left: `${node.offsetLeft}px`, top: `${node.offsetTop}px`, width: `${node.offsetWidth}px`, margin: '0', pointerEvents: 'none' });
        msgs.append(ghost);
        ghost.animate([{ opacity: 1 }, { opacity: 0, transform: `translateY(${-node.offsetWidth / 45}px)` }], { duration: 220, easing: 'ease-out' }).finished.then(() => ghost.remove(), () => ghost.remove());
    }
    function add(node) {
        if (!empty.hidden) {
            fadeOut(empty);
            empty.hidden = true;
        }
        log.append(node);
        scroll();
        return node;
    }
    function mine(text) {
        const m = document.createElement('div');
        m.className = 'm me';
        const b = document.createElement('div');
        b.className = 'bub';
        b.textContent = text;
        m.append(b);
        add(m);
        return b;
    }
    /** One of Vron's rows: his gutter (he sits in the newest one) and the column for his bubble and proposal. */
    function vronRow(typing = false) {
        const row = document.createElement('div');
        row.className = typing ? 'm vr typing' : 'm vr';
        const slot = document.createElement('span');
        slot.className = 'av';
        slot.setAttribute('aria-hidden', 'true');
        const col = document.createElement('div');
        col.className = 'col';
        row.append(slot, col);
        return { row, slot, col };
    }
    function typing() {
        const r = vronRow(true);
        r.row.setAttribute('aria-hidden', 'true');
        const dots = document.createElement('div');
        dots.className = 'bub dots';
        dots.innerHTML = '<i></i><i></i><i></i>';
        r.col.append(dots);
        add(r.row);
        return r;
    }
    /**
     * His reply, word by word: every word is laid out from the start (the bubble has its full size, so nothing below
     * it or beside it jumps) and fades in on its own delay. Returns how long the reveal takes (0 under reduced motion).
     */
    function words(bub, text) {
        if (reduce) {
            bub.textContent = text;
            return 0;
        }
        const parts = text.split(/(\s+)/).filter(Boolean);
        const count = parts.filter((p) => !/^\s+$/.test(p)).length;
        const per = Math.min(WORD_MS, REVEAL_MAX / Math.max(1, count));
        let i = 0;
        for (const p of parts) {
            if (/^\s+$/.test(p)) {
                bub.append(p);
                continue;
            }
            const w = document.createElement('span');
            w.className = 'w';
            w.style.setProperty('--d', `${Math.round(i++ * per)}ms`);
            w.textContent = p;
            bub.append(w);
        }
        return Math.round((count - 1) * per) + WORD_FADE;
    }
    function opCard(col, op) {
        const card = document.createElement('div');
        card.className = 'op';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', 'Proposed change');
        card.innerHTML = `<div class="op-h">${tpl('logo')}<span data-op-state>Proposed change</span></div>
      <div class="op-l"><span class="op-c">${tpl('check')}</span><span></span></div>
      <div class="op-f"><button type="button" data-op-dismiss>Dismiss</button><button type="button" data-op-apply>Apply</button></div>`;
        card.querySelector('.op-l span:last-child').textContent = op.title;
        const state = card.querySelector('[data-op-state]');
        const foot = card.querySelector('.op-f');
        card.querySelector('[data-op-apply]').addEventListener('click', () => {
            if (!canApply(op)) {
                foot.innerHTML = '<span class="note">That task has already moved.</span>';
                vron.react('sad', 1300);
                return;
            }
            card.classList.add('applied');
            state.textContent = 'Applied';
            foot.innerHTML = `<span class="done">${tpl('check')}Applied</span>`;
            vron.applied();
            // A beat to see it land, then the sheet closes and the list changes.
            setTimeout(() => onApply(op), reduce ? 500 : 900);
        });
        card.querySelector('[data-op-dismiss]').addEventListener('click', () => {
            card.classList.add('dismissed');
            state.textContent = 'Dismissed';
            foot.innerHTML = '<span class="note">No changes made.</span>';
            vron.dismissed();
            (chipsEl.querySelector('.chip') ?? input).focus({ preventScroll: true });
        });
        col.append(card);
    }
    async function exchange(text, reply) {
        if (busy)
            return;
        busy = true;
        fadeOut(chipsEl);
        chipsEl.replaceChildren();
        sendBtn.disabled = true;
        // Your bubble, and the typing dots with Vron beside them (from the empty state he shrinks into place).
        vron.mark();
        const said = mine(text);
        const dots = typing();
        vron.think(dots.slot, said);
        await pause(THINK_MS);
        const r = reply() ?? { mood: 'happy', text: 'Your list is clear.' };
        // His reply takes the dots' place, and he moves along to sit beside it.
        const row = vronRow();
        const bub = document.createElement('div');
        bub.className = 'bub';
        const ms = words(bub, r.text);
        row.col.append(bub);
        vron.mark();
        dots.row.after(row.row);
        vron.follow(row.slot, () => dots.row.remove());
        scroll();
        if (ms) {
            vron.talk(true);
            await pause(ms);
        }
        vron.talk(false);
        vron.react(r.mood, REACT_MS);
        if (r.op) {
            await pause(reduce ? 0 : 160);
            vron.mark();
            opCard(row.col, r.op);
            vron.follow(row.slot);
            scroll();
        }
        await pause(220);
        renderChips();
        scroll(); // the next suggestions in view, under his reply
        busy = false;
        sendBtn.disabled = !input.value.trim();
        // Keyboard users land on the change to approve, or the next suggestion.
        if (!auto() && (el.contains(activeEl()) || activeEl() === document.body))
            (log.querySelector('.op:last-child [data-op-apply]') ?? chipsEl.querySelector('.chip') ?? input).focus({ preventScroll: true });
    }
    input.addEventListener('input', () => {
        sendBtn.disabled = busy || !input.value.trim();
        vron.typed(input.value);
    });
    input.addEventListener('blur', () => vron.blurred());
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || busy)
            return;
        input.value = '';
        void exchange(text, answer(text));
    });
    renderChips();
    return {
        /** The sheet opened from `f` (what's on screen): Vron comes in (he waves on an empty chat), the suggestions and
         *  the lines that say what he's looking at follow it. */
        opened(f = { screen: 'today' }) {
            focus = f;
            const t = focusTask();
            headSub.textContent = t ? `About “${t.title}”` : HEAD_SUB;
            emptySub.textContent = t ? 'Ask me to change its goal, reminder or date, or what it needs.' : EMPTY_SUB;
            input.placeholder = t ? 'Ask about this task…' : PLACEHOLDER;
            // Back in a conversation about something else: a quiet line says what it's about now.
            const now = t ? `task:${t.id}` : 'list';
            if (now !== about && log.childElementCount) {
                const line = document.createElement('p');
                line.className = 'm-about';
                line.textContent = t ? `About “${t.title}”` : 'About your list';
                log.append(line);
            }
            about = now;
            if (!busy)
                renderChips();
            vron.opened();
        },
        /** His live view goes once the sheet is out of sight. */
        closed() {
            vron.closed();
        },
        /** Where focus goes when the sheet opens. */
        firstFocus() {
            return chipsEl.querySelector('.chip') ?? input;
        },
    };
}
