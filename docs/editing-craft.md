# The editing craft bar

The style (`styles/<name>/STYLE.md`) says WHAT goes in a reel. This doc says HOW refined it must
be. The `reel-build` skill runs the pre-delivery checklist at the bottom on every cut before the
user sees it, so the user spends their time on taste calls, not on catching unfinished basics.

Rules the user confirms in `rules/TASTE.md` beat anything here.

## The intro is the deliverable

Most viewers decide in the first 2 to 3 seconds whether to stay. Craft spent after that point is
worth far less than craft spent inside it.

- Design the intro first, build it first, judge it hardest.
- The first 3 to 4 seconds are the most designed stretch of the reel. "Footage with one word on
  it" is a failed intro.
- Every sentence in the intro gets its own new visual state. A sentence never sits on a frame
  that did not change.
- When an intro fails twice, change the KIND of energy, not the amount. Overlay density is one
  lever; editing energy (three or four fast cuts in the first 4 seconds) is the other.
- Open with a curiosity gap: something half shown, blurred, counted down or promised, that only
  pays off if the viewer stays.

## The continuous-visual test

Scrub the cut and ask at every second: what changed, and did it make a sound?

1. **Continuous.** The screen is never holding still. A still frame is where a thumb swipes.
2. **Scored.** Every visual change has its own soft sound landing on it.
3. **Coherent.** The changes share one palette, one light source and one motion language, so the
   succession feels composed instead of frantic.

Nothing changed: a hole to fill. Something changed silently: a missing sound. Changes that do
not look like each other: fix the palette before adding more motion.

Density buys length. Do not trim a reel to hit a target duration. Trim only beats that are
static or redundant.

## Media over text

1. **Real footage of the real thing first.** If the voice names an app, show the app doing the
   exact action named, recorded by you. A drawn graphic is second choice. A still image is third.
2. **Named company: its real logo**, never a coloured dot or a text label. Simple Icons
   (`https://cdn.simpleicons.org/<slug>`) covers most brands as clean SVG.
3. **Named person: their real face on screen on the word they are named**, from a source you are
   allowed to use. Never put a face on screen you have not verified belongs to that person.
4. **A news claim: the real article as a receipt.** Several outlets landing in a fanned pile prove
   the story was everywhere. A single screenshot is the fallback. Annotate the real receipt; never
   replace it with a made-up card.
5. **Check every clip by looking at a frame** (`ffmpeg -ss <t> -i clip.mp4 -frames:v 1 check.png`)
   before it goes into a scene. A search can return the wrong person or the wrong screen.
6. **Footage importance decides layering.** Generic b-roll is free space, fill it. Important
   footage (the real person, the real product) keeps its subject uncovered.
7. **No two clips that look alike.** Reuse reads as low effort.

## Motion

- **Nothing just fades.** Every element enters with a reason (slides, grows, types in, pops), idles
  with a little life, and leaves moving. A fade-only entrance is a placeholder.
- **The smooth grammar.** Overshoot in (`back.out(1.1 to 1.4)`, 0.3 to 0.6 s), blurred while it
  moves fast and sharp the moment it settles (motion blur, the `mblur` field in ravyn), leave
  with momentum in the last 0.2 s. One motion language on every element is what reads as smooth.
- **The camera stays alive.** Every screenshot and recording pushes in slowly, about 1.00 to 1.10
  over its time on screen.
- **Build the interface, do not just show it.** Commands type in, rows land one at a time,
  checkmarks tick on the word. At least one interface moment per reel that does something.
- **Numbers count up** from zero with a sound, and land with a payoff hit.
- **A state beats a label.** Do not write "BROKEN" on a thing; make the thing shake, go red, sag.
- **Draw a thing by what it is made of.** A company is people, not a building. A market is orders.
- Stagger a row of state changes 40 to 60 ms apart so it reads as choreography.
- **Big type only on what matters:** numbers, the key claim, the punchline. Three or four moments
  per reel.
- **No cheese:** no 3D spins, no glow for the sake of glow, no bouncing text, no preset
  transitions.
- Animate transforms and colours only, never layout properties (width, top, margin).
- A 3D rotation stops short of 90 degrees (55 to 65), or the slab goes edge-on and vanishes.

## Sync

- **Nothing appears before it is said.** Take the time of the key word from the transcript
  (`assets/rNN/words.js`) and land the visual on it, or up to 0.1 s before. Never use round
  scene numbers.
