// Node-only operations shared by server.mjs and cli.mjs: project files with history, the
// ingest import (facecam, VO, words, your jump cuts), ffprobe with a cache, proxies, the build
// (variants/<id>.html + a HyperFrames project dir for check/render), and the job runner.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync, copyFileSync, unlinkSync, rmSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve, join, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as M from "./model.mjs";
import { compileHtml } from "./compile.mjs";
import * as N from "./notes.mjs";
import * as E from "./edits.mjs";

export const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// the studio folder: assets/, fonts/, projects/, variants/, renders/ all live here
export const REELS = resolve(process.env.STUDIO_DIR || resolve(TOOL, ".."));
export const PROJECTS = join(REELS, "projects");
export const HISTORY = join(PROJECTS, ".history");
export const NOTES_DIR = join(PROJECTS, "notes");
export const EDITS_DIR = join(PROJECTS, "edits");
export const SNAPS_DIR = join(NOTES_DIR, "snaps");
export const CACHE = join(REELS, ".ravyn");
export const PROXY_DIR = join(CACHE, "proxy");
export const BUILD_DIR = join(CACHE, "build");
export const VARIANTS = join(REELS, "variants");
export const RENDERS = join(REELS, "renders");
// an optional sound library anywhere on disk (set SFX_LIBRARY to its folder); studio/sfx/ is always listed
export const PACK = process.env.SFX_LIBRARY ? resolve(process.env.SFX_LIBRARY) : join(REELS, ".no-sfx-library");
export const HF = "hyperframes@0.7.89";
export const MEDIA_EXT = { video: [".mp4", ".webm", ".mov", ".mkv", ".m4v"], audio: [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"], image: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"] };

for (const d of [PROJECTS, HISTORY, NOTES_DIR, EDITS_DIR, SNAPS_DIR, CACHE, PROXY_DIR, BUILD_DIR, VARIANTS, RENDERS]) mkdirSync(d, { recursive: true });

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
export const isSafeId = (id) => SAFE_ID.test(id) && !id.includes("..");
export const toPosix = (p) => p.replace(/\\/g, "/");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/* ------------------------------------------------------------------ project files */
export function projectPath(id) { if (!isSafeId(id)) throw new Error(`bad project id ${id}`); return join(PROJECTS, `${id}.json`); }
export function listProjects() {
  if (!existsSync(PROJECTS)) return [];
  return readdirSync(PROJECTS).filter((f) => f.endsWith(".json")).map((f) => {
    try {
      const p = JSON.parse(readFileSync(join(PROJECTS, f), "utf8"));
      return { id: p.id || f.replace(/\.json$/, ""), title: p.title, reel: p.reel, duration: p.duration, clips: (p.clips || []).length, modified: p.meta?.modified || statSync(join(PROJECTS, f)).mtime.toISOString() };
    } catch { return { id: f.replace(/\.json$/, ""), title: f, broken: true }; }
  }).sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
}
export function loadProject(id) {
  const p = JSON.parse(readFileSync(projectPath(id), "utf8"));
  return M.normalize(p);
}
/* source: "build" (cut.mjs and every script, the default) keeps the project as built as the base
   and re-applies your hand edits on top (lib/edits.mjs); "editor" (the editor UI) records your edits as
   the diff from that base; "create" (a fresh project from the ingest) does neither. */
