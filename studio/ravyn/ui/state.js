// Shared editor state, the event bus, undo/redo and autosave. Every module imports this.
import * as M from "/lib/model.mjs";
import { debounce } from "/ui/util.js";

export const S = {
  project: null, proxies: {}, useProxy: true, scope: null,
  sel: new Set(), hoverId: null,
  t: 0, playing: false, speed: 1,
  zoom: 40, scrollX: 0, tool: "select", snap: true, snapWords: false, safe: false, selKey: null, stopAt: null,
  undo: [], redo: [], dirty: false, saveState: "idle", saveError: null,
  mediaPick: null, clipboard: null, fonts: [], roots: [], busy: null,
};
export const bus = {
  m: new Map(),
  on(t, f) { (this.m.get(t) || this.m.set(t, new Set()).get(t)).add(f); return () => this.off(t, f); },
  off(t, f) { this.m.get(t)?.delete(f); },
  emit(t, d) { for (const f of this.m.get(t) || []) { try { f(d); } catch (e) { console.error(`[bus:${t}]`, e); } } },
};

/* ---------------------------------------------------------------- api */
export async function api(path, body, method) {
  const r = await fetch(path, body ? { method: method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: method || "GET" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status} ${path}`);
  return j;
}

/* ---------------------------------------------------------------- project + undo */
const snap = () => JSON.stringify(S.project);
export function setProject(p, extras = {}) {
  S.project = p ? M.normalize(p) : null;
  S.proxies = extras.proxies || {};
  S.sel.clear(); S.undo = []; S.redo = []; S.dirty = false; S.saveState = p ? "saved" : "idle";
  S.t = 0;
  bus.emit("project", { reason: "load" });
  bus.emit("selection"); bus.emit("time"); bus.emit("save");
}
/* one undoable edit: fn(project) mutates in place */
export function commit(label, fn) {
  if (!S.project) return;
  const before = snap();
  let r;
  try { r = fn(S.project); } catch (e) { console.error(label, e); bus.emit("toast", { text: String(e.message || e), bad: true }); return; }
  M.normalizeGroups(S.project);
  const after = snap();
  if (after === before) return r;
  push(before);
  markDirty();
  bus.emit("project", { reason: label });
  return r;
}
let liveBefore = null;
export function beginLive() { if (!S.project || liveBefore != null) return; liveBefore = snap(); }
export function live(fn, reason = "live") { if (!S.project) return; try { fn(S.project); } catch (e) { console.error(e); } M.normalizeGroups(S.project); bus.emit("project", { reason, live: true }); }
export function endLive(label = "edit") {
  if (liveBefore == null) return;
  const before = liveBefore; liveBefore = null;
  if (before !== snap()) { push(before); markDirty(); }
  bus.emit("project", { reason: label });
}
export function cancelLive() { if (liveBefore == null) return; S.project = M.normalize(JSON.parse(liveBefore)); liveBefore = null; bus.emit("project", { reason: "cancel" }); }
function push(before) { S.undo.push(before); if (S.undo.length > 200) S.undo.shift(); S.redo = []; }
export function undo() {
  if (!S.undo.length) return;
  S.redo.push(snap()); S.project = M.normalize(JSON.parse(S.undo.pop()));
  pruneSelection(); if (S.scope && !M.clipById(S.project, S.scope)) S.scope = null; markDirty(); bus.emit("project", { reason: "undo" }); bus.emit("selection");
}
export function redo() {
  if (!S.redo.length) return;
  S.undo.push(snap()); S.project = M.normalize(JSON.parse(S.redo.pop()));
  pruneSelection(); if (S.scope && !M.clipById(S.project, S.scope)) S.scope = null; markDirty(); bus.emit("project", { reason: "redo" }); bus.emit("selection");
}
function pruneSelection() { for (const id of [...S.sel]) if (!M.clipById(S.project, id)) S.sel.delete(id); }

/* ---------------------------------------------------------------- autosave */
function markDirty() { S.dirty = true; S.saveState = "dirty"; bus.emit("save"); saveSoon(); }
const saveSoon = debounce(() => saveNow(), 800);
let saving = false, again = false;
export async function saveNow() {
  if (!S.project || !S.dirty) return;
  if (saving) { again = true; return; }
  saving = true; S.saveState = "saving"; bus.emit("save");
  try {
    const r = await api("/api/project", { project: S.project });
    S.project.meta.modified = r.modified; S.dirty = false; S.saveState = "saved"; S.saveError = null;
    if (r.validate && !r.validate.ok) { S.saveState = "warn"; S.saveError = r.validate.errors.join("; "); }
  } catch (e) {
    // "stale": cut.mjs rebuilt the reel after this editor loaded it; the server refused to save the
    // old copy over the build, so reload the new one (your hand edits are re-applied in it)
    if (String(e.message) === "stale") { S.dirty = false; S.saveState = "saved"; saving = false; bus.emit("save"); bus.emit("reload-project", { reason: "stale" }); return; }
    S.saveState = "error"; S.saveError = String(e.message || e);
  }
  saving = false; bus.emit("save");
  if (again) { again = false; saveNow(); }
}
window.addEventListener("beforeunload", (e) => { if (S.dirty) { saveNow(); e.preventDefault(); e.returnValue = ""; } });

/* ---------------------------------------------------------------- selection + time */
export function select(ids, { add = false, toggle = false } = {}) {
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!add && !toggle) S.sel.clear();
  for (const id of list) { if (toggle && S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); }
  bus.emit("selection");
}
export const selected = () => [...S.sel].map((id) => M.clipById(S.project, id)).filter(Boolean);
export const primary = () => selected()[0] || null;
export function setTime(t, opts = {}) {
  const d = S.project ? M.projectDuration(S.project) : 0;
  S.t = Math.max(0, Math.min(d, t));
  bus.emit("time", opts);
}
export const fps = () => S.project?.fps || 30;
/* the timeline being edited: the project, or the open group seen through the same API */
export const T = () => M.scopeOf(S.project, S.scope);
export { M };
