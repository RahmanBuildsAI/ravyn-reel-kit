// The editor app: boot, project load/new, transport clock, header actions, job log, key actions.
import { S, M, bus, api, setProject, commit, beginLive, live, endLive, undo, redo, select, selected, primary, setTime, saveNow, fps, T } from "/ui/state.js";
import * as C from "/lib/compile.mjs";
/* every clip edit runs on the open scope: the project, or the group you are inside */
const SC = (p) => M.scopeOf(p, S.scope);
import { $, $$, el, fmtClock, clamp, r3, layer } from "/ui/util.js";
import { Audio } from "/ui/audio.js";
import { initStage, stage } from "/ui/stage.js";
import { initTimeline, timeline } from "/ui/timeline.js";
import { initInspector } from "/ui/inspector.js";
import { initMedia, media } from "/ui/media.js";
import { installKeys } from "/ui/keys.js";
import { initNotes, notes } from "/ui/notes.js";
import { initReview, review } from "/ui/review.js";
import { initPalette, open as openPalette, close as closePalette, isOpen as paletteOpen } from "/ui/palette.js";

/* ---------------------------------------------------------------- toast + log */
const logBody = $("#logBody");
function logLine(text, cls) { const span = el("span", { class: cls || "", text }); logBody.append(span); logBody.scrollTop = logBody.scrollHeight; if (logBody.childNodes.length > 4000) logBody.firstChild.remove(); }
function showLog(on = true) { $("#log").hidden = !on; }
/* a message: always into the log; a problem opens the log, anything else shows as a short toast */
const toastEl = el("div", { id: "toast" }); document.body.append(toastEl); let toastTimer = 0;
bus.on("toast", ({ text, bad }) => {
  logLine(`\n${bad ? "ERROR " : ""}${text}\n`, bad ? "bad" : "ok");
  if (bad) return showLog(true);
  if (toastEl.parentNode !== layer()) layer().append(toastEl);
  toastEl.textContent = text; toastEl.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3800);
});
$("#btnLog").onclick = () => showLog($("#log").hidden);
$("#logClose").onclick = () => showLog(false);
$("#logClear").onclick = () => (logBody.textContent = "");

function connectEvents() {
  const es = new EventSource("/api/events");
  es.addEventListener("log", (e) => { const d = JSON.parse(e.data); logLine(d.text); });
  es.addEventListener("job", (e) => {
    const d = JSON.parse(e.data);
    S.busy = d.state === "start" ? d.job : null; bus.emit("ui");
    $("#logState").textContent = d.state === "start" ? `${d.job} running` : "";
    if (d.state === "done") logLine(`\n[${d.job}] done${d.code != null ? ` (exit ${d.code})` : ""}${d.out ? `  ->  ${d.out}` : ""}\n`, d.code === 0 || d.code == null ? "ok" : "bad");
    if (d.state === "error") logLine(`\n[${d.job}] ${d.error}\n`, "bad");
  });
  es.addEventListener("notes", (e) => bus.emit("notes-remote", JSON.parse(e.data)));
  es.addEventListener("project-changed", (e) => { const d = JSON.parse(e.data); if (S.project && d.id === S.project.id && d.modified !== S.project.meta?.modified) bus.emit("reload-project", { reason: "rebuilt" }); });
  es.addEventListener("proxy", (e) => { const d = JSON.parse(e.data); media.proxyProgress(d); if (d.done && d.ok && d.proxy) { S.proxies[d.src] = d.proxy; if (S.useProxy) bus.emit("project", { reason: "proxy" }); } });
  es.onerror = () => { $("#logState").textContent = "events disconnected"; };
}

/* ---------------------------------------------------------------- projects */
async function refreshState() {
  const st = await api("/api/state");
  S.fonts = st.fonts; S.roots = st.roots; S.busy = st.busy;
  const pick = $("#projectPick");
  const cur = S.project?.id || "";
  pick.innerHTML = `<option value="">open a project</option>` + st.projects.map((p) => `<option value="${p.id}"${p.id === cur ? " selected" : ""}>${p.id}${p.broken ? " (broken)" : ""}</option>`).join("");
  return st;
}
async function openProject(id, { keepZoom = false } = {}) {
  if (!id) return;
  try {
    const r = await api(`/api/project?id=${encodeURIComponent(id)}`);
    setProject(r.project, { proxies: r.proxies || {} });
    document.title = `ravyn · ${r.project.id}`;
    localStorage.setItem("ravyn.last", id);
    logLine(`opened projects/${id}.json  (${r.project.clips.length} clips, ${r.project.duration}s)\n`, "ok");
    if (!keepZoom) zoomFit();
  } catch (e) { bus.emit("toast", { text: `open failed: ${e.message}`, bad: true }); }
}
$("#projectPick").onchange = (e) => { if (S.dirty) saveNow(); openProject(e.target.value); };
/* Claude rebuilt the open reel (cut.mjs): load the new build where you were, your hand edits are in it */
bus.on("reload-project", async ({ reason } = {}) => {
  if (!S.project) return;
  const t = S.t, id = S.project.id;
  await openProject(id, { keepZoom: true });
  setTime(t);
  bus.emit("toast", { text: reason === "stale" ? "Claude rebuilt this reel while it was open: loaded the new build (your hand edits are re-applied in it)" : "Claude rebuilt this reel: loaded the new build" });
});
$("#btnNew").onclick = () => $("#dlgNew").showModal();
$("#dlgNew").addEventListener("close", async () => {
  const dlg = $("#dlgNew"); if (dlg.returnValue !== "ok") return;
  const f = dlg.querySelector("form"); const fd = new FormData(f);
  const body = { reel: fd.get("reel") ? +fd.get("reel") : null, slug: fd.get("slug"), title: fd.get("title") || undefined, fps: +fd.get("fps") || 30, importIngest: !!fd.get("ingest") };
  try {
    const r = await api("/api/project/new", body);
    logLine(`created projects/${r.project.id}.json\n` + (r.notes || []).map((n) => "  " + n + "\n").join(""), "ok");
    await refreshState();
    setProject(r.project, { proxies: r.proxies || {} });
    $("#projectPick").value = r.project.id; localStorage.setItem("ravyn.last", r.project.id);
    zoomFit();
    f.reset();
  } catch (e) { bus.emit("toast", { text: `new project: ${e.message}`, bad: true }); }
});
$("#btnHelp").onclick = () => $("#dlgHelp").showModal();
bus.on("save", () => {
  const s = $("#saveState");
  s.className = "save-state " + ({ dirty: "dirty", saving: "dirty", saved: "saved", warn: "err", error: "err" }[S.saveState] || "");
  s.textContent = { idle: "no project", dirty: "unsaved", saving: "saving", saved: "saved", warn: "saved, check log", error: "SAVE FAILED" }[S.saveState] || "";
  s.title = S.saveError || "";
  if (S.saveError && S.saveState === "warn") logLine(`validate: ${S.saveError}\n`, "bad");
});

