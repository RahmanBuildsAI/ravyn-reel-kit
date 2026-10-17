// The stage on the parent side: scales the composition iframe to fit, draws the selection
// overlay, hit-tests clips from the model geometry, and handles move / resize / rotate /
// in-place text editing. The iframe itself is built by the compiler (stage.html).
import { S, M, bus, commit, beginLive, live, endLive, select, selected, primary, setTime } from "/ui/state.js";
import { $, el, corners, hit, rot, clamp, r3, contextMenu } from "/ui/util.js";

const wrap = $("#stageWrap"), frame = $("#stage"), overlay = $("#overlay"), viewport = $("#viewport"), editor = $("#textEditor");
const NS = "http://www.w3.org/2000/svg";
let k = 0.3, ready = false, mountedSig = "", actionsRef = null;
let override = null;   // review: another version of the project on the picture (the "before" of a fix)

export const stage = {
  fit, tick, mount,
  showProject(p) { override = p || null; mount(true); draw(); },
  pauseAll() { try { frame.contentWindow.__stage?.pauseAll(); } catch {} },
  measure(id) { try { return frame.contentWindow.__stage?.measure(id); } catch { return null; } },
};

export function initStage(actions) {
  actionsRef = actions;
  window.addEventListener("message", (e) => { if (e.data?.type === "stage-ready") { ready = true; mount(true); } });
  // the iframe can finish loading (and post "stage-ready") before this module runs, so also
  // poll for its API; and if it never turns up (a failed module load, a server restart
  // mid-page-load) reload it rather than leaving a black stage until you refreshes
  let waited = 0;
  const watchdog = setInterval(() => {
    if (ready) return clearInterval(watchdog);
    try { if (frame.contentWindow?.__stage) { ready = true; mount(true); return clearInterval(watchdog); } } catch {}
    waited += 250;
    if (waited >= 6000) { waited = 0; console.warn("stage not ready, reloading the stage iframe"); frame.src = "/stage.html?r=" + Date.now(); }
  }, 250);
  bus.on("project", (o) => { mount(false, o); draw(); });
  bus.on("selection", draw);
  bus.on("time", () => { if (!S.playing) tick(S.t, "scrub"); draw(); });
  bus.on("ui", draw);
  wrap.addEventListener("pointerdown", onDown);
  wrap.addEventListener("pointermove", onHover);
  wrap.addEventListener("dblclick", onDblClick);
  wrap.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-ravyn")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  wrap.addEventListener("drop", (e) => { const raw = e.dataTransfer.getData("application/x-ravyn"); if (!raw) return; e.preventDefault(); actions.addMedia(JSON.parse(raw), { start: S.t }); });
  editor.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeEditor(true); } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.execCommand("insertText", false, "\n"); } e.stopPropagation(); });
  editor.addEventListener("blur", () => closeEditor(true));
  const fb = $("#floatbar");
  fb.addEventListener("pointerdown", (e) => e.stopPropagation());
  fb.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const c = primary(); if (!c) return;
    const act = b.dataset.act;
    if (act === "centre") commit("centre", (p) => { const q = M.clipById(p, c.id); M.setPropAt(q, "x", r3(p.width / 2 - q.w / 2), S.t - q.start, p.fps); M.setPropAt(q, "y", r3(p.height / 2 - q.h / 2), S.t - q.start, p.fps); });
    else if (act === "fill") commit("fill frame", (p) => { const q = M.clipById(p, c.id); q.w = p.width; q.h = p.height; q.scale = 1; q.rotation = 0; M.clearKeys(q, "x"); M.clearKeys(q, "y"); q.x = 0; q.y = 0; if (q.type === "text") q.hAuto = false; });
    else if (act === "forward") actions.trackMove(1);
    else if (act === "back") actions.trackMove(-1);
    else if (act === "split") actions.splitAtPlayhead();
    else if (act === "delete") actions.del();
    else if (act === "edit") openEditor(c);
    else if (act === "open") actions.openGroup(c.id);
    else if (act === "ungroup") actions.ungroup();
  });
  wrap.addEventListener("contextmenu", onStageContext);
  fit();
}
function onStageContext(e) {
  if (!S.project) return;
  e.preventDefault();
  if (S.mode === "review" || override) {
    const A = actionsRef;
    contextMenu(e.clientX, e.clientY, [["Note on the picture", "N", () => A.note()], ["Arrow note: this goes there", "Shift+N", () => A.noteArrow()], null, ["Edit mode (the full editor)", "E", () => A.toggleMode()]]);
    return;
  }
  const [x, y] = pt(e); const c = topHit(x, y);
  if (c && !S.sel.has(c.id)) select(c.id);
  const A = actionsRef;
  const items = c ? [
    c.type === "group" ? ["Open group", "dbl-click", () => A.openGroup(c.id)] : null, c.type === "group" ? ["Ungroup", "Ctrl+Shift+G", A.ungroup] : null,
    c.type !== "group" && !S.scope ? ["Group the selection", "Ctrl+G", A.group] : null, null,
    ["Bring forward", "Alt+\u2191", () => A.trackMove(1)], ["Send back", "Alt+\u2193", () => A.trackMove(-1)], null,
    ["Split at playhead", "Ctrl+K", A.splitAtPlayhead], ["Duplicate", "Ctrl+D", A.duplicate],
    c.type === "text" ? ["Edit text", "dbl-click", () => openEditor(c)] : null, null,
    ["Centre on the frame", "", () => $("#floatbar button[data-act=centre]").click()], ["Fill the frame", "", () => $("#floatbar button[data-act=fill]").click()], null,
    ["Go to its start", "", () => { A.pause(); setTime(c.start); }], ["Delete", "Del", A.del],
  ] : [["Add text here", "T", A.addText], ["Add shape", "R", A.addShape], ["Marker", "M", A.marker], null, ["Fit the timeline", "", () => A.zoom(1)]];
  contextMenu(e.clientX, e.clientY, items.filter((i) => i !== undefined));
}
function positionFloatbar(c) {
  const fb = $("#floatbar");
  if (!c) { fb.hidden = true; return; }
  const pts = corners(c);
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  const wr = wrap.getBoundingClientRect(), vr = viewport.getBoundingClientRect();
  fb.hidden = false;
  $("#floatbar button[data-act=edit]").hidden = c.type !== "text";
  for (const act of ["centre", "fill"]) $(`#floatbar button[data-act=${act}]`).hidden = c.type === "group";
  for (const act of ["open", "ungroup"]) $(`#floatbar button[data-act=${act}]`).hidden = c.type !== "group";
  const fw = fb.offsetWidth, fh = fb.offsetHeight;
  let x = wr.left - vr.left + minX * k, y = wr.top - vr.top + minY * k - fh - 8;
  x = clamp(x, 4, Math.max(4, vr.width - fw - 4)); if (y < 4) y = clamp(wr.top - vr.top + Math.max(...pts.map((p) => p[1])) * k + 8, 4, vr.height - fh - 4);
  fb.style.left = x + "px"; fb.style.top = y + "px";
}

