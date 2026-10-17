// Review notes: your feedback pinned to a frame and a spot on the picture. Shared by the editor
// (ui/notes.js), the server and the CLI, so it stays pure: no DOM, no fs.
//
// A note lives in projects/notes/<id>.json, NOT in the project file: cut.mjs rewrites the project
// from scratch on every run, and a note must survive the fix it asks for.
//
//   { id, n, t, frame, x, y, w, h, to, text, status: "open" | "fixed", checked, fix, created, modified, ctx }
//
// to = {x, y}: an ARROW note, "move this there" (null for a plain spot or box). checked = you looked
// at Claude's fix and passed it; a fix you reject goes back to open with your follow-up in the text.
// The doc also holds your scene verdicts: [{ n, t, end, state, verdict: "good" | "bad", at }].
//
// t is the reel time (frame-quantised), x/y/w/h are composition px (w = h = 0 for a click, a box
// for a drag). ctx is captured when the note is made, so it reads right even after the cut moves
// on: the clips under the spot (front first), the words you are saying, the scene.
import * as M from "./model.mjs";

export const NOTES_VERSION = 1;

/* ------------------------------------------------------------------ the file */
export function emptyNotes(projectId) { return { notes_version: NOTES_VERSION, project: projectId, notes: [] }; }
export function normalizeNotes(doc, projectId) {
  const d = doc && typeof doc === "object" ? doc : emptyNotes(projectId);
  d.notes_version = NOTES_VERSION; d.project = d.project || projectId;
  d.verdicts = (Array.isArray(d.verdicts) ? d.verdicts : []).filter((v) => v && typeof v.t === "number" && (v.verdict === "good" || v.verdict === "bad")).sort((a, b) => a.t - b.t);
  d.notes = (Array.isArray(d.notes) ? d.notes : []).filter((n) => n && typeof n.t === "number").map((n) => ({
    ...n,
    id: String(n.id || ""), n: +n.n || 0, t: M.r3(n.t), frame: n.frame ?? null,
    x: Math.round(+n.x || 0), y: Math.round(+n.y || 0), w: Math.round(+n.w || 0), h: Math.round(+n.h || 0),
    to: n.to && Number.isFinite(+n.to.x) ? { x: Math.round(+n.to.x), y: Math.round(+n.to.y) } : null,
    text: String(n.text || ""), status: n.status === "fixed" ? "fixed" : "open", checked: n.status === "fixed" && !!n.checked, fix: n.fix || null,
    created: n.created || null, modified: n.modified || null, ctx: n.ctx || null,
  }));
  let max = 0; for (const n of d.notes) max = Math.max(max, n.n);
  for (const n of d.notes) { if (!n.n) n.n = ++max; if (!n.id) n.id = "n" + n.n; }
  d.notes.sort((a, b) => a.t - b.t || a.n - b.n);
  return d;
}
export function nextNumber(doc) { return (doc.notes || []).reduce((m, n) => Math.max(m, n.n || 0), 0) + 1; }

/* ------------------------------------------------------------------ what is under the spot */
/* the box a clip covers at time t (after scale + rotation), axis-aligned */
function aabb(c) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2, hw = (c.w * (c.scale || 1)) / 2, hh = (c.h * (c.scale || 1)) / 2;
  const a = ((c.rotation || 0) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * co - y * si, cy + x * si + y * co]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function hitPoint(c, px, py) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2, a = (-(c.rotation || 0) * Math.PI) / 180;
  const dx = px - cx, dy = py - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  const s = c.scale || 1;
  return Math.abs(lx) <= (c.w * s) / 2 && Math.abs(ly) <= (c.h * s) / 2;
}
const meets = (b, r) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
/* the text a clip shows at time t: a text clip's text, a caption cue's words */
function shownText(c, t) {
  if (c.type === "text") return String(c.text || "").slice(0, 160);
  if (c.type === "caption") return (c.words || []).map((w) => w.text).join(" ").slice(0, 160);
  if (c.type === "chapter") return [c.eyebrow, c.name].filter(Boolean).join(" · ").slice(0, 160) || null;
  if (c.type === "cta") return [c.line1, c.keyword].filter(Boolean).join(" ").slice(0, 160) || null;
  return null;
}
/* every visual clip at time t that covers the spot (or meets the box), front first */
export function clipsUnder(p, t, x, y, w = 0, h = 0) {
  const box = { x, y, w, h }, isBox = w > 0 && h > 0;
  return M.allClips(p)
    .filter((c) => M.clipVisible(p, c) && M.isVisual(c) && t >= c.start - M.EPS && t < M.clipEnd(c))
    .map((c) => ({ real: c, at: M.clipAt(c, t) }))
    .filter(({ at }) => (isBox ? meets(aabb(at), box) : hitPoint(at, x, y)))
    .sort((a, b) => (M.zIndexOf(p, b.real) - M.zIndexOf(p, a.real)) || (b.real.start - a.real.start))
    .map(({ real, at }) => {
      const tr = M.trackById(p, real.track), g = M.groupOf(p, real.id), bb = aabb(at);
      const o = { id: real.id, type: real.type, name: real.name || null, track: tr?.name || real.track, start: real.start, end: M.clipEnd(real), box: [Math.round(bb.x), Math.round(bb.y), Math.round(bb.w), Math.round(bb.h)] };
      if (g) o.group = g.name || g.id;
      if (real.src) o.src = real.src;
      const s = shownText(real, t); if (s) o.text = s;
      return o;
    });
}
/* the word being said at t, and the line around it */
export function wordsAt(p, t, span = 1.6) {
  const W = p.words || []; if (!W.length) return { word: null, line: null };
  const now = W.find((w) => t >= w.start - 0.02 && t < w.end + 0.02) || null;
  const line = W.filter((w) => w.end > t - span && w.start < t + span).map((w) => w.text).join(" ");
  return { word: now ? now.text : null, line: line || null };
}
/* the full context of a spot at t, written into the note when you make it */
export function captureContext(p, t, x, y, w = 0, h = 0, to = null) {
  const scenes = M.facecamOf(p) ? M.sceneSpans(p) : [];
  const sc = scenes.find((s) => t >= s.t - M.EPS && t < s.end);
  return {
    clips: clipsUnder(p, t, x, y, w, h).slice(0, 8),
    ...wordsAt(p, t),
    scene: sc ? { n: scenes.indexOf(sc) + 1, of: scenes.length, state: sc.state, from: sc.t, to: sc.end } : null,
    to: to ? { clips: clipsUnder(p, t, to.x, to.y).slice(0, 4) } : null,
    projectModified: p.meta?.modified || null,
  };
}
/* a new note at a spot; the caller gives it text */
export function makeNote(p, doc, { t, x, y, w = 0, h = 0, to = null, text = "" }) {
  const fps = p.fps || 30, tq = M.quant(t, fps), n = nextNumber(doc), now = new Date().toISOString();
  return { id: `n${n}-${Date.now().toString(36)}`, n, t: tq, frame: Math.round(tq * fps), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), to: to ? { x: Math.round(to.x), y: Math.round(to.y) } : null, text, status: "open", checked: false, fix: null, created: now, modified: now, ctx: captureContext(p, tq, x, y, w, h, to) };
}
/* recompute what an arrow points at (the note box adds the arrow after the note is made) */
export function withArrow(p, n, to) {
  const out = { ...n, to: to ? { x: Math.round(to.x), y: Math.round(to.y) } : null };
  out.ctx = { ...(n.ctx || {}), to: to ? { clips: clipsUnder(p, n.t, to.x, to.y).slice(0, 4) } : null };
  return out;
}

