// The timeline: tracks (video stacked top = front, then audio), clips, ruler, playhead, markers,
// the keyframe lane of the selected clip, waveforms on audio clips.
// Drag to move (ghost, overwrite on drop), edges to trim, Ctrl+edge to roll the seam, Alt+drag
// to slip, razor tool to split, marquee on empty lane, snapping to edges / markers / playhead /
// word starts, Ctrl+wheel zoom.
import { S, M, bus, commit, beginLive, live, endLive, select, selected, primary, setTime, fps, T } from "/ui/state.js";
import { $, el, clamp, r3, fmtClock, contextMenu, typeColor } from "/ui/util.js";
/* every edit op runs on the open scope: the project, or the group you are inside */
const SC = (p) => M.scopeOf(p, S.scope);
import { Audio } from "/ui/audio.js";

const scroll = $("#tlScroll"), lanes = $("#tlLanes"), heads = $("#tlHeads"), ruler = $("#tlRuler"), playhead = $("#playhead"), marquee = $("#marquee");
const PAD_S = 4;               // seconds of empty room after the end
const KF_COLORS = { x: "#e8c547", y: "#e8a047", scale: "#7cc4ff", rotation: "#c08cff", opacity: "#7fd48a" };
let actionsRef = null, hoverLane = null;

export const timeline = {
  zoomBy(f, aroundPx) { setZoom(S.zoom * f, aroundPx); },
  zoomFit() { const d = S.project ? M.projectDuration(S.project) + PAD_S : 60; setZoom(Math.max(4, (scroll.clientWidth - 20) / d)); scroll.scrollLeft = 0; },
  render,
};
export function initTimeline(actions) {
  actionsRef = actions;
  bus.on("project", render); bus.on("selection", () => { paintSelection(); renderKeyLanes(); }); bus.on("ui", render);
  bus.on("time", positionPlayhead); bus.on("notes", render);
  scroll.addEventListener("scroll", () => { heads.scrollTop = scroll.scrollTop; drawRuler(); });
  scroll.addEventListener("wheel", (e) => {
    if (e.ctrlKey) { e.preventDefault(); const px = e.clientX - scroll.getBoundingClientRect().left + scroll.scrollLeft; setZoom(S.zoom * (e.deltaY < 0 ? 1.15 : 0.87), px); }
    else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
  }, { passive: false });
  ruler.addEventListener("pointerdown", (e) => { e.preventDefault(); try { ruler.setPointerCapture(e.pointerId); } catch {} actions.pause(); scrubTo(e); ruler.onpointermove = (ev) => scrubTo(ev); });
  ruler.addEventListener("pointerup", () => { ruler.onpointermove = null; });
  lanes.addEventListener("pointerdown", onLaneDown);
  lanes.addEventListener("dblclick", onLaneDblClick);
  lanes.addEventListener("contextmenu", onLaneContext);
  lanes.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-ravyn")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; const l = laneAt(e.clientY); if (hoverLane !== l) { hoverLane?.classList.remove("drop"); hoverLane = l; l?.classList.add("drop"); } } });
  lanes.addEventListener("dragleave", () => { hoverLane?.classList.remove("drop"); hoverLane = null; });
  lanes.addEventListener("drop", (e) => {
    hoverLane?.classList.remove("drop"); hoverLane = null;
    const raw = e.dataTransfer.getData("application/x-ravyn"); if (!raw) return; e.preventDefault();
    const file = JSON.parse(raw); const lane = laneAt(e.clientY);
    let t = xToT(e.clientX); if (S.snap) t = snapTime(t, [], 10 / S.zoom);
    actions.addMedia(file, { start: M.quant(Math.max(0, t), fps()), track: lane?.dataset.track || null });
  });
  new ResizeObserver(() => { drawRuler(); }).observe(scroll);
}

