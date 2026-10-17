# Style: ZEBRA

A 16:9 long-form commentary style for YouTube. You talk over clips from your own webcam, and the
clips live in three frames you hard-cut between: full screen, a 90% card floating on a loud yellow
zebra-stripe bed with a hard shadow, or a 50/50 split with your face and a cyan lightning line down
the middle. On top: giant red arrows that point at what you name, CENSORED boxes, quick reaction
clips on the punchline, and a comic-caps label when something is a joke. No subtitles. The frame
changes about every 3 seconds even when the clip does not.

![Zebra style preview](preview.png)

**Format:** horizontal video, 1920 x 1080, 30 fps. Built for long videos (10 minutes and up), but
the same frames work for a 2 minute piece.
**You need:** a webcam recording of yourself talking (in your own room, a mic in shot is fine),
the clips you are talking about (screen recordings, footage, photos you have the rights to use),
a few short reaction clips, a quiet music bed, and a handful of simple sound effects.

**How to build it:** say "build video N in the zebra style" (the `reel-build` skill). The project
is made at 16:9 with `node ravyn/cli.mjs new N <slug> --size 1920x1080`, and Claude builds the
three frames (full-bleed, zebra card, split) from regular ravyn clips following this spec, so you
still open it in ravyn, leave notes on the frame and render from there.

## The eight rules

1. **Three frames, hard-cut between them.** Full, 0.90 card on zebra, 50/50 split. The frame
   changes every 3 seconds or so, even when the clip itself keeps playing.
2. **The bed is loud, the card is still.** A saturated, static zebra bed plus a hard down-right
   shadow makes any clip look edited with zero motion.
3. **Story on the clip, opinion on the face.** Facts play full screen or carded. When you give your
   opinion, your face comes in (split or side panel).
4. **Point at the noun.** A pure red block arrow lands on the thing you name, on the frame you name it.
5. **The punchline is a reaction clip.** 0.5 to 1.5 seconds of reaction footage or an emoji hit on
   the joke, then straight back.
6. **The subject invades your room.** A running gag where the thing you are talking about shows up
   as a cutout in your webcam shot. Set it up in the opening, pay it off at the end.
7. **No dead air.** Talk wall to wall and cut out every pause. The music sits far under you and
   drops out to sell a gag.
8. **Text only when it is a joke.** No subtitles, no counters, no chapter cards. One comic-caps label
   or a CENSORED box at most.

## The three frames (plus two variations)

| Frame | Share of runtime | Typical hold | What is on screen |
|---|---|---|---|
| **FULL** | 39% (clip or your face) | median 3.2 s, up to about 28 s | the clip at 100%, no frame, or you full screen |
| **ZEBRA CARD** | 34% (card or cutout) | median 3.5 s, up to 16 s | the clip at 0.90 scale on the zebra bed |
| **SIDE PANEL** | 15% | | you on the right half, zebra on the left with a small card or cutout |
| **SPLIT** | 12% | median 1.9 s, up to about 16 s | clip left, you right, lightning divider |

Lean on SPLIT in the first few minutes (a quarter to almost half of each minute), then shift to
cards and full screen once the story is running.

### FULL

- The clip fills the frame. Use it for long story beats.
- Your face full screen is the same frame. For emphasis on a joke line, hard-cut to an extreme
  close-up (your face fills the frame) and hold it about 1 s.

### ZEBRA CARD

- Card: x 96 to 1824, y 54 to 1026, which is **1728 x 972, scale 0.90, centred**.
- Square corners, no border. The clip is the card.
- Hard shadow offset **26 px right and 26 px down**, colour `#BE9A00` (the yellow darkened about
  25%), about 6 px of softness on the edge.
- A smaller 0.82 card exists for variety, and you can fan 2 or 3 small cards on the bed, or stand a
  cutout (an object or a drawing) directly on the zebra with no card.

### SPLIT

- Clip on the left, x 0 to 960. You on the right, x 978 to 1920. 50/50.
- The divider sits at x 960 to 978: an electric cyan lightning line, core `#B9F9FF`, glow `#52DEFC`,
  about 20 px wide, and it flickers.
- The clip side can push in slowly. Your side stays still.

## Motion

- **Cut rate:** a scene change every 2.5 s at the median (3.4 s on average). Inside a card the clip
  hard-cuts too.
- **Into a card, two ways:**
  - A hard cut straight to the 0.90 card.
  - A **push-out**: the full clip shrinks into the card, 1.00 to 0.90 over 8 frames (0.27 s),
    ease-out, decelerating, no overshoot. Measured scale per frame: 0.999, 0.989, 0.978, 0.966,
    0.951, 0.941, 0.932, 0.927, then it settles on the card.
