// Ported from Siddharth's Vronte repo (apps/web/src/components/demo/vron-lazy.ts), transpiled from TypeScript to JS.
// Changes for the portfolio: runs inside a shadow root (focus checks use activeEl()), sprite Vron only (no three.js).
// Everything the sprite Vrons need at runtime, in one chunk that loads only when a Vron is about to show (the frames
// are fetched by the player then too). Imported with import('./vron-lazy.js') so the hero's first paint stays light.
export { VronPlayer, STAGE } from './player.js';