function fit() {
  const vw = viewport.clientWidth - 24, vh = viewport.clientHeight - 24;
  const W = S.project?.width || 1080, H = S.project?.height || 1920;
  wrap.style.width = W + "px"; wrap.style.height = H + "px";
  frame.style.width = W + "px"; frame.style.height = H + "px";
  overlay.setAttribute("width", W); overlay.setAttribute("height", H);
  k = Math.max(0.05, Math.min(vw / W, vh / H));
  wrap.style.transform = `scale(${k})`;
  wrap.style.marginLeft = `${(viewport.clientWidth - W * k) / 2}px`;
  wrap.style.marginTop = `${(viewport.clientHeight - H * k) / 2}px`;
  wrap.style.position = "absolute"; wrap.style.left = "0"; wrap.style.top = "0";
  if (S.project) $("#stageInfo").textContent = `${W}x${H} · ${Math.round(k * 100)}%`;
  draw();
}
function srcMap() {
  const m = {}; if (!S.useProxy) return m;
  for (const [src, url] of Object.entries(S.proxies || {})) m[src] = url;
  return m;
}
function mount(force, o = {}) {
  const P = override || S.project;
  if (!ready || !P) return;
  const sig = JSON.stringify([P, S.useProxy ? S.proxies : null]);
  if (!force && sig === mountedSig) return;
  mountedSig = sig;
  try { frame.contentWindow.__stage.mount(P, { srcMap: srcMap() }); } catch (e) { console.error("mount", e); }
  $("#stageInfo").textContent = `${S.project.width}x${S.project.height} · ${Math.round(k * 100)}%`;
  if (!o.live && !override) queueMicrotask(autoHeight);
}
function tick(t, mode) { if (ready) { try { frame.contentWindow.__stage.tick(t, mode); } catch {} } }
/* text clips with hAuto follow their content height */
function autoHeight() {
  if (!S.project) return; let changed = false;
  for (const c of M.allClips(S.project)) {
    if (c.type !== "text" || c.hAuto === false) continue;
    const h = stage.measure(c.id); if (!h || Math.abs(h - c.h) < 1.5) continue;
    c.h = Math.max(10, h); changed = true;
  }
  if (changed) bus.emit("project", { reason: "measure", live: true });
}

