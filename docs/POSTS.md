# Carousel posts and covers

ravyn edits video. Still images (carousel slides, reel covers, YouTube thumbnails) are made as
HTML pages and turned into PNGs with one command. Claude writes the HTML for you from a style.

## A carousel post

1. Pick a post style: `styles/big-number/` or `styles/steps/`. Read its `STYLE.md`.
2. Ask Claude: **"Make a carousel in the big-number style about <topic>, 6 slides."** It writes
   one HTML file per slide into `studio/posts/<slug>/` (`slide-01.html`, `slide-02.html` ...),
   each 1080 x 1350, using only the fonts in `studio/fonts/` and your own images.
3. Shoot them, from `studio/`:
   ```bash
   node tools/shoot.mjs posts/<slug>
   ```
   Every slide becomes a PNG next to its HTML.
4. Look at every PNG before you post. Then post the PNGs in order.

## A reel cover

Same thing at the reel's size:

```bash
node tools/shoot.mjs posts/<slug>/cover.html --size 1080x1920
```

Instagram's profile grid only shows the middle of a reel cover (about y 240 to 1680), so keep the
title and the face inside that band.

## A YouTube thumbnail

```bash
node tools/shoot.mjs posts/<slug>/thumb.html --size 1280x720
```

## Rules that keep stills good

- Never cover a face with text or graphics. Text sits beside or below it.
- One idea per slide. If a slide needs two sentences of explanation, it is two slides.
- The first slide is the hook; the last slide is the call to action.
- Real images beat drawn ones: your own photo, a real screenshot, the real product.
- Never invent a number. Every number on a slide needs a source you can open.