- **A transition starts when the sentence ends.** Every scene change sits on a sentence end, on
  one of the user's own jump cuts, or in a silence.
- **Blur-anticipation reveal:** keep a named thing blurred (about 15 px, silhouette still
  readable) with a small working effect until the word, then snap it sharp with a sound.
- Spot-check five random words: each visual lands within 0.1 s of its word.

## Text

- **Readability is absolute.** No text behind or over anything that makes it hard to read,
  including chart lines. Busy footage under text gets blurred hard (12 to 16 px, darker), or the
  text moves.
- **On-screen text adds, never echoes.** A headline line must not repeat the caption under it.
  Use it for attribution, context, a number or the takeaway.
- **Never two texts with the same meaning on screen at once.**
- **No text on screen for less than 0.8 s.**
- **Elements never touch:** 24 px clear space minimum.
- **Emphasis is bright and alive.** An emphasised word or number uses a high-luminance fill and a
  slow idle drift. A dull fill stays dull no matter how much it moves.
- **Colour carries meaning.** Danger is red, safe is green. The accent colour is for identity,
  not for a state the audience already has a colour for.
- **Check every logo against what it sits on.** An orange mark on an orange disc disappears.
- Tight tracking on display caps. Wide-spaced caps look cheap.
- No filled boxes with a word inside as a "stamp". Put the state on the object instead.
- Captions that scale a word need a little side padding on every word, or the scale eats the
  space between words.

## Sound

- **Voice is the loudest thing, always.** Music is optional and sits far under the voice; a dry
  mix of voice plus soft sounds is a valid style on its own.
- **One soft sound per visual event**, on the frame the event lands: a tick when a row lands, an
  air when the window moves, a pop on a logo, a low swell under a scene change.
- **Soft and tonal beats noisy.** Harsh high-frequency whooshes and alarms read as cheap.
  Tension comes from the low end (swells, sub drops), never from a siren.
- **Volumes 0.2 to 0.5** for effects, under the voice.
- **The reuse ceiling.** A generic sound (tick, click, air, paper) plays at most 8 times in one
  reel; past that, swap in a variant. A distinctive sound (a riser, a signature hit) plays once.
  Keep a tally while you build.
- **A progressive animation gets a progressive sound:** bars filling, dots turning, a spread. Not
  silence.
- **An intro riser** in the first 3 to 5 seconds and **an outro cue** in the last 2 seconds.

## Ground and layout

- Fill the frame. A beat with dead space and a bit of text is unfinished.
- Hero moments get a full sequence: build, climax, payoff.
- The safe zone: nothing the viewer must read below **y 1700** on a 1080 x 1920 frame, nothing
  above y 220, and keep the right edge in clear of the like and share buttons.
- A landscape screen capture in a portrait full-bleed box with `cover` crops to the empty centre
  of the page. Full bleed uses `contain` in a band; `cover` only when the box is near the
  capture's own shape.

## Options: vary the KIND

When the user rejects a look, the next options vary what the thing IS, not how it moves. Test:
could one option become the other by changing timing, easing or colour alone? Then they are the
same option. Show at least four genuinely different kinds, as stills.

## Pre-delivery checklist

Run it on the render, not on the code. Pull a contact sheet
(`ffmpeg -v error -i renders/<file>.mp4 -vf "fps=2,scale=240:-1,tile=3x3" sheet%02d.png`),
look at every sheet, scrub every scene change.

- [ ] The board was approved and every board note is in the cut
- [ ] The intro has a designed moment in the first 3 seconds, not a static reveal
- [ ] Every sentence in the intro is a new visual state
- [ ] Every scene change lands on a jump cut, a sentence end or a silence
- [ ] Every named app has real footage of the action named; every named brand has its real logo
- [ ] Every named person has their verified face on the word
- [ ] Every element overshoots in, blurs while fast, and leaves moving; nothing fade-only
- [ ] Every screenshot and recording is slowly pushing in
- [ ] Every number counts up with a sound
- [ ] Every visual event has a soft sound; no generic sound past 8 uses; no hero sound twice
- [ ] Every text element is readable against what is behind it, chart lines included
- [ ] No text echoes the caption; no text on screen under 0.8 s; nothing touching
- [ ] Five spot-checked words land within 0.1 s
- [ ] Nothing the viewer reads sits below y 1700
- [ ] The style's own checklist (`styles/<name>/STYLE.md`) passes
- [ ] Zero em dashes in any on-screen text

If any box fails, fix it before showing the user.