/* ---------------------------------------------------------------- transport */
const clock = { mode: "raf", ctx0: 0, perf0: 0, t0: 0 };
function dur() { return S.project ? M.projectDuration(S.project) : 0; }
async function play() {
  if (S.playing || !S.project) return;
  await Audio.ensure();
  S.playing = true;
  if (S.t >= dur() - 0.02) S.t = 0;
  restartClock();
  bus.emit("play");
}
function restartClock() {
  clock.mode = "pending"; clock.perf0 = performance.now(); clock.t0 = S.t;
  if (S.speed === 1) {
    const my = ++clockGen;
    if (review.isRender()) { Audio.stop(); review.playMedia(); clock.mode = "video"; return; }
    Audio.start(S.t, S.rate || 1).then((at) => { if (my !== clockGen || !S.playing || S.speed !== 1 || at == null) return; clock.mode = "audio"; clock.ctx0 = at; clock.t0 = S.t; });
  } else { Audio.stop(); clock.mode = "raf"; }
}
let clockGen = 0;
function pause() {
  if (!S.playing) return;
  S.playing = false; S.speed = 1; clockGen++;
  Audio.stop(); stage.pauseAll(); review.pauseMedia();
  $("#speedTag").textContent = "";
  bus.emit("play");
}
function togglePlay() { S.playing ? pause() : play(); }
function shuttle(dir) {
  if (!S.project) return;
  const seq = [1, 2, 4, 8];
  if (!S.playing) { S.speed = dir; play(); }
  else {
    const cur = Math.abs(S.speed), same = Math.sign(S.speed) === dir;
    S.speed = dir * (same ? seq[Math.min(seq.length - 1, seq.indexOf(cur) + 1)] || 8 : 1);
    restartClock();
  }
  $("#speedTag").textContent = S.speed === 1 ? "" : `${S.speed > 0 ? "" : "<"}${Math.abs(S.speed)}x`;
}
bus.on("time", (o) => { if (S.playing && !o?.fromPlay) restartClock(); updateClock(); });
function updateClock() { $("#clock").textContent = fmtClock(S.t, fps()); $("#clockSec").textContent = S.t.toFixed(2) + "s"; }
bus.on("play", () => { $("#btnPlay").innerHTML = S.playing ? "&#10074;&#10074;" : "&#9654;"; });
function loop() {
  if (S.playing && S.project) {
    let t;
    if (clock.mode === "video") t = review.mediaTime();
    else if (clock.mode === "audio" && Audio.ctx) t = clock.t0 + (Audio.ctx.currentTime - clock.ctx0) * (S.rate || 1);
    else t = clock.t0 + ((performance.now() - clock.perf0) / 1000) * (clock.mode === "raf" ? S.speed : (S.rate || 1));
    const d = dur();
    if (S.stopAt != null && t >= S.stopAt) { const at = S.stopAt; S.stopAt = null; pause(); setTime(at); }
    else if (t >= d) { t = d; setTime(t, { fromPlay: true }); pause(); }
    else if (t <= 0 && S.speed < 0) { setTime(0, { fromPlay: true }); pause(); }
    else setTime(t, { fromPlay: true });
  }
  if (!review.isRender()) stage.tick(S.t, S.playing && S.speed === 1 && (S.rate || 1) === 1 && clock.mode === "audio" ? "play" : "scrub");
  requestAnimationFrame(loop);
}
$("#btnPlay").onclick = togglePlay;
$("#btnStart").onclick = () => { pause(); setTime(0); };
$("#btnEnd").onclick = () => { pause(); setTime(dur()); };
$("#btnBackF").onclick = () => { pause(); setTime(S.t - 1 / fps()); };
$("#btnFwdF").onclick = () => { pause(); setTime(S.t + 1 / fps()); };
$("#chkSafe").onchange = (e) => { S.safe = e.target.checked; $("#safezone").hidden = !S.safe; };
$("#chkProxy").onchange = (e) => { S.useProxy = e.target.checked; bus.emit("project", { reason: "proxy" }); };

/* ---------------------------------------------------------------- builds */
async function withBusy(btn, fn) { if (S.busy) { bus.emit("toast", { text: `${S.busy} is still running`, bad: true }); return; } btn.disabled = true; try { await fn(); } catch (e) { if (e.message === "stale") bus.emit("reload-project", { reason: "stale" }); else bus.emit("toast", { text: e.message, bad: true }); } finally { btn.disabled = false; } }
$("#btnCompile").onclick = () => withBusy($("#btnCompile"), async () => {
  showLog(true);
  const r = await api("/api/compile", { project: S.project });
  S.dirty = false; S.saveState = "saved"; bus.emit("save");
  logLine(`compiled ${r.variant}\n${r.validate.ok ? "validate: ok" : "validate: " + r.validate.errors.join("; ")}\n${r.validate.warnings.map((w) => "  warning: " + w).join("\n")}\nopen: ${location.origin}${r.url}\n`, r.validate.ok ? "ok" : "bad");
});
$("#btnCheck").onclick = () => withBusy($("#btnCheck"), async () => {
  showLog(true); logLine("\n[check] compiling + npx hyperframes check (a minute or two)\n");
  const r = await api("/api/check", { project: S.project });
  S.dirty = false; S.saveState = "saved"; bus.emit("save");
  const s = r.summary || {};
  logLine(`\n[check] exit ${r.code} · errors ${s.errors ?? "?"} · warnings ${s.warnings ?? "?"} · WCAG ${s.wcag ?? "?"} · content_overlap ${s.overlap} · text_occluded ${s.occluded}\nRead the sections above, not just the summary line.\n`, r.code === 0 && !s.overlap && !s.occluded ? "ok" : "bad");
});
$("#btnTest").onclick = () => withBusy($("#btnTest"), async () => {
  const from = r3(S.t), to = r3(Math.min(dur(), S.t + 3));
  if (to - from < 0.2) throw new Error("move the playhead earlier: nothing to render after it");
  showLog(true); logLine(`\n[test-render] ${from}s to ${to}s\n`);
  const r = await api("/api/render", { project: S.project, from, to, quality: "standard" });
  if (r.url) logLine(`\ntest clip: ${location.origin}${r.url}\n`, "ok");
});
$("#btnRender").onclick = () => withBusy($("#btnRender"), async () => {
  showLog(true); logLine(`\n[render] full reel, ${dur()}s at ${fps()} fps. Roughly a second per second of reel.\n`);
  const r = await api("/api/render", { project: S.project, quality: "standard" });
  if (r.url) logLine(`\nrendered: ${r.out}\nopen: ${location.origin}${r.url}\n`, "ok");
});