export function saveProject(p, { history = true, source = "build", quiet = false } = {}) {
  if (!p || !isSafeId(p.id)) throw new Error("project needs a safe id");
  const file = projectPath(p.id);
  if (source === "build") {
    writeJson(editsBasePath(p.id), p);
    const edits = loadEdits(p.id).edits;
    if (edits.length) {
      const r = E.applyEdits(p, edits);
      if (!quiet) {
        console.log(`hand edits (projects/edits/${p.id}.json): ${r.applied.length} re-applied, ${r.ported.length} already in the build, ${r.dropped.length} dropped, ${r.missing.length} not found`);
        for (const [k, list] of Object.entries({ dropped: r.dropped, "not found": r.missing })) for (const x of list) console.log(`  ${k}: ${x}`);
      }
    }
  } else if (source === "editor") {
    let base = null; try { base = JSON.parse(readFileSync(editsBasePath(p.id), "utf8")); } catch {}
    if (!base && existsSync(file)) { base = JSON.parse(readFileSync(file, "utf8")); writeJson(editsBasePath(p.id), base); }
    if (base) { const d = E.diffProjects(M.normalize(base), p); if (d.length || existsSync(editsPath(p.id))) saveEdits(p.id, d); }
  }
  if (history && existsSync(file)) {
    const dir = join(HISTORY, p.id); mkdirSync(dir, { recursive: true });
    copyFileSync(file, join(dir, `${stamp()}.json`));
    const old = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    while (old.length > 50) unlinkSync(join(dir, old.shift()));
  }
  p.meta = p.meta || {}; p.meta.modified = new Date().toISOString(); p.meta.source = source;
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(p, null, 1));
  renameSync(tmp, file);
  return file;
}
/* your review notes: projects/notes/<id>.json, beside the project and never inside it (lib/notes.mjs) */
export function notesPath(id) { if (!isSafeId(id)) throw new Error(`bad project id ${id}`); return join(NOTES_DIR, `${id}.json`); }
export function loadNotes(id) {
  const f = notesPath(id);
  return N.normalizeNotes(existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null, id);
}
export function saveNotes(id, doc) {
  const d = N.normalizeNotes(doc, id); d.project = id; d.modified = new Date().toISOString();
  const f = notesPath(id), tmp = f + ".tmp";
  writeFileSync(tmp, JSON.stringify(d, null, 1));
  renameSync(tmp, f);
  return d;
}
function writeJson(f, obj) { const tmp = f + ".tmp"; writeFileSync(tmp, JSON.stringify(obj, null, 1)); renameSync(tmp, f); }
/* your hand edits: projects/edits/<id>.json, the base they diff from: projects/edits/<id>.base.json */
export const editsPath = (id) => { if (!isSafeId(id)) throw new Error(`bad project id ${id}`); return join(EDITS_DIR, `${id}.json`); };
export const editsBasePath = (id) => { if (!isSafeId(id)) throw new Error(`bad project id ${id}`); return join(EDITS_DIR, `${id}.base.json`); };
export function loadEdits(id) { try { const d = JSON.parse(readFileSync(editsPath(id), "utf8")); return { edits: Array.isArray(d.edits) ? d.edits : [], updated: d.updated || null }; } catch { return { edits: [], updated: null }; } }
export function saveEdits(id, edits) { writeJson(editsPath(id), { project: id, updated: new Date().toISOString(), edits }); }
/* the project as it was when a note was made (the "before" of a fix): one snapshot per project
   version that has a note on it, taken when the note is saved */
export const snapPath = (id, modified) => join(SNAPS_DIR, id, String(modified).replace(/[:.]/g, "-") + ".json");
export function snapshotForNotes(id, doc) {
  const f = projectPath(id); if (!existsSync(f)) return;
  const raw = readFileSync(f, "utf8"); const mod = JSON.parse(raw).meta?.modified; if (!mod) return;
  if (!doc.notes.some((n) => n.ctx?.projectModified === mod)) return;
  const s = snapPath(id, mod); if (existsSync(s)) return;
  mkdirSync(dirname(s), { recursive: true }); writeFileSync(s, raw);
}
export function loadSnapshot(id, modified) { const s = snapPath(id, modified); return existsSync(s) ? M.normalize(JSON.parse(readFileSync(s, "utf8"))) : null; }
/* "1", "reel-001-my-slug" or "reel-001" -> the project id */
export function resolveProjectId(arg) {
  const a = String(arg || "").trim(); if (!a) throw new Error("which project? give an id or a reel number");
  if (isSafeId(a) && existsSync(projectPath(a))) return a;
  const list = listProjects();
  const hits = /^\d+$/.test(a) ? list.filter((p) => +p.reel === +a) : list.filter((p) => p.id.startsWith(a));
  if (hits.length === 1) return hits[0].id;
  if (!hits.length) throw new Error(`no project matches "${a}"`);
  throw new Error(`"${a}" matches ${hits.map((p) => p.id).join(", ")}; give the full id`);
}
export function historyOf(id) {
  const dir = join(HISTORY, id); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
}

