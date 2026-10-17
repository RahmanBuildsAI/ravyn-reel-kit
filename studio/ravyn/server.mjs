#!/usr/bin/env node
// The ravyn server. Zero dependencies.
//   node ravyn/server.mjs [port] [--lan]   default port 3140, open http://localhost:3140
//   --lan also listens on the home network, so a phone on the same WiFi can review (the URL prints)
// Serves the editor UI, the reels root (assets, fonts, renders) with HTTP Range so video seeks
// work, the proxies, and a small JSON API. Long jobs (proxies, check, render) stream their output
// over Server-Sent Events at /api/events.
import http from "node:http";
import { existsSync, readFileSync, statSync, createReadStream, readdirSync, watch, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, extname, resolve, normalize } from "node:path";
import { execSync, spawn, execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createInterface } from "node:readline";
import * as M from "./lib/model.mjs";
import { families } from "./lib/fonts.mjs";
import * as O from "./lib/node-ops.mjs";

const ARGS = process.argv.slice(2);
const PORT = +(ARGS.find((a) => /^\d+$/.test(a)) || process.env.RAVYN_PORT || 3140);
const LAN = ARGS.includes("--lan");
const UI = join(O.TOOL, "ui");
const LIB = join(O.TOOL, "lib");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".flac": "audio/flac", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8" };

/* ------------------------------------------------------------------ SSE */
const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch { clients.delete(res); } }
}
const log = (job, text) => broadcast("log", { job, text });

/* ------------------------------------------------------------------ helpers */
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(b), "Cache-Control": "no-store" }); res.end(b); }
function readBody(req) { return new Promise((ok, bad) => { const chunks = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > 80e6) { bad(new Error("body too large")); req.destroy(); } chunks.push(c); }); req.on("end", () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { bad(e); } }); req.on("error", bad); }); }
function serveFile(req, res, abs, { cache = false } = {}) {
  if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); return res.end("not found"); }
  const st = statSync(abs); const type = MIME[extname(abs).toLowerCase()] || "application/octet-stream";
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache ? "public, max-age=3600" : "no-store", "Last-Modified": st.mtime.toUTCString() };
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    let a = m && m[1] ? +m[1] : 0, b = m && m[2] ? +m[2] : st.size - 1;
    if (m && !m[1] && m[2]) { a = Math.max(0, st.size - +m[2]); b = st.size - 1; }
    if (a >= st.size || b >= st.size || a > b) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Content-Length": b - a + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(abs, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(abs).pipe(res);
}
function safeJoin(root, rel) {
  const abs = normalize(join(root, decodeURIComponent(rel)));
  return abs.startsWith(root) ? abs : null;
}

/* ------------------------------------------------------------------ jobs */
let busy = null;          // one heavy job at a time (check / render)
const proxyQueue = []; let proxyRunning = false;
async function pumpProxies() {
  if (proxyRunning) return; proxyRunning = true;
  while (proxyQueue.length) {
    const src = proxyQueue.shift();
    broadcast("proxy", { src, pct: 0 });
    const r = await O.makeProxy(src, (pct) => broadcast("proxy", { src, pct }), (t) => log("proxy", t));
    broadcast("proxy", { src, pct: 100, done: true, ok: r.ok, proxy: r.proxy || null, error: r.error || null });
  }
  proxyRunning = false;
}
async function heavy(name, fn) {
  if (busy) throw new Error(`${busy} is still running`);
  busy = name; broadcast("job", { job: name, state: "start" });
  try { const r = await fn(); broadcast("job", { job: name, state: "done", ...r }); return r; }
  catch (e) { broadcast("job", { job: name, state: "error", error: String(e.message || e) }); throw e; }
  finally { busy = null; }
}
function parseCheck(tail) {
  const errors = (tail.match(/(\d+)\s+errors?/i) || [])[1];
  const warnings = (tail.match(/(\d+)\s+warnings?/i) || [])[1];
  const wcag = (tail.match(/(\d+)\/(\d+)\s+text checks pass WCAG/i) || []);
  return { errors: errors != null ? +errors : null, warnings: warnings != null ? +warnings : null, wcag: wcag.length ? `${wcag[1]}/${wcag[2]}` : null, overlap: (tail.match(/content_overlap/g) || []).length, occluded: (tail.match(/text_occluded/g) || []).length };
}