/* ---------------------------------------------------------------- edit actions (keys + buttons) */
function freeTrackFor(kind, start, duration, preferTop = true) {
  const p = T(); const tracks = M.tracksOf(p, kind);
  const order = preferTop ? [...tracks].reverse() : tracks;
  for (const t of order) if (!t.locked && !M.overlapping(p, t.id, start, start + duration).length) return t;
  return M.addTrack(p, kind);
}
export function addMediaClip(file, { start = S.t, track = null } = {}) {
  if (!S.project) return;
  const p = S.project;
  commit("add media", (p) => {
    const kind = file.kind === "audio" ? "audio" : "video";
    const durS = file.duration || (file.kind === "image" ? 5 : 5);
    const t = track ? M.trackById(p, track) : freeTrackFor(kind, start, durS);
    if (!t || t.kind !== kind) throw new Error(`a ${file.kind} cannot go on that track`);
    const o = { src: file.src, name: file.name.replace(/\.[^.]+$/, ""), start, duration: durS, track: t.id };
    if (file.kind === "video") { Object.assign(o, { mediaDuration: file.duration || null, mediaWidth: file.width || null, mediaHeight: file.height || null }); fitToFrame(o, file.width, file.height, p); M.addClip(SC(p), "video", o); }
    else if (file.kind === "image") { Object.assign(o, { mediaWidth: file.width || null, mediaHeight: file.height || null }); fitToFrame(o, file.width, file.height, p); M.addClip(SC(p), "image", o); }
    else { o.mediaDuration = file.duration || null; M.addClip(SC(p), "audio", o); }
    select(o.id || p.clips[p.clips.length - 1].id);
  });
}
function fitToFrame(o, mw, mh, p) {
  if (!mw || !mh) { o.x = 0; o.y = 0; o.w = p.width; o.h = p.height; o.fit = "cover"; return; }
  if (mh >= mw) { o.x = 0; o.y = 0; o.w = p.width; o.h = p.height; o.fit = "cover"; }
  else { o.w = p.width; o.h = Math.round((p.width * mh) / mw); o.x = 0; o.y = Math.round((p.height - o.h) / 2); o.fit = "cover"; }
}
const actions = {
  togglePlay, play, pause, shuttle, save: saveNow,
  setTool(t) { S.tool = t; bus.emit("ui"); },
  zoom(f) { timeline.zoomBy(f); },
  escape() { if (document.fullscreenElement) return; if (paletteOpen()) return closePalette(); if (S.playing) return pause(); if (S.sel.size) select([]); else if (S.scope) actions.closeGroup(); else if (S.drawer) actions.openDrawer(null); S.tool = "select"; bus.emit("ui"); },
  palette() { openPalette(); },
  splitAtPlayhead() {
    const ids = [...S.sel];
    commit("split", (p) => { const r = M.splitAt(SC(p), S.t, ids.length ? { ids } : { tracks: SC(p).tracks.filter((t) => !t.locked).map((t) => t.id) }); if (!r.length) throw new Error("nothing under the playhead to split"); });
  },
  del() { const ids = [...S.sel]; if (!ids.length) return; commit("delete", (p) => { for (const id of ids) M.removeClip(SC(p), id); }); select([]); },
  rippleDelete() { const ids = [...S.sel]; if (!ids.length) return; commit("ripple delete", (p) => { for (const id of ids) M.rippleDelete(SC(p), id); }); select([]); },
  duplicate() { const ids = [...S.sel]; if (!ids.length) return; const made = []; commit("duplicate", (p) => { for (const id of ids) { const d = M.duplicateClip(SC(p), id); if (d) made.push(d.id); } }); select(made); },
  copy() { const list = selected(); if (!list.length) return; S.clipboard = JSON.parse(JSON.stringify(list)); logLine(`copied ${list.length} clip(s)\n`); },
  paste() {
    if (!S.clipboard?.length) return; const made = [];
    const t0 = Math.min(...S.clipboard.map((c) => c.start));
    commit("paste", (p) => {
      for (const c0 of S.clipboard) {
        const c = M.defaultClip(c0.type, { ...c0, id: undefined }, p);
        c.id = M.nextId(p, "c"); c.start = M.quant(S.t + (c0.start - t0), p.fps);
        if (c.type === "group") { M.reidGroup(p, c); M.shiftGroup(c, M.r3(c.start - c0.start)); }
        if (!SC(p).tracks.some((t) => t.id === c.track)) c.track = M.tracksOf(SC(p), M.trackKindFor(c.type))[0].id;
        M.placeClip(SC(p), c, "overwrite"); made.push(c.id);
      }
    });
    select(made);
  },
  trackMove(dir) { const ids = [...S.sel]; if (!ids.length) return; commit(dir > 0 ? "bring forward" : "send back", (p) => { for (const id of ids) M.moveClipToTrack(SC(p), id, dir); }); },
  nudgeTime(frames) { const ids = [...S.sel]; if (!ids.length) return; commit("nudge", (p) => { for (const id of ids) { const c = M.clipById(p, id); M.moveClip(SC(p), id, { start: c.start + frames / p.fps }, "reject"); } }); },
  nudgeXY(dx, dy) { const ids = [...S.sel]; if (!ids.length) return; commit("nudge", (p) => { for (const id of ids) { const c = M.clipById(p, id); if (c && M.isVisual(c)) { c.x = r3(c.x + dx); c.y = r3(c.y + dy); } } }); },
  jumpEdit(dir) {
    const pts = M.snapPoints(S.project); pause();
    if (dir > 0) { const n = pts.find((x) => x > S.t + 0.001); if (n != null) setTime(n); }
    else { const prev = [...pts].reverse().find((x) => x < S.t - 0.001); if (prev != null) setTime(prev); }
  },
  marker() { commit("marker", (p) => { M.addMarker(p, S.t, ""); }); },
  addText() { commit("add text", (p) => { const t = freeTrackFor("video", S.t, 3); const c = M.addClip(SC(p), "text", { track: t.id, start: S.t, duration: 3, text: "Your line here", name: "text" }); select(c.id); }); },
  addShape() { commit("add shape", (p) => { const t = freeTrackFor("video", S.t, 3); const c = M.addClip(SC(p), "shape", { track: t.id, start: S.t, duration: 3, name: "shape" }); select(c.id); }); },
  /* captions from the VO words: replaces the CAPTIONS track */
  addCaptions() {
    const words = S.project?.words; if (!words?.length) { bus.emit("toast", { text: "this project has no words. New project with ingest, or Import ingest", bad: true }); return; }
    const maxWords = Math.max(1, +$("#cueWords").value || 3), pause = Math.max(0.05, +$("#cuePause").value || 0.24);
    const existing = S.project.tracks.find((t) => t.name === "CAPTIONS");
    if (existing && M.clipsOnTrack(S.project, existing.id).length && !confirm("Rebuild the CAPTIONS track? The cues on it are replaced.")) return;
    commit("captions", (p) => {
      let track = p.tracks.find((t) => t.name === "CAPTIONS");
      if (track) p.clips = p.clips.filter((c) => c.track !== track.id); else track = M.addTrack(p, "video", "CAPTIONS");
      const cues = M.buildCues(words, { fps: p.fps, maxWords, pause });
      let placed = 0;
      for (const q of cues) if (M.addClip(p, "caption", { track: track.id, start: q.start, duration: q.duration, words: q.words, name: q.words.map((w) => w.text).join(" "), sys: "capB", y: 1380 }, "overwrite")) placed++;
      logLine(`captions: ${placed} cues placed of ${cues.length} built (${maxWords} words max, pause ${pause}s)\n`, placed === cues.length ? "ok" : "bad");
    });
  },
  /* play a window then stop (enter/exit previews) */
  /* groups: Premiere's nest, in real reel time (docs: README, Groups) */
  group() {
    const R = M.rootOf(S.project); const ids = [...S.sel].filter((id) => R.clips.some((c) => c.id === id));
    if (!ids.length) { bus.emit("toast", { text: S.scope ? "press Esc to leave the group first, then group" : "select clips on the timeline first, then Ctrl+G", bad: true }); return; }
    let g = null;
    commit("group", (p) => { g = M.groupClips(p, ids, ids.length === 1 ? (M.clipById(p, ids[0]).name || "group") : `group of ${ids.length}`); });
    if (g) { select(g.id); logLine(`grouped ${g.clips.length} clips into "${g.name}" (double-click it to open, Ctrl+Shift+G to ungroup)\n`); }
  },
  ungroup() {
    const gs = selected().filter((c) => c.type === "group");
    const target = gs.length ? gs : (S.scope ? [M.clipById(S.project, S.scope)].filter(Boolean) : []);
    if (!target.length) { bus.emit("toast", { text: "select a group first", bad: true }); return; }
    const out = [];
    S.scope = null;
    commit("ungroup", (p) => { for (const g of target) out.push(...(M.ungroup(p, g.id) || [])); });
    select(out); bus.emit("ui");
  },
  openGroup(id) { const g = M.clipById(S.project, id); if (!g || g.type !== "group") return; S.scope = g.id; select([]); bus.emit("ui"); bus.emit("project", { reason: "scope" }); },
  closeGroup() { if (!S.scope) return; const id = S.scope; S.scope = null; select(M.clipById(S.project, id) ? [id] : []); bus.emit("ui"); bus.emit("project", { reason: "scope" }); },
  previewRange(a, b) { pause(); setTime(Math.max(0, a)); S.stopAt = Math.min(dur(), b); play(); },
  /* a colour at 35% over the clip on the track above, same timing */
  addTint(id) {
    commit("tint", (p) => {
      const c = M.clipById(p, id); if (!c) return;
      const kind = "video"; const same = M.tracksOf(p, kind); const i = same.findIndex((t) => t.id === c.track);
      let target = same[i + 1]; if (!target || M.overlapping(p, target.id, c.start, M.clipEnd(c)).length) target = M.addTrack(p, kind, null, i + 1);
      const eff = M.clipAt(c, S.t);
      const t = M.addClip(p, "shape", { track: target.id, start: c.start, duration: c.duration, x: eff.x, y: eff.y, w: c.w, h: c.h, rotation: eff.rotation, scale: eff.scale, fill: "#0A0D14", opacity: 0.35, radius: c.radius || 0, name: `tint of ${c.name || c.type}` }, "reject");
      if (t) select(t.id);
    });
  },
  /* drop a sound at t on the first free audio track (top first), making one if needed */
  dropSfx(src, t = S.t, dur = null) {
    const f = { src, kind: "audio", name: src.split("/").pop(), duration: dur };
    if (dur == null) { api(`/api/probe?src=${encodeURIComponent(src)}`).then((pr) => addMediaClip({ ...f, duration: pr.duration || 0.5 }, { start: t })); }
    else addMediaClip(f, { start: t });
  },
  /* the picked sound at every marker (your cuts), skipping markers that already carry it */
  async sfxOnMarkers(src) {
    if (!src) { bus.emit("toast", { text: "pick a sound in the media panel first", bad: true }); return; }
    const pr = await api(`/api/probe?src=${encodeURIComponent(src)}`); const d = pr.duration || 0.5;
    commit("sfx on markers", (p) => {
      let n = 0;
      for (const m of p.markers) {
        if (p.clips.some((c) => c.type === "audio" && c.src === src && Math.abs(c.start - m.t) < 0.3)) continue;
        const tr = freeTrackFor("audio", m.t, d, false);
        M.addClip(p, "audio", { src, name: src.split("/").pop().replace(/\.[^.]+$/, ""), start: m.t, duration: d, mediaDuration: d, track: tr.id, volume: 0.16 }, "reject"); n++;
      }
      logLine(`${n} sounds placed on markers (volume 0.16)\n`, "ok");
    });
  },
  /* move a clip so it starts on the VO word nearest its start (keeps the duration) */
  snapClipToWord(id) {
    const words = S.project?.words; if (!words?.length) return;
    commit("snap to word", (p) => { const c = M.clipById(p, id); if (!c) return; let best = null; for (const w of words) if (best == null || Math.abs(w.start - c.start) < Math.abs(best - c.start)) best = w.start; if (best != null) M.moveClip(p, id, { start: best }, "overwrite"); });
  },
  snapClipEndToWord(id) {
    const words = S.project?.words; if (!words?.length) return;
    commit("snap end to word", (p) => { const c = M.clipById(p, id); if (!c) return; const e = M.clipEnd(c); let best = null; for (const w of words) if (best == null || Math.abs(w.end - e) < Math.abs(best - e)) best = w.end; if (best != null) M.trimClip(p, id, { end: best }); });
  },
  /* ---- the facecam window block, chapter cards, the CTA ---- */
  async addFacecam() {
    const p = S.project; if (!p) return;
    // the facecam comes from the project's assets folder, or from a video picked in the media panel
    const ing = p.reel != null ? await api(`/api/ingest?reel=${p.reel}`) : null;
    const picked = media.picked()?.kind === "video" ? media.picked().src : null;
    const src = ing?.facecam || picked;
    if (!src) { bus.emit("toast", { text: `no facecam.mp4 in ${ing?.dir || "the assets folder"} and no video picked in the media panel`, bad: true }); return; }
    commit("facecam block", (p) => {
      if (M.facecamOf(p)) throw new Error("this project already has a facecam block");
      const plain = p.clips.find((c) => c.type === "video" && c.src === src);
      const track = plain ? plain.track : M.videoTracks(p)[0].id;
      const o = { name: "facecam (window)", src, start: plain ? plain.start : 0, duration: plain ? plain.duration : p.duration, mediaStart: plain ? plain.mediaStart : 0, mediaDuration: plain?.mediaDuration || null, track };
      if (plain) M.removeClip(p, plain.id);
      o.states = [{ t: o.start, state: "full" }];
      const fc = M.addClip(p, "facecam", o, "overwrite");
      p.style = "window"; select(fc.id);
    });
    logLine(`facecam block: ${src}. Add scene cuts (Scenes) to switch between full, stack, bubble and none.\n`, "ok");
  },
  addChapter() { commit("chapter card", (p) => { const t = freeTrackFor("video", S.t, 2.4); const c = M.addClip(SC(p), "chapter", { track: t.id, start: S.t, duration: 2.4, name: "chapter card" }); select(c.id); }); },
  addCta() { commit("CTA lockup", (p) => { const dur = Math.max(1, M.quant(M.projectDuration(p) - S.t, p.fps)); const t = freeTrackFor("video", S.t, dur); const c = M.addClip(p, "cta", { track: t.id, start: S.t, duration: dur, name: "CTA lockup" }); select(c.id); }); },
  addVlab() {
    commit("eyebrow", (p) => { const t = freeTrackFor("video", S.t, 2.5); const c = M.addClip(SC(p), "text", { track: t.id, start: S.t, duration: 2.5, name: "eyebrow", text: "STEP 01 · SCRIPT", font: "JetBrains Mono", weight: 500, size: 30, letterSpacing: 0.14, uppercase: true, fill: "#666666", align: "center", valign: "top", x: 60, y: 160, w: 960, h: 44, hAuto: true, shadow: "none", enter: { type: "slideDown", dur: 0.3, ease: "power2.out" }, exit: { type: "slideUp", dur: 0.2 } }); select(c.id); });
  },
  addBigNumber() {
    commit("big number", (p) => {
      const t = freeTrackFor("video", S.t, 2.5);
      const c = M.addClip(SC(p), "text", { track: t.id, start: S.t, duration: 2.5, name: "big number", text: "12", font: "Inter", weight: 900, size: 300, letterSpacing: -0.03, fill: "#2B59FF", x: 0, y: 470, w: p.width, h: 320, hAuto: false, shadow: "none", enter: { type: "pop", dur: 0.55, ease: "power3.out" }, exit: { type: "slideUp", dur: 0.25 } });
      M.upsertKey(c, "scale", 0.55, 1, p.fps, "none"); M.upsertKey(c, "scale", c.duration, 1.13, p.fps, "none");
      select(c.id);
    });
  },
  addBoundary() { commit("scene cut", (p) => { if (!M.facecamOf(p)) throw new Error("add the facecam block first"); const s = M.addBoundary(p, S.t); if (!s) throw new Error("there is already a boundary at that time"); }); },
  sceneCaptions() {
    const p = S.project; if (!p?.words?.length) { bus.emit("toast", { text: "this project has no words", bad: true }); return; }
    if (!M.facecamOf(p)) { bus.emit("toast", { text: "add the facecam block first: the cues follow its scene states", bad: true }); return; }
    const maxWords = Math.max(1, +$("#cueWords").value || 4), pause = Math.max(0.05, +$("#cuePause").value || 0.24);
    const existing = p.tracks.find((t) => t.name === "CAPTIONS");
    if (existing && M.clipsOnTrack(p, existing.id).length && !confirm("Rebuild the CAPTIONS track per scene? The cues on it are replaced.")) return;
    commit("captions per scene", (p) => {
      let track = p.tracks.find((t) => t.name === "CAPTIONS");
      if (track) p.clips = p.clips.filter((c) => c.track !== track.id); else track = M.addTrack(p, "video", "CAPTIONS");
      const cues = M.buildSceneCues(p, { maxWords, pause });
      let placed = 0;
      for (const q of cues) {
        const sys = C.CAPTION_SYS[q.sys] || C.CAPTION_SYS.capFace;
        if (M.addClip(p, "caption", { track: track.id, start: q.start, duration: q.duration, words: q.words, name: q.words.map((w) => w.text).join(" "), sys: q.sys, y: q.y, x: sys.x, w: sys.w, fill: sys.fill, shadow: sys.shadow }, "overwrite")) placed++;
      }
      const by = {}; for (const q of cues) by[q.sys] = (by[q.sys] || 0) + 1;
      logLine(`captions per scene: ${placed} cues (${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ")})\n`, "ok");
    });
  },
  /* the picked sound (or every sfx/scene*.wav in the assets folder, rotated) on every scene change */
  async soundOnScenes() {
    const p = S.project; if (!p || !M.facecamOf(p)) { bus.emit("toast", { text: "add the facecam block first", bad: true }); return; }
    const ing = p.reel != null ? await api(`/api/ingest?reel=${p.reel}`) : null;
    const fam = media.picked()?.kind === "audio" ? [media.picked().src] : ing?.sceneSfx?.length ? ing.sceneSfx : null;
    if (!fam) { bus.emit("toast", { text: "pick a sound in the media panel first (a soft whoosh works)", bad: true }); return; }
    const durs = {}; for (const s of fam) durs[s] = (await api(`/api/probe?src=${encodeURIComponent(s)}`)).duration || 0.7;
    commit("sound on scene changes", (p) => {
      let n = 0; const spans = M.sceneSpans(p);
      spans.forEach((s, i) => {
        if (!i) return;
        if (p.clips.some((c) => c.type === "audio" && fam.includes(c.src) && Math.abs(c.start - s.t) < 0.15)) return;
        const src = fam[n % fam.length]; const d = durs[src];
        const tr = freeTrackFor("audio", s.t, d, false);
        M.addClip(p, "audio", { src, name: src.split("/").pop().replace(/\.[^.]+$/, ""), start: s.t, duration: d, mediaDuration: d, track: tr.id, volume: 0.2 }, "reject"); n++;
      });
      logLine(`${n} sounds on scene changes (volume 0.2)\n`, "ok");
    });
  },
  async board() {
    if (!S.project) return; showLog(true); logLine("\n[board] compiling + one snapshot per scene (a minute)\n");
    const r = await api("/api/board", { project: S.project });
    logLine(`\nboard: ${r.file} (${r.frames} frames)\nopen: ${location.origin}${r.url}\nOne frame per scene: check the whole reel at a glance before you render.\n`, "ok");
  },
  addMedia: addMediaClip,
};
actions.note = () => (S.noteMode ? notes.disarm() : notes.arm());
actions.noteArrow = () => (S.noteMode === "arrow" ? notes.disarm() : notes.arm("arrow"));
actions.toggleMode = () => review.toggleMode();
actions.review = review; actions.notes = notes;
bus.on("rate", () => { if (S.playing) restartClock(); });
/* full screen: the picture and the play bar only (the timeline hides in CSS); keys, notes and
   the command box keep working inside it */