/* ------------------------------------------------------------------ scene verdicts */
/* your thumbs up / down on a scene. A scene is keyed by its start time (a rebuild keeps your cuts). */
export function verdictFor(doc, scene) { return (doc?.verdicts || []).find((v) => Math.abs(v.t - scene.t) < 0.05) || null; }
export function setVerdict(doc, scene, verdict) {
  doc.verdicts = (doc.verdicts || []).filter((v) => Math.abs(v.t - scene.t) >= 0.05);
  if (verdict) doc.verdicts.push({ n: scene.n, t: scene.t, end: scene.end, state: scene.state, verdict, at: new Date().toISOString() });
  doc.verdicts.sort((a, b) => a.t - b.t);
  return doc;
}

/* ------------------------------------------------------------------ reading them */
export function clock(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; }
export function where(n) {
  const at = n.w > 0 && n.h > 0 ? `box ${n.x},${n.y} ${n.w}x${n.h}` : `point ${n.x},${n.y}`;
  return n.to ? `${at}  ARROW to ${n.to.x},${n.to.y} (move it there)` : at;
}
function clipLine(c) {
  return `${c.type}${c.name ? ` "${c.name}"` : ""} ${c.id} on ${c.track}${c.group ? ` in group "${c.group}"` : ""} [${c.box.join(",")}] ${c.start}s-${c.end}s${c.src ? ` ${c.src}` : ""}${c.text ? ` text: "${c.text}"` : ""}`;
}
/* the plain-text report the CLI prints for Claude */
export function report(doc, { all = false, fps = 30 } = {}) {
  const list = doc.notes.filter((n) => all || n.status === "open");
  const open = doc.notes.filter((n) => n.status === "open").length, fixed = doc.notes.length - open, passed = doc.notes.filter((n) => n.checked).length;
  const out = [`${doc.project} · ${open} open, ${fixed} fixed (${passed} checked by you)${all ? "" : " (showing open; --all for every note)"}`, ""];
  const V = doc.verdicts || [];
  if (V.length) {
    const good = V.filter((v) => v.verdict === "good"), bad = V.filter((v) => v.verdict === "bad");
    out.push(`scene verdicts: GOOD (leave alone) ${good.map((v) => `${v.n}`).join(", ") || "none"} · BAD ${bad.map((v) => `${v.n}`).join(", ") || "none"}`);
    const silent = bad.filter((v) => !doc.notes.some((n) => n.status === "open" && n.t >= v.t - 0.01 && n.t < v.end));
    for (const v of silent) out.push(`  scene ${v.n} (${clock(v.t)}-${clock(v.end)}, ${v.state}) is BAD with no note on it: write down what is wrong`);
    out.push("");
  }
  for (const n of list) {
    out.push(`#${n.n}  ${clock(n.t)}  (${n.t}s, frame ${n.frame ?? Math.round(n.t * fps)})  ${where(n)}  [${n.status}${n.checked ? ", checked by you" : ""}]`);
    out.push(`    "${n.text}"`);
    const c = n.ctx || {};
    if (c.line) out.push(`    saying: "${c.line}"${c.word ? `  (on "${c.word}")` : ""}`);
    if (c.scene) out.push(`    scene ${c.scene.n} of ${c.scene.of}, ${c.scene.state}, ${c.scene.from}s-${c.scene.to}s`);
    if (c.clips?.length) { out.push("    under the spot, front first:"); for (const k of c.clips) out.push("      " + clipLine(k)); }
    else out.push("    under the spot: nothing but the background");
    if (c.to?.clips?.length) { out.push("    under the arrow's end:"); for (const k of c.to.clips) out.push("      " + clipLine(k)); }
    if (n.fix) out.push(`    fixed: ${n.fix.note || ""} (${n.fix.at || ""})`);
    out.push("");
  }
  if (!list.length) out.push(all ? "no notes yet" : "no open notes");
  return out.join("\n");
}