/* ------------------------------------------------------------------ ffprobe with a cache */
const probeCachePath = join(CACHE, "probe.json");
let probeCache = null;
function loadProbeCache() { if (!probeCache) { try { probeCache = JSON.parse(readFileSync(probeCachePath, "utf8")); } catch { probeCache = {}; } } return probeCache; }
function saveProbeCache() { try { writeFileSync(probeCachePath, JSON.stringify(probeCache)); } catch {} }

/* resolve a project-relative src ("assets/r01/x.mp4" or "pack:Whooshes/x.wav") to a disk path */
export function srcToPath(src) {
  if (!src) return null;
  if (src.startsWith("pack:")) return join(PACK, src.slice(5));
  if (src.startsWith("/")) return null;
  const abs = resolve(REELS, src);
  if (!abs.startsWith(REELS)) return null;
  return abs;
}
export function pathToSrc(abs) {
  abs = resolve(abs);
  if (abs.startsWith(PACK)) return "pack:" + toPosix(relative(PACK, abs));
  return toPosix(relative(REELS, abs));
}
export function probe(src) {
  const abs = srcToPath(src);
  if (!abs || !existsSync(abs)) return null;
  const st = statSync(abs);
  const key = `${src}|${st.size}|${Math.round(st.mtimeMs)}`;
  const cache = loadProbeCache();
  if (cache[key]) return cache[key];
  let out = { src, size: st.size, mtime: st.mtimeMs, kind: kindOf(abs) };
  if (out.kind === "image" && extname(abs).toLowerCase() === ".svg") { cache[key] = out; saveProbeCache(); return out; }
  try {
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration", "-of", "json", abs]).toString());
    const v = (j.streams || []).find((s) => s.codec_type === "video"), a = (j.streams || []).find((s) => s.codec_type === "audio");
    out.duration = j.format?.duration ? +(+j.format.duration).toFixed(3) : null;
    if (v) {
      const fps = v.r_frame_rate ? (([n, d]) => (d ? n / d : 0))(v.r_frame_rate.split("/").map(Number)) : null;
      out.width = v.width; out.height = v.height; out.fps = fps ? +fps.toFixed(3) : null; out.codec = v.codec_name;
      out.alpha = /yuva|rgba|argb|bgra/.test(v.pix_fmt || "");
    }
    out.hasAudio = !!a;
  } catch (e) { out.error = String(e.message || e).split("\n")[0]; }
  cache[key] = out; saveProbeCache();
  return out;
}
export function kindOf(file) {
  const e = extname(file).toLowerCase();
  for (const [k, list] of Object.entries(MEDIA_EXT)) if (list.includes(e)) return k;
  return null;
}