actions.fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else $("#center").requestFullscreen().catch((e) => bus.emit("toast", { text: `full screen: ${e.message}`, bad: true })); };
$("#btnFull").onclick = actions.fullscreen;
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  $("#btnFull").classList.toggle("on", on); $("#btnFull").innerHTML = on ? "&#x2715; exit full" : "&#x26F6; full";
  requestAnimationFrame(() => stage.fit());
});
$("#btnAddText").onclick = actions.addText;
$("#btnAddShape").onclick = actions.addShape;
$("#btnAddCaptions").onclick = actions.addCaptions;
$("#btnSplit").onclick = actions.splitAtPlayhead;
$("#btnMarker").onclick = actions.marker;
$("#toolSelect").onclick = () => actions.setTool("select");
$("#toolRazor").onclick = () => actions.setTool("razor");
$("#chkSnap").onchange = (e) => { S.snap = e.target.checked; bus.emit("ui"); };
$("#chkSnapWords").onchange = (e) => { S.snapWords = e.target.checked; bus.emit("ui"); };
for (const b of $$(".sfxbar button[data-sfx]")) b.onclick = () => actions.dropSfx(b.dataset.sfx);
$("#btnSfxMarkers").onclick = () => actions.sfxOnMarkers(media.picked()?.kind === "audio" ? media.picked().src : null);
$("#btnAddFacecam").onclick = () => actions.addFacecam().catch((e) => bus.emit("toast", { text: e.message, bad: true }));
$("#btnAddChapter").onclick = actions.addChapter;
$("#btnAddCta").onclick = actions.addCta;
$("#btnAddVlab").onclick = actions.addVlab;
$("#btnAddBignum").onclick = actions.addBigNumber;
$("#btnBoundary").onclick = actions.addBoundary;
$("#btnBoard").onclick = () => withBusy($("#btnBoard"), actions.board);
bus.on("ui", () => { $("#toolSelect").classList.toggle("on", S.tool === "select"); $("#toolRazor").classList.toggle("on", S.tool === "razor"); $("#chkSnap").checked = S.snap; $("#chkSnapWords").checked = !!S.snapWords; document.body.classList.toggle("razor", S.tool === "razor"); for (const b of ["#btnCheck", "#btnTest", "#btnRender"]) $(b).disabled = !!S.busy; });
$("#btnAddVTrack").onclick = () => commit("add track", (p) => { M.addTrack(p, "video"); });
$("#btnAddATrack").onclick = () => commit("add track", (p) => { M.addTrack(p, "audio"); });
function zoomFit() { timeline.zoomFit(); }
$("#zoomFit").onclick = zoomFit; $("#zoomIn").onclick = () => timeline.zoomBy(1.25); $("#zoomOut").onclick = () => timeline.zoomBy(0.8);