/* an editor save: records your hand edits (lib/edits.mjs) and refuses a stale project. If cut.mjs
   rebuilt the reel after the editor loaded it, saving the old copy would wipe the build; the editor
   gets a 409 and reloads instead. */
function editorSave(res, project) {
  const f = O.projectPath(project.id);
  if (existsSync(f)) {
    let disk = null; try { disk = JSON.parse(readFileSync(f, "utf8")).meta || {}; } catch {}
    if (disk && (disk.source === "build" || disk.source === "create") && String(disk.modified || "") > String(project.meta?.modified || "")) {
      json(res, 409, { error: "stale", message: "the reel was rebuilt on disk after you opened it; reloading the new build", modified: disk.modified });
      return false;
    }
  }
  O.saveProject(project, { source: "editor" });
  return true;
}

/* ------------------------------------------------------------------ routes */
async function api(req, res, url) {
  const p = url.pathname; const q = url.searchParams;
  if (p === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify({ busy, proxies: proxyQueue.length })}\n\n`);
    clients.add(res); req.on("close", () => clients.delete(res));
    return;
  }
  if (p === "/api/state") return json(res, 200, { port: PORT, reels: O.toPosix(O.REELS), projects: O.listProjects(), roots: O.mediaRoots(), fonts: families(), busy, pack: existsSync(O.PACK) });
  if (p === "/api/projects") return json(res, 200, O.listProjects());
  if (p === "/api/project" && req.method === "GET") {
    const id = q.get("id"); if (!id || !O.isSafeId(id)) return json(res, 400, { error: "bad id" });
    if (!existsSync(O.projectPath(id))) return json(res, 404, { error: "no such project" });
    const project = O.loadProject(id);
    const srcs = O.videoSrcs(project);
    return json(res, 200, { project, proxies: O.proxyMap(srcs), history: O.historyOf(id).slice(0, 10) });
  }
  if (p === "/api/project" && req.method === "POST") {
    const body = await readBody(req); const project = body.project;
    if (!project || !O.isSafeId(project.id)) return json(res, 400, { error: "bad project" });
    M.normalize(project);
    if (!editorSave(res, project)) return;
    const file = O.projectPath(project.id);
    return json(res, 200, { ok: true, file: O.toPosix(file), modified: project.meta.modified, validate: M.validate(project) });
  }
  if (p === "/api/project/new" && req.method === "POST") {
    const body = await readBody(req);
    try { const r = O.createProject(body); return json(res, 200, { ok: true, ...r, proxies: O.proxyMap(O.videoSrcs(r.project)) }); }
    catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }
  if (p === "/api/project/import-ingest" && req.method === "POST") {
    // re-run the ingest import on an existing project (after ingest-vo.mjs finished later)
    const body = await readBody(req); const project = body.project; if (!project || project.reel == null) return json(res, 400, { error: "project has no reel number" });
    const tmp = O.createProject.length; void tmp;
    const words = O.readWords(project.reel), cuts = O.readCuts(project.reel);
    if (words) project.words = words;
    if (cuts && !project.markers.length) for (const c of cuts) M.addMarker(project, c.t, c.kind === "quiet" ? "quiet cut" : "jump cut", "#7CC4FF");
    return json(res, 200, { ok: true, project, words: words ? words.length : 0, cuts: cuts ? cuts.length : 0 });
  }
  if (p === "/api/notes" && req.method === "GET") {
    const id = q.get("id"); if (!O.isSafeId(id || "")) return json(res, 400, { error: "bad id" });
    return json(res, 200, O.loadNotes(id));
  }
  if (p === "/api/notes" && req.method === "POST") {
    // the editor sends the whole list; one person edits, so the last write wins
    const body = await readBody(req); const id = body.id;
    if (!O.isSafeId(id || "") || !existsSync(O.projectPath(id))) return json(res, 400, { error: "bad id" });
    const doc = O.saveNotes(id, body.doc); lastNotesWrite = Date.now();
    try { O.snapshotForNotes(id, doc); } catch (e) { console.warn("snapshot:", e.message); }
    return json(res, 200, { ok: true, doc });
  }
  if (p === "/api/snapshot") {
    // the project as it was when a note was made: the "before" of a fix
    const id = q.get("id"), mod = q.get("modified"); if (!O.isSafeId(id || "") || !mod) return json(res, 400, {});
    const snap = O.loadSnapshot(id, mod); return snap ? json(res, 200, { project: snap }) : json(res, 404, { error: "no snapshot for that version" });
  }
  if (p === "/api/edits") { const id = q.get("id"); if (!O.isSafeId(id || "")) return json(res, 400, {}); return json(res, 200, O.loadEdits(id)); }
  if (p === "/api/transcribe" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.audio) return json(res, 400, { error: "no audio" });
    try { return json(res, 200, { text: await transcribe(Buffer.from(body.audio, "base64")) }); }
    catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }
  if (p === "/api/history") { const id = q.get("id"); if (!O.isSafeId(id || "")) return json(res, 400, {}); return json(res, 200, O.historyOf(id)); }
  if (p === "/api/history/load") {
    const id = q.get("id"), file = q.get("file"); if (!O.isSafeId(id || "") || !/^[\w-]+\.json$/.test(file || "")) return json(res, 400, {});
    const abs = join(O.HISTORY, id, file); if (!existsSync(abs)) return json(res, 404, {});
    return json(res, 200, { project: M.normalize(JSON.parse(readFileSync(abs, "utf8"))) });
  }
  if (p === "/api/media") return json(res, 200, O.listDir(q.get("dir") || "assets", { probeAll: q.get("probe") === "1" }));
  if (p === "/api/probe") { const src = q.get("src"); return json(res, 200, O.probe(src) || { error: "not found", src }); }
  if (p === "/api/proxies" && req.method === "POST") { const body = await readBody(req); return json(res, 200, O.proxyMap(body.srcs || [])); }
  if (p === "/api/proxy" && req.method === "POST") {
    const body = await readBody(req); const srcs = (body.srcs || []).filter((s) => typeof s === "string");
    let queued = 0;
    for (const s of srcs) { const px = O.proxyPathFor(s); if (px && !existsSync(px) && !proxyQueue.includes(s)) { proxyQueue.push(s); queued++; } }
    pumpProxies();
    return json(res, 200, { ok: true, queued, ready: O.proxyMap(srcs) });
  }
  if (p === "/api/words") { const reel = +q.get("reel"); return json(res, 200, { words: O.readWords(reel) || [], cuts: O.readCuts(reel) || [] }); }
  if (p === "/api/ingest") { const reel = +q.get("reel"); if (!reel) return json(res, 400, { error: "reel?" }); return json(res, 200, O.readIngest(reel)); }
  if (p === "/api/board" && req.method === "POST") {
    const body = await readBody(req); const project = body.project ? M.normalize(body.project) : O.loadProject(body.id);
    if (body.project && !editorSave(res, project)) return;
    try {
      const r = await heavy("board", async () => O.buildBoard(project, (t) => log("board", t)));
      return json(res, 200, { ok: true, ...r });
    } catch (e) { return json(res, 409, { error: String(e.message || e) }); }
  }
  if (p === "/api/compile" && req.method === "POST") {
    const body = await readBody(req); const project = body.project ? M.normalize(body.project) : O.loadProject(body.id);
    if (body.project && !editorSave(res, project)) return;
    const r = O.buildProject(project, { slice: body.slice || null });
    log("compile", `compiled -> ${O.toPosix(r.variant)}\n`);
    return json(res, 200, { ok: true, variant: O.toPosix(r.variant), index: O.toPosix(r.index), validate: r.validate, url: `/reels/variants/${r.id}.html` });
  }
  if (p === "/api/check" && req.method === "POST") {
    const body = await readBody(req); const project = body.project ? M.normalize(body.project) : O.loadProject(body.id);
    if (body.project && !editorSave(res, project)) return;
    try {
      const r = await heavy("check", async () => {
        const b = O.buildProject(project, { slice: body.slice || null });
        const j = await O.runJob("npx", O.hfArgs("check", b.dir), { onLine: (t) => log("check", t) });
        return { code: j.code, summary: parseCheck(j.tail), variant: O.toPosix(b.variant), validate: b.validate };
      });
      return json(res, 200, { ok: true, ...r });
    } catch (e) { return json(res, 409, { error: String(e.message || e) }); }
  }
  if (p === "/api/render" && req.method === "POST") {
    const body = await readBody(req); const project = body.project ? M.normalize(body.project) : O.loadProject(body.id);
    if (body.project && !editorSave(res, project)) return;
    const slice = body.from != null && body.to != null ? { from: +body.from, to: +body.to } : null;
    try {
      const r = await heavy(slice ? "test-render" : "render", async () => {
        const b = O.buildProject(project, { slice });
        const out = slice ? join(O.RENDERS, `${project.id}-test-${String(slice.from).replace(".", "_")}s.mp4`) : O.nextRenderName(project.id);
        const args = O.hfArgs("render", b.dir, "-o", out, "--fps", String(project.fps), "--sdr", "--video-frame-format", "png", "-q", body.quality || "standard", "--workers", String(body.workers || 2));
        if (body.gpu !== false) args.push("--gpu");
        const j = await O.runJob("npx", args, { onLine: (t) => log("render", t) });
        return { code: j.code, out: O.toPosix(out), url: existsSync(out) ? `/reels/renders/${out.split(/[\\/]/).pop()}` : null, variant: O.toPosix(b.variant) };
      });
      return json(res, 200, { ok: r.code === 0, ...r });
    } catch (e) { return json(res, 409, { error: String(e.message || e) }); }
  }
  if (p === "/api/renders") {
    const id = q.get("id") || ""; if (!existsSync(O.RENDERS)) return json(res, 200, []);
    const list = readdirSync(O.RENDERS).filter((f) => f.startsWith(id) && /\.(mp4|webm)$/.test(f)).map((f) => ({ file: f, url: `/reels/renders/${f}`, size: statSync(join(O.RENDERS, f)).size, mtime: statSync(join(O.RENDERS, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, list);
  }
  if (p === "/api/open" && req.method === "POST") {
    // open a rendered file or folder in Explorer (your machine, your call)
    const body = await readBody(req); const rel = String(body.path || "");
    const abs = safeJoin(O.REELS, rel); if (!abs || !existsSync(abs)) return json(res, 404, {});
    try { execSync(`start "" "${abs}"`, { shell: "cmd.exe", windowsHide: true }); } catch {}
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: "no such route" });
}

/* a note fixed from the CLI (cli.mjs note-fix) shows up in the open editor without a reload */
let lastNotesWrite = 0; const notesTimers = new Map();
try {
  watch(O.NOTES_DIR, (ev, file) => {
    if (!file || !/^[\w.-]+\.json$/.test(file)) return;
    const id = file.replace(/\.json$/, "");
    clearTimeout(notesTimers.get(id));
    notesTimers.set(id, setTimeout(() => { if (Date.now() - lastNotesWrite > 400) broadcast("notes", { id }); }, 150));
  });
} catch (e) { console.warn("notes watch off:", e.message); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p.startsWith("/api/")) return await api(req, res, url);
    if (p === "/" || p === "/index.html") return serveFile(req, res, join(UI, "index.html"));
    if (p === "/stage.html") return serveFile(req, res, join(UI, "stage.html"));
    if (p.startsWith("/ui/")) { const abs = safeJoin(UI, p.slice(4)); return abs ? serveFile(req, res, abs) : json(res, 403, {}); }
    if (p.startsWith("/lib/")) { const abs = safeJoin(LIB, p.slice(5)); return abs ? serveFile(req, res, abs) : json(res, 403, {}); }
    if (p.startsWith("/reels/")) { const abs = safeJoin(O.REELS, p.slice(7)); return abs ? serveFile(req, res, abs, { cache: /\.(mp4|webm|mp3|wav|woff2|ttf|png|jpg)$/i.test(abs) }) : json(res, 403, {}); }
    if (p.startsWith("/pack/")) { const abs = safeJoin(O.PACK, p.slice(6)); return abs ? serveFile(req, res, abs, { cache: true }) : json(res, 403, {}); }
    if (p.startsWith("/proxy/")) { const abs = safeJoin(O.PROXY_DIR, p.slice(7)); return abs ? serveFile(req, res, abs, { cache: true }) : json(res, 403, {}); }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: String(e.message || e) });
    else res.end();
  }
});
/* a build (cut.mjs) rewrote a project: tell the open editor, which reloads it */
const projTimers = new Map();
try {
  watch(O.PROJECTS, (ev, file) => {
    if (!file || !/^[\w.-]+\.json$/.test(file)) return;
    const id = file.replace(/\.json$/, "");
    clearTimeout(projTimers.get(id));
    projTimers.set(id, setTimeout(() => {
      try { const m = JSON.parse(readFileSync(join(O.PROJECTS, file), "utf8")).meta || {}; if (m.source === "build" || m.source === "create") broadcast("project-changed", { id, modified: m.modified }); } catch {}
    }, 300));
  });
} catch (e) { console.warn("project watch off:", e.message); }

/* voice notes: one Whisper worker (lib/transcribe.py), started on the first note, kept warm */
let whisperProc = null, whisperReady = null, whisperQueue = Promise.resolve();
function whisperWorker() {
  if (whisperReady) return whisperReady;
  whisperReady = new Promise((ok, bad) => {
    whisperProc = spawn("python", [join(O.TOOL, "lib", "transcribe.py")], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const rl = createInterface({ input: whisperProc.stdout });
    const waiting = [];
    whisperProc.pending = waiting;
    rl.on("line", (line) => { let m; try { m = JSON.parse(line); } catch { return; } if (m.ready) { console.log(`voice notes: whisper ${m.model} on ${m.device}`); ok(); } else waiting.shift()?.(m); });
    whisperProc.stderr.on("data", () => {});
    whisperProc.on("exit", (code) => { whisperReady = null; for (const w of waiting.splice(0)) w({ error: `whisper stopped (${code})` }); bad(new Error(`whisper worker exited (${code})`)); });
  });
  return whisperReady;
}
function transcribe(buf) {
  const job = async () => {
    await whisperWorker();
    const dir = join(O.CACHE, "voice"); mkdirSync(dir, { recursive: true });
    const stem = join(dir, `note-${Date.now()}`), src = stem + ".webm", wav = stem + ".wav";
    writeFileSync(src, buf);
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "16000", wav], { windowsHide: true });
      const m = await new Promise((ok) => { whisperProc.pending.push(ok); whisperProc.stdin.write(JSON.stringify({ wav }) + "\n"); });
      if (m.error) throw new Error(m.error);
      return m.text || "";
    } finally { for (const f of [src, wav]) { try { unlinkSync(f); } catch {} } }
  };
  const r = whisperQueue.then(job, job); whisperQueue = r.catch(() => {}); return r;
}

server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  const lan = LAN ? Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => `http://${i.address}:${PORT}`) : [];
  if (lan.length) console.log(`On your phone (same WiFi): ${lan.join("  ")}`);
  console.log(`ravyn  http://localhost:${PORT}\n  reels root ${O.REELS}\n  projects   ${O.PROJECTS}\n  proxies    ${O.PROXY_DIR}\n  SFX library ${existsSync(O.PACK) ? O.PACK : "(none: set SFX_LIBRARY to use one)"}`);
});