/* ---------------------------------------------------------------- geometry */
const tToX = (t) => t * S.zoom;
const xToT = (clientX) => (clientX - lanes.getBoundingClientRect().left) / S.zoom;
function setZoom(z, aroundPx) {
  const old = S.zoom; S.zoom = clamp(z, 2, 2000);
  if (aroundPx != null) { const t = aroundPx / old; scroll.scrollLeft = t * S.zoom - (aroundPx - scroll.scrollLeft); }
  render();
}
function displayTracks() {
  if (!S.project) return [];
  const sc = T();
  return [...M.videoTracks(sc)].reverse().concat(M.audioTracks(sc));
}
function laneAt(clientY) {
  for (const l of lanes.children) { if (!l.classList.contains("trk")) continue; const r = l.getBoundingClientRect(); if (clientY >= r.top && clientY < r.bottom) return l; }
  return null;
}
function snapTime(t, excludeIds = [], th = 8 / S.zoom, extra = []) {
  const pts = M.snapPoints(T(), { exclude: excludeIds, playhead: S.t }).concat(extra);
  if (S.snapWords && S.project.words) for (const w of S.project.words) pts.push(w.start);
  let best = t, d = th;
  for (const x of pts) { const dd = Math.abs(x - t); if (dd < d) { d = dd; best = x; } }
  return best;
}

