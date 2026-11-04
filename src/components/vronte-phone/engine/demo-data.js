// Ported from Siddharth's Vronte repo (apps/web/src/lib/demo-data.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
/** Tier colors (apps/mobile/src/components/charts/theme.ts tierColor). */
export const TIER_COLORS = { 1: '#6c4cf5', 2: '#ffc83d', 3: '#c6dd8c', 4: '#8a8a8a' };
/** Twelve card colours, as in the app: open tasks don't share one until there are more than twelve. */
export const COLORS = ['violet', 'amber', 'lime', 'coral', 'sky', 'pink', 'mint', 'aqua', 'blue', 'lavender', 'orchid', 'sand'];
export const SOURCE_LABEL = { gmail: 'Gmail', google_calendar: 'Google Calendar', wispr: 'Wispr Flow', manual: 'Added by you' };
/** Short source name for the lime pill (the app's PROVIDER_LABEL). */
export const SOURCE_PILL = { gmail: 'Gmail', google_calendar: 'Calendar', wispr: 'Wispr', manual: 'Manual' };
// ---------- employee (the homepage): a manager, a team lead, peers ----------
const E_PEOPLE = [
    { id: 'sarah', name: 'Sarah Mitchell', email: 'sarah@acme.com', tier: 1 },
    { id: 'marco', name: 'Marco Rossi', email: 'marco@acme.com', tier: 2 },
    { id: 'emma', name: 'Emma Laurent', email: 'emma@acme.com', tier: 2 },
    { id: 'lena', name: 'Lena Fischer', email: 'lena@acme.com', tier: 3 },
    { id: 'jonas', name: 'Jonas Weber', email: 'jonas@acme.com', tier: 3 },
    { id: 'tom', name: 'Tom Becker', email: 'tom@acme.com', tier: 3 },
    { id: 'sam', name: 'Sam Carter', email: 'sam@acme.com', tier: 3 },
    { id: 'dana', name: 'Dana Cole', email: 'dana@northwind.io', tier: 4 },
    { id: 'oliver', name: 'Oliver Grant', email: 'oliver@acme.com', tier: 4 },
    { id: 'billing', name: 'Vendor billing', email: 'billing@vendor.io', tier: 4 },
];
const E_TASKS = [
    {
        id: 't1', short: 'the Q4 numbers', title: 'Send Q4 numbers to Sarah', meta: 'Today, 4 PM', src: 'gmail', color: 'violet', time: '4 PM', kind: 'Due', why: 'From Sarah (Manager) · due today', goal: 'a',
        from: 'sarah', due: 'due today', tag: 'Today', origin: 'Re: Q4 numbers', at: 'Today, 9:12 AM',
        quote: 'Can you get me the Q4 numbers before my 5 PM call?',
        details: ['Q4 revenue and costs, split by region', 'To Sarah before her 5 PM call', 'Reply on the “Re: Q4 numbers” thread'],
    },
    {
        id: 't2', short: 'the client deck', title: 'Review client deck draft', meta: 'Tomorrow, 11 AM', src: 'wispr', color: 'amber', time: '11 AM', kind: 'Due', why: 'From Sarah (Manager) · from standup', goal: 'a',
        from: 'sarah', due: 'due tomorrow', tag: 'Tomorrow', origin: 'Mon standup', at: 'Mon, 9:30 AM',
        quote: 'Alex, can you take a pass on the client deck draft before tomorrow at eleven?', cc: ['lena', 'marco'],
        details: ['Read the draft and comment in the deck', 'Check the pricing and timeline slides', 'Done before tomorrow, 11 AM'],
    },
    {
        id: 't3', short: 'the Acme client sync', title: 'Client sync: Acme rollout', meta: 'Today, 4:15 PM', src: 'google_calendar', color: 'lime', time: '4:15 PM', kind: 'Event', why: 'Walk through the rollout plan',
        from: 'marco', due: 'meeting at 4:15 PM', tag: 'Today', origin: 'Invite: Client sync', at: 'Today, 4:15 to 4:45 PM',
        quote: 'Walk through the rollout plan and open risks with the Acme team.', cc: ['dana'],
        details: ['Walk Acme through the rollout plan', 'Bring the open risks and who owns each', 'With Dana and Marco, 4:15 to 4:45 PM'], fit: 'a',
    },
    {
        id: 't4', short: 'the onboarding checklist', title: 'Draft onboarding checklist', meta: 'Wed, 12 PM', src: 'wispr', color: 'coral', time: '12 PM', kind: 'Due', why: 'From Sarah (Manager) · Mon standup', goal: 'b',
        from: 'sarah', due: 'due Wednesday', tag: 'Wed', origin: 'Mon standup', at: 'Mon, 9:30 AM',
        quote: 'Alex, can you draft the onboarding checklist for the new designers by Wednesday?', cc: ['lena', 'marco'],
        details: ['First-week checklist for the 2 new designers', 'Accounts, tools, intro meetings, first task', 'Share the draft with Sarah by Wednesday'],
    },
    {
        id: 't5', short: 'the vendor invoice', title: 'Reply to vendor invoice', meta: 'Thu, 12 PM', src: 'gmail', color: 'sky', time: '12 PM', kind: 'Due', why: 'From Lena (Peer) · due Thursday',
        from: 'lena', due: 'due Thursday', tag: 'Thu', origin: 'Fwd: Invoice #4471', at: 'Yesterday, 4:05 PM',
        quote: 'Could you reply to the vendor about this invoice? They need an answer by Thursday.', cc: ['billing'],
        details: ['Confirm or query invoice #4471', 'Check the amount against the signed quote', 'Reply to Vendor billing by Thursday'], fit: 'a',
    },
    {
        id: 't6', short: 'the hiring plan', title: 'Share the hiring plan', meta: 'Fri, 10 AM', src: 'gmail', color: 'pink', time: '10 AM', kind: 'Due', why: 'From Marco (Team lead)', goal: 'b',
        from: 'marco', due: 'due Friday', tag: 'Fri', origin: 'Hiring plan for Q1', at: 'Today, 8:20 AM',
        quote: 'Please share the hiring plan with me before Friday’s leads meeting.', cc: ['emma'],
        details: ['Q1 hiring plan: roles, levels, start dates', 'Send it to Marco, copy Emma', 'Before Friday’s leads meeting'],
    },
    {
        id: 't7', short: 'the design review room', title: 'Book room for design review', meta: 'Today, 6 PM', src: 'google_calendar', color: 'mint', time: '6 PM', kind: 'Event', why: 'Design review with the team',
        from: 'emma', due: 'meeting at 6 PM', tag: 'Today', origin: 'Invite: Design review', at: 'Today, 6 to 7 PM',
        quote: 'Alex, can you grab a room for the design review? We’ll be eight people.', cc: ['lena', 'jonas'],
        details: ['A room for 8 people, 6 to 7 PM today', 'With a screen for the slides', 'Add the room to Emma’s invite'], fit: 'a',
    },
    {
        id: 't8', short: 'the team wiki', title: 'Update the team wiki', meta: 'Sun, 5 PM', src: 'wispr', color: 'lavender', time: '5 PM', kind: 'Due', why: 'From Marco (Team lead) · retro',
        from: 'marco', due: 'due Sunday', tag: 'Sun', origin: 'Sprint retro', at: 'Fri, 4 PM',
        quote: 'Someone needs to update the team wiki. Alex, can you own it by Sunday?', cc: ['sam', 'jonas'],
        details: ['Add the retro’s decisions to the wiki', 'Update the on-call and release pages', 'By Sunday, 5 PM'], fit: 'b',
    },
    {
        id: 't9', short: 'the 1:1 agenda', title: 'Prep 1:1 agenda for Lena', meta: 'Tomorrow, 10 AM', src: 'google_calendar', color: 'sand', time: '10 AM', kind: 'Event', why: 'Career goals and next sprint',
        from: 'lena', due: 'meeting tomorrow at 10 AM', tag: 'Tomorrow', origin: 'Invite: 1:1 Alex / Lena', at: 'Tomorrow, 10 to 10:30 AM',
        quote: 'Let’s talk about career goals and next sprint’s scope.',
        details: ['Agenda for tomorrow’s 10 AM 1:1 with Lena', 'Her career goals, next sprint’s scope', 'Put it in the invite notes'], fit: 'b',
    },
    {
        id: 't10', short: 'the market research', title: 'Read market research', meta: 'No deadline', src: 'gmail', color: 'aqua', time: '9 AM', kind: 'Due', why: 'From Sam (Peer) · FYI',
        from: 'sam', due: 'no deadline', tag: 'No deadline', origin: 'FYI: market research', at: 'Mon, 11:40 AM',
        quote: 'No rush, but give the market research summary a read when you can.',
        details: ['Read Sam’s market research summary', 'Note anything for the client deck'], fit: 'a',
    },
];
const E_UP_NEXT = [
    {
        id: 'u1', short: 'the hiring brief', title: 'Approve design hiring brief', meta: 'Today, 6 PM', reason: 'From Marco (Team lead) · due today', src: 'gmail', color: 'blue', time: '6 PM', kind: 'Due', why: 'From Marco (Team lead) · due today', goal: 'b',
        from: 'marco', due: 'due today', tag: 'Today', origin: 'Design hiring brief v2', at: 'Today, 8:40 AM',
        quote: 'Can you approve the hiring brief today so we can post the roles tomorrow?', cc: ['emma'],
        details: ['Approve hiring brief v2, or send changes', 'So Emma can post the roles tomorrow', 'By 6 PM today'],
    },
    {
        id: 'u2', short: 'the security answers', title: 'Send Acme the security answers', meta: 'Tomorrow, 10 AM', reason: 'From Dana (Everyone else) · due tomorrow', src: 'gmail', color: 'orchid', time: '10 AM', kind: 'Due', why: 'From Dana · due tomorrow',
        from: 'dana', due: 'due tomorrow', tag: 'Tomorrow', origin: 'Security questionnaire', at: 'Yesterday, 6:15 PM',
        quote: 'Could you send over the answers to our security questions by tomorrow morning?',
        details: ['Answer Acme’s security questionnaire', 'Data storage, access and retention', 'Send it to Dana by tomorrow, 10 AM'], fit: 'a',
    },
    {
        id: 'u3', short: 'the sprint notes', title: 'Share sprint notes with the team', meta: 'Fri, 4 PM', reason: 'From Lena (Peer) · due Friday', src: 'wispr', color: 'sky', time: '4 PM', kind: 'Due', why: 'From Lena (Peer) · due Friday',
        from: 'lena', due: 'due Friday', tag: 'Fri', origin: 'Sprint planning', at: 'Mon, 2 PM',
        quote: 'Alex, could you share the sprint notes with the team by Friday?', cc: ['sam', 'jonas'],
        details: ['Tidy up the sprint planning notes', 'Post them in the team channel', 'By Friday, 4 PM'], fit: 'a',
    },
];
const E_SYNC = {
    id: 'sync', short: 'the Q4 budget', title: 'Sign off the Q4 budget', meta: 'Today, 4:30 PM', src: 'gmail', color: 'coral', time: '4:30 PM', kind: 'Due', why: 'From Sarah (Manager) · due 4:30 PM', goal: 'a',
    from: 'sarah', due: 'due today at 4:30 PM', tag: 'Today', origin: 'Q4 budget: final', at: 'Just now',
    quote: 'Need your sign-off on the Q4 budget before I send it to finance at 4:30.', cc: ['oliver'],
    details: ['Approve the final Q4 budget, or flag changes', 'Sarah sends it to finance at 4:30 PM', 'Reply on “Q4 budget: final”'],
};
const E_WEEK = [
    { time: '9 AM', kind: 'Event', title: 'Weekly planning', why: 'Team · 30 min', color: 'sky' },
    { time: '10 AM', kind: 'Due', title: 'Share the hiring plan', why: 'From Marco (Team lead)', color: 'pink' },
    { time: '11:30 AM', kind: 'Event', title: 'Design crit', why: 'Review onboarding flows', color: 'lime' },
    { time: '1 PM', kind: 'Due', title: 'Draft onboarding checklist', why: 'From Sarah (Manager)', color: 'coral' },
    { time: '2 PM', kind: 'Event', title: 'Acme weekly', why: 'Rollout status and risks', color: 'amber' },
    { time: '3 PM', kind: 'Due', title: 'Reply to vendor invoice', why: 'From Lena (Peer)', color: 'sky' },
    { time: '4:30 PM', kind: 'Event', title: '1:1 with Sarah', why: 'Q4 priorities', color: 'violet' },
    { time: '5 PM', kind: 'Due', title: 'Update the team wiki', why: 'From Marco (Team lead)', color: 'amber' },
];
const E_TODAY = [
    { time: '9:30 AM', kind: 'Event', title: 'Team standup', why: 'Daily · 15 min', color: 'sky' },
    { time: '11 AM', kind: 'Event', title: 'Design crit', why: 'Onboarding flows · 45 min', color: 'coral' },
];
// ---------- freelancer (/freelancers): clients by tier, Ongoing > Current project > Leads ----------
const F_PEOPLE = [
    { id: 'acme', name: 'Acme', email: '@acme.com', tier: 1 },
    { id: 'northwind', name: 'Northwind', email: '@northwind.io', tier: 1 },
    { id: 'brightline', name: 'Brightline', email: '@brightline.co', tier: 2 },
    { id: 'lumen', name: 'Lumen Studio', email: '@lumen.studio', tier: 2 },
    { id: 'kestrel', name: 'Kestrel', email: '@kestrel.app', tier: 3 },
    { id: 'harbor', name: 'Harbor & Co', email: '@harbor.co', tier: 3 },
    { id: 'tom', name: 'Tom Becker', email: 'tom@beckertax.com', tier: 4 },
    { id: 'billing', name: 'Vendor billing', email: 'billing@vendor.io', tier: 4 },
];
const F_TASKS = [
    {
        id: 't1', short: 'the Acme homepage', title: 'Send Acme the homepage', meta: 'Today, 4 PM', src: 'gmail', color: 'violet', time: '4 PM', kind: 'Due', why: 'From Acme (Ongoing) · due today', goal: 'a',
        from: 'acme', due: 'due today', tag: 'Today', origin: 'Re: Homepage v2', at: 'Today, 9:12 AM',
        quote: 'Can you send the revised homepage before my 5 PM call with the board?',
        details: ['Homepage v2, desktop and mobile', 'To Dana at Acme before her 5 PM call', 'Reply on the “Re: Homepage v2” thread'],
    },
    {
        id: 't2', short: 'the Northwind proposal', title: 'Review Northwind proposal', meta: 'Tomorrow, 11 AM', src: 'wispr', color: 'amber', time: '11 AM', kind: 'Due', why: 'From Northwind (Ongoing) · from the call', goal: 'a',
        from: 'northwind', due: 'due tomorrow', tag: 'Tomorrow', origin: 'Northwind call', at: 'Mon, 9:30 AM',
        quote: 'Alex, could you look over the proposal draft before tomorrow at eleven?',
        details: ['Read the draft and mark what to change', 'Check scope, timeline and price', 'Done before tomorrow, 11 AM'],
    },
    {
        id: 't3', short: 'the Brightline call', title: 'Brightline launch call', meta: 'Today, 4:15 PM', src: 'google_calendar', color: 'lime', time: '4:15 PM', kind: 'Event', why: 'Walk through the launch plan',
        from: 'brightline', due: 'meeting at 4:15 PM', tag: 'Today', origin: 'Invite: Brightline launch', at: 'Today, 4:15 to 4:45 PM',
        quote: 'Walk through the launch plan and what’s still open.',
        details: ['Walk Brightline through the launch plan', 'Bring the open questions and who owns each', 'With Emma and Jonas, 4:15 to 4:45 PM'], fit: 'a',
    },
    {
        id: 't4', short: 'the Lumen style guide', title: 'Draft Lumen style guide', meta: 'Wed, 12 PM', src: 'wispr', color: 'coral', time: '12 PM', kind: 'Due', why: 'From Lumen (Current project) · call notes', goal: 'a',
        from: 'lumen', due: 'due Wednesday', tag: 'Wed', origin: 'Lumen check-in', at: 'Mon, 9:30 AM',
        quote: 'Alex, can you draft the style guide for the new site by Wednesday?',
        details: ['Colours, type and buttons for the new site', 'One page their developers can follow', 'Send the draft to Lumen by Wednesday'],
    },
    {
        id: 't5', short: 'the Kestrel quote', title: 'Send Kestrel a quote', meta: 'Thu, 12 PM', src: 'gmail', color: 'sky', time: '12 PM', kind: 'Due', why: 'From Kestrel (Lead) · due Thursday',
        from: 'kestrel', due: 'due Thursday', tag: 'Thu', origin: 'Re: App redesign', at: 'Yesterday, 4:05 PM',
        quote: 'Could you send us a rough quote for the app redesign by Thursday?',
        details: ['Rough quote for the app redesign', 'Scope, timeline and a price range', 'Reply to Sam at Kestrel by Thursday'], fit: 'b',
    },
    {
        id: 't6', short: 'the case studies', title: 'Send Harbor case studies', meta: 'Fri, 10 AM', src: 'gmail', color: 'pink', time: '10 AM', kind: 'Due', why: 'From Harbor & Co (Lead)', goal: 'b',
        from: 'harbor', due: 'due Friday', tag: 'Fri', origin: 'Intro: Harbor & Co', at: 'Today, 8:20 AM',
        quote: 'Please share a few case studies before our call on Friday.',
        details: ['Three case studies close to their product', 'Send them to Lena at Harbor & Co', 'Before Friday’s call'],
    },
    {
        id: 't7', short: 'the Lumen moodboards', title: 'Present Lumen moodboards', meta: 'Today, 6 PM', src: 'google_calendar', color: 'mint', time: '6 PM', kind: 'Event', why: 'Moodboard review with Lumen',
        from: 'lumen', due: 'meeting at 6 PM', tag: 'Today', origin: 'Invite: Moodboard review', at: 'Today, 6 to 7 PM',
        quote: 'Let’s go through the moodboards together and pick a direction.',
        details: ['Show the three moodboards', 'Agree one direction for the style guide', 'With Emma, 6 to 7 PM'], fit: 'a',
    },
    {
        id: 't8', short: 'the Brightline handoff', title: 'Write Brightline handoff', meta: 'Sun, 5 PM', src: 'wispr', color: 'lavender', time: '5 PM', kind: 'Due', why: 'From Brightline (Current project) · call',
        from: 'brightline', due: 'due Sunday', tag: 'Sun', origin: 'Brightline call', at: 'Fri, 4 PM',
        quote: 'Can you write up the handoff notes for our developers by Sunday?',
        details: ['Handoff notes for their developers', 'Specs, assets and open questions', 'By Sunday, 5 PM'], fit: 'a',
    },
    {
        id: 't9', short: 'the Kestrel intro', title: 'Prep Kestrel intro call', meta: 'Tomorrow, 10 AM', src: 'google_calendar', color: 'sand', time: '10 AM', kind: 'Event', why: 'Their app and timeline',
        from: 'kestrel', due: 'meeting tomorrow at 10 AM', tag: 'Tomorrow', origin: 'Invite: Intro call', at: 'Tomorrow, 10 to 10:30 AM',
        quote: 'Keen to hear how you’d approach our app redesign.',
        details: ['Questions about their app and users', 'Two similar projects to show', 'Call tomorrow at 10 AM'], fit: 'b',
    },
    {
        id: 't10', short: 'the Lumen research', title: 'Read Lumen user research', meta: 'No deadline', src: 'gmail', color: 'aqua', time: '9 AM', kind: 'Due', why: 'From Lumen (Current project) · FYI',
        from: 'lumen', due: 'no deadline', tag: 'No deadline', origin: 'FYI: user interviews', at: 'Mon, 11:40 AM',
        quote: 'No rush, but the interview notes might help with the style guide.',
        details: ['Read the user interview notes', 'Note anything for the style guide'], fit: 'a',
    },
];
const F_UP_NEXT = [
    {
        id: 'u1', short: 'the Brightline copy', title: 'Approve Brightline copy', meta: 'Today, 6 PM', reason: 'From Brightline (Current project) · due today', src: 'gmail', color: 'blue', time: '6 PM', kind: 'Due', why: 'From Brightline (Current project) · due today', goal: 'a',
        from: 'brightline', due: 'due today', tag: 'Today', origin: 'Launch copy v2', at: 'Today, 8:40 AM',
        quote: 'Can you approve the launch copy today so we can publish tomorrow?',
        details: ['Approve launch copy v2, or send changes', 'So Brightline can publish tomorrow', 'By 6 PM today'],
    },
    {
        id: 'u2', short: 'the Q3 invoices', title: 'Send Tom the Q3 invoices', meta: 'Tomorrow, 10 AM', reason: 'From Tom (Everyone else) · due tomorrow', src: 'gmail', color: 'orchid', time: '10 AM', kind: 'Due', why: 'From Tom · due tomorrow',
        from: 'tom', due: 'due tomorrow', tag: 'Tomorrow', origin: 'Q3 bookkeeping', at: 'Yesterday, 6:15 PM',
        quote: 'Could you send me your Q3 invoices by tomorrow morning?',
        details: ['Every Q3 client invoice, as PDFs', 'Plus receipts over $100', 'Send them to Tom by tomorrow, 10 AM'],
    },
    {
        id: 'u3', short: 'the call notes', title: 'Send Harbor a call recap', meta: 'Fri, 4 PM', reason: 'From Harbor & Co (Lead) · due Friday', src: 'wispr', color: 'sky', time: '4 PM', kind: 'Due', why: 'From Harbor & Co (Lead) · due Friday',
        from: 'harbor', due: 'due Friday', tag: 'Fri', origin: 'Harbor & Co call', at: 'Mon, 2 PM',
        quote: 'Could you send a short recap of what we discussed by Friday?',
        details: ['A short recap of the call', 'Next steps and a rough timeline', 'By Friday, 4 PM'], fit: 'b',
    },
];
const F_SYNC = {
    id: 'sync', short: 'the launch date', title: 'Confirm Acme’s launch date', meta: 'Today, 4:30 PM', src: 'gmail', color: 'coral', time: '4:30 PM', kind: 'Due', why: 'From Acme (Ongoing) · due 4:30 PM', goal: 'a',
    from: 'acme', due: 'due today at 4:30 PM', tag: 'Today', origin: 'Launch date: final', at: 'Just now',
    quote: 'Can you confirm the launch date before I tell our board at 4:30?',
    details: ['Confirm the launch date, or flag a risk', 'Dana tells Acme’s board at 4:30 PM', 'Reply on “Launch date: final”'],
};
const F_WEEK = [
    { time: '9 AM', kind: 'Event', title: 'Plan the week', why: 'Just you · 30 min', color: 'sky' },
    { time: '10 AM', kind: 'Due', title: 'Send Harbor case studies', why: 'From Harbor & Co (Lead)', color: 'pink' },
    { time: '11:30 AM', kind: 'Event', title: 'Acme design review', why: 'Homepage and checkout', color: 'lime' },
    { time: '1 PM', kind: 'Due', title: 'Draft Lumen style guide', why: 'From Lumen (Current project)', color: 'coral' },
    { time: '2 PM', kind: 'Event', title: 'Northwind check-in', why: 'Proposal and next phase', color: 'amber' },
    { time: '3 PM', kind: 'Due', title: 'Send Kestrel a quote', why: 'From Kestrel (Lead)', color: 'sky' },
    { time: '4:30 PM', kind: 'Event', title: 'Brightline launch sync', why: 'Copy and assets', color: 'violet' },
    { time: '5 PM', kind: 'Due', title: 'Write Brightline handoff', why: 'From Brightline (Current project)', color: 'amber' },
];
const F_TODAY = [
    { time: '9:30 AM', kind: 'Event', title: 'Acme weekly', why: 'Weekly · 15 min', color: 'sky' },
    { time: '11 AM', kind: 'Event', title: 'Portfolio review', why: 'Just you · 45 min', color: 'coral' },
];
/** The demo's ranked list: #1-#3, then what used to be the black card's first task (#4), the rest, its others last. */
const ranked = (tasks, more) => [...tasks.slice(0, 3), more[0], ...tasks.slice(3), ...more.slice(1)];
export const PERSONAS = {
    employee: {
        id: 'employee',
        // TIER_PRESETS.manager (= DEFAULT_TIER_LABELS); DemoPhone.astro checks it against packages/core at build time.
        tierLabels: { 1: 'Manager', 2: 'Team lead', 3: 'Peers', 4: 'Everyone else' },
        tierOne: { 1: 'Manager', 2: 'Team lead', 3: 'Peer', 4: 'Everyone else' },
        tierShort: ['Manager', 'Lead', 'Peers'],
        people: E_PEOPLE,
        goals: { a: 'Ship Q4 client deck', b: 'Hire 2 designers' },
        goalsShort: { a: 'Ship Q4 deck', b: 'Hire 2 designers' },
        tasks: ranked(E_TASKS, E_UP_NEXT),
        sync: E_SYNC,
        week: E_WEEK,
        today: E_TODAY,
        autoTitles: ['Book flights for the offsite', 'Send Acme the rollout notes', 'Order a new laptop for Lena'],
        email: 'alex@acme.com',
        peopleTitle: 'People & tiers',
        peopleCount: `${E_PEOPLE.length} people in 4 tiers`,
        peopleSub: 'Tasks are ranked by who asked. A manager’s ask always beats a peer’s.',
        outrank: { q: 'Why does Sarah outrank Lena?', a: 'Sarah is your Manager, Lena a Peer. A manager’s ask comes first, and you decide who’s in each tier.' },
    },
    freelancer: {
        id: 'freelancer',
        // TIER_PRESETS.clients; DemoPhone.astro checks it against packages/core at build time.
        tierLabels: { 1: 'Ongoing', 2: 'Current project', 3: 'Leads', 4: 'Everyone else' },
        tierOne: { 1: 'Ongoing', 2: 'Current project', 3: 'Lead', 4: 'Everyone else' },
        tierShort: ['Ongoing', 'Current', 'Leads'],
        people: F_PEOPLE,
        goals: { a: 'Finish 3 client projects', b: 'Win 2 new clients' },
        goalsShort: { a: 'Finish 3 projects', b: 'Win 2 clients' },
        tasks: ranked(F_TASKS, F_UP_NEXT),
        sync: F_SYNC,
        week: F_WEEK,
        today: F_TODAY,
        autoTitles: ['Invoice Lumen for October', 'Book flights for Acme workshop', 'Update my portfolio site'],
        email: 'alex@morgan.studio',
        peopleTitle: 'People & clients',
        peopleCount: `${F_PEOPLE.length} clients and people in 4 tiers`,
        peopleSub: 'Tasks are ranked by who asked. An ongoing client comes before a lead.',
        outrank: { q: 'Why does Acme outrank Kestrel?', a: 'Acme is an ongoing client, Kestrel a lead. Ongoing work comes first, and you decide who’s in each tier.' },
    },
};
// ---------- the active persona (live bindings) ----------
export let PERSONA = PERSONAS.employee;
export let PEOPLE = PERSONA.people;
export let TIER_LABELS = PERSONA.tierLabels;
export let TIER_ONE = PERSONA.tierOne;
export let GOALS = PERSONA.goals;
export let TASKS = PERSONA.tasks;
/** Today shows four: the hero and three colored cards. */
export const DECK_SIZE = 4;
export let DECK_START = TASKS.slice(0, DECK_SIZE);
export let SYNC_TASK = PERSONA.sync;
export let WEEK_ITEMS = PERSONA.week;
export let TODAY_EVENTS = PERSONA.today;
/** Points every binding above at `id`'s data (unknown ids fall back to the employee). */
export function usePersona(id) {
    PERSONA = PERSONAS[id] ?? PERSONAS.employee;
    PEOPLE = PERSONA.people;
    TIER_LABELS = PERSONA.tierLabels;
    TIER_ONE = PERSONA.tierOne;
    GOALS = PERSONA.goals;
    TASKS = PERSONA.tasks;
    DECK_START = TASKS.slice(0, DECK_SIZE);
    SYNC_TASK = PERSONA.sync;
    WEEK_ITEMS = PERSONA.week;
    TODAY_EVENTS = PERSONA.today;
    return PERSONA;
}
export const person = (id) => PEOPLE.find((p) => p.id === id);
/** How a sentence names them: "Sarah", or a client company: "Acme". */
export const callName = (p) => p.name.split(' ')[0];
/**
 * Something urgent, that Vron guards (docs/briefs/19-vron-will.md). The app's rule: the #1 task on Today is overdue,
 * due within 2 hours, or asked by a tier-1 person today. Here: a tier-1 task due today, when it's #1 (demo.ts guard):
 * "Send Q4 numbers to Sarah" (or Acme's homepage) until it's done, and the one a refresh brings in.
 */
