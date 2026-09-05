# Presentation deck

`pitstop-deck.html`: the course presentation for Pit-Stop Racer Pro.
Single self-contained HTML file: **18 slides + 4 backup slides**, dark "Pit Wall"
F1-telemetry style, built as one 15-minute story.
Slide 3 plays `monza-start.mp4` (a 17 s F1 race-start clip); keep that file next
to the HTML. Everything else is embedded.

`pitstop-deck-v1.html` is the previous 29-slide deck. It is **not** dead weight:
the build script reads the shared design system, the JetRacer photos, the track
geometry and the grip chart out of it. Do not delete it.

## Opening / presenting

Open `pitstop-deck.html` in any modern browser (double-click, or drag into a tab).
No build step, no server.

| key | action |
|---|---|
| `→` / `Space` / `PageDown` | next step, then next slide |
| `←` / `PageUp` | back |
| `S` | toggle the speaker script (talking points per slide) |
| `O` | slide overview grid, click any slide to jump |
| `T` | rehearsal timer (slide elapsed, total, 14:52 target, over-by) |
| `F` | fullscreen |
| `Home` / `End` | first / last slide |

Clicking the right / left third of the screen also navigates. The URL hash
(`#7`) tracks the current slide, so you can deep-link or reload in place.

## The story

Three acts, one question: *the car is fast, but how long can it stay out?*

| # | slide | act | steps |
|---|---|---|---|
| 1 | Title | — | 0 |
| 2 | The premise: the best-managed car wins | — | 2 |
| 3 | Monza race start (video) | — | 1 |
| 4 | Three clocks: battery, tires, fuel | — | 3 |
| 5 | Anatomy (JetRacer hardware) | — | 6 |
| 6 | Perception: steering, people, markers | — | 4 |
| 7 | **Act I card: Battery** | I | 1 |
| 8 | How many laps are left in the pack? | I | 5 |
| 9 | The verdict: 35 < 37 → BOX | I | 4 |
| 10 | **Act II card: Tires** | II | 1 |
| 11 | Tires: wear you cannot measure | II | 3 |
| 12 | Rain: a phone changes the speed limit | II | 4 |
| 13 | **Act III card: Fuel** | III | 1 |
| 14 | Fuel: the see-saw | III | 3 |
| 15 | The call: one car, three deadlines, one pit lane | III | 6 |
| 16 | Telemetry: the car races, the phone watches | III | 5 |
| 17 | Race sim: one lap with everything on | — | 1 |
| 18 | What's built, and where this grows next + close | — | 3 |

Backup slides `b01`–`b04` sit after slide 18. Arrow navigation **skips** them;
they only appear in the `O` overview (dimmed, tagged `BACKUP`) so you can jump
to one during Q&A.

## Global mechanics

- **HUD** (top right): one number per slide, laps left, FPS, max throttle,
  latency. It morphs when the story changes it and counts digits when it is
  numeric.
- **Clock rail** (above the footer): three live bars, BATTERY / TIRES / FUEL,
  draining in wall-clock time from slide 4 onward. Battery is forced to `0.0`
  when you reach slide 15, which is what makes the pit call unavoidable.
- Both are idempotent: jumping straight to `#15` lands in the right state.
- **Speaker split** (4 voices) is in the `S` script per slide.

## What's in it

- Content follows the partner's **General Summary** (the as-built system); the
  report is only used where the summary is silent.
- The track on slides 15, 17 and the backups is rendered live from the real
  627-point Monza centreline (`app/src/track/monza.generated.ts`).
- Slide 3 is a full-bleed `<video>` with sound. It auto-plays on entry and pauses
  on leave; if the browser blocks autoplay-with-audio, click play (controls are
  shown). Source: 2020 Italian GP, Formula 1.
- Tire and fuel models are shown in plain English with a permanent amber
  `SIMULATED · HAND-TUNED` badge; the latency figure carries
  `ESTIMATE · PER STAGE, NOT END-TO-END`. The maths stays in the report.
- Fonts (Chakra Petch, IBM Plex Mono, Inter) load from Google Fonts, so the
  first render needs a network connection. Load it once before presenting and
  keep the tab open.

## Editing

`pitstop-deck.html` is **generated**. Do not edit it directly, regenerate:

```
cd docs/presentation && python3 _build/assemble.py
```

| file | holds |
|---|---|
| `_build/p1.html` | head, `/*__CSS__*/` token, new CSS part 1 (HUD, rail, act cards, slides 01–09) |
| `_build/p2.html` | new CSS part 2 (slides 11–18, backups, timer), `</style>` |
| `_build/p3.html` | all slide markup + chrome |
| `_build/p4.js` | engine: `SCRIPT`, `HUD`, `RAIL`, `CHOREO`, hooks, nav, timer |
| `_build/assemble.py` | splices the reused assets out of `pitstop-deck-v1.html` |

Gotchas:

- **Never give a new slide an id matching `s0`–`s27`.** The reused CSS block
  still carries the old deck's per-slide rules and they will silently win. New
  slides use the `p01`–`p18` / `b01`–`b04` prefix; `svid` is reused on purpose.
- `SCRIPT` is keyed by slide **position** (1-based). Inserting a slide means
  renumbering `SCRIPT`, `TARGET` and the `acts` ranges.
- `data-steps="N"` on the section = click-reveals; `class="step" data-s="2"`
  appears on step 2. `data-backup="1"` hides a slide from arrow navigation.

## Open items

- Chair / lab name for the title slide, if the course wants one.
- Rehearse against the `T` timer: the per-slide targets sum to 14:52.