/* ---------------------------------------------------------------- overlay */
function visibleAt(t) {
  const p = S.project; if (!p) return [];
  return M.allClips(p).filter((c) => M.clipVisible(p, c) && M.isVisual(c) && t >= c.start - 1e-6 && t < M.clipEnd(c))
    .sort((a, b) => (M.zIndexOf(p, b) - M.zIndexOf(p, a)) || (b.start - a.start))
    .map((c) => M.clipAt(c, t));
}
function topHit(px, py, t = S.t, skip = null) {
  const list = visibleAt(t).filter((c) => !(M.trackById(S.project, c.track)?.locked));
  const hits = list.filter((c) => hit(c, px, py));
  if (!hits.length) return null;
  let h = hits[0];
  if (skip) { const i = hits.findIndex((c) => c.id === skip); if (i >= 0 && hits.length > 1) h = hits[(i + 1) % hits.length]; }
  const real = M.clipById(S.project, h.id);
  const g = real ? M.groupOf(S.project, real.id) : null;
  return g && S.scope !== g.id ? g : real;      // outside a group you pick the group; inside it, its clips
}
/* the box a group takes on the picture at time t: the union of its visible clips */
function groupBox(g, t) {
  const kids = g.clips.filter((k) => M.isVisual(k) && t >= k.start - 1e-6 && t < M.clipEnd(k)).map((k) => M.clipAt(k, t));
  if (!kids.length) return null;
  const xs = kids.flatMap((k) => corners(k).map((p) => p[0])), ys = kids.flatMap((k) => corners(k).map((p) => p[1]));
  const x = Math.min(...xs), y = Math.min(...ys);
  return { id: g.id, type: "group", name: g.name, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, scale: 1, rotation: 0, n: g.clips.length };
}
function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); return e; }
function draw() {
  overlay.innerHTML = "";
  if (!S.project) return;
  if (override) { $("#floatbar").hidden = true; return; }
  const hs = 12 / k;
  if (S.hoverId && !S.sel.has(S.hoverId)) { const c = M.clipById(S.project, S.hoverId); if (c && M.isVisual(c)) overlay.append(svg("polygon", { class: "hover", points: corners(M.clipAt(c, S.t)).map((p) => p.join(",")).join(" ") })); }
  const sel = selected().filter((c) => M.isVisual(c) && S.t >= c.start - 1e-6 && S.t < M.clipEnd(c)).map((c) => M.clipAt(c, S.t));
  const gsel = selected().filter((c) => c.type === "group" && S.t >= c.start - 1e-6 && S.t < M.clipEnd(c)).map((g) => groupBox(g, S.t)).filter(Boolean);
  for (const g of gsel) {
    overlay.append(svg("polygon", { class: "box", points: corners(g).map((p) => p.join(",")).join(" "), style: "stroke-dasharray:14 8" }));
    const lbl = svg("text", { class: "lbl", x: Math.max(8 / k, g.x), y: g.y > 44 / k ? g.y - 8 / k : g.y + g.h + 34 / k }); lbl.style.fontSize = `${26 / k}px`;
    lbl.textContent = `${g.name || "group"} · ${g.n}`; overlay.append(lbl);
  }
  positionFloatbar(!editing && !drag ? (sel.length === 1 && !gsel.length ? sel[0] : (!sel.length && gsel.length === 1 ? gsel[0] : null)) : null);
  for (const c of sel) {
    const pts = corners(c);
    overlay.append(svg("polygon", { class: "box", points: pts.map((p) => p.join(",")).join(" ") }));
    if (sel.length > 1 || editing === c.id) continue;
    const mids = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([a, b]) => [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2]);
    const handles = { nw: pts[0], ne: pts[1], se: pts[2], sw: pts[3], n: mids[0], e: mids[1], s: mids[2], w: mids[3] };
    for (const [h, [x, y]] of Object.entries(handles)) overlay.append(svg("rect", { class: "h", "data-h": h, x: x - hs / 2, y: y - hs / 2, width: hs, height: hs, "data-id": c.id }));
    const [ux, uy] = rot(0, -1, c.rotation || 0);
    const rx = mids[0][0] + ux * (56 / k), ry = mids[0][1] + uy * (56 / k);
    overlay.append(svg("line", { class: "rotline", x1: mids[0][0], y1: mids[0][1], x2: rx, y2: ry }));
    overlay.append(svg("circle", { class: "rot", "data-h": "rot", cx: rx, cy: ry, r: hs * 0.6, "data-id": c.id }));
    const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
    const lbl = svg("text", { class: "lbl", x: Math.max(8 / k, pts[0][0]), y: minY > 44 / k ? minY - 8 / k : Math.min((S.project.height - 10 / k), maxY + 34 / k) }); lbl.style.fontSize = `${26 / k}px`;
    lbl.textContent = `${c.name || c.type}  ${Math.round(c.x)},${Math.round(c.y)}  ${Math.round(c.w)}x${Math.round(c.h)}${c.scale !== 1 ? `  x${c.scale.toFixed(2)}` : ""}${c.rotation ? `  ${Math.round(c.rotation)}°` : ""}`;
    overlay.append(lbl);
  }
}

