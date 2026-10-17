---
name: reel-build
description: Build, board, check and render a reel in ravyn, the editor in studio/. Use when the user says build reel N, edit my reel, make the board, show me the frames, apply my notes, fix the intro, change the style, add sounds, check it, render it, make a test render, or the reel looks generic or unfinished. Covers ingesting the recorded take, choosing a style from styles/ (default window, the facecam style), the board-before-build rule, the cut rule, media over text, sound discipline, the QA gate and the render.
---
# Building a reel in ravyn

The reel lives in one project file, `studio/projects/<id>.json`. ravyn edits it, the build script
writes into it, and the compiler turns it into the composition. Never hand-edit
`studio/variants/*.html` or `studio/index.html`; they are build output.

Run every command from the `studio/` folder. Before starting, read:

1. `rules/TASTE.md`: the user's confirmed taste. It beats every default below.
2. The locked script in `scripts/` for this reel, if there is one.
3. The style: `styles/<name>/STYLE.md` (default `styles/window/STYLE.md`).
4. `docs/editing-craft.md`: the craft bar and the pre-delivery checklist.
5. `docs/render-traps.md`: what fails silently.

## Step 1. Ingest the take

The user records their take and saves it as `studio/assets/rNN/facecam.mp4` (reel 1 is
`assets/r01`). Then:

```bash
node tools/ingest.mjs 1                  # --video <file> to copy a take in, --model small, --force
```

It writes a clean 30 fps copy (`facecam-fix.mp4`), `vo.mp3`, the word-level transcript
(`words.js`, `transcript.txt`) and the user's own jump cuts (`cuts.json`). If Whisper is missing,
it prints `pip install openai-whisper`; tell the user to run it.

**Fix the transcript before anything else.** Whisper garbles brand and product names. Read
`transcript.txt` against the script, fix the display text in `words.js`, and KEEP every timing.

Then create the project:

```bash
node ravyn/cli.mjs new 1 my-slug --title "Reel 1 · the hook line"
```

It prints the project id (for example `reel-001-my-slug`). Use that id everywhere below.

## Step 2. Pick the style

List `styles/`. The default is `window`: your face as a window that changes shape (FULL FACE,
FACE + ELEMENT as STACK or BUBBLE, ELEMENTS ONLY). Use the style the user names, else the default
in `CLAUDE.md`, else `window`. Read its STYLE.md end to end and follow its numbers exactly
(positions, sizes, fonts, colours, sequence rules). A style's own rules never get merged with
another style's. If the user wants a look no style covers, run `video-breakdown` on a reference
first.

`ravyn/build-template.mjs` is the window style's build. For any other style, start from the
same template and replace the layout blocks with that style's numbers.

## Step 3. Gather real media before planning

Media over text, every beat. In order of preference:

1. **Real footage of the real thing.** The voice names an app: a screen recording of that app
   doing that exact action. Ask the user to record it (Windows: `Win + Alt + R` with Xbox Game
   Bar, or OBS) or use the product's own official demo where its terms allow.
2. **Real receipts:** the real logo (`https://cdn.simpleicons.org/<slug>`), the real article
   screenshot (several outlets when the story ran in several), the verified real face.
3. **A built graphic** only when there is nothing real to show.

Save everything in `assets/rNN/clips/`. Look at one frame of every clip before using it:
`ffmpeg -ss 2 -i assets/rNN/clips/x.mp4 -frames:v 1 check.png`. If an app beat has no footage,
the board frame for it is not finished; say so instead of drawing a placeholder.

Sounds: put the effects for scene changes in `assets/rNN/sfx/` named `scene-*.wav` (the build
rotates them). Other effects come from `studio/sfx/`.

## Step 4. Plan the cut

Copy the template and fill the block at the top:

```bash
cp ravyn/build-template.mjs assets/rNN/cut.mjs      # PowerShell: Copy-Item
```

Fill `REEL`, `ID`, `ACCENT`, `KEYWORD`, then `PLAN`, `ELEMENTS`, `EYEBROWS`, `CTA_AT`.

**Every time comes from the transcript**, never from round numbers. Print the words with their
times (`node -e "eval(require('fs').readFileSync('assets/rNN/words.js','utf8').replace('window.__WORDS','globalThis.W'));W.forEach(w=>console.log(w.start.toFixed(2),w.text))"`)
and the jump cuts (`assets/rNN/cuts.json`), then plan against them.

**The cut rule.** A scene change lands on one of the user's own jump cuts or in a silence, never
mid-word. Put each `PLAN` time on the sentence end where the change belongs; ravyn snaps it onto
the user's jump cut within 0.85 s, else into the nearest real pause. If a planned change has
neither nearby, move the change, not the rule.

