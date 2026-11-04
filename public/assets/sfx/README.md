# Sound effects: sources and licences

The paper and sticker sounds the site plays (src/lib/sound.js, src/lib/sound-samples.js). Every
file is built from real recordings released under **CC0 1.0** (public domain dedication: free for
any use, commercial included, no attribution required). We credit the recordists anyway.
(`expr/` holds the face's expression cues; it has its own README.)

| File | What it is | Made from |
| --- | --- | --- |
| `tear.mp3` (2.8 s) | One continuous paper rip, scrubbed in grains as the page tears on scroll | BigSoundBank #0018, #3239, #3241, #3244 |
| `peel.mp3` (3.6 s) | A sticker's adhesive letting go: fine crackle in short release fronts, scrubbed for the sticker peels (intro lid, face peel-off) | BigSoundBank #0299, #0298 (texture), shaped and partly synthesised by us (see below) |
| `flip.mp3` (sprite, 6) | Page turns: 3 book pages, then 3 notepad pages | BigSoundBank #0493, #1413; Starninjas "10 Book Page Flips" (#4, #7, #10) |
| `pop.mp3` (sprite, 4) | Mouth "bubble" pops as the objects rise out of the head | BigSoundBank #1074 |
| `whoosh.mp3` | The peeled lid thrown off | BigSoundBank #1796 (rope) layered with #1802 (wooden sheet) |

## Sources

All BigSoundBank sounds are by **Joseph Sardin** (BigSoundBank.com / LaSonotheque.org), licence
**CC0 1.0** as stated on each sound's page and at https://bigsoundbank.com/licence.html. Files were
downloaded from `https://bigsoundbank.com/UPLOAD/bwf-en/<number>.wav`.

| # | Title | Page |
| --- | --- | --- |
| 0018 | Torn Paper ("Paper: Tear long (x2), short tear (x2)") | https://bigsoundbank.com/torn-paper-s0018.html |
| 3239 | Torn paper ("I tear off a sheet of paper") | https://bigsoundbank.com/torn-paper-2-s3239.html |
| 3241 | Torn paper | https://bigsoundbank.com/torn-paper-4-s3241.html |
| 3244 | Torn paper | https://bigsoundbank.com/torn-paper-7-s3244.html |
| 0298 | Adhesive tape (unrolled) | https://bigsoundbank.com/adhesive-tape-2-s0298.html |
| 0299 | Adhesive tape (unrolled, short) | https://bigsoundbank.com/adhesive-tape-3-s0299.html |
| 0493 | Pages that turn (a paperback, 5 times) | https://bigsoundbank.com/pages-that-turn-s0493.html |
| 1413 | Pages that turn (several pages) | https://bigsoundbank.com/pages-that-turn-2-s1413.html |
| 1074 | Bubbles Burst (made with the mouth) | https://bigsoundbank.com/bubbles-burst-s1074.html |
| 1796 | Whoosh (a long rope) | https://bigsoundbank.com/whoosh-4-s1796.html |
| 1802 | Whoosh (a wooden sheet) | https://bigsoundbank.com/whoosh-9-s1802.html |

OpenGameArt: **"10 Book Page Flips"** by **Starninjas**, licence **CC0 1.0**,
https://opengameart.org/content/10-book-page-flips (file `book_flips_-_starninjas.zip`; clips
`book_flip.4.ogg`, `book_flip.7.ogg`, `book_flip.10.ogg`).

## Processing

Mono, 44.1 kHz, MP3 (112 kbps for the tear bed, 128 for the peel's crackle, 96 for the rest), ~175 KB in all.
The tear and peel beds keep only the sustained part of each take, levelled to an even loudness and
joined with equal-power crossfades (the peel is reshaped further, below). One-shots are trimmed so the sound starts where it should (a flip starts
just before the page's swish), with short fades, peaks normalised to -3/-4 dBFS. Sprites separate
their variations with 0.2-0.25 s of digital silence; the page splits them on it after decoding.
Playback volume is set in code (`LEVEL.rec` in src/lib/sound-synth.js), not in the files.

### peel.mp3 (sticker peel)

The tape recordings alone read as a paper tear (a continuous broadband rasp with the roll's body).
A sticker peel is lighter and higher: a fine, tacky crackle that comes in short release fronts. So
the bed keeps only the tape's adhesive micro-crackle (high-passed at 1 kHz, transients emphasised)
and cuts it into irregular release fronts of 4-160 ms (fast onset, short decay, some smooth
"tssss" phrases, some jerky "tk-shk" ones), adds small resonant release ticks and rare stick-slip
squeaks (synthesised), and is EQ'd to the long-term spectrum of a real close-miked sticker peel
(Nicholas Judy's "Sticker, Peel Off", The Designer's Choice foley collection on archive.org; used only
as a measuring reference, not mixed in: its licence is royalty-free but not CC0). The synthesised
parts are ours, released CC0 as well. Spectral centroid ~7.7 kHz (the tape bed was 5.1 kHz, the
tear is 4.6 kHz), under 4% of the energy below 1.5 kHz (was 13%). Mono MP3, 128 kbps, -3.6 dBFS peak.

### Recording your own peel

`peel.mp3` can be replaced by any recording, as is: once decoded, the page high-passes it, cuts
every pause of 120 ms or more (before, between and after takes), joins the rest, levels it to the
same loudness and loops it to fill (`prepBed` in src/lib/sound-samples.js). Phone voice memo, quiet
room, phone flat on the table, a vinyl or paper sticker stuck on a smooth hard surface (a laptop
lid, a mug, a notebook cover) 10-15 cm from the mic. Lift a corner with a nail (not in the take),
then peel slowly and evenly at a low angle for about a second; pause; three takes, one at a slow
pace, one normal, one quick. Convert it to MP3 (e.g. `ffmpeg -i memo.m4a -ac 1 -b:a 128k peel.mp3`), name it `peel.mp3`, drop it in
this folder. No code change; keep it under ~20 s.
