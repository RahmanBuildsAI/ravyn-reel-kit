// THE EXAMPLE REEL: a 26-second tour of this kit, in the PAPER style, built entirely from code.
// Run it from the studio folder:   node assets/example/build.mjs
// It writes the ravyn project projects/example-kit-tour.json and compiles it. Then:
//   node ravyn/server.mjs                                  open it in ravyn, look around
//   node ravyn/cli.mjs render example-kit-tour             render it (your setup test)
//
// Everything in it is free to reuse: the voice is AI (HyperFrames tts, Kokoro), the two photos are
// CC0 (StockSnap), the props are HTML pages in props/ shot to PNG with tools/shoot.mjs, and the
// sounds are the kit's own. Read it as a worked example of a cut script: one beat per line.
import { readFileSync } from "node:fs";
import * as M from "../../ravyn/lib/model.mjs";
import * as O from "../../ravyn/lib/node-ops.mjs";

const DIR = "assets/example";
const ID = "example-kit-tour";
const INK = "#232323", GREY = "#8A8A8A", ACCENT = "#C5735F";

// the voice and its word timings (from tools/words.py)
const src = readFileSync(`${DIR}/words.js`, "utf8");
const words = JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
const vo = O.probe(`${DIR}/vo.mp3`);
const END = M.quant(vo.duration + 0.3, 30);

// the beats: [start, end, what visits the stage]. Every start sits on the word that names it.
const BEATS = [
  [0.0, 2.05, { photo: "macbook-code.jpg" }],
  [2.05, 4.65, { prop: "prop-ask.png", sfx: "tick" }],
  [4.65, 6.95, { prop: "prop-topic.png" }],
  [6.95, 10.0, { prop: "prop-hooks.png" }],
  [10.0, 11.95, { photo: "phone-hand.jpg" }],
  [11.95, 14.85, { prop: "prop-ingest.png", sfx: "tick" }],
  [14.85, 18.85, { prop: "ravyn-ui.png" }],
  [18.85, 21.7, { prop: "prop-notes.png" }],
  [21.7, 23.85, { prop: "prop-render.png" }],
  [23.85, END, { mark: true }],
];

const p = M.newProject({ id: ID, title: "Example · a tour of the kit", fps: 30, duration: END, background: "#F6F6F6", style: null });
const [V1, V2, V3] = M.videoTracks(p).map((t) => t.id);
const V4 = M.addTrack(p, "video", "V4").id;
const A1 = M.audioTracks(p)[0].id, A2 = M.audioTracks(p)[1].id;
p.words = words;

// motion: objects visit the stage. In with a small overshoot, blurred while fast, out with momentum.
const IN = { type: "slideUp", dur: 0.38, ease: "back.out(1.25)" }, OUT = { type: "slideUp", dur: 0.22, ease: "power2.in" };
const push = (c, d) => { M.upsertKey(c, "scale", 0, 1, 30, "none"); M.upsertKey(c, "scale", d, 1.05, 30, "none"); };

// 1. the stage: a dotted cross grid that never stops drifting
const grid = M.addClip(p, "image", { name: "grid", src: `${DIR}/media/grid.svg`, track: V1, start: 0, duration: END, x: -135, y: -135, w: 1350, h: 2295, fit: "fill" });
M.upsertKey(grid, "x", 0, -135, 30, "none"); M.upsertKey(grid, "x", END, 0, 30, "none");
M.upsertKey(grid, "y", 0, -135, 30, "none"); M.upsertKey(grid, "y", END, -40, 30, "none");