/* the shell (direction B): the rail and its drawer, the timeline resizer, the scenes pane,
   the status line, the command box */
(function shell() {
  const rootEl = document.documentElement;
  const saved = JSON.parse(localStorage.getItem("ravyn.layout") || "{}");
  if (saved.tlH) rootEl.style.setProperty("--tl-h", saved.tlH + "px");
  const tlR = $("#tlResizer");
  tlR.onpointerdown = (e) => { tlR.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = $("#tlPanel").getBoundingClientRect().height; tlR.onpointermove = (ev) => { rootEl.style.setProperty("--tl-h", clamp(h0 - (ev.clientY - y0), 110, window.innerHeight - 260) + "px"); stage.fit(); }; };
  tlR.onpointerup = () => { tlR.onpointermove = null; localStorage.setItem("ravyn.layout", JSON.stringify({ tlH: parseFloat(getComputedStyle($("#tlPanel")).height) })); stage.fit(); };

  const TITLES = { media: ["Media", "files, sounds, your SFX library"], add: ["Text and shapes", "at the playhead"], captions: ["Captions", "from the VO words"], sound: ["Sound", "the core four, helpers"], blocks: ["Blocks", "facecam window, chapter, CTA"], scenes: ["Scenes", "full / stack / bubble / none"], notes: ["Notes", "your review, pinned to the frame"] };
  function openDrawer(name) {
    S.drawer = name || null;
    $("#drawer").hidden = !S.drawer;
    for (const b of $$("#rail button[data-drawer]")) b.classList.toggle("on", b.dataset.drawer === S.drawer);
    for (const pane of $$("#drawer .dpane")) pane.hidden = pane.dataset.pane !== S.drawer;
    if (S.drawer) { $("#drawerTitle").textContent = TITLES[S.drawer][0]; $("#drawerSub").textContent = TITLES[S.drawer][1]; }
    localStorage.setItem("ravyn.drawer", S.drawer || "");
    if (S.drawer === "scenes") renderScenes();
    stage.fit();
  }
  for (const b of $$("#rail button[data-drawer]")) b.onclick = () => openDrawer(S.drawer === b.dataset.drawer ? null : b.dataset.drawer);
  $("#drawerClose").onclick = () => openDrawer(null);
  $("#railLog").onclick = () => showLog($("#log").hidden);
  actions.openDrawer = openDrawer;
  const lastDrawer = localStorage.getItem("ravyn.drawer");
  openDrawer(lastDrawer === "" ? null : (lastDrawer || "media"));

  for (const m of $$("details.menu")) m.addEventListener("click", (e) => { if (e.target.tagName === "BUTTON" && !e.target.matches("#zoomIn,#zoomOut")) m.open = false; });
  document.addEventListener("pointerdown", (e) => { for (const m of $$("details.menu[open]")) if (!m.contains(e.target)) m.open = false; });

  function renderScenes() {
    const box = $("#sceneList"); box.innerHTML = "";
    const p = S.project; if (!p) return;
    if (!M.facecamOf(p)) { box.append(el("div", { class: "hint", text: "add the Facecam block first (Blocks), then cut scenes here or on the SCENES row of the timeline" })); return; }
    for (const s of M.sceneSpans(p)) {
      const now = S.t >= s.t && S.t < s.end;
      box.append(el("div", { class: `srow${now ? " now" : ""}`, onclick: () => { pause(); setTime(s.t); } }, el("i", { class: s.state, text: s.state[0].toUpperCase() }), el("span", { text: `scene ${s.idx + 1} · ${s.state}` }), el("span", { class: "dim", text: `${s.t.toFixed(2)}s · ${s.dur.toFixed(1)}s` })));
    }
  }
  bus.on("project", () => { if (S.drawer === "scenes") renderScenes(); $("#tlTitle").textContent = S.project ? `${S.project.id} · ${S.project.duration}s · ${S.project.fps} fps` : ""; });
  bus.on("time", () => {
    const sp = S.project && M.facecamOf(S.project) ? M.sceneSpans(S.project) : [];
    if (S.drawer === "scenes") { const rows = $$("#sceneList .srow"); sp.forEach((s, i) => rows[i]?.classList.toggle("now", S.t >= s.t && S.t < s.end)); }
    const cur = sp.find((s) => S.t >= s.t && S.t < s.end);
    $("#sceneTag").textContent = cur ? `scene ${cur.idx + 1} of ${sp.length} · ${cur.state}` : "";
  });

  const K = (k) => `<span class="k">${k}</span>`;
  function status() {
    const p = S.project; const line = $("#statusLine");
    if (!p) { line.innerHTML = "open a project, or New"; return; }
    const list = selected(); const c = list[0];
    const flags = `${S.snap ? "snap on" : "snap off"}${S.snapWords ? " · word snap" : ""}${S.useProxy ? " · proxies" : ""}${S.tool === "razor" ? " · RAZOR tool (V to leave)" : ""}`;
    if (!c) line.innerHTML = `nothing selected · click the picture or a clip · ${K("Ctrl+/")} for anything · ${flags}`;
    else if (list.length > 1) line.innerHTML = `<b>${list.length} clips</b> · ${K("Alt+\u2191")} forward ${K("Alt+\u2193")} back ${K("Del")} delete · ${flags}`;
    else { const tr = M.trackById(p, c.track); line.innerHTML = `<b>${c.name || c.type}</b> · ${tr?.name || ""} · ${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s · ${K("Ctrl+K")} split ${K("Alt+\u2191")} forward ${K("Del")} delete${c.type === "text" ? ` ${K("dbl-click")} type` : ""} · ${flags}`; }
  }
  const status0 = status;
  const statusScoped = () => { status0(); if (S.scope && S.project) { const g = M.clipById(S.project, S.scope); $("#statusLine").innerHTML = `inside <b>${g?.name || "group"}</b> · ${K("Esc")} back to the reel · ` + $("#statusLine").innerHTML; } };
  bus.on("selection", statusScoped); bus.on("project", statusScoped); bus.on("ui", statusScoped);
  statusScoped();
  $("#crumbBack").onclick = () => actions.closeGroup();
})();
$("#btnSceneCaptions").onclick = actions.sceneCaptions;
$("#btnSceneSound").onclick = () => actions.soundOnScenes();
S.foldEmpty = localStorage.getItem("ravyn.foldEmpty") !== "0"; S.foldAudio = localStorage.getItem("ravyn.foldAudio") === "1";
$("#chkFoldEmpty").checked = S.foldEmpty; $("#chkFoldAudio").checked = S.foldAudio;
$("#chkFoldEmpty").onchange = (e) => { S.foldEmpty = e.target.checked; localStorage.setItem("ravyn.foldEmpty", S.foldEmpty ? "1" : "0"); bus.emit("ui"); };
$("#chkFoldAudio").onchange = (e) => { S.foldAudio = e.target.checked; localStorage.setItem("ravyn.foldAudio", S.foldAudio ? "1" : "0"); bus.emit("ui"); };