/* ---------------------------------------------------------------- pointer */
const pt = (e) => { const r = wrap.getBoundingClientRect(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
let drag = null;
function onHover(e) {
  if (drag || editing) return;
  if (S.mode === "review" || override) { if (S.hoverId) { S.hoverId = null; draw(); } wrap.style.cursor = "default"; return; }
  const [x, y] = pt(e); const c = topHit(x, y);
  const id = c ? c.id : null;
  if (id !== S.hoverId) { S.hoverId = id; draw(); }
  wrap.style.cursor = c ? "move" : "default";
}
function onDown(e) {
  if (e.button !== 0 || !S.project) return;
  if (editing) { closeEditor(true); }
  if (S.mode === "review" || override) return;     // review: the picture is for looking; E for edit mode
  const target = e.target;
  const [x, y] = pt(e);
  if (target.dataset?.h) {
    const c = M.clipById(S.project, target.dataset.id); if (!c) return;
    e.preventDefault(); try { wrap.setPointerCapture(e.pointerId); } catch {}
    beginLive();
    drag = target.dataset.h === "rot" ? rotDrag(c, x, y) : resizeDrag(c, target.dataset.h, x, y, e.shiftKey);
    return;
  }
  const c = topHit(x, y, S.t, e.altKey ? (primary()?.id || null) : null);
  if (!c) { if (!e.shiftKey) select([]); return; }
  if (S.scope && M.groupOf(S.project, c.id)?.id !== S.scope) actionsRef.closeGroup();
  if (e.shiftKey) select(c.id, { toggle: true });
  else if (!S.sel.has(c.id)) select(c.id);
  e.preventDefault(); try { wrap.setPointerCapture(e.pointerId); } catch {}
  const sel0 = selected();
  const moving = sel0.filter((q) => M.isVisual(q) && !q.locked);
  const kids = sel0.filter((q) => q.type === "group" && !q.locked).flatMap((g) => g.clips.filter((k) => M.isVisual(k)));
  const origin = new Map(moving.map((q) => { const e0 = M.clipAt(q, S.t); return [q.id, { x: e0.x, y: e0.y }]; }));
  let applied = { dx: 0, dy: 0 };
  beginLive();
  drag = {
    move(ex, ey) {
      const dx = ex - x, dy = ey - y;
      live((p) => {
        for (const q of moving) { const o = origin.get(q.id); const c2 = M.clipById(p, q.id); if (!c2) continue; const tmp = { ...M.clipAt(c2, S.t), x: r3(o.x + dx), y: r3(o.y + dy) }; if (S.snap) snapXY(tmp, p); M.setPropAt(c2, "x", tmp.x, S.t - c2.start, p.fps); M.setPropAt(c2, "y", tmp.y, S.t - c2.start, p.fps); }
        const ddx = r3(dx - applied.dx), ddy = r3(dy - applied.dy);
        for (const k of kids) { const c2 = M.clipById(p, k.id); if (c2) M.shiftXY(c2, ddx, ddy); }
        applied = { dx, dy };
      }, "move");
    },
    end() { endLive("move"); },
  };
}
function snapXY(c, p) {
  const th = 8 / k;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  if (Math.abs(cx - p.width / 2) < th) c.x = r3(p.width / 2 - c.w / 2);
  if (Math.abs(cy - p.height / 2) < th) c.y = r3(p.height / 2 - c.h / 2);
  if (Math.abs(c.x) < th) c.x = 0;
  if (Math.abs(c.y) < th) c.y = 0;
  if (Math.abs(c.x + c.w - p.width) < th) c.x = r3(p.width - c.w);
  if (Math.abs(c.y + c.h - p.height) < th) c.y = r3(p.height - c.h);
}
function resizeDrag(c0, h, x0, y0, shift) {
  const c = M.clipAt(c0, S.t);
  const start = { x: c.x, y: c.y, w: c.w, h: c.h }, cx0 = c.x + c.w / 2, cy0 = c.y + c.h / 2, s = c.scale || 1, r = c.rotation || 0;
  const aspect = start.w / start.h, isMediaLike = c.type === "video" || c.type === "image";
  const corner = h.length === 2;
  return {
    move(ex, ey, ev) {
      const [lx0, ly0] = rot(ex - x0, ey - y0, -r); const lx = lx0 / s, ly = ly0 / s;
      let nw = start.w, nh = start.h, sx = 0, sy = 0;
      if (h.includes("e")) { nw = start.w + lx; sx = lx / 2; }
      if (h.includes("w")) { nw = start.w - lx; sx = lx / 2; }
      if (h.includes("s")) { nh = start.h + ly; sy = ly / 2; }
      if (h.includes("n")) { nh = start.h - ly; sy = ly / 2; }
      const lock = corner && (isMediaLike ? !(ev?.shiftKey || shift) : (ev?.shiftKey || shift));
      if (lock) {
        if (Math.abs(lx) >= Math.abs(ly)) { nh = nw / aspect; const d = nh - start.h; sy = h.includes("s") ? d / 2 : -d / 2; }
        else { nw = nh * aspect; const d = nw - start.w; sx = h.includes("e") ? d / 2 : -d / 2; }
      }
      nw = Math.max(10, nw); nh = Math.max(10, nh);
      const [ox, oy] = rot(sx * s, sy * s, r);
      const cx = cx0 + ox, cy = cy0 + oy;
      live((p) => { const q = M.clipById(p, c.id); if (!q) return; q.w = r3(nw); q.h = r3(nh); M.setPropAt(q, "x", r3(cx - nw / 2), S.t - q.start, p.fps); M.setPropAt(q, "y", r3(cy - nh / 2), S.t - q.start, p.fps); if (q.type === "text" && (h.includes("n") || h.includes("s"))) q.hAuto = false; }, "resize");
    },
    end() { endLive("resize"); },
  };
}
function rotDrag(c0, x0, y0) {
  const c = M.clipAt(c0, S.t);
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return {
    move(ex, ey, ev) {
      let a = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI + 90;
      if (ev?.shiftKey) a = Math.round(a / 15) * 15;
      if (Math.abs(a) < 2) a = 0;
      live((p) => { const q = M.clipById(p, c.id); if (q) M.setPropAt(q, "rotation", r3(((a + 540) % 360) - 180), S.t - q.start, p.fps); }, "rotate");
    },
    end() { endLive("rotate"); },
  };
}
wrap.addEventListener("pointermove", (e) => { if (!drag) return; const [x, y] = pt(e); drag.move(x, y, e); });
wrap.addEventListener("pointerup", (e) => { if (!drag) return; drag.end(); drag = null; try { wrap.releasePointerCapture(e.pointerId); } catch {} });
wrap.addEventListener("pointercancel", () => { if (drag) { drag.end(); drag = null; } });

/* ---------------------------------------------------------------- in-place text editing */
let editing = null;
function onDblClick(e) {
  if (override) return;
  const [x, y] = pt(e); const c = topHit(x, y);
  if (c && c.type === "group") { if (S.mode !== "review") actionsRef.openGroup(c.id); return; }
  if (!c || c.type !== "text") return;
  openEditor(c);
}
export function openEditor(c0) {
  const c = M.clipAt(c0, S.t);
  editing = c.id; select(c.id);
  const f = c.italic ? "italic " : "";
  Object.assign(editor.style, { left: c.x + "px", top: c.y + "px", width: c.w + "px", minHeight: c.h + "px", font: `${f}${c.weight} ${c.size}px/${c.lineHeight} "${c.font}",sans-serif`, color: c.fill, textAlign: c.align, letterSpacing: `${c.letterSpacing}em`, textTransform: c.uppercase ? "uppercase" : "none", transform: `rotate(${c.rotation || 0}deg) scale(${c.scale || 1})`, transformOrigin: "50% 50%" });
  editor.hidden = false; editor.textContent = c.text || "";
  editor.focus();
  const range = document.createRange(); range.selectNodeContents(editor); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
  draw();
}
function closeEditor(commitText) {
  if (!editing) return;
  const id = editing; editing = null;
  const text = editor.innerText.replace(/\r/g, "").replace(/\n$/, "");
  editor.hidden = true;
  if (commitText) commit("edit text", (p) => { const q = M.clipById(p, id); if (q && q.text !== text) q.text = text; });
  draw();
}
