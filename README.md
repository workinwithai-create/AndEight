# AndEight

Eight-bar low-end scheduling desk for bedroom producers and AI-music finishers.

A busy loop feels empty because the kick and the upright sit on the same downbeat. AndEight keeps the chords and the kit, and only moves the bass: stacked on the kick, or onto the and so the one has a chair.

Live samples only — FluidR3 acoustic grand piano, upright bass, kick, snare, and hi-hat, copied from PreEight commit `d58301e4a494555f411a2afbc448b724136eee76` into `public/samples/`. No oscillators. Audio never leaves the tab.

## Distinct from yesterday and the rest of the line

| Tool | Job |
| --- | --- |
| AnswerEight | Second verse that is not a reprint of verse one |
| WalkEight | Walking bass line over a locked loop |
| PedalEight | Bass holds a pedal |
| HoleFour | Stop-time holes in the whole bar |
| **AndEight** | Kick keeps the one. Upright takes the and. |

Not a walking-bass desk. Not a stop-time desk. The comparison is stacked low end against scheduled low end, at matched loudness.

## Pricing

This desk is free.

If you sell it, sell it once. One-time $19 lifetime on Lemon Squeezy (merchant of record). Mirror on Gumroad. Do not subscribe it. There is no stem server and no seat. Recurring billing belongs to AuraMix, MixForge, and the Forge Pass.

## Run

Open `public/index.html` or deploy the folder as a static site on Vercel (`outputDirectory`: `public`).

Tap to start audio. Set BPM (60–180), key, and a 4-chord progression. Those persist in localStorage and drive playback and export.

Export is 48 kHz, 24-bit stereo WAV, first downbeat at sample 0, ring-out folded onto the start so the loop is seamless. A separate with-tail WAV is labeled. Matching MIDI, one track per chair, tempo and time signature set.

## Demo

`demo.mp4` — stacked low end, then the bass on the and. Same chords, same kit.