/* ------------------------------------------------------------------ media listing */
export function listDir(rel, { probeAll = false } = {}) {
  const abs = rel.startsWith("pack:") ? join(PACK, rel.slice(5)) : resolve(REELS, rel);
  const root = rel.startsWith("pack:") ? PACK : REELS;
  if (!abs.startsWith(root) || !existsSync(abs)) return { dir: rel, dirs: [], files: [] };
  const dirs = [], files = [];
  for (const name of readdirSync(abs)) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = join(abs, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { dirs.push(name); continue; }
    const kind = kindOf(full); if (!kind) continue;
    const src = pathToSrc(full);
    const row = { name, src, kind, size: st.size };
    if (probeAll) Object.assign(row, probe(src) || {});
    if (kind === "video") { const px = proxyPathFor(src); row.proxy = px && existsSync(px) ? proxyUrl(px) : null; }
    files.push(row);
  }
  dirs.sort(); files.sort((a, b) => a.name.localeCompare(b.name));
  return { dir: rel, dirs, files };
}
export function mediaRoots() {
  const roots = [];
  const assets = join(REELS, "assets");
  if (existsSync(assets)) for (const n of readdirSync(assets)) if (!n.startsWith(".") && !n.startsWith("_") && statSync(join(assets, n)).isDirectory()) roots.push({ label: `assets/${n}`, dir: `assets/${n}` });
  roots.sort((a, b) => b.dir.localeCompare(a.dir, undefined, { numeric: true }));
  if (existsSync(join(REELS, "sfx"))) roots.push({ label: "sfx (your sounds)", dir: "sfx" });
  if (existsSync(PACK)) roots.push({ label: "your SFX library", dir: "pack:" });
  return roots;
}

/* ------------------------------------------------------------------ proxies */
export function proxyPathFor(src) {
  const abs = srcToPath(src); if (!abs || !existsSync(abs)) return null;
  const st = statSync(abs);
  const h = createHash("sha1").update(`${src}|${st.size}|${Math.round(st.mtimeMs)}`).digest("hex").slice(0, 16);
  const alpha = extname(abs).toLowerCase() === ".webm";
  return join(PROXY_DIR, `${basename(abs, extname(abs)).replace(/[^a-z0-9_-]/gi, "_")}-${h}.${alpha ? "webm" : "mp4"}`);
}
export const proxyUrl = (abs) => "/proxy/" + basename(abs);
/* every video file a project plays: plain video clips, the facecam block and its matte */
export function videoSrcs(p) {
  const out = new Set();
  for (const c of p.clips || []) { if (c.type === "video" || c.type === "facecam") { if (c.src) out.add(c.src); } }
  return [...out];
}
export function proxyMap(srcs) {
  const map = {};
  for (const s of srcs) { const px = proxyPathFor(s); if (px && existsSync(px)) map[s] = proxyUrl(px); }
  return map;
}
/* make one proxy; onProgress(pct). Portrait sources scale to 540 wide, everything keeps aspect.
   15-frame GOP so a seek lands within half a second of decode. NVENC first, x264 fallback. */