/* ---------------------------------------------------------------- render */
function render() {
  const p = S.project;
  heads.innerHTML = ""; lanes.innerHTML = "";
  if (!p) { drawRuler(); return; }
  const width = Math.max(scroll.clientWidth, tToX(M.projectDuration(p) + PAD_S));
  lanes.style.width = width + "px";
  const crumb = $("#tlCrumb");
  if (crumb) { const g = S.scope ? M.clipById(p, S.scope) : null; crumb.hidden = !g; if (g) $("#crumbName").textContent = `${g.name || "group"} · ${g.clips.length} clips`; }
  if (!S.scope && M.facecamOf(p)) renderSceneStrip(p);
  for (const t of displayTracks()) {
    const isA = t.kind === "audio";
    const mine = M.clipsOnTrack(T(), t.id);
    const folded = (S.foldEmpty !== false && !mine.length) || (!!S.foldAudio && isA);
    const head = el("div", { class: `head ${t.kind}${folded ? " folded" : ""}`, title: folded && !mine.length ? "empty track, folded (more > fold empty tracks)" : "" },
      el("span", { class: "nm", text: t.name, title: "double-click to rename", ondblclick: () => { const n = prompt("Track name", t.name); if (n != null && n.trim()) commit("rename track", (p) => M.renameTrack(p, t.id, n.trim())); } }),
      el("button", { class: `tb ${t.locked ? "on warn" : ""}`, title: "lock", html: t.locked ? "&#128274;" : "&#128275;", onclick: () => commit("lock", (p) => M.setTrack(p, t.id, { locked: !t.locked })) }),
      isA ? el("button", { class: `tb ${t.muted ? "on warn" : ""}`, title: "mute", html: t.muted ? "&#128263;" : "&#128266;", onclick: () => commit("mute", (p) => M.setTrack(p, t.id, { muted: !t.muted })) })
          : el("button", { class: `tb ${t.hidden ? "on warn" : ""}`, title: "hide (also skipped in the render)", html: t.hidden ? "&#128065;&#65039;" : "&#128065;", onclick: () => commit("hide", (p) => M.setTrack(p, t.id, { hidden: !t.hidden })) }),
    );
    head.oncontextmenu = (e) => { e.preventDefault(); trackMenu(e, t); };
    head.dataset.track = t.id;
    heads.append(head);
    const lane = el("div", { class: `trk ${t.kind}${t.locked ? " locked" : ""}${t.hidden ? " hidden" : ""}${folded ? " folded" : ""}`, "data-track": t.id, "data-kind": t.kind });
    for (const c of mine) lane.append(clipBox(c, t));
    lanes.append(lane);
  }
  for (const m of p.markers || []) {
    const mk = el("div", { class: "marker", style: { left: tToX(m.t) + "px" }, title: `${m.label || "marker"} ${m.t.toFixed(3)}s` });
    const dia = el("i", { onclick: (e) => { e.stopPropagation(); actionsRef.pause(); setTime(m.t); }, oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); if (confirm(`delete marker at ${m.t.toFixed(2)}s?`)) commit("delete marker", (p) => M.removeMarker(p, m.id)); } });
    mk.append(dia); lanes.append(mk);
  }
  // your review notes (ui/notes.js): a numbered tick per note, click to jump there
  for (const n of S.notes || []) {
    if (n.status === "fixed" && !S.notesShowFixed) continue;
    const nt = el("div", { class: `notetick ${n.status}`, style: { left: tToX(n.t) + "px" } });
    nt.append(el("i", { text: String(n.n), title: `note #${n.n} ${n.t.toFixed(2)}s: ${n.text}`, onclick: (e) => { e.stopPropagation(); bus.emit("note-focus", n.id); } }));
    lanes.append(nt);
  }
  renderKeyLanes();
  positionPlayhead(); drawRuler(); paintSelection();
}
function clipBox(c, t) {
  const box = el("div", { class: `clipbox ${c.type}${t.locked || c.locked ? " locked" : ""}`, "data-id": c.id, style: { left: tToX(c.start) + "px", width: Math.max(2, tToX(c.duration)) + "px" }, title: `${c.name || c.type}  ${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s (${c.duration.toFixed(2)}s)${c.mediaStart ? `  in ${c.mediaStart.toFixed(2)}s` : ""}` });
  if (tToX(c.duration) < (c.type === "caption" ? 44 : 34)) box.classList.add("tiny");
  if (c.type === "audio" && tToX(c.duration) >= 34) { const cv = el("canvas", { class: "wave" }); box.append(cv); drawWave(cv, c, box); }
  if (c.label) box.append(el("i", { class: "lbl", style: { background: c.label } }));
  box.append(el("span", { class: "nm", text: c.type === "group" ? `${c.name || "group"} · ${c.clips.length}` : (c.name || c.type) }));
  if (c.type === "group") { box.classList.add("group"); box.title = `${c.name || "group"} · ${c.clips.length} clips inside · double-click to open · Ctrl+Shift+G to ungroup`; box.append(el("span", { class: "gstack" }, ...c.clips.slice(0, 16).map((k) => el("i", { style: { background: typeColor(k.type) } })))); }
  box.append(el("div", { class: "edge l" }), el("div", { class: "edge r" }));
  return box;
}
function drawWave(cv, c, box) {
  const w = Math.max(2, Math.round(tToX(c.duration))), h = 30;
  cv.width = w; cv.height = h;
  const paint = (peaks) => {
    if (!peaks || !cv.isConnected) return;
    const g = cv.getContext("2d"); g.clearRect(0, 0, w, h); g.fillStyle = "rgba(255,255,255,.55)";
    const pps = Audio.PPS, t0 = c.mediaStart || 0;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((t0 + (x / S.zoom)) * pps), b = Math.max(a + 1, Math.floor((t0 + ((x + 1) / S.zoom)) * pps));
      let m = 0; for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      const bar = Math.max(1, m * (h - 4)); g.fillRect(x, (h - bar) / 2, 1, bar);
    }
  };
  const cached = Audio.peaksCache.get(Audio.url(c.src));
  if (cached !== undefined) paint(cached); else Audio.peaks(c.src).then(paint);
}
function paintSelection() { for (const b of lanes.querySelectorAll(".clipbox")) b.classList.toggle("sel", S.sel.has(b.dataset.id)); }
function positionPlayhead() { playhead.style.left = tToX(S.t) + "px"; if (S.playing) { const x = tToX(S.t) - scroll.scrollLeft; if (x > scroll.clientWidth - 40 || x < 0) scroll.scrollLeft = Math.max(0, tToX(S.t) - 60); } }
function drawRuler() {
  const w = Math.max(scroll.clientWidth, lanes.offsetWidth || 0); const dpr = window.devicePixelRatio || 1;
  ruler.width = w * dpr; ruler.height = 26 * dpr; ruler.style.width = w + "px";
  const g = ruler.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#1c1d21"; g.fillRect(0, 0, w, 26);
  if (!S.project) return;
  const f = fps();
  const steps = [1 / f, 2 / f, 5 / f, 10 / f, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const step = steps.find((s) => s * S.zoom >= 70) || 60;
  const minor = step >= 1 ? step / 5 : step / 2;
  g.strokeStyle = "#3a3d44"; g.fillStyle = "#9aa0aa"; g.font = "10px Segoe UI, sans-serif"; g.textBaseline = "top";
  const tEnd = w / S.zoom;
  for (let t = 0; t <= tEnd; t += minor) { const x = Math.round(t * S.zoom) + 0.5; g.beginPath(); g.moveTo(x, 20); g.lineTo(x, 26); g.stroke(); }
  g.strokeStyle = "#5a5f69";
  for (let t = 0; t <= tEnd; t += step) { const x = Math.round(t * S.zoom) + 0.5; g.beginPath(); g.moveTo(x, 12); g.lineTo(x, 26); g.stroke(); g.fillText(step < 1 ? fmtClock(t, f) : t >= 60 ? fmtClock(t, f).slice(0, 5) : `${Math.round(t * 100) / 100}s`, x + 3, 2); }
  if (S.snapWords && S.project.words && S.zoom > 30) { g.fillStyle = "rgba(124,196,255,.5)"; for (const wd of S.project.words) g.fillRect(Math.round(wd.start * S.zoom), 22, 1, 4); }
  const d = M.projectDuration(S.project); const xe = tToX(d);
  g.fillStyle = "rgba(217,119,87,.25)"; g.fillRect(xe, 0, w - xe, 26);
}
function scrubTo(e) { setTime(M.quant(Math.max(0, xToT(e.clientX)), fps())); }

/* ---------------------------------------------------------------- scene strip (facecam window states) */
function renderSceneStrip(p) {
  heads.append(el("div", { class: "scenehead", text: "SCENES  F / C / N" }));
  const strip = el("div", { class: "scenestrip", title: "click a span to cycle full / stack / bubble / none · drag its left edge to move the cut · double-click to add a cut · right-click to remove" });
  for (const s of M.sceneSpans(p)) {
    const wpx = tToX(s.dur);
    const span = el("div", { class: `sspan ${s.state}${s.idx === 0 ? " first" : ""}`, "data-idx": s.idx, style: { left: tToX(s.t) + "px", width: Math.max(2, wpx - 1) + "px" }, text: wpx > 58 ? `${s.state[0].toUpperCase()} ${s.dur.toFixed(1)}s` : wpx > 16 ? s.state[0].toUpperCase() : "", title: `scene ${s.idx + 1} · ${s.state} · ${s.t.toFixed(2)}s to ${s.end.toFixed(2)}s (${s.dur.toFixed(2)}s)` });
    span.prepend(el("i", { class: "bnd", title: "drag the cut" }));
    span.onclick = (e) => { if (e.target.classList.contains("bnd")) return; commit("scene state", (p2) => M.cycleSpanState(p2, s.idx)); };
    span.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); if (s.idx === 0) return; if (confirm(`remove the scene cut at ${s.t.toFixed(2)}s?`)) commit("remove scene cut", (p2) => M.removeBoundary(p2, s.idx)); };
    strip.append(span);
  }
  strip.ondblclick = (e) => { if (e.target !== strip && !e.target.classList.contains("sspan")) return; const t = xToT(e.clientX); commit("scene cut", (p2) => { M.addBoundary(p2, t); }); };
  strip.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".bnd"); if (!b || e.button !== 0) return;
    const idx = +b.parentElement.dataset.idx; e.preventDefault(); e.stopPropagation();
    try { lanes.setPointerCapture(e.pointerId); } catch {}
    beginLive();
    lanes.onpointermove = (ev) => live((p2) => { M.moveBoundary(p2, idx, xToT(ev.clientX)); }, "scene cut");
    lanes.onpointerup = () => { lanes.onpointermove = lanes.onpointerup = null; endLive("move scene cut"); };
  });
  lanes.append(strip);
}