// 2. one visitor per beat, at the same spot on the stage
const sfx = (name, t, vol, track = A2) => { const s = `sfx/${name}.wav`; const d = O.probe(s)?.duration || 0.4; M.addClip(p, "audio", { name, src: s, start: M.quant(t, 30), duration: d, mediaDuration: d, track, volume: vol }, "reject") || M.addClip(p, "audio", { name, src: s, start: M.quant(t, 30), duration: d, mediaDuration: d, track: M.addTrack(p, "audio").id, volume: vol }, "reject"); };
for (const [a, b, what] of BEATS) {
  const d = M.quant(b - a, 30);
  if (what.photo) {
    const c = M.addClip(p, "image", { name: what.photo, src: `${DIR}/media/${what.photo}`, track: V2, start: a, duration: d, x: 60, y: 340, w: 960, h: 720, radius: 24, fit: "cover", effects: { grayscale: 1, contrast: 1.05 }, enter: IN, exit: OUT, mblur: 8 });
    push(c, d);
  } else if (what.prop) {
    const c = M.addClip(p, "image", { name: what.prop, src: `${DIR}/media/${what.prop}`, track: V2, start: a, duration: d, x: 20, y: 300, w: 1040, h: 800, fit: "contain", enter: IN, exit: OUT, mblur: 8 });
    push(c, d);
  } else if (what.mark) {
    const c = M.addClip(p, "image", { name: "the mark", src: `${DIR}/media/ravyn.svg`, track: V2, start: a, duration: d, x: 340, y: 420, w: 400, h: 400, fit: "contain", enter: { type: "pop", dur: 0.5, ease: "back.out(1.6)" } });
    M.upsertKey(c, "rotation", 0, -4, 30, "none"); M.upsertKey(c, "rotation", d, 4, 30, "sine.inOut");
  }
  if (a > 0) sfx("slide", a, 0.35);
  if (what.sfx) sfx(what.sfx, a + 0.45, 0.25);
}

// 3. decoration: two accent starbursts that drift and turn the whole time
// (each on its own track: two clips on one track at the same time would overwrite each other)
for (const [x, y, size, spin, track] of [[860, 150, 170, 40, V3], [70, 1560, 130, -30, M.addTrack(p, "video", "V5").id]]) {
  const s = M.addClip(p, "image", { name: "starburst", src: `${DIR}/media/starburst.svg`, track, start: 0, duration: END, x, y, w: size, h: size, fit: "contain", enter: { type: "pop", dur: 0.5, ease: "back.out(1.6)" } });
  M.upsertKey(s, "rotation", 0, 0, 30, "none"); M.upsertKey(s, "rotation", END, spin, 30, "none");
}

// 4. the one black pill per scene, on the first beat and the last
const pill = (text, a, b) => M.addClip(p, "text", { name: "pill", text, track: V4, start: a, duration: M.quant(b - a, 30), font: "Inter", weight: 800, size: 44, fill: "#FFFFFF", shadow: "none", pill: { color: "#111111", radius: 14, padX: 26, padY: 14 }, x: 60, y: 1120, w: 960, h: 90, hAuto: true, enter: { type: "slideUp", dur: 0.4, ease: "back.out(1.2)" }, exit: { type: "slideUp", dur: 0.2, ease: "power2.in" } });
pill("a free kit", 1.2, 2.05); sfx("click", 1.2, 0.3);
pill("make my first reel", 25.1, END); sfx("click", 25.1, 0.3);

// 5. karaoke captions: every word arrives grey and settles to ink as it is spoken, and stays ink
const cap = M.addTrack(p, "video", "CAPTIONS").id;
const cues = M.buildCues(words, { fps: 30, maxWords: 4, pause: 0.24 });
cues.forEach((q, i) => {
  const next = i + 1 < cues.length ? cues[i + 1].start : END;
  M.addClip(p, "caption", { track: cap, start: q.start, duration: M.quant(Math.max(1 / 30, next - q.start), 30), words: q.words, name: q.words.map((w) => w.text).join(" "), sys: "capGround", x: 60, y: 1250, w: 960, h: 180, size: 76, fill: GREY, lit: INK, hold: true, shadow: "none" }, "overwrite");
});

// 6. the voice
M.addClip(p, "audio", { name: "voice", src: `${DIR}/vo.mp3`, track: A1, start: 0, duration: M.quant(vo.duration, 30), mediaDuration: vo.duration, volume: 1 });

void ACCENT;
const v = M.validate(p);
console.log("validate:", v.ok ? "ok" : v.errors.join("; "), v.warnings.length ? "\n  " + v.warnings.join("\n  ") : "");
O.saveProject(p, { history: false, source: "create" });
const b = O.buildProject(p);
console.log(`compiled ${O.toPosix(b.variant)}\nopen it:   node ravyn/server.mjs   (project ${ID})\nrender it: node ravyn/cli.mjs render ${ID}`);