export function makeProxy(src, onProgress = () => {}, onLog = () => {}) {
  return new Promise((done) => {
    const abs = srcToPath(src); const out = proxyPathFor(src);
    if (!abs || !out) return done({ src, ok: false, error: "not found" });
    if (existsSync(out)) return done({ src, ok: true, proxy: proxyUrl(out), cached: true });
    const info = probe(src) || {};
    const dur = info.duration || 0;
    const alpha = extname(abs).toLowerCase() === ".webm" && info.alpha;
    const scale = `scale='min(540,iw)':-2`;
    const tmp = out + ".part" + extname(out);
    const attempts = alpha
      ? [["-c:v", "libvpx-vp9", "-i", abs, "-vf", scale, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "34", "-g", "15", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-an"]]
      : [["-i", abs, "-vf", scale, "-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "30", "-g", "15", "-bf", "0", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart"],
         ["-i", abs, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart"]];
    const run = (i) => {
      if (i >= attempts.length) return done({ src, ok: false, error: "ffmpeg failed" });
      const args = ["-y", "-v", "error", "-progress", "pipe:1", "-nostats", ...attempts[i], tmp];
      const ff = spawn("ffmpeg", args);
      let err = "";
      ff.stdout.on("data", (b) => { const m = String(b).match(/out_time_ms=(\d+)/g); if (m && dur) { const ms = +m[m.length - 1].split("=")[1]; onProgress(Math.min(99, Math.round((ms / 1e6 / dur) * 100))); } });
      ff.stderr.on("data", (b) => { err += String(b); onLog(String(b)); });
      ff.on("close", (code) => {
        if (code === 0 && existsSync(tmp)) { renameSync(tmp, out); onProgress(100); done({ src, ok: true, proxy: proxyUrl(out) }); }
        else { try { unlinkSync(tmp); } catch {} onLog(`[proxy] attempt ${i + 1} failed (${code}): ${err.slice(-200)}\n`); run(i + 1); }
      });
    };
    run(0);
  });
}

/* ------------------------------------------------------------------ project creation + ingest import */
export function readWords(reel) {
  const NN = String(reel).padStart(2, "0");
  const f = join(REELS, "assets", `r${NN}`, "words.js");
  if (!existsSync(f)) return null;
  const g = {}; new Function("window", readFileSync(f, "utf8"))(g);
  return g.__WORDS || null;
}
export function readCuts(reel) {
  const NN = String(reel).padStart(2, "0");
  const f = join(REELS, "assets", `r${NN}`, "cuts.json");
  if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, "utf8"));
  return (Array.isArray(j) ? j : j.cuts || []).map((c) => (typeof c === "number" ? { t: c } : c));
}
export function createProject({ reel, slug, title, fps, width, height, importIngest = true, id } = {}) {
  const NN = reel != null ? String(reel).padStart(3, "0") : null;
  const pid = id || (NN ? `reel-${NN}-${(slug || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : (slug || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  if (!isSafeId(pid)) throw new Error(`bad id ${pid}`);
  if (existsSync(projectPath(pid))) throw new Error(`project ${pid} already exists`);
  const p = M.newProject({ id: pid, title: title || (reel != null ? `Reel ${reel}` : pid), reel: reel ?? null, fps: fps || 30, width: width || 1080, height: height || 1920 });
  const notes = [];
  if (importIngest && reel != null) {
    const dir = `assets/r${String(reel).padStart(2, "0")}`;
    const abs = join(REELS, dir);
    if (existsSync(abs)) {
      const v = M.videoTracks(p), a = M.audioTracks(p);
      const fc = ["facecam-fix.mp4", "facecam.mp4", "facecam.mov"].map((f) => `${dir}/${f}`).find((s) => existsSync(srcToPath(s)));
      const vo = ["vo.mp3", "vo.wav", "vo-raw.mp3", "vo-raw.wav", "vo-raw.m4a"].map((f) => `${dir}/${f}`).find((s) => existsSync(srcToPath(s)));
      let dur = null;
      if (vo) { const pr = probe(vo); dur = pr?.duration || null; }
      if (!dur && fc) { const pr = probe(fc); dur = pr?.duration || null; }
      if (dur) p.duration = M.quant(dur, p.fps);
      if (fc) {
        const pr = probe(fc) || {};
        if (pr.fps && Math.abs(pr.fps - 29.97) < 0.02 && !fps) { p.fps = 30; notes.push("facecam is 29.97 fps; project fps stays 30 (the renders have always been 30)"); }
        M.addClip(p, "video", { name: "facecam", src: fc, start: 0, duration: Math.min(p.duration, pr.duration || p.duration), mediaDuration: pr.duration || null, mediaWidth: pr.width || null, mediaHeight: pr.height || null, track: v[0].id, fit: "cover" });
        notes.push(`facecam ${basename(fc)} on ${v[0].name}`);
      }
      if (vo) {
        const pr = probe(vo) || {};
        M.addClip(p, "audio", { name: "VO", src: vo, start: 0, duration: Math.min(p.duration, pr.duration || p.duration), mediaDuration: pr.duration || null, track: a[0].id, volume: 1 });
        notes.push(`VO ${basename(vo)} on ${a[0].name}, ${pr.duration}s`);
      }
      const words = readWords(reel);
      if (words) { p.words = words; notes.push(`${words.length} words from words.js (captions are built from these)`); }
      const cuts = readCuts(reel);
      if (cuts && cuts.length) { for (const c of cuts) M.addMarker(p, c.t, c.kind === "quiet" ? "quiet cut" : "jump cut", "#7CC4FF"); notes.push(`${cuts.length} of your jump cuts as markers`); }
    } else notes.push(`no ${dir} folder yet; put facecam.mp4 in it and run node tools/ingest.mjs ${reel}, then Import ingest`);
  }
  saveProject(p, { history: false, source: "create" });
  return { project: p, notes };
}

/* ------------------------------------------------------------------ build
   Two outputs from one compile:
   variants/<id>.html      the artifact of record, ../assets paths (what every other variant uses)
   <reels root>/index.html the file `hyperframes check` and `hyperframes render` read. HyperFrames
                           resolves asset paths against the PROJECT ROOT and refuses "../", so the
                           build has to live at the root, exactly as the old per-reel pipeline did
                           (copy the variant to index.html with paths rewritten to assets/).
   The previous index.html is backed up once to .ravyn/index.backup.html unless it is already
   an editor build. */
export function buildProject(p, { slice = null } = {}) {
  let q = p;
  if (slice) q = M.sliceProject(p, slice.from, slice.to);
  const variant = join(VARIANTS, `${q.id}.html`);
  const index = join(REELS, "index.html");
  if (existsSync(index)) {
    const head = readFileSync(index, "utf8").slice(0, 400);
    if (!head.includes("ravyn BUILD")) copyFileSync(index, join(CACHE, "index.backup.html"));
  }
  writeFileSync(variant, compileHtml(q, { assetBase: "../", fontBase: "../fonts/" }));
  writeFileSync(index, compileHtml(q, { assetBase: "", fontBase: "fonts/" }));
  return { id: q.id, variant, dir: REELS, index, validate: M.validate(q), duration: q.duration };
}
export function nextRenderName(id) {
  mkdirSync(RENDERS, { recursive: true });
  let n = 0;
  for (const f of readdirSync(RENDERS)) { const m = f.match(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v(\\d+)\\.mp4$`)); if (m) n = Math.max(n, +m[1]); }
  return join(RENDERS, `${id}-v${n + 1}.mp4`);
}