/* ---------------------------------------------------------------- keyframe lane */
function renderKeyLanes() {
  for (const x of [...lanes.querySelectorAll(".kflane"), ...heads.querySelectorAll(".kfhead")]) x.remove();
  const p = S.project; if (!p) return;
  const c = primary(); if (!c || S.sel.size !== 1 || !M.isVisual(c)) return;
  const props = M.KF_PROPS.filter((k) => M.hasKeys(c, k));
  if (!props.length) return;
  const lane = lanes.querySelector(`.trk[data-track="${c.track}"]`); const head = heads.querySelector(`.head[data-track="${c.track}"]`);
  if (!lane || !head) return;
  let afterL = lane, afterH = head;
  for (const prop of props) {
    const kl = el("div", { class: "kflane", "data-clip": c.id, "data-prop": prop });
    const keys = c.keyframes[prop];
    const x0 = tToX(c.start), x1 = tToX(M.clipEnd(c));
    kl.append(el("span", { class: "kfspan", style: { left: x0 + "px", width: Math.max(1, x1 - x0) + "px", background: KF_COLORS[prop] || "#e8c547", opacity: .35 } }));
    kl.append(el("span", { class: "kfname", text: prop, style: { left: x0 + 4 + "px" } }));
    for (const k of keys) {
      const on = S.selKey && S.selKey.id === c.id && S.selKey.prop === prop && Math.abs(S.selKey.t - k.t) < 1e-6;
      kl.append(el("i", { class: `kf${on ? " on" : ""}`, "data-t": k.t, style: { left: tToX(c.start + k.t) + "px", background: KF_COLORS[prop] || "#e8c547" }, title: `${prop} = ${Math.round(k.v * 100) / 100} at ${(c.start + k.t).toFixed(2)}s (${k.ease || "power2.inOut"})` }));
    }
    afterL.after(kl); afterL = kl;
    const kh = el("div", { class: "kfhead", text: `keys · ${prop}` }); afterH.after(kh); afterH = kh;
  }
}
function keyDrag(e, kl, kf) {
  const p = S.project; const c = M.clipById(p, kl.dataset.clip); const prop = kl.dataset.prop; if (!c) return;
  const t0 = +kf.dataset.t;
  S.selKey = { id: c.id, prop, t: t0 }; actionsRef.pause(); setTime(c.start + t0); bus.emit("selection");
  const key = c.keyframes[prop].find((k) => Math.abs(k.t - t0) < 1e-6); if (!key) return;
  let moved = false; beginLive();
  lanes.onpointermove = (ev) => {
    const nt = M.quant(clamp(xToT(ev.clientX) - c.start, 0, c.duration), p.fps);
    if (nt === key.t) return; moved = true;
    live((p2) => { const q = M.clipById(p2, c.id); const list = q.keyframes[prop]; const k2 = list.find((k) => Math.abs(k.t - S.selKey.t) < 1e-6); if (!k2) return; if (list.some((x) => x !== k2 && Math.abs(x.t - nt) < 1e-6)) return; k2.t = nt; S.selKey.t = nt; list.sort((a, b) => a.t - b.t); }, "keyframe");
    setTime(c.start + S.selKey.t);
  };
  lanes.onpointerup = () => { lanes.onpointermove = lanes.onpointerup = null; if (moved) endLive("move key"); else endLive("select key"); };
}
function onLaneDblClick(e) {
  const gbox = e.target.closest(".clipbox");
  if (gbox) { const g = M.clipById(S.project, gbox.dataset.id); if (g && g.type === "group") { e.preventDefault(); actionsRef.openGroup(g.id); return; } }
  const kl = e.target.closest(".kflane"); if (!kl || e.target.classList.contains("kf")) return;
  const c = M.clipById(S.project, kl.dataset.clip); const prop = kl.dataset.prop; if (!c) return;
  const rel = M.quant(clamp(xToT(e.clientX) - c.start, 0, c.duration), fps());
  commit("add key", (p) => { const q = M.clipById(p, c.id); M.upsertKey(q, prop, rel, M.valueAt(q.keyframes[prop], rel), p.fps); });
}
function onLaneContext(e) {
  const box = e.target.closest(".clipbox");
  if (box) {
    e.preventDefault();
    const c = M.clipById(S.project, box.dataset.id); if (!c) return;
    if (!S.sel.has(c.id)) select(c.id);
    const A = actionsRef;
    contextMenu(e.clientX, e.clientY, [
      c.type === "group" ? ["Open group", "dbl-click", () => A.openGroup(c.id)] : null, c.type === "group" ? ["Ungroup", "Ctrl+Shift+G", A.ungroup] : null,
      c.type !== "group" && !S.scope ? ["Group the selection", "Ctrl+G", A.group] : null, (c.type === "group" || !S.scope) ? null : undefined,
      ["Split at playhead", "Ctrl+K", A.splitAtPlayhead], ["Duplicate", "Ctrl+D", A.duplicate], ["Ripple delete", "Shift+Del", A.rippleDelete], null,
      ["Bring forward", "Alt+\u2191", () => A.trackMove(1)], ["Send back", "Alt+\u2193", () => A.trackMove(-1)],
      S.project.words?.length && M.isVisual(c) ? ["Start on the nearest word", "", () => A.snapClipToWord(c.id)] : null, null,
      ["Go to its start", "", () => { A.pause(); setTime(c.start); }], ["Delete", "Del", A.del],
    ].filter((i) => i !== undefined));
    return;
  }
  const kf = e.target.closest(".kf"); if (!kf) return;
  e.preventDefault();
  const kl = kf.closest(".kflane"); const c = M.clipById(S.project, kl.dataset.clip); if (!c) return;
  commit("delete key", (p) => { M.removeKey(M.clipById(p, c.id), kl.dataset.prop, +kf.dataset.t, p.fps); });
}