export const isUrgent = (t) => person(t.from)?.tier === 1 && t.tag === 'Today';
/** "Sarah Mitchell" → "SM", "Acme" → "AC" (apps/mobile AvatarStack initials). */
export function initials(name) {
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    if (parts.length === 1)
        return parts[0].slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
/** Avatar fill: in the demo a person wears their tier's color, so who-outranks-whom reads at a glance
 *  (Everyone else gets a light grey). Text is white on violet, ink otherwise. */
export function avatarColors(name, people = PEOPLE) {
    const p = people.find((x) => x.name === name);
    const bg = !p ? '#c6dd8c' : p.tier === 4 ? '#dedede' : TIER_COLORS[p.tier];
    return { bg, fg: bg === TIER_COLORS[1] ? '#fff' : '#111' };
}
// ---------- times, due dates and reminders ----------
/** The demo's clock (the status bar reads 3:41 when the page opens): a 4 PM deadline is close and the 4:15 PM meeting
 *  is inside the hour ("In 34 min"). It moves on a minute for every minute the page stays open (tickDemoClock). */
export let DEMO_NOW = 15 * 60 + 41;
export function tickDemoClock(by = 1) {
    DEMO_NOW += by;
}
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const LONG_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
/** "4 PM" / "3:30 PM" → minutes after midnight (0 if it doesn't parse). */
export function minutes(t) {
    const m = /^(\d+)(?::(\d+))?\s*(AM|PM)$/.exec(t);
    if (!m)
        return 0;
    let h = Number(m[1]) % 12;
    if (m[3] === 'PM')
        h += 12;
    return h * 60 + Number(m[2] ?? 0);
}
/** Minutes after midnight → "3 PM" / "3:30 PM". */
export function clock(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
/** When a task is due (or its meeting starts): its day pill and time, or null without a deadline. */
export function dueAt(t) {
    if (t.src === 'manual' || !(t.tag === 'Today' || t.tag === 'Tomorrow' || t.tag in LONG_DAY))
        return null;
    return { tag: t.tag, min: minutes(t.time) };
}
/** Minutes from the demo clock to when it's due (Infinity for a later day), or null without a deadline. */
export function minutesLeft(t) {
    const d = dueAt(t);
    if (!d)
        return null;
    return d.tag === 'Today' ? d.min - DEMO_NOW : Infinity;
}
/** The switch's default, as in the app: 30 minutes before the due time (closer when that's already past: 10 minutes
 *  before, or when it's due), else tomorrow at 9 AM. */
export function defaultReminder(t) {
    const left = minutesLeft(t);
    if (left === null || left <= 0)
        return { before: null };
    return { before: left > 30 ? 30 : left > 10 ? 10 : 0 };
}
/** "Today, 3:30 PM" and "30 min before" (no note for tomorrow morning). */
export function reminderText(t, r) {
    const d = dueAt(t);
    if (r.before === null || !d)
        return { when: 'Tomorrow, 9 AM', note: '' };
    const note = r.before === 0 ? 'when it’s due' : r.before >= 60 ? `${r.before / 60} hour${r.before > 60 ? 's' : ''} before` : `${r.before} min before`;
    return { when: `${d.tag}, ${clock(d.min - r.before)}`, note };
}
/** The new day pill when a task moves one day on: Today → Tomorrow, Tomorrow → the day after, anything else → Tomorrow. */
export function nextTag(tag, todayIdx) {
    if (tag === 'Tomorrow')
        return DAY_NAMES[(todayIdx + 2) % 7];
    return 'Tomorrow';
}
/** Moves a task to `tag` (same time): its pill, card meta and the reason line's end. */
export function reschedule(t, tag) {
    const day = tag === 'Tomorrow' ? 'tomorrow' : (LONG_DAY[tag] ?? tag);
    t.tag = tag;
    t.meta = `${tag}, ${t.time}`;
    t.due = t.kind === 'Event' ? `meeting ${tag === 'Tomorrow' ? 'tomorrow' : `on ${day}`} at ${t.time}` : `due ${day}`;
    // The calendar line says when it's due too (the hero's big line is computed: `heroReason`).
    const was = /\bdue (today|tomorrow|\w+day)( at noon)?/;
    t.why = t.why.replace(was, `due ${day}`);
    const u = t;
    if (u.reason)
        u.reason = u.reason.replace(was, `due ${day}`);
}
// ---------- Today's hero ("Do this first") and the meeting line (brief 23) ----------
/** The hero's reason, the line under its big title (WHY; the label above has the time): "From Sarah (Manager) · due
 *  today", "From Acme (Ongoing) · due today", "From Marco (Team lead) · meeting today". */
export function heroReason(t) {
    const p = person(t.from);
    const who = p ? `From ${callName(p)} (${TIER_ONE[p.tier]})` : 'Added by you';
    if (t.tag === 'No deadline' || !dueAt(t))
        return `${who} · no deadline`;
    const day = t.tag === 'Today' ? 'today' : t.tag === 'Tomorrow' ? 'tomorrow' : LONG_DAY[t.tag] ? `on ${LONG_DAY[t.tag]}` : t.tag.toLowerCase();
    return t.kind === 'Event' ? `${who} · meeting ${day}` : `${who} · due ${day.replace(/^on /, '')}`;
}
/**
 * A meeting today that starts within the next 60 minutes reads "In 34 min" (whole minutes, "In 1 min" at the end)
 * wherever it shows: its card, the hero, its task screen (brief 24). Once it has started, "Now · started 4:15 PM"
 * for half an hour (the app's hero takeover, which the demo doesn't stage). Null otherwise.
 */
export function startsIn(t, now = DEMO_NOW) {
    if (t.kind !== 'Event' || t.tag !== 'Today')
        return null;
    const n = minutes(t.time) - now;
    if (n > 0 && n <= 60)
        return `In ${n} min`;
    if (n <= 0 && n > -30)
        return `Now · started ${t.time}`;
    return null;
}
/** When a card says it is: "In 34 min" for a meeting inside the hour, else its meta ("Today, 4 PM"). */
export const whenText = (t, now = DEMO_NOW) => startsIn(t, now) ?? t.meta;