**Design the intro first.** The first 3 to 4 seconds are the deliverable: a designed moment, a
new visual state for every sentence, a curiosity gap. Plan it before the rest.

Window style sequence rules (the build warns on each): all three scene types appear, no type more
than 4 scenes in a row, an ELEMENTS ONLY stretch under 8 s, open and close on FULL FACE.

For each scene, also write one line of "transition in" and one line of "motion" into the board
notes, so the board shows them. Add this before `const val = M.validate(p);` in `cut.mjs`:

```js
p.boardNotes = [ { t: 2.4, in: "full frame shrinks into the bottom window", motion: "page pushes 1.00 to 1.06" } ];
```

`t` is the scene's start time (the snapped one; the build prints them). Add `at` to pin the board
frame to a specific second.

## Step 5. The board, then the user's notes (before anything renders)

**No render happens until the user has seen a still board and given notes.** A note on a still
costs a minute; a note on a render costs an hour. This applies to every reel and every re-cut.

1. Run the cut once to fill the project: `node assets/rNN/cut.mjs`. It prints validate warnings;
   fix every one.
2. Make the board: start ravyn in the background (`node ravyn/server.mjs`, then open
   http://localhost:3140), open the project and press **Board**. It writes
   `studio/boards/BOARD-<id>.html`: one frame per scene at its peak, with the time range, the
   words, what is on screen, the caption style, the transition and motion lines, and the sounds.
3. Look at every frame yourself first, against `docs/editing-craft.md`. Fix what you can see is
   wrong (empty frame, text over a graphic, wrong clip, placeholder) and rebuild the board.
4. Hand the user the board path and ask for notes per frame number.
5. Apply every note in `cut.mjs` (or the project, for one-off fixes), then run it again. That is
   the ONE build. Read pinned review notes with `node ravyn/cli.mjs notes <id>`, and mark each
   one done with `node ravyn/cli.mjs note-fix <id> <n> "what changed"`.

Hand edits the user makes inside ravyn are kept and re-applied on every build
(`node ravyn/cli.mjs edits <id>` lists them). Never undo one without asking.

## Step 6. Sound

- The voice is the loudest thing, always. Music is optional and far under the voice.
- **One soft sound per visual event**, on the frame it lands: a tick when a row lands, an air
  when the window moves, a pop on a logo, a low swell under a scene change. Not on every word.
- Effects at volume 0.2 to 0.5. Soft and tonal; no alarms, no harsh whooshes.
- **Reuse ceiling:** any one generic sound at most 8 times per reel, then swap a variant. A
  distinctive sound (a riser, a signature hit) plays once. Keep the tally as you add them.
- An intro riser in the first 3 to 5 seconds and an outro cue in the last 2 seconds.

## Step 7. The QA gate

```bash
npx --yes hyperframes@0.7.89 check .        # or: node ravyn/cli.mjs check <id>
```

"Check passed" is NOT the pass condition. Read the sections and require:

1. Contrast: `N/N text checks pass WCAG AA`, both numbers equal.
2. Zero `content_overlap`, zero `text_occluded`.
3. Zero GSAP, track and media errors.

Then the checks the tool cannot do, by eye on the board: no text sitting on a built graphic,
nothing the viewer must read below **y 1700** (the platform's buttons and caption cover it),
captions word for word with the voice, zero em dashes in any on-screen text.

## Step 8. Render

Test first, always. Pick the hardest 3 seconds (the busiest scene change or the first clip):

```bash
node ravyn/cli.mjs render <id> --from 5 --to 8 --workers 2
ffmpeg -v error -ss 1.5 -i renders/<id>-test-5s.mp4 -frames:v 1 test-frame.png
```

Look at the frame and listen to the clip. Then the reel:

```bash
node ravyn/cli.mjs render <id> --workers 2
```

Always `--workers 2`; the default of 4 can crash a reel with several video clips. Renders land in
`studio/renders/<id>-vN.mp4`.

## Step 9. Before the user sees it

Run the pre-delivery checklist in `docs/editing-craft.md` on the RENDER: contact sheets at 2 fps,
every scene change scrubbed, one full listen. Fix every failed box first. The user should only be
judging taste.

Then give the user, in short plain sentences: the render path, the board path, and any taste
call you made on your own (so they can veto it).

## Notes after the render

Post-render notes are for motion and sound, the things a still cannot show. Apply them to
`cut.mjs` or the project, never the HTML, then test-render the changed seconds before the full
render. Any reaction the user gives ("love this", "never again", "too slow") goes through the
`taste-learn` skill so it becomes a rule.

If a note is vague ("make it better", "feels generic"), ask: what second, what should it do
instead (describe the movement), what is that moment for, and which earlier cut got it right.