- **Into a split:** a hard cut from your full face. No slide.
- **Arrows:** pop in over about 2 frames (a small faded blob, then full size), hold 1 to 2 s, cut
  out with the shot.
- **Flash:** a 3-frame black and white matte flash before a gag card, or a 2-frame cross-dissolve
  into a new card. For a "freeze" beat, drop the clip to grey and hold.
- **Big gag moments** (a takeover of your video): glass shatter, a chromatic smear, a curtain and
  confetti reveal. Save these for the opening and the ending.
- **Idle:** none on the bed, none on the card frame. All the life comes from the clips and from you.

## Overlays

| Overlay | Look | Rule |
|---|---|---|
| **Red arrow** | pure `#FF0000`, chunky block arrow, no outline, no shadow, about 450 px long | lands on the exact thing you name. Up to 4 at once |
| **CENSORED box** | solid black rectangle, white heavy condensed caps (Anton) | sized to cover what it hides and moves with it. It can run partly off frame |
| **Reaction label** | white comic caps, thick black stroke, cap height about 58 px | centred near y 930 (the lower 14%). One or two words |
| **Quote callout** | small white caps with a black outline, in quote marks | along the bottom edge of the card |
| **Reaction clip** | full frame, 0.5 to 1.5 s, carries its own audio | on the punchline only |
| **Emoji or sticker hit** | one big emoji, a star rating, falling money, bars over a face | over a blurred clip, short |
| **Gag treatments** | a camcorder REC frame (battery, REC dot, corner marks), a meter rising, a silhouette flash | one per gag |

If a clip has a logo in its corner, blur it. Do not crop it.

## Look

| Token | Value | Use |
|---|---|---|
| Zebra stripe A | `#FECD00` (about 55% of the bed) | the bed |
| Zebra stripe B | `#FEE57A` (about 38% of the bed) | the bed |
| Card shadow | `#BE9A00`, offset 26 / 26 px, about 6 px soft | under every card |
| Lightning core | `#B9F9FF` | split divider |
| Lightning glow | `#52DEFC` | split divider |
| Arrow red | `#FF0000` | arrows only |
| CENSORED | white on `#000000`, Anton | the box |
| Label font | a comic caps font (Bangers is a free option; Poppins 800 with a heavy black stroke also works), cap about 58 px | reaction labels |

- The zebra is **static**. Never animate it. Re-crop it per appearance so it does not feel like
  a wallpaper: wide wavy stripes in some sections, tight diagonal hatching in others.
- Your webcam is your real room. Keep a recognisable object or two in shot.

## Captions and text

There are no subtitles in this style. Text appears only for these three jobs: a reaction label,
a CENSORED box, a quote callout. Do not add a counter for a list, even in a "top 10" video.
Title cards that are already part of a clip can stay as your chapter markers.

## Sound

- **Voice:** wall to wall. Aim for about 167 words a minute, with no more than one gap longer
  than 0.8 s every 2 to 3 minutes. Cut every pause.
- **Music bed:** quiet, about 14 dB under your voice. Change the tune by section. Drop it out to
  near silence on a gag.
- **Clip audio:** plays under or between your lines. Talk over most of it.
- **Sound effects:** about one hit per overlay (an arrow pop, a card push-out). Not on every word.
- **Reaction clips** bring their own sound.

## Safe zone

This is a 16:9 player video, so there is no vertical-app button zone. Keep labels in the lower
14% of the card (around y 930), which clears the player bar, and keep your face out of the
corners where end-screen elements go in the closing seconds.

## The arc of a video

1. **Cold open (about 35 s):** full clips, an arrow, a reaction clip, then the takeover gag where the
   subject "hijacks" your video. Land on a split for your welcome.
2. **Body:** segments of roughly 45 to 50 s (about 15 in a 13 minute video). Each opens on a
   story line, plays over full clips and zebra cards with arrows, then 1 to 3 opinion lines on
   a split or side panel, a reaction clip on the punchline, out.
3. **Outro:** your face full screen, the running gag pays off (the cutout is back in your room),
   then COMMENT, like and SUBSCRIBE pop in one after another next to your head, and a wave.

## Checklist before you post

- [ ] Only three frames (full, 0.90 card, 50/50 split) plus the side panel, hard-cut between
- [ ] The frame changes about every 3 s
- [ ] Card at 1728 x 972, centred, shadow 26 / 26 px in `#BE9A00`
- [ ] The zebra bed never moves
- [ ] Split divider at x 960 to 978, cyan lightning
- [ ] Every arrow lands on the frame its noun is spoken
- [ ] No subtitles, no counters; text only for a joke
- [ ] Dead air cut out; music about 14 dB under the voice
- [ ] Logos in clip corners blurred