/* ---------------------------------------------------------------- lane pointer */
function onLaneDown(e) {
  if (e.button !== 0 || !S.project) return;
  const kf = e.target.closest(".kf");
  if (kf) { e.preventDefault(); try { lanes.setPointerCapture(e.pointerId); } catch {} return keyDrag(e, kf.closest(".kflane"), kf); }
  if (e.target.closest(".kflane")) return;
  const box = e.target.closest(".clipbox"); const lane = e.target.closest(".trk");
  const p = S.project;
  if (S.tool === "razor") {
    if (!box) return;
    e.preventDefault();
    let t = xToT(e.clientX); if (S.snap) t = snapTime(t, [box.dataset.id]);
    commit("razor", (p) => { M.splitClip(SC(p), box.dataset.id, t); });
    return;
  }
  if (!box) {
    if (!e.shiftKey) select([]);
    startMarquee(e);
    if (lane && !e.shiftKey) { actionsRef.pause(); setTime(M.quant(Math.max(0, xToT(e.clientX)), fps())); }
    return;
  }
  const c = M.clipById(p, box.dataset.id); if (!c) return;
  const tr = M.trackById(p, c.track);
  if (e.shiftKey) select(c.id, { toggle: true }); else if (!S.sel.has(c.id)) select(c.id);
  if (tr?.locked || c.locked) return;
  e.preventDefault(); try { lanes.setPointerCapture(e.pointerId); } catch {}
  const t0 = xToT(e.clientX);
  if (e.target.classList.contains("edge")) return startTrim(e, c, e.target.classList.contains("l") ? "start" : "end", t0);
  if (e.altKey && M.isMedia(c)) return startSlip(e, c, t0);
  startMove(e, c, t0, box);
}
function startTrim(e, c, side, t0) {
  beginLive();
  const orig = { start: c.start, end: M.clipEnd(c) };
  const list = M.clipsOnTrack(S.project, c.track);
  const nb = side === "end" ? list.find((x) => x.id !== c.id && Math.abs(x.start - orig.end) < 1.5 / fps()) : list.find((x) => x.id !== c.id && Math.abs(M.clipEnd(x) - orig.start) < 1.5 / fps());
  const roll = e.ctrlKey && nb;
  lanes.onpointermove = (ev) => {
    const dt = xToT(ev.clientX) - t0;
    let nt = side === "start" ? orig.start + dt : orig.end + dt;
    if (S.snap) nt = snapTime(nt, [c.id, nb?.id].filter(Boolean));
    live((p) => {
      if (roll) { side === "end" ? M.rollEdit(SC(p), c.id, nb.id, nt) : M.rollEdit(SC(p), nb.id, c.id, nt); }
      else M.trimClip(SC(p), c.id, side === "start" ? { start: nt } : { end: nt });
    }, roll ? "roll" : "trim");
  };
  lanes.onpointerup = () => { lanes.onpointermove = lanes.onpointerup = null; endLive(roll ? "roll edit" : "trim"); };
}
function startSlip(e, c, t0) {
  beginLive(); const ms0 = c.mediaStart || 0;
  lanes.onpointermove = (ev) => { const dt = xToT(ev.clientX) - t0; live((p) => { const q = M.clipById(p, c.id); if (q) { q.mediaStart = ms0; M.slipClip(SC(p), c.id, -dt); } }, "slip"); };
  lanes.onpointerup = () => { lanes.onpointermove = lanes.onpointerup = null; endLive("slip"); };
}
function startMove(e, c, t0, box) {
  const moving = selected().filter((q) => !q.locked && !M.trackById(S.project, q.track)?.locked);
  if (!moving.includes(c)) moving.push(c);
  const orig = new Map(moving.map((q) => [q.id, { start: q.start, track: q.track }]));
  const ghosts = new Map();
  let moved = false, targetTrack = c.track, dt = 0;
  const kind = M.trackById(S.project, c.track).kind;
  lanes.onpointermove = (ev) => {
    const raw = xToT(ev.clientX) - t0;
    if (!moved && Math.abs(raw * S.zoom) < 3) return;
    moved = true;
    dt = raw;
    if (S.snap) {
      const ex = moving.map((q) => q.id);
      const cand = [c.start + raw, M.clipEnd(c) + raw];
      let best = null, bd = 8 / S.zoom;
      const pts = M.snapPoints(S.project, { exclude: ex, playhead: S.t });
      if (S.snapWords && S.project.words) for (const w of S.project.words) pts.push(w.start);
      // x - raw is the clip's own edge; the delta that lands that edge on the snap point is pnt - edge
      for (const x of cand) for (const pnt of pts) { const d = Math.abs(pnt - x); if (d < bd) { bd = d; best = pnt - (x - raw); } }
      if (best != null) dt = best;
    }
    dt = Math.max(dt, -Math.min(...moving.map((q) => q.start)));
    const lane = laneAt(ev.clientY);
    if (lane && lane.dataset.kind === kind && moving.length === 1) targetTrack = lane.dataset.track;
    for (const q of moving) {
      const o = orig.get(q.id); const tid = moving.length === 1 ? targetTrack : o.track;
      const lane2 = lanes.querySelector(`.trk[data-track="${tid}"]`); if (!lane2) continue;
      let g = ghosts.get(q.id);
      if (!g) { g = el("div", { class: `clipbox ghost ${q.type}` }, el("span", { class: "nm", text: q.name || q.type })); ghosts.set(q.id, g); }
      if (g.parentElement !== lane2) lane2.append(g);
      const ns = M.quant(o.start + dt, fps());
      g.style.left = tToX(ns) + "px"; g.style.width = Math.max(2, tToX(q.duration)) + "px";
      g.title = `${ns.toFixed(2)}s`;
    }
  };
  lanes.onpointerup = () => {
    lanes.onpointermove = lanes.onpointerup = null;
    for (const g of ghosts.values()) g.remove();
    if (!moved) return;
    commit("move", (p) => {
      for (const q of moving) { const o = orig.get(q.id); M.moveClip(SC(p), q.id, { start: o.start + dt, track: moving.length === 1 ? targetTrack : o.track }, "overwrite"); }
    });
  };
}
function startMarquee(e) {
  const r0 = scroll.getBoundingClientRect(); const x0 = e.clientX - r0.left + scroll.scrollLeft, y0 = e.clientY - r0.top + scroll.scrollTop;
  try { lanes.setPointerCapture(e.pointerId); } catch {}
  let on = false;
  lanes.onpointermove = (ev) => {
    const x1 = ev.clientX - r0.left + scroll.scrollLeft, y1 = ev.clientY - r0.top + scroll.scrollTop;
    if (!on && Math.hypot(x1 - x0, y1 - y0) < 4) return; on = true;
    marquee.hidden = false;
    Object.assign(marquee.style, { left: Math.min(x0, x1) + "px", top: Math.min(y0, y1) + "px", width: Math.abs(x1 - x0) + "px", height: Math.abs(y1 - y0) + "px" });
    const mr = marquee.getBoundingClientRect(); const ids = [];
    for (const b of lanes.querySelectorAll(".clipbox")) { const br = b.getBoundingClientRect(); if (br.right > mr.left && br.left < mr.right && br.bottom > mr.top && br.top < mr.bottom) ids.push(b.dataset.id); }
    select(ids, { add: ev.shiftKey });
  };
  lanes.onpointerup = () => { lanes.onpointermove = lanes.onpointerup = null; marquee.hidden = true; };
}
function trackMenu(e, t) {
  const items = [
    ["add track above", () => commit("add track", (p) => { const i = M.trackIndex(p, t.id); M.addTrack(SC(p), t.kind, null, t.kind === "video" ? i + 1 : i); })],
    ["add track below", () => commit("add track", (p) => { const i = M.trackIndex(p, t.id); M.addTrack(SC(p), t.kind, null, t.kind === "video" ? i : i + 1); })],
    ["move up", () => commit("move track", (p) => M.moveTrack(SC(p), t.id, t.kind === "video" ? 1 : -1))],
    ["move down", () => commit("move track", (p) => M.moveTrack(SC(p), t.id, t.kind === "video" ? -1 : 1))],
    ["delete track (and its clips)", () => { if (confirm(`delete ${t.name} and everything on it?`)) commit("delete track", (p) => M.removeTrack(SC(p), t.id, { deleteClips: true })); }],
  ];
  const menu = el("div", { style: { position: "fixed", left: e.clientX + "px", top: e.clientY + "px", background: "#232529", border: "1px solid #3a3d44", borderRadius: "6px", padding: "4px 0", zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,.6)" } });
  for (const [label, fn] of items) menu.append(el("div", { text: label, style: { padding: "5px 14px", cursor: "pointer" }, onmouseenter: (ev) => (ev.target.style.background = "#2a3e57"), onmouseleave: (ev) => (ev.target.style.background = ""), onclick: () => { fn(); menu.remove(); } }));
  document.body.append(menu);
  setTimeout(() => document.addEventListener("pointerdown", () => menu.remove(), { once: true }), 0);
}
