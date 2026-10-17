// ravyn BUILD TEMPLATE (style: WINDOW). Copy it to assets/rNN/cut.mjs, fill the blocks at the top,
// and run it from the studio folder: node assets/rNN/cut.mjs
// It writes the first cut INTO the project file (the same file you open in ravyn), compiles it and
// prints the style's warnings. You never write a variants/*.html by hand.
//
// Before this: put facecam.mp4 in assets/rNN, run node tools/ingest.mjs NN (words + jump cuts),
// then node ravyn/cli.mjs new NN <slug>.
// After this: the board (Board button in ravyn), your notes into this file, a 3-second test
// render, the full render.
import * as M from "../../ravyn/lib/model.mjs";
import * as O from "../../ravyn/lib/node-ops.mjs";

/* ───────────────────────────── fill these ───────────────────────────── */
const REEL = 1;                                    // the reel number (assets/r01)
const ID = "reel-001-my-slug";                     // the project id that cli.mjs new printed
const ACCENT = "#2B59FF";                          // one accent colour (the topic's brand colour if it has one)
const KEYWORD = "GUIDE";                           // the comment keyword for the call to action

// Scene cuts: [time, state]. States: full (your face fills the frame), stack (your window in the
// bottom half, an element on top), bubble (your face in a corner circle, the element big),
// none (elements only). A time snaps onto your own jump cut within 0.85 s, else into the
// nearest silence. Rules: all three types, no type more than 4 in a row, none under 8 s.
const PLAN = [
  [2.4, "stack"], [6.0, "none"], [9.2, "full"], [12.5, "bubble"], [17.0, "stack"], [21.0, "full"],
];
// Elements: { at, src } puts a screenshot or a screen recording into the scene that is live at
// `at`, sized for that scene's layout. Real footage of the real thing beats any drawn graphic.
const ELEMENTS = [
  { at: 2.4, src: `assets/r${String(REEL).padStart(2, "0")}/clips/example.png` },
];
// Eyebrows: small mono labels at the top of an element scene, like "STEP 01 · SCRIPT".
const EYEBROWS = [
  { at: 2.4, text: "STEP 01 · SCRIPT" },
];
// The call to action sits over the LAST full-face scene.
const CTA_AT = null;                               // seconds, or null for the last full scene

// MOTION: every element enters with a slide or pop and a small overshoot, blurs while it moves
// fast, and leaves with momentum before its cut. Nothing just fades.
const ENTER = { slideUp: { type: "slideUp", dur: 0.34, ease: "back.out(1.2)" }, slideDown: { type: "slideDown", dur: 0.3, ease: "back.out(1.2)" }, pop: { type: "pop", dur: 0.26, ease: "back.out(1.4)" }, none: { type: "none" } };
const EXIT = { slideUp: { type: "slideUp", dur: 0.2, ease: "power2.in" }, slideDown: { type: "slideDown", dur: 0.2, ease: "power2.in" }, pop: { type: "pop", dur: 0.18, ease: "power2.in" }, none: { type: "none" } };
function MOTION(duration, enter = "slideDown", exit = "slideUp", mblur = 8) {
  const en = ENTER[enter] || ENTER.none, ex = EXIT[exit] || EXIT.none;
  const room = duration >= (en.dur || 0) + (ex.dur || 0) + 0.08;   // too short for both: keep the entrance
  return { enter: en, exit: room ? ex : EXIT.none, mblur };
}
// Where an element sits in each scene type (1080 x 1920, nothing below y 1700).
const SLOT = {
  stack: { x: 60, y: 150, w: 960, h: 720, radius: 34 },
  bubble: { x: 60, y: 230, w: 960, h: 960, radius: 34 },
  none: { x: 60, y: 320, w: 960, h: 900, radius: 34 },
  full: { x: 70, y: 110, w: 940, h: 540, radius: 34 },   // only if your shot has empty space above your head
};
/* ─────────────────────────────────────────────────────────────────────── */

const p = O.loadProject(ID);
const ing = O.readIngest(REEL);
const v = M.videoTracks(p);
p.style = "window";

// 1. the facecam window block replaces the plain facecam clip the import made
if (!M.facecamOf(p)) {
  const plain = p.clips.find((c) => c.type === "video" && c.src === ing.facecam);
  if (!plain) throw new Error("no facecam clip from the ingest: run tools/ingest.mjs, then ravyn/cli.mjs new");
  M.removeClip(p, plain.id);
  M.addClip(p, "facecam", { name: "facecam (window)", src: ing.facecam, start: 0, duration: p.duration, mediaDuration: plain.mediaDuration, track: v[0].id, bubble: { ring: ACCENT }, states: [{ t: 0, state: "full" }] }, "overwrite");
}
// 2. scene cuts, snapped to your jump cuts or the silence
for (const [t, state] of PLAN) M.addBoundary(p, t, state);
const spans = M.sceneSpans(p);
// a scene cut can snap up to 0.85 s onto your jump cut, so an element asked for at a PLAN time
// belongs to the scene whose (snapped) start is nearest, not the one that happens to contain it
const spanAt = (t) => {
  const near = spans.filter((s) => s.t > 0 && Math.abs(s.t - t) <= 0.85).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return near || spans.find((s) => t >= s.t - 0.01 && t < s.end) || null;
};

