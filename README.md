# WalkEight

Eight-bar bass desk for bedroom producers and AI-music finishers.

The loop is stuck because the bass never leaves the root. Chords and kit are already doing their job. WalkEight keeps both of them and only rewrites the upright: root-lock versus a walking line that approaches the next chord.

Live samples only — FluidR3 acoustic grand piano, upright bass, kick, snare, and hi-hat, copied from PreEight commit `d58301e4a494555f411a2afbc448b724136eee76` into `public/samples/`. No oscillators. Audio never leaves the tab.

## Distinct from yesterday and the rest of the line

| Tool | Job |
| --- | --- |
| AnswerEight | Second verse that is not a reprint of verse one |
| Unravel | Chorus that is not a louder verse |
| PedalEight | Bass and cello hold a pedal while others move |
| LineFour | Contrary motion, violin against upright |
| HoleFour | Stop-time holes |
| **WalkEight** | Change only the bass. Chords and kit stay. |

Not a verse desk. Not a pedal desk. The comparison is root-lock against a walk, at matched loudness.

## Pricing

This desk is free.

If you sell it, sell it once. One-time $19 lifetime on Lemon Squeezy (merchant of record). Mirror on Gumroad. Do not subscribe it. There is no stem server and no seat. Recurring billing belongs to AuraMix, MixForge, and the Forge Pass.

## Run

Open `public/index.html` or deploy the folder as a static site on Vercel (`outputDirectory`: `public`).

Tap to start audio. Set BPM (60–180), key, and a 4-chord progression. Those persist in localStorage and drive playback and export.

Export is 48 kHz, 24-bit stereo WAV, first downbeat at sample 0, ring-out folded onto the start so the loop is seamless. A separate with-tail WAV is labeled. Matching MIDI, one track per chair, tempo and time signature set.

## Demo

`demo.mp4` — root lock, then the walk, same chords and kit.