/* the command box */
const drop = (f) => () => actions.dropSfx(`sfx/${f}.wav`);
initPalette([
  { group: "play", label: "Play / pause", keys: "Space", run: togglePlay },
  { group: "play", label: "Go to the start", keys: "Home", run: () => { pause(); setTime(0); } },
  { group: "play", label: "Go to the end", keys: "End", run: () => { pause(); setTime(dur()); } },
  { group: "edit", label: "Split at the playhead", keys: "Ctrl+K", run: actions.splitAtPlayhead },
  { group: "edit", label: "Delete the selection", keys: "Del", run: actions.del },
  { group: "edit", label: "Ripple delete the selection", keys: "Shift+Del", run: actions.rippleDelete },
  { group: "edit", label: "Duplicate", keys: "Ctrl+D", run: actions.duplicate },
  { group: "edit", label: "Bring forward", keys: "Alt+\u2191", run: () => actions.trackMove(1) },
  { group: "edit", label: "Send back", keys: "Alt+\u2193", run: () => actions.trackMove(-1) },
  { group: "edit", label: "Marker at the playhead", keys: "M", run: actions.marker },
  { group: "edit", label: "Note on the picture (click the spot)", keys: "N", alias: "review feedback comment", run: () => notes.arm() },
  { group: "edit", label: "Arrow note: drag from the thing to where it should go", keys: "Shift+N", alias: "move this there", run: () => notes.arm("arrow") },
  { group: "view", label: "Review mode / Edit mode", keys: "E", alias: "simple full editor", run: () => review.toggleMode() },
  { group: "view", label: "Next note / previous note", keys: "] [", run: () => notes.next(1) },
  { group: "view", label: "Next scene / previous scene", keys: ". ,", run: () => review.scene(1) },
  { group: "view", label: "Scene is good / not right", keys: "G / X", alias: "verdict thumbs", run: () => review.verdict("good") },
  { group: "view", label: "Play the real render / the live preview", keys: "P", alias: "render mp4 source", run: () => review.toggleSource() },
  { group: "view", label: "Instagram overlay on / off", keys: "O", alias: "ig ui preview", run: () => review.toggleIG() },
  { group: "view", label: "Faster / slower playback", keys: "> <", alias: "speed rate 1.5x 2x", run: () => review.rate(1) },
  { group: "edit", label: "Scene cut at the playhead", alias: "boundary", run: actions.addBoundary },
  { group: "edit", label: "Group the selection", keys: "Ctrl+G", run: () => actions.group() },
  { group: "edit", label: "Ungroup", keys: "Ctrl+Shift+G", run: () => actions.ungroup() },
  { group: "edit", label: "Open the selected group", keys: "dbl-click", run: () => { const g = selected().find((c) => c.type === "group"); if (g) actions.openGroup(g.id); } },
  { group: "edit", label: "Back to the reel (leave the group)", keys: "Esc", run: () => actions.closeGroup() },
  { group: "edit", label: "Undo", keys: "Ctrl+Z", run: undo }, { group: "edit", label: "Redo", keys: "Ctrl+Shift+Z", run: redo },
  { group: "add", label: "Add text", keys: "T", run: actions.addText },
  { group: "add", label: "Add shape", keys: "R", run: actions.addShape },
  { group: "add", label: "Add label (mono tag)", run: actions.addVlab },
  { group: "add", label: "Add big number", run: actions.addBigNumber },
  { group: "add", label: "Build captions from the words", run: actions.addCaptions },
  { group: "add", label: "Captions per scene", run: actions.sceneCaptions },
  { group: "add", label: "Facecam window block", run: () => actions.addFacecam().catch((e) => bus.emit("toast", { text: e.message, bad: true })) },
  { group: "add", label: "Chapter card", run: actions.addChapter },
  { group: "add", label: "CTA lockup", run: actions.addCta },
  { group: "sound", label: "Drop core paper at the playhead", run: drop("paper") },
  { group: "sound", label: "Drop core click at the playhead", run: drop("click") },
  { group: "sound", label: "Drop core tick at the playhead", run: drop("tick") },
  { group: "sound", label: "Drop core slide at the playhead", run: drop("slide") },
  { group: "sound", label: "Sound on every scene change", run: () => actions.soundOnScenes() },
  { group: "view", label: "Fit the timeline", run: () => timeline.zoomFit() },
  { group: "view", label: "Zoom in", keys: "+", run: () => timeline.zoomBy(1.25) }, { group: "view", label: "Zoom out", keys: "\u2212", run: () => timeline.zoomBy(0.8) },
  { group: "view", label: "Snap on / off", keys: "S", run: () => { S.snap = !S.snap; bus.emit("ui"); } },
  { group: "view", label: "Snap to words on / off", run: () => $("#chkSnapWords").click() },
  { group: "view", label: "Fold empty tracks on / off", run: () => $("#chkFoldEmpty").click() },
  { group: "view", label: "Fold audio tracks on / off", run: () => $("#chkFoldAudio").click() },
  { group: "view", label: "Full screen on / off", keys: "F", alias: "fullscreen maximize big preview", run: () => actions.fullscreen() },
  { group: "view", label: "Safe zones on / off", run: () => $("#chkSafe").click() },
  { group: "view", label: "Proxies on / off", run: () => $("#chkProxy").click() },
  { group: "view", label: "Selection tool", keys: "V", run: () => actions.setTool("select") }, { group: "view", label: "Razor tool", keys: "C", run: () => actions.setTool("razor") },
  { group: "open", label: "Media drawer", run: () => actions.openDrawer("media") }, { group: "open", label: "Text drawer", run: () => actions.openDrawer("add") },
  { group: "open", label: "Captions drawer", run: () => actions.openDrawer("captions") }, { group: "open", label: "Sound drawer", run: () => actions.openDrawer("sound") },
  { group: "open", label: "Blocks drawer", run: () => actions.openDrawer("blocks") }, { group: "open", label: "Scenes drawer", run: () => actions.openDrawer("scenes") },
  { group: "open", label: "Notes drawer", alias: "review feedback", run: () => actions.openDrawer("notes") },
  { group: "open", label: "Close the drawer", keys: "Esc", run: () => actions.openDrawer(null) },
  { group: "open", label: "Job log", run: () => showLog(true) }, { group: "open", label: "Help: where things are, keys", run: () => $("#dlgHelp").showModal() },
  { group: "export", label: "Compile the composition", run: () => $("#btnCompile").click() },
  { group: "export", label: "Check (HyperFrames)", run: () => $("#btnCheck").click() },
  { group: "export", label: "Test render 3 s at the playhead", run: () => $("#btnTest").click() },
  { group: "export", label: "Render the reel", run: () => $("#btnRender").click() },
  { group: "export", label: "Board (one frame per scene)", run: () => $("#btnBoard").click() },
  { group: "file", label: "New project", run: () => $("#btnNew").click() }, { group: "file", label: "Save now", keys: "Ctrl+S", run: saveNow },
]);
window.addEventListener("resize", () => stage.fit());

/* ---------------------------------------------------------------- boot */
async function boot() {
  initStage(actions); initTimeline(actions); initInspector(actions); initMedia(actions); initNotes(actions); initReview(actions);
  installKeys(actions);
  connectEvents();
  const st = await refreshState();
  const last = localStorage.getItem("ravyn.last");
  const first = st.projects.find((p) => p.id === last) ? last : st.projects[0]?.id;
  if (first) { $("#projectPick").value = first; await openProject(first); }
  bus.emit("ui"); updateClock();
  requestAnimationFrame(loop);
}
boot().catch((e) => { console.error(e); logLine(`boot failed: ${e.message}\n`, "bad"); showLog(true); });
window.__ravyn = { S, M, actions, commit, select, setTime, stage, timeline };
