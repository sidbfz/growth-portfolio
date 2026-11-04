# Expression sounds

Short internet-meme sound effects that play when a visitor taps or clicks the sticker head and it
pulls a face. They play on the tap only, never for the faces the head makes by itself while idle.
The `surprised` cue also plays once each time the hero's face turns surprised as the visitor
scrolls (the peel-off). The code is in `src/lib/sound-expr.js` (`sfxExpr(name)`), called from
`src/components/FaceTracker.jsx` and `src/App.jsx`.

They are all non-verbal sounds: game and system sounds, stings, a few notes of a TV theme, and
vocal bursts like "huh?" and a choir's "aaah". None of them contains spoken words.

All files are mono MP3s (44.1 kHz, 96 kbps), each 0.47 s to 1.33 s long. Each one is trimmed to
the recognisable part, faded in over 5 ms and out over 80 to 350 ms, and loudness-matched to about
-19.5 LUFS max momentary, with true peaks at -6 dBFS or lower. The full set is about 115 KB. The
page fetches the files only after the visitor turns sound on with the header button. They play
through the site's shared sound bus, so turning sound off mutes them too.

| Expression | File | Sound | Origin | Source (myinstants.com) |
|---|---|---|---|---|
| smile | `smile.mp3` | Mario coin: the bright two-note "ba-ding" (0.99 s) | Nintendo, *Super Mario Bros.* (1985) | `/media/sounds/mario_coin_sound.mp3` ("Mario Coin Sound") |
| laugh | `laugh.mp3` | Clash Royale laugh: the King emote's "he-he-he-haw" (0.99 s) | Supercell, *Clash Royale* (2016) emote | `/media/sounds/clash-royale-laugh.mp3` |
| wink | `wink.mp3` | The Rizz sound: the low, smooth "rizz" sting (1.28 s) | TikTok/Reels "rizz" meme sound, 2023 | `/media/sounds/rizz-sound-effect.mp3` ("Rizz Sound Effect") |
| wink (take 2) | `wink-2.mp3` | Anime wink "ting": a bright ding (0.89 s) | The stock anime wink sound effect | `/media/sounds/3-wink-ding.mp3` |
| happy-surprise | `happy-surprise.mp3` | Heavenly choir: a swelling angelic "aaah" (1.31 s) | The stock "angel choir" meme sting, used for a moment of revelation; original recording unknown | `/media/sounds/angel-choirrr.mp3` ("Angel Choirrr") |
| thinking | `thinking.mp3` | Jeopardy! thinking music: the opening four notes, sped up (1.33 s) | "Think!" by Merv Griffin, the *Jeopardy!* Final Jeopardy music (1964) | `/media/sounds/jeopardy-final-jeopardy-thinking-music.mp3` |
| confused | `confused.mp3` | Huh cat: a short "huh?" (0.47 s) | The 2023 Huh cat meme | `/media/sounds/huh-cat-short.mp3` |
| confused (take 2) | `confused-2.mp3` | Windows XP error chord (0.89 s) | Microsoft Windows XP system sound (2001) | `/media/sounds/windows-error-sound_9PcNR0C.mp3` |
| surprised | `surprised.mp3` | Vine boom: a deep, echoing thud (1.20 s) | The 2014 Vine meme | `/media/sounds/vine-boom.mp3` ("Vine Boom Sound") |

Where an expression has two takes, they alternate.

## Sources and rights

The clips were downloaded from myinstants.com, a site of user-uploaded sound buttons (the paths
above are under `https://www.myinstants.com`), then trimmed and processed for this site. The
uploaders are anonymous, so the uploads themselves say nothing reliable about who owns them.

These are copyrighted clips. They come from video games (*Super Mario Bros.*, *Clash Royale*), a TV
theme (*Jeopardy!*), an operating system (Windows XP), and social-media uploads whose original
recordings are unknown. None of them is licensed for this site. They are used here as very short,
transformed excerpts on a personal, non-commercial portfolio, in the way meme sounds are shared
online. This is not a licence. If a rights holder objects, or the site becomes commercial,
replace the clip.

Earlier picks that are no longer used: the anime sparkle (smile), the Alien sound from
*Annihilation* (happy-surprise), the Roblox "hmm" (thinking), Fahh (surprised), and the cartoon
blips (Kenney, CC0).

## Using your own recordings

You can swap in your own sounds:

1. Record or find one short take per expression. Under 1.3 s works best, because an expression
   stays up for 1.1 s. Leave almost no silence before the sound, because it plays the moment the
   face changes.
2. Save it as `<expression>.mp3` in this folder, using the image's name: `smile`, `laugh`, `wink`,
   `happy-surprise`, `thinking`, `confused` or `surprised`. A second take can go in
   `<expression>-2.mp3`. The two takes alternate.
3. Mono at 96 kbps is plenty. Match the loudness of the files already here: about -19.5 LUFS max
   momentary, with peaks below -1.5 dBFS. For example:
   `ffmpeg -i take.wav -ac 1 -af "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-19:TP=-1.5" -b:a 96k wink.mp3`
4. If you add or remove a take, update the `FILES` list at the top of `src/lib/sound-expr.js`.
   To set the overall level of all the cues, change `LEVEL` in the same file.