// 3. elements, sized to the scene's slot, with a slow push so nothing sits still
for (const e of ELEMENTS) {
  const s = spanAt(e.at); if (!s) continue;
  const pr = O.probe(e.src); if (!pr) { console.warn("missing", e.src); continue; }
  const dur = Math.min(s.end - s.t, pr.duration || 99);
  const kind = pr.kind === "image" ? "image" : "video";
  const clip = M.addClip(p, kind, { name: e.src.split("/").pop(), src: e.src, start: s.t, duration: dur, mediaDuration: pr.duration || null, mediaWidth: pr.width, mediaHeight: pr.height, track: v[1].id, fit: "cover", ...SLOT[s.state], ...MOTION(dur) }, "overwrite");
  M.upsertKey(clip, "scale", 0.4, 1, p.fps, "none"); M.upsertKey(clip, "scale", dur, 1.06, p.fps, "none");
}
// 4. eyebrows
for (const e of EYEBROWS) {
  const s = spanAt(e.at); if (!s) continue;
  const slot = SLOT[s.state] || SLOT.none;
  M.addClip(p, "text", { name: "eyebrow", text: e.text, font: "JetBrains Mono", weight: 500, size: 30, letterSpacing: 0.14, uppercase: true, fill: "#666666", shadow: "none", x: 60, y: Math.max(60, slot.y - 80), w: 960, h: 44, start: s.t, duration: s.dur, track: v[2].id, ...MOTION(s.dur, "slideDown", "slideUp", 0) }, "overwrite");
}
// 5. the call to action over the last full-face scene (never the opening scene: that is the hook)
const fulls = spans.filter((s, i) => s.state === "full" && i > 0);
const last = CTA_AT != null ? spanAt(CTA_AT) : fulls[fulls.length - 1];
if (last) M.addClip(p, "cta", { name: "CTA", keyword: KEYWORD, brand: ACCENT, start: last.t, duration: last.dur, track: v[2].id, y: 730 }, "overwrite");
else console.warn("no full-face scene after the hook, so no call to action: end the PLAN on a \"full\" scene");
// 6. captions per scene (never across a cut, the right caption style for each scene)
let capTrack = p.tracks.find((t) => t.name === "CAPTIONS"); if (capTrack) p.clips = p.clips.filter((c) => c.track !== capTrack.id); else capTrack = M.addTrack(p, "video", "CAPTIONS");
const SYS = { capFace: { x: 60, w: 960, fill: "#FFFFFF", shadow: "face" }, capSeam: { x: 150, w: 780, fill: "#141414", shadow: "none" }, capSide: { x: 500, w: 520, fill: "#141414", shadow: "none" }, capGround: { x: 60, w: 960, fill: "#141414", shadow: "none" } };
for (const q of M.buildSceneCues(p)) M.addClip(p, "caption", { track: capTrack.id, start: q.start, duration: q.duration, words: q.words, name: q.words.map((w) => w.text).join(" "), sys: q.sys, y: q.y, lit: ACCENT, ...SYS[q.sys] }, "overwrite");
// 7. one soft sound on every scene change: your own scene-*.wav files in assets/rNN/sfx rotate,
// else the kit's sfx/slide.wav
const a1 = M.audioTracks(p)[0].id;
const free = (t, d) => M.tracksOf(p, "audio").find((tr) => tr.id !== a1 && !M.overlapping(p, tr.id, t, t + d).length) || M.addTrack(p, "audio");
const sceneSfx = ing.sceneSfx.length ? ing.sceneSfx : O.probe("sfx/slide.wav") ? ["sfx/slide.wav"] : [];
spans.forEach((s, i) => { if (!i || !sceneSfx.length) return; const src = sceneSfx[i % sceneSfx.length]; const d = O.probe(src)?.duration || 0.7; M.addClip(p, "audio", { src, name: src.split("/").pop(), start: s.t, duration: d, mediaDuration: d, track: free(s.t, d).id, volume: 0.2 }, "reject"); });

const val = M.validate(p);
console.log("validate:", val.ok ? "ok" : val.errors.join("; "), val.warnings.length ? "\n  warnings: " + val.warnings.join("\n  ") : "");
O.saveProject(p);
const b = O.buildProject(p);
console.log("compiled", O.toPosix(b.variant));
console.log(`open it: node ravyn/server.mjs  ->  http://localhost:3140  (project ${ID})`);