/* ------------------------------------------------------------------ ingest + the board */
export function readIngest(reel) {
  const NN = String(reel).padStart(2, "0"); const dir = `assets/r${NN}`;
  const f = join(REELS, dir, "ingest.json");
  const j = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  const pick = (names) => names.map((n) => `${dir}/${n}`).filter((s) => { const a = srcToPath(s); return a && existsSync(a) && statSync(a).size > 0; });
  const facecam = pick(["facecam-fix.mp4", "facecam.mp4", "facecam.mov"]);
  const sfxDir = join(REELS, dir, "sfx");
  const sceneSfx = existsSync(sfxDir) ? readdirSync(sfxDir).filter((x) => /^scene/i.test(x)).map((x) => `${dir}/sfx/${x}`) : [];
  return { reel, dir, ingest: !!j, facecam: facecam[0] || null, sceneSfx, words: !!readWords(reel), cuts: (readCuts(reel) || []).length };
}
/* the board: one frame per scene at its peak, one HTML page to check the whole reel before a render */
export async function buildBoard(p, onLine = () => {}) {
  const spans = M.sceneSpans(p);
  if (!spans.length) throw new Error("no scene spans: add the facecam block and its states first");
  buildProject(p);
  const outDir = join(CACHE, "board", p.id);
  rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true });
  // each frame sits at the scene's PEAK: after the last element of the span has
  // landed (elements ride in on their words, so 0.6 s in is often an empty card). A note can pin
  // the time with boardNotes[].at; otherwise the last element start + 0.45 s, inside the span.
  const times = spans.map((s) => {
    const pinned = (p.boardNotes || []).find((n) => Math.abs((+n.t || 0) - s.t) < 0.06 && n.at != null);
    if (pinned) return +Math.min(s.end - 0.06, Math.max(s.t + 0.05, +pinned.at)).toFixed(3);
    const starts = p.clips.filter((c) => c.type !== "facecam" && c.type !== "audio" && c.type !== "caption" && c.start >= s.t - 0.001 && c.start < s.end - 0.3).map((c) => c.start);
    const peak = starts.length ? Math.max(...starts) + 0.45 : s.t + Math.min(0.6, s.dur / 2);
    return +Math.min(s.end - 0.06, Math.max(s.t + 0.3, peak)).toFixed(3);
  });
  const j = await runJob("npx", hfArgs("snapshot", REELS, "--at", times.join(","), "-o", outDir, "--no-end", "--describe", "false"), { onLine });
  // only the frames: hyperframes snapshot also writes contact-sheet-N.jpg, which would sort first and shift every image
  const files = readdirSync(outDir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !/^contact-sheet/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length) throw new Error(`snapshot produced no frames (exit ${j.code})`);
  const words = p.words || [];
  const name = `BOARD-${p.id}.html`;
  mkdirSync(join(REELS, "boards"), { recursive: true });
  const file = join(REELS, "boards", name);
  const frames = spans.map((s, i) => {
    const f = files[Math.min(i, files.length - 1)];
    let data = "";
    try { data = "data:image/jpeg;base64," + execFileSync("ffmpeg", ["-v", "error", "-i", join(outDir, f), "-vf", "scale=540:-2", "-q:v", "5", "-f", "image2", "-vcodec", "mjpeg", "pipe:1"], { maxBuffer: 32 * 1024 * 1024 }).toString("base64"); } catch {}
    const vo = words.filter((w) => w.start >= s.t - 0.001 && w.start < s.end - 0.001).map((w) => w.text).join(" ");
    const active = p.clips.filter((c) => c.type !== "facecam" && c.type !== "audio" && c.type !== "caption" && c.start < s.end && M.clipEnd(c) > s.t).map((c) => c.name || c.type);
    const sfx = p.clips.filter((c) => c.type === "audio" && c.start >= s.t - 0.05 && c.start < s.end).map((c) => basename(c.src)).join(", ");
    const ty = s.state === "full" ? ["full-face", "FULL FACE"] : s.state === "stack" ? ["card", "FACE + ELEMENT · STACK"] : s.state === "bubble" ? ["card", "FACE + ELEMENT · BUBBLE"] : ["noface", "ELEMENTS ONLY"];
    const cap = s.sys || (M.CAPTION_FOR[s.state] || M.CAPTION_FOR.full).sys;
    // a cut script can write the transition in and one line of motion under every frame:
    // p.boardNotes = [{ t, in, motion }], keyed on the span start
    const bn = (p.boardNotes || []).find((n) => Math.abs((+n.t || 0) - s.t) < 0.06) || {};
    const notes = (bn.in ? `<p class="m"><b>transition in:</b> ${esc(bn.in)}</p>` : "") + (bn.motion ? `<p class="m"><b>motion:</b> ${esc(bn.motion)}</p>` : "");
    return `<div class="fr"><div class="fr-h"><span class="n">${i + 1}</span><span class="ty ${ty[0]}">${ty[1]}</span><span class="t">${s.t.toFixed(2)}s to ${s.end.toFixed(2)}s · ${s.dur.toFixed(2)}s</span></div>` +
      `${data ? `<img src="${data}" alt="scene ${i + 1}"/>` : `<div class="nofr">no frame</div>`}` +
      `<div class="fr-b"><p class="vo">${vo ? esc(vo) : "<i>no words in this span</i>"}</p><p class="m"><b>on screen:</b> ${active.length ? esc(active.join(", ")) : "your footage only"}</p><p class="m"><b>captions:</b> ${cap}</p>${notes}<p class="m"><b>sfx:</b> ${sfx ? esc(sfx) : "none"}</p></div></div>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>BOARD · ${esc(p.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0c0a;color:#e8eae8;font:400 15px/1.6 Inter,"Segoe UI",system-ui;padding:34px 22px 70px}
header{max-width:1500px;margin:0 auto 26px}
h1{font:800 34px/1.1 Inter;color:#fff;margin-bottom:10px}
.sub{font:400 14px/1.6 Inter;color:#a4aca4;max-width:1040px}
.sub code{font:400 12.5px/1 ui-monospace,Consolas,monospace;background:#161a16;padding:3px 6px;border-radius:4px;color:#7cc4ff}
.grid{max-width:1500px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}
.fr{background:#12160f;border:1px solid #252b25;border-radius:13px;overflow:hidden;display:flex;flex-direction:column}
.fr-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:11px 13px;border-bottom:1px solid #252b25;background:#0e120e}
.n{font:800 15px/1 Inter;color:#fff;background:#252b25;padding:5px 9px;border-radius:5px;min-width:38px;text-align:center}
.ty{font:700 8.5px/1 ui-monospace,monospace;letter-spacing:.12em;padding:5px 7px;border-radius:4px}
.full-face{background:#14A800;color:#08120a}.card{background:#7BD64B;color:#08120a}.noface{background:#8a928a;color:#08120a}
.t{font:500 11px/1 ui-monospace,monospace;color:#96a096;margin-left:auto}
.fr img{width:100%;display:block;aspect-ratio:9/16;object-fit:cover;background:#000}
.nofr{aspect-ratio:9/16;display:grid;place-items:center;color:#667066}
.fr-b{padding:11px 13px}
.vo{font:500 14px/1.5 Inter;color:#e8eae8;margin-bottom:8px}
.m{font:400 12px/1.5 Inter;color:#96a096}.m b{color:#c4ccc4}
</style></head><body>
<header><h1>${esc(p.title)}</h1><p class="sub">The board: one frame per scene at its peak (built ${new Date().toISOString().slice(0, 16).replace("T", " ")} from <code>projects/${esc(p.id)}.json</code>, ${spans.length} scenes, ${p.duration}s). Look at every frame before you render.</p></header>
<div class="grid">
${frames}
</div>
</body></html>
`;
  writeFileSync(file, html);
  return { file: toPosix(file), name, frames: files.length, url: `/reels/boards/${name}` };
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ job runner (streams lines) */
// The hyperframes render process caps its V8 heap at ~4 GB and can die on a long reel with several
// 1080p sources ("Reached heap limit"). Every job gets an 8 GB ceiling unless the caller set one.
const JOB_ENV = process.env.NODE_OPTIONS ? process.env : { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" };
export function runJob(cmd, args, { cwd = REELS, onLine = () => {}, env = JOB_ENV } = {}) {
  return new Promise((done) => {
    const shell = process.platform === "win32";
    const a = shell ? args.map((x) => (/[\s&()^"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)) : args;
    const cmdQ = shell && /\s/.test(cmd) ? `"${cmd}"` : cmd;   // node.exe lives in "Program Files"
    onLine(`$ ${cmdQ} ${a.join(" ")}\n`);
    let child;
    try { child = shell ? spawn(`${cmdQ} ${a.join(" ")}`, { cwd, shell: true, env, windowsHide: true }) : spawn(cmd, a, { cwd, env }); }
    catch (e) { onLine(`spawn failed: ${e.message}\n`); return done({ code: 1 }); }
    let tail = "";
    const feed = (b) => { const s = String(b); tail = (tail + s).slice(-4000); onLine(s); };
    child.stdout.on("data", feed); child.stderr.on("data", feed);
    child.on("close", (code) => done({ code, tail }));
  });
}
export function hfArgs(sub, ...rest) { return ["--yes", HF, sub, ...rest]; }
