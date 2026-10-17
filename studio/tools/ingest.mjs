#!/usr/bin/env node
// INGEST: one command turns your talking-head video into everything ravyn needs.
// Run it from the studio folder:
//
//   node tools/ingest.mjs <reel number> [--video <file>] [--model small.en] [--force]
//
// Put your video at assets/r01/facecam.mp4 (or pass --video and it is copied there). Then:
//   1. probe            duration, fps, size                          -> ingest.json
//   2. facecam-fix.mp4  a clean 30 fps H.264 copy (phone video is often variable frame rate,
//                       which makes the render drift out of sync)
//   3. audio            rNN.wav (16 kHz mono, for Whisper) + vo.mp3 (for the reel)
//   4. words            word-level transcript (tools/words.py, Whisper) -> words.js + transcript.txt
//   5. jump cuts        every place you cut a pause out of your take    -> cuts.json
//
// Each stage is skipped when its file already exists, unless --force. Next: node ravyn/cli.mjs new <n> <slug>
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const force = argv.includes("--force");
const reel = parseInt(argv[0], 10);
if (!Number.isFinite(reel)) { console.log("usage: node tools/ingest.mjs <reel number> [--video <file>] [--model small.en] [--force]"); process.exit(2); }
const NN = String(reel).padStart(2, "0");
const DIR = join(STUDIO, "assets", `r${NN}`);
mkdirSync(DIR, { recursive: true });
const log = { reel, dir: `assets/r${NN}`, started: new Date().toISOString(), stages: {} };
const fresh = (f) => force || !existsSync(f) || statSync(f).size === 0;
const step = (name, fn) => { const t0 = Date.now(); process.stdout.write(`[${name}] `); const r = fn(); log.stages[name] = { ...(r || {}), ms: Date.now() - t0 }; console.log(r?.note || "done"); return r; };
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });

// 0. the source video
const given = flag("--video");
let src = ["facecam.mp4", "facecam.mov", "facecam.m4v"].map((f) => join(DIR, f)).find((f) => existsSync(f));
if (given) { src = join(DIR, `facecam${extname(given).toLowerCase() || ".mp4"}`); if (resolve(given) !== src) copyFileSync(given, src); }
if (!src) { console.log(`no video: put your take at assets/r${NN}/facecam.mp4, or pass --video <file>`); process.exit(1); }

// 1. probe
const probe = step("probe", () => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", src]).toString());
  const v = j.streams.find((s) => s.codec_type === "video") || {};
  const [n, d] = String(v.r_frame_rate || "30/1").split("/").map(Number);
  const out = { duration: +(+j.format.duration).toFixed(3), fps: +(n / (d || 1)).toFixed(3), width: v.width, height: v.height, hasAudio: j.streams.some((s) => s.codec_type === "audio") };
  out.note = `${out.duration}s, ${out.width}x${out.height}, ${out.fps} fps${out.hasAudio ? "" : ", NO AUDIO TRACK"}`;
  if (out.width && out.height && out.width > out.height) out.note += " (landscape: the reel is 1080x1920, it will be cropped)";
  return out;
});
if (!probe.hasAudio) { console.log("this video has no sound, so there is nothing to transcribe"); process.exit(1); }

// 2. a clean constant-frame-rate copy
const fix = join(DIR, "facecam-fix.mp4");
step("facecam-fix", () => {
  if (!fresh(fix)) return { note: "exists" };
  ff(["-i", src, "-vf", "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", fix]);
  return { note: "30 fps, 1080x1920, H.264" };
});

// 3. audio
const wav = join(DIR, `r${NN}.wav`), mp3 = join(DIR, "vo.mp3");
step("audio", () => {
  if (fresh(wav)) ff(["-i", fix, "-vn", "-ac", "1", "-ar", "16000", wav]);
  if (fresh(mp3)) ff(["-i", fix, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", mp3]);
  return { note: "vo.mp3 + 16 kHz wav" };
});

// 4. words
const wordsJs = join(DIR, "words.js");
step("words", () => {
  if (!fresh(wordsJs)) return { note: "exists" };
  const model = flag("--model", "small.en");
  const r = spawnSync("python", [join(STUDIO, "tools", "words.py"), wav, model], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.log(`\n  Whisper failed. Install it once with:  pip install openai-whisper\n  ${String(r.stderr || "").trim().split("\n").slice(-3).join("\n  ")}`);
    process.exit(1);
  }
  const j = JSON.parse(r.stdout.trim().split("\n").pop());
  writeFileSync(wordsJs, `window.__WORDS = ${JSON.stringify(j.words)};\n`);
  writeFileSync(join(DIR, "transcript.txt"), j.text + "\n");
  return { words: j.words.length, model: j.model, device: j.device, note: `${j.words.length} words (${j.model} on ${j.device})` };
});

// 5. jump cuts: a cut is one frame that moves far more than the frames around it (an impulse);
// ordinary motion rises and falls over several frames. Loud cuts are caught by size alone.
const cutsJson = join(DIR, "cuts.json");
step("cuts", () => {
  if (!fresh(cutsJson)) return { note: "exists" };
  const W = 135, H = 240, N = W * H;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", fix, "-f", "rawvideo", "-pix_fmt", "gray", "-vf", `scale=${W}:${H}`, "pipe:1"], { maxBuffer: 2 * 1024 * 1024 * 1024 });
  const frames = Math.floor(raw.length / N);
  const d = new Float64Array(Math.max(0, frames - 1));
  for (let i = 0; i < d.length; i++) { let s = 0; const a = i * N, b = a + N; for (let k = 0; k < N; k++) s += Math.abs(raw[b + k] - raw[a + k]); d[i] = s / N; }
  const sorted = [...d].sort((x, y) => x - y); const med = sorted.length ? sorted[sorted.length >> 1] : 0;
  const loudBar = Math.max(8, 6 * med), FLOOR = 3, CONTRAST = 3;
  const near = (i) => { let m = 0; for (let j = i - 2; j <= i + 2; j++) if (j !== i && j >= 0 && j < d.length) m = Math.max(m, d[j]); return m; };
  const hits = [];
  for (let i = 0; i < d.length; i++) {
    const loud = d[i] > loudBar, quiet = !loud && d[i] >= FLOOR && d[i] >= CONTRAST * near(i);
    if (loud || quiet) hits.push({ frame: i + 1, t: +((i + 1) / 30).toFixed(3), diff: +d[i].toFixed(1), kind: loud ? "loud" : "quiet" });
  }
  const cuts = [];
  for (const c of hits) { const last = cuts[cuts.length - 1]; if (last && c.frame - last.frame <= 2) { if (c.diff > last.diff) cuts[cuts.length - 1] = c; } else cuts.push(c); }
  writeFileSync(cutsJson, JSON.stringify({ detector: 2, fps: 30, frames, median_diff: +med.toFixed(2), cuts }, null, 1));
  return { cuts: cuts.length, note: `${cuts.length} jump cuts` };
});

log.finished = new Date().toISOString();
writeFileSync(join(DIR, "ingest.json"), JSON.stringify(log, null, 1));
console.log(`\nready: assets/r${NN}. Next:  node ravyn/cli.mjs new ${reel} <slug> --title "..."`);
