// Effect Controls (the Premiere panel): every property of the selected clip in twirl-down
// sections whose open state is remembered, Motion first; the sequence settings when nothing
// is selected. Number and text fields commit on change; sliders and colours update live and
// commit on release. Keyframed properties show the value at the playhead and edits there
// write a key. Caption clips get the word editor, the facecam block gets its scene table.
import { S, M, bus, commit, beginLive, live, endLive, select, selected, primary, setTime, fps } from "/ui/state.js";
import { $, el, fmtClock, r3, clamp, typeColor } from "/ui/util.js";
import { ENTER_TYPES, EASES, SHADOWS, CAPTION_SYS } from "/lib/compile.mjs";

const root = $("#inspector");
/* the scope a clip lives in: the project, or its group */
const SP = (p, c) => { const g = M.groupOf(p, c.id); return g ? M.scopeOf(p, g.id) : M.rootOf(p); };
let actionsRef = null, lastKey = "";
const LIT_PRESETS = [["#2B59FF", "blue (the window accent)"], ["#FFD400", "yellow (dark ground)"], ["#D97757", "coral"], ["#8B1FA8", "purple (light ground)"], ["#FFB020", "amber"], ["#14A800", "green"]];

export function initInspector(actions) {
  actionsRef = actions;
  bus.on("selection", () => render(true));
  bus.on("project", (o) => { if (o?.reason === "inspector-live") return; render(o?.reason !== "inspector"); });
  bus.on("time", () => { refreshKeyed(); refreshWordNow(); });
  render(true);
}

/* ---------------------------------------------------------------- sections + fields */
/* a twirl-down section, like Premiere's Effect Controls; its open state is remembered per title */
const DEFAULT_OPEN = new Set(["text", "caption", "shape", "chapter card", "cta lockup", "facecam window", "sequence"]);
function sec(title, ...kids) {
  const key = title.toLowerCase().replace(/\s*\(.*$/, "").trim();
  const saved = localStorage.getItem("ravyn.sec." + key);
  const open = saved != null ? saved === "1" : DEFAULT_OPEN.has(key);
  const d = el("details", { class: "sec", open });
  d.append(el("summary", { text: title }), el("div", { class: "sbody" }, ...kids.filter(Boolean)));
  d.addEventListener("toggle", () => localStorage.setItem("ravyn.sec." + key, d.open ? "1" : "0"));
  return d;
}
function row(label, ...inputs) { return el("div", { class: "f" }, el("label", {}, label), el("div", { class: "in" }, ...inputs.filter(Boolean))); }
const kl = (c, prop, text) => el("span", {}, kfBtn(c, prop), text);
function patch(ids, fn, label = "inspector") { commit(label, (p) => { for (const id of ids) { const c = M.clipById(p, id); if (c) fn(c, p); } }); }
function num(c, key, { min, max, step = 1, live: isLive = false, get, set, ids, kprop } = {}) {
  const val = get ? get(c) : c[key];
  const inp = el("input", { type: "number", value: val == null ? "" : Math.round(val * 1000) / 1000, min, max, step });
  if (kprop) inp.dataset.kprop = kprop;
  const apply = (commitIt) => { const v = parseFloat(inp.value); if (!Number.isFinite(v)) return; const fn = (q, p) => (set ? set(q, v, p) : (q[key] = v)); if (commitIt) patch(ids || [c.id], fn); else live((p) => { for (const id of ids || [c.id]) { const q = M.clipById(p, id); if (q) fn(q, p); } }, "inspector-live"); };
  inp.onchange = () => apply(true);
  if (isLive) inp.oninput = () => apply(false);
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); if (e.key === "ArrowUp" || e.key === "ArrowDown") setTimeout(() => apply(true), 0); };
  return inp;
}
function txt(c, key, { area = false, ids } = {}) {
  const inp = area ? el("textarea", { value: c[key] ?? "" }) : el("input", { type: "text", value: c[key] ?? "" });
  inp.onchange = () => patch(ids || [c.id], (q) => (q[key] = inp.value));
  if (area) inp.oninput = () => live((p) => { for (const id of ids || [c.id]) { const q = M.clipById(p, id); if (q) q[key] = inp.value; } }, "inspector-live");
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && !area) inp.blur(); };
  return inp;
}
function sel(c, key, options, { get, set, ids } = {}) {
  const cur = get ? get(c) : c[key];
  const s = el("select", {}, ...options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return el("option", { value: v, text: l, selected: String(v) === String(cur) }); }));
  s.onchange = () => patch(ids || [c.id], (q, p) => (set ? set(q, s.value, p) : (q[key] = s.value)));
  s.onkeydown = (e) => e.stopPropagation();
  return s;
}
function chk(c, key, { get, set, ids, label } = {}) {
  const i = el("input", { type: "checkbox", checked: get ? get(c) : !!c[key] });
  i.onchange = () => patch(ids || [c.id], (q) => (set ? set(q, i.checked) : (q[key] = i.checked)));
  return label ? el("label", {}, i, " " + label) : i;
}
function color(c, key, { get, set, ids } = {}) {
  const cur = (get ? get(c) : c[key]) || "#ffffff";
  const i = el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : "#ffffff" });
  const t = el("input", { type: "text", value: cur, style: { width: "84px" } });
  const applyLive = (v) => live((p) => { for (const id of ids || [c.id]) { const q = M.clipById(p, id); if (q) (set ? set(q, v) : (q[key] = v)); } }, "inspector-live");
  i.oninput = () => { t.value = i.value; applyLive(i.value); };
  i.onchange = () => patch(ids || [c.id], (q) => (set ? set(q, i.value) : (q[key] = i.value)));
  t.onchange = () => patch(ids || [c.id], (q) => (set ? set(q, t.value) : (q[key] = t.value)));
  t.onkeydown = (e) => e.stopPropagation();
  return el("span", { class: "in" }, i, t);
}
function range(c, key, { min = 0, max = 1, step = 0.01, ids, kprop } = {}) {
  const cur = kprop ? M.clipAt(c, S.t)[key] : c[key];
  const r = el("input", { type: "range", min, max, step, value: cur ?? 1 });
  if (kprop) r.dataset.kprop = kprop;
  const n = num(c, key, { min, max, step, ids, kprop, get: kprop ? (q) => M.clipAt(q, S.t)[key] : undefined, set: kprop ? (q, v, p) => M.setPropAt(q, key, v, S.t - q.start, p.fps) : undefined });
  r.onpointerdown = () => beginLive();
  r.oninput = () => { n.value = r.value; live((p) => { for (const id of ids || [c.id]) { const q = M.clipById(p, id); if (q) { if (kprop) M.setPropAt(q, key, +r.value, S.t - q.start, p.fps); else q[key] = +r.value; } } }, "inspector-live"); };
  r.onchange = () => endLive("inspector");
  return el("span", { class: "in" }, r, n);
}
function btn(label, fn, title) { return el("button", { text: label, onclick: fn, title }); }
/* the keyframe diamond next to a Motion value */
function kfBtn(c, prop) {
  const rel = S.t - c.start, inside = rel >= -1e-6 && rel <= c.duration + 1e-6;
  const has = M.hasKeys(c, prop);
  const here = has && c.keyframes[prop].some((k) => Math.abs(k.t - rel) < 0.5 / fps());
  const b = el("button", { class: `kfbtn${here ? " here" : has ? " some" : ""}`, html: here ? "&#9670;" : "&#9671;", title: here ? "remove the key at the playhead" : "add a key at the playhead for " + prop });
  b.onclick = () => {
    if (!inside) { bus.emit("toast", { text: "move the playhead inside the clip first", bad: true }); return; }
    patch([c.id], (q, p) => { if (here) M.removeKey(q, prop, rel, p.fps); else M.upsertKey(q, prop, rel, M.clipAt(q, S.t)[prop], p.fps); }, here ? "remove key" : "add key");
  };
  return b;
}
function kfield(c, prop, opts = {}) {
  return num(c, prop, { ...opts, kprop: prop, get: (q) => M.clipAt(q, S.t)[prop], set: (q, v, p) => M.setPropAt(q, prop, v, S.t - q.start, p.fps) });
}
/* keyframed fields follow the playhead without a full re-render */
function refreshKeyed() {
  const c = primary(); if (!c || S.sel.size !== 1) return;
  const eff = M.clipAt(c, S.t);
  for (const inp of root.querySelectorAll("[data-kprop]")) { if (document.activeElement === inp) continue; const v = eff[inp.dataset.kprop]; if (v != null) inp.value = Math.round(v * 1000) / 1000; }
}
function refreshWordNow() {
  const rows = root.querySelectorAll(".wordrows .w"); if (!rows.length) return;
  for (const r of rows) { const a = +r.dataset.s, b = +r.dataset.e; r.classList.toggle("now", S.t >= a && S.t < b); }
}

/* ---------------------------------------------------------------- render */
function render(force) {
  const p = S.project; const list = selected(); const c = list[0];
  const key = p ? `${p.id}|${[...S.sel].join(",")}` : "";
  if (!force && key === lastKey && document.activeElement && root.contains(document.activeElement)) return;
  lastKey = key;
  const scrollTop = root.scrollTop;
  root.innerHTML = "";
  const head = (title, sub, color) => { $("#fxTitle").textContent = title; $("#fxSub").textContent = sub || ""; $("#fxDot").style.background = color || "#555"; };
  if (!p) { head("nothing open", "", "#555"); root.append(el("div", { class: "dim", style: { padding: "10px" }, text: "open or create a project" })); return; }
  if (!c) { renderProject(p); root.scrollTop = scrollTop; return; }
  const ids = list.map((q) => q.id);
  if (list.length > 1) {
    head(`${list.length} clips`, "", "#555");
    root.append(sec("Motion", row("Opacity", range(c, "opacity", { ids })), row("Scale", num(c, "scale", { step: 0.01, ids }))));
    root.append(el("div", { class: "btns", style: { padding: "8px" } }, btn("Bring forward", () => actionsRef.trackMove(1)), btn("Send back", () => actionsRef.trackMove(-1)), btn("Delete", actionsRef.del)));
    return;
  }
  const isVis = M.isVisual(c), isMed = M.isMedia(c);
  const tr = M.trackById(p, c.track);
  head(c.name || c.type, `${tr?.name || ""} · ${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s`, typeColor(c.type));
  const parts = [];
  if (c.type === "group") {
    root.append(el("div", { class: "ess" },
      row("Holds", el("span", {}, `${c.clips.length} clips on ${c.tracks.length} tracks`)),
      row("Time", el("span", {}, `${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s`, el("span", { class: "dim", text: ` (${c.duration.toFixed(2)}s)` }))),
      row("Inside", el("span", { class: "dim", text: [...new Set(c.clips.map((k) => k.type))].join(", ") })),
    ));
    root.append(el("div", { class: "btns", style: { padding: "8px" } },
      btn("Open group", () => actionsRef.openGroup(c.id), "the timeline shows only what is inside (double-click the block does the same)"),
      btn("Ungroup", actionsRef.ungroup, "put the clips back on the main timeline exactly where they are (Ctrl+Shift+G)"),
      btn("Duplicate", actionsRef.duplicate), btn("Delete", actionsRef.del), btn("Go to start", () => { actionsRef.pause(); setTime(c.start); }),
    ));
    root.append(sec("Clip",
      row("Name", txt(c, "name")),
      row("Track", sel(c, "track", M.tracksOf(p, "video").map((t) => [t.id, t.name]), { set: (q, v, p) => { M.moveClip(p, q.id, { track: v }, "reject") || bus.emit("toast", { text: "that track is occupied there", bad: true }); } })),
      row("Start", num(c, "start", { step: 1 / fps(), set: (q, v, p) => M.moveClip(p, q.id, { start: v }, "overwrite") })),
      row("Label", el("span", { class: "in" }, ...["", "#ff5f5f", "#ffb020", "#7fd48a", "#7cc4ff", "#c08cff"].map((col) => el("button", { style: { background: col || "transparent", width: "20px", height: "18px", padding: 0, border: c.label === (col || null) ? "2px solid #fff" : "1px solid #444" }, title: col || "none", onclick: () => patch([c.id], (q) => (q.label = col || null)) })))),
      row("", chk(c, "locked", { label: "locked" })),
    ));
    root.append(el("div", { class: "dim", style: { padding: "8px 10px" }, text: "A group keeps its clips in real reel time. Moving, trimming, splitting or deleting the block does the same to everything inside." }));
    root.scrollTop = scrollTop;
    return;
  }
  if (isVis && c.type !== "facecam") {
    root.append(el("div", { class: "ess" },
      row(kl(c, "x", "Position"), kfield(c, "x", { live: true }), kfBtn(c, "y"), kfield(c, "y", { live: true })),
      row("Size", num(c, "w", { min: 1, live: true }), num(c, "h", { min: 1, live: true, set: (q, v) => { q.h = v; if (q.type === "text") q.hAuto = false; } })),
      row(kl(c, "scale", "Scale · rot"), kfield(c, "scale", { step: 0.01, min: 0.01, live: true }), kfBtn(c, "rotation"), kfield(c, "rotation", { step: 1, live: true })),
      row(kl(c, "opacity", "Opacity"), range(c, "opacity", { kprop: "opacity" })),
      row("Time", el("span", {}, `${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s`, el("span", { class: "dim", text: ` (${c.duration.toFixed(2)}s)` }))),
      row("Enter · exit", sel(c, null, ENTER_TYPES, { get: (q) => q.enter?.type || "none", set: (q, v) => (q.enter = { ...(q.enter || {}), type: v }) }), sel(c, null, ENTER_TYPES, { get: (q) => q.exit?.type || "none", set: (q, v) => (q.exit = { ...(q.exit || {}), type: v }) })),
    ));
    parts.push(sec("Fit and align",
      (c.type === "video" || c.type === "image") ? row("Fit", sel(c, "fit", ["cover", "contain", "fill"])) : null,
      (c.type !== "text" && c.type !== "caption") ? row("Corner", num(c, "radius", { min: 0 })) : null,
      row("", el("span", { class: "btns" },
        btn("centre H", () => patch([c.id], (q) => (q.x = r3(p.width / 2 - q.w / 2)))),
        btn("centre V", () => patch([c.id], (q) => (q.y = r3(p.height / 2 - q.h / 2)))),
        btn("fill frame", () => patch([c.id], (q) => { q.x = 0; q.y = 0; q.w = p.width; q.h = p.height; q.scale = 1; q.rotation = 0; if (q.type === "text") q.hAuto = false; })),
        btn("reset", () => patch([c.id], (q) => { q.scale = 1; q.rotation = 0; q.opacity = 1; })),
      )),
    ));
  }
  if (c.type === "facecam") parts.push(facecamSection(c, p));
  if (c.type === "chapter") {
    parts.push(sec("Chapter card",
      row("Eyebrow", txt(c, "eyebrow")), row("Name", txt(c, "name")),
      row("Icon", txt(c, "icon"), el("span", { class: "dim", text: "assets/rNN/logo.png" })),
      row("Accent", color(c, "accent")), row("Ground", color(c, "ground"), color(c, "ground2")),
      row("", chk(c, "hold", { label: "slow hold drift" })),
      el("div", { class: "dim", text: "the card name should not repeat the caption: carry the rank or the number, not the spoken words" }),
    ));
  }
  if (c.type === "cta") {
    parts.push(sec("CTA lockup",
      row("Line 1", txt(c, "line1")), row("Keyword", txt(c, "keyword")),
      row("Brand", color(c, "brand"), el("span", { class: "in" }, ...LIT_PRESETS.map(([hex, name]) => el("span", { class: "swatch", style: { background: hex }, title: name, onclick: () => patch([c.id], (q) => (q.brand = hex)) })))),
      row("", chk(c, "pulse", { label: "one slow glow pulse" })),
      el("div", { class: "dim", text: "two lines over your full-frame face, off your face. The per-scene caption builder skips this window." }),
    ));
  }
  if (c.type === "text") {
    const fam = S.fonts.find((f) => f.family === c.font);
    parts.push(sec("Text",
      row("Text", txt(c, "text", { area: true })),
      row("Font", sel(c, "font", S.fonts.map((f) => [f.family, f.family]), { set: (q, v) => { q.font = v; const f2 = S.fonts.find((x) => x.family === v); if (f2 && !f2.faces.some((x) => x.weight === q.weight)) q.weight = f2.faces[0].weight; } })),
      row("Weight", sel(c, "weight", [...new Set((fam?.faces || []).map((f) => f.weight))].sort((a, b) => a - b).map(String), { set: (q, v) => (q.weight = +v) }), chk(c, "italic", { label: "italic" })),
      row("Size", num(c, "size", { min: 8, live: true }), el("span", { class: "dim", text: "px" })),
      row("Line height", num(c, "lineHeight", { step: 0.05, min: 0.6, live: true })),
      row("Letter sp.", num(c, "letterSpacing", { step: 0.01, live: true }), el("span", { class: "dim", text: "em" })),
      row("Align", sel(c, "align", ["left", "center", "right"]), sel(c, "valign", ["top", "middle", "bottom"])),
      row("Colour", color(c, "fill")),
      row("Case", chk(c, "uppercase", { label: "UPPERCASE" }), chk(c, "hAuto", { label: "auto height" })),
      row("Shadow", sel(c, "shadow", Object.keys(SHADOWS))),
      row("Pill", chk(c, null, { label: "background pill", get: (q) => !!q.pill, set: (q, v) => (q.pill = v ? { color: "rgba(10,10,10,.6)", radius: 18, padX: 22, padY: 10 } : null) })),
      c.pill ? row("Pill colour", color(c, null, { get: (q) => q.pill?.color || "#0a0a0a", set: (q, v) => { q.pill = { ...(q.pill || {}), color: v }; } })) : null,
      c.pill ? row("Pill pad", num(c, null, { get: (q) => q.pill.padX, set: (q, v) => (q.pill.padX = v) }), num(c, null, { get: (q) => q.pill.padY, set: (q, v) => (q.pill.padY = v) }), num(c, null, { get: (q) => q.pill.radius, set: (q, v) => (q.pill.radius = v) })) : null,
    ));
  }
  if (c.type === "caption") parts.push(captionSection(c, p));
  if (c.type === "shape") {
    parts.push(sec("Shape",
      row("Shape", sel(c, "shape", ["rect", "ellipse"])),
      row("Fill", color(c, "fill")),
      row("Stroke", num(c, null, { min: 0, get: (q) => q.stroke?.width || 0, set: (q, v) => (q.stroke = v ? { color: q.stroke?.color || "#ffffff", width: v } : null) }), c.stroke ? color(c, null, { get: (q) => q.stroke?.color, set: (q, v) => (q.stroke = { ...(q.stroke || { width: 2 }), color: v }) }) : null),
    ));
  }
  if (isVis && c.type !== "facecam") {
    parts.push(sec("Animation (enter / exit)",
      row("Enter", sel(c, null, ENTER_TYPES, { get: (q) => q.enter?.type || "none", set: (q, v) => (q.enter = { ...(q.enter || {}), type: v }) }), num(c, null, { step: 0.05, min: 0.05, get: (q) => q.enter?.dur ?? 0.4, set: (q, v) => (q.enter = { ...(q.enter || {}), dur: v }) }), btn("preview", () => actionsRef.previewRange(c.start - 0.1, c.start + (c.enter?.dur ?? 0.4) + 0.5), "play the entrance")),
      row("Ease", sel(c, null, EASES, { get: (q) => q.enter?.ease || "power3.out", set: (q, v) => (q.enter = { ...(q.enter || {}), ease: v }) })),
      row("Exit", sel(c, null, ENTER_TYPES, { get: (q) => q.exit?.type || "none", set: (q, v) => (q.exit = { ...(q.exit || {}), type: v }) }), num(c, null, { step: 0.05, min: 0.05, get: (q) => q.exit?.dur ?? 0.3, set: (q, v) => (q.exit = { ...(q.exit || {}), dur: v }) }), btn("preview", () => actionsRef.previewRange(M.clipEnd(c) - (c.exit?.dur ?? 0.3) - 0.5, M.clipEnd(c) + 0.1), "play the exit")),
      row("Ease", sel(c, null, EASES, { get: (q) => q.exit?.ease || "power2.in", set: (q, v) => (q.exit = { ...(q.exit || {}), ease: v }) })),
      p.words?.length ? row("", el("span", { class: "btns" }, btn("start on the nearest word", () => actionsRef.snapClipToWord(c.id), "move the clip so it starts on the VO word nearest its start"), btn("end on the nearest word end", () => actionsRef.snapClipEndToWord(c.id)))) : null,
    ));
    parts.push(sec("Effects",
      row("Blur", num(c, null, { min: 0, step: 0.5, live: true, get: (q) => q.effects?.blur || 0, set: (q, v) => (q.effects = { ...(q.effects || {}), blur: v }) })),
      row("Brightness", num(c, null, { min: 0, step: 0.05, live: true, get: (q) => q.effects?.brightness ?? 1, set: (q, v) => (q.effects = { ...(q.effects || {}), brightness: v }) })),
      row("Contrast", num(c, null, { min: 0, step: 0.05, live: true, get: (q) => q.effects?.contrast ?? 1, set: (q, v) => (q.effects = { ...(q.effects || {}), contrast: v }) })),
      row("Saturate", num(c, null, { min: 0, step: 0.05, live: true, get: (q) => q.effects?.saturate ?? 1, set: (q, v) => (q.effects = { ...(q.effects || {}), saturate: v }) })),
      row("Grayscale", num(c, null, { min: 0, max: 1, step: 0.05, live: true, get: (q) => q.effects?.grayscale || 0, set: (q, v) => (q.effects = { ...(q.effects || {}), grayscale: v }) })),
      row("", el("span", { class: "btns" }, btn("add a tint layer over this", () => actionsRef.addTint(c.id), "a colour at 35% on the track above, same timing"), btn("clear effects", () => patch([c.id], (q) => (q.effects = {}))))),
    ));
    parts.push(keyframesSection(c, p));
  }
  if (isMed) {
    parts.push(sec("Media",
      row("File", el("span", { class: "dim", text: c.src, style: { wordBreak: "break-all" } })),
      row("In point", num(c, "mediaStart", { step: 1 / fps(), min: 0, set: (q, v, p) => { q.mediaStart = 0; M.slipClip(p, q.id, v); } })),
      row("Length", el("span", { class: "dim", text: c.mediaDuration != null ? `${c.mediaDuration}s${c.mediaWidth ? ` · ${c.mediaWidth}x${c.mediaHeight}` : ""}` : "unknown" })),
      c.type === "video" ? row("Audio", chk(c, "audio", { label: "use this clip's own sound" })) : null,
      row("Volume", range(c, "volume", { min: 0, max: 2, step: 0.01 })),
      c.type === "audio" ? row("Fade in / out", num(c, "fadeIn", { step: 0.05, min: 0 }), num(c, "fadeOut", { step: 0.05, min: 0 })) : null,
      c.type === "video" ? row("Proxy", el("span", { class: "dim", text: S.proxies[c.src] ? "ready" : "none (Make proxies in the Project tab)" })) : null,
    ));
  }
  parts.push(sec("Clip",
    row("Name", txt(c, "name")),
    row("Track", sel(c, "track", M.tracksOf(SP(p, c), tr.kind).map((t) => [t.id, t.name]), { set: (q, v, p) => { M.moveClip(SP(p, q), q.id, { track: v }, "reject") || bus.emit("toast", { text: "that track is occupied there", bad: true }); } })),
    row("Start", num(c, "start", { step: 1 / fps(), set: (q, v, p) => M.moveClip(SP(p, q), q.id, { start: v }, "overwrite") })),
    row("Duration", num(c, "duration", { step: 1 / fps(), min: 1 / fps(), set: (q, v, p) => M.trimClip(SP(p, q), q.id, { end: q.start + v }) })),
    row("End", num(c, null, { step: 1 / fps(), get: (q) => M.clipEnd(q), set: (q, v, p) => M.trimClip(SP(p, q), q.id, { end: v }) })),
    row("Label", el("span", { class: "in" }, ...["", "#ff5f5f", "#ffb020", "#7fd48a", "#7cc4ff", "#c08cff"].map((col) => el("button", { style: { background: col || "transparent", width: "20px", height: "18px", padding: 0, border: c.label === (col || null) ? "2px solid #fff" : "1px solid #444" }, title: col || "none", onclick: () => patch([c.id], (q) => (q.label = col || null)) })))),
    row("", chk(c, "locked", { label: "locked" })),
  ));
  for (const part of parts) root.append(part);
  root.append(el("div", { class: "btns", style: { padding: "8px" } },
    btn("Bring forward", () => actionsRef.trackMove(1)), btn("Send back", () => actionsRef.trackMove(-1)),
    btn("Split here", actionsRef.splitAtPlayhead), btn("Duplicate", actionsRef.duplicate), btn("Delete", actionsRef.del),
    btn("Go to start", () => { actionsRef.pause(); setTime(c.start); }),
  ));
  root.scrollTop = scrollTop;
}

/* ---------------------------------------------------------------- keyframes */
function keyframesSection(c, p) {
  const props = M.KF_PROPS.filter((k) => M.hasKeys(c, k));
  const presets = el("div", { class: "presetrow" },
    btn("push in 8%", () => preset(c, "pushIn"), "scale 1 to 1.08 across the clip, so nothing sits still"),
    btn("push out", () => preset(c, "pushOut"), "scale 1.08 to 1 across the clip"),
    btn("drift up 40", () => preset(c, "driftUp"), "y drifts 40px up across the clip"),
    btn("Ken Burns", () => preset(c, "kenBurns"), "push in 12% while drifting up 60px"),
    btn("breathe", () => preset(c, "breathe"), "scale 1 to 1.03 and back, twice"),
  );
  const kids = [presets];
  for (const prop of props) {
    const grid = el("div", { class: "kfrows" }, el("span", { class: "h", text: prop }), el("span", { class: "h", text: "time" }), el("span", { class: "h", text: "value" }), el("span", { class: "h", text: "ease into it" }), el("span"));
    for (const k of c.keyframes[prop]) {
      const tIn = el("input", { type: "number", step: 1 / fps(), value: Math.round((c.start + k.t) * 1000) / 1000, style: { width: "60px" } });
      tIn.onchange = () => patch([c.id], (q, p2) => { const list = q.keyframes[prop]; const kk = list.find((x) => Math.abs(x.t - k.t) < 1e-6); if (kk) { kk.t = M.quant(clamp(+tIn.value - q.start, 0, q.duration), p2.fps); list.sort((a, b) => a.t - b.t); } });
      const vIn = el("input", { type: "number", step: prop === "scale" || prop === "opacity" ? 0.01 : 1, value: Math.round(k.v * 1000) / 1000, style: { width: "64px" } });
      vIn.onchange = () => patch([c.id], (q) => { const kk = q.keyframes[prop].find((x) => Math.abs(x.t - k.t) < 1e-6); if (kk) kk.v = +vIn.value; });
      const eIn = el("select", {}, ...EASES.map((e) => el("option", { value: e, text: e, selected: (k.ease || "power2.inOut") === e })));
      eIn.onchange = () => patch([c.id], (q) => { const kk = q.keyframes[prop].find((x) => Math.abs(x.t - k.t) < 1e-6); if (kk) kk.ease = eIn.value; });
      for (const i of [tIn, vIn, eIn]) i.onkeydown = (e) => e.stopPropagation();
      grid.append(el("button", { class: "kfbtn some", html: "&#9670;", title: "go to this key", onclick: () => { actionsRef.pause(); setTime(c.start + k.t); S.selKey = { id: c.id, prop, t: k.t }; bus.emit("selection"); } }), tIn, vIn, eIn, el("button", { class: "kfbtn", text: "x", title: "delete key", onclick: () => patch([c.id], (q, p2) => M.removeKey(q, prop, k.t, p2.fps), "delete key") }));
    }
    kids.push(grid, el("div", { class: "btns" }, btn(`bake ${prop}`, () => patch([c.id], (q) => M.bakeKeys(q, prop, S.t - q.start)), "keep the value at the playhead, drop the keys"), btn(`clear ${prop}`, () => patch([c.id], (q) => M.clearKeys(q, prop)))));
  }
  if (!props.length) kids.push(el("div", { class: "dim", text: "no keys yet: press a diamond next to a Motion value, or a preset above" }));
  return sec("Keyframes", ...kids);
}
function preset(c, name) {
  patch([c.id], (q, p) => {
    const d = q.duration, f = p.fps;
    const set = (prop, pairs) => { M.clearKeys(q, prop); for (const [t, v, ease] of pairs) M.upsertKey(q, prop, t, v, f, ease || "none"); };
    const s0 = q.scale || 1, y0 = q.y;
    if (name === "pushIn") set("scale", [[0, s0], [d, s0 * 1.08]]);
    if (name === "pushOut") set("scale", [[0, s0 * 1.08], [d, s0]]);
    if (name === "driftUp") set("y", [[0, y0], [d, y0 - 40]]);
    if (name === "kenBurns") { set("scale", [[0, s0], [d, s0 * 1.12]]); set("y", [[0, y0], [d, y0 - 60]]); }
    if (name === "breathe") set("scale", [[0, s0, "sine.inOut"], [d / 4, s0 * 1.03, "sine.inOut"], [d / 2, s0, "sine.inOut"], [(3 * d) / 4, s0 * 1.03, "sine.inOut"], [d, s0, "sine.inOut"]]);
  }, "preset " + name);
}

/* ---------------------------------------------------------------- captions */
function captionSection(c, p) {
  const words = c.words || [];
  const grid = el("div", { class: "wordrows" });
  words.forEach((w, i) => {
    const tIn = el("input", { type: "text", value: w.text });
    tIn.onchange = () => patch([c.id], (q, p2) => { const ww = q.words[i]; if (!ww) return; ww.srcStart = ww.srcStart ?? ww.start; ww.text = tIn.value; M.syncWord(p2, ww); q.name = q.words.map((x) => x.text).join(" "); });
    const sIn = el("input", { type: "number", step: 0.01, value: w.start });
    sIn.onchange = () => patch([c.id], (q, p2) => { const ww = q.words[i]; if (!ww) return; ww.srcStart = ww.srcStart ?? ww.start; ww.start = r3(+sIn.value); M.syncWord(p2, ww); });
    const eIn = el("input", { type: "number", step: 0.01, value: w.end });
    eIn.onchange = () => patch([c.id], (q, p2) => { const ww = q.words[i]; if (!ww) return; ww.srcStart = ww.srcStart ?? ww.start; ww.end = r3(+eIn.value); M.syncWord(p2, ww); });
    for (const x of [tIn, sIn, eIn]) x.onkeydown = (e) => e.stopPropagation();
    const rowWrap = el("div", { class: "w", style: { display: "contents" } });
    rowWrap.dataset.s = w.start; rowWrap.dataset.e = w.end;
    rowWrap.append(tIn, sIn, eIn,
      el("button", { class: "wb", text: "split after", title: "the words after this one become a new cue", onclick: () => { let made; commit("split cue", (p2) => { made = M.splitCaptionAfter(SP(p2, c), c.id, i); }); if (made) select(made.id); }, disabled: i >= words.length - 1 }),
      el("button", { class: "wb", text: "go", title: "playhead to this word", onclick: () => { actionsRef.pause(); setTime(w.start); } }));
    grid.append(rowWrap);
  });
  const strip = el("canvas", { class: "retime", title: "drag a boundary between two words to retime them" });
  requestAnimationFrame(() => drawStrip(strip, c));
  strip.onpointerdown = (e) => stripDrag(e, strip, c);
  return sec("Caption",
    row("Cue", el("span", { class: "dim", text: `${c.start.toFixed(2)}s to ${M.clipEnd(c).toFixed(2)}s · ${words.length} words` })),
    grid,
    strip,
    row("", el("span", { class: "btns" }, btn("merge with next", () => commit("merge cues", (p2) => { M.mergeCaptionNext(SP(p2, c), c.id) || bus.emit("toast", { text: "no cue follows this one on its track", bad: true }); })), btn("re-fit end to last word", () => patch([c.id], (q, p2) => { const last = q.words[q.words.length - 1]; if (last) M.trimClip(p2, q.id, { end: last.end + 0.15 }); })))),
    row("System", sel(c, "sys", Object.keys(CAPTION_SYS).map((k) => [k, `${k} (${CAPTION_SYS[k].font}${CAPTION_SYS[k].uppercase ? ", caps" : ""})`]))),
    row("Position", el("span", { class: "btns" }, btn("seam (870)", () => patch([c.id], (q) => (q.y = 870)), "on the top edge of the stack window"), btn("under the chin (1390)", () => patch([c.id], (q) => (q.y = 1390)), "below the chin on a full-frame face"), btn("low (1330)", () => patch([c.id], (q) => (q.y = 1330)), "beside the bubble, or on the ground"))),
    row("Size", num(c, "size", { min: 8, live: true })),
    row("Colour", color(c, "fill")),
    row("Lit word", color(c, "lit"), el("span", { class: "in" }, ...LIT_PRESETS.map(([hex, name]) => el("span", { class: "swatch", style: { background: hex }, title: name, onclick: () => patch([c.id], (q) => (q.lit = hex)) })))),
    row("Shadow", sel(c, "shadow", Object.keys(SHADOWS))),
    row("", el("span", { class: "btns" }, btn("apply this style to every cue", () => patch(M.allClips(p).filter((q) => q.type === "caption").map((q) => q.id), (q) => { Object.assign(q, { sys: c.sys, size: c.size, fill: c.fill, lit: c.lit, shadow: c.shadow, y: c.y, x: c.x, w: c.w }); }, "restyle cues")))),
  );
}
function drawStrip(cv, c) {
  const w = cv.clientWidth || 280, h = 44; cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); g.clearRect(0, 0, w, h);
  const a = c.start, b = M.clipEnd(c), span = Math.max(0.01, b - a);
  const X = (t) => ((t - a) / span) * w;
  (c.words || []).forEach((wd, i) => {
    const x0 = X(wd.start), x1 = X(wd.end);
    g.fillStyle = i % 2 ? "#3a3f4a" : "#2c3039"; g.fillRect(x0, 4, Math.max(1, x1 - x0), h - 8);
    g.fillStyle = "#e8e9ec"; g.font = "11px Segoe UI, sans-serif"; g.textBaseline = "middle";
    const label = wd.text; const tw = g.measureText(label).width;
    if (tw < x1 - x0 - 4) g.fillText(label, x0 + 3, h / 2); else g.fillText(label.slice(0, Math.max(1, Math.floor((x1 - x0) / 7))), x0 + 2, h / 2);
    if (i) { g.fillStyle = "#e8c547"; g.fillRect(x0 - 1, 0, 2, h); }
  });
  const px = X(S.t); if (px >= 0 && px <= w) { g.fillStyle = "#D97757"; g.fillRect(px, 0, 2, h); }
}
function stripDrag(e, cv, c) {
  const w = cv.clientWidth, a = c.start, span = Math.max(0.01, M.clipEnd(c) - a);
  const tAt = (clientX) => a + ((clientX - cv.getBoundingClientRect().left) / w) * span;
  const t = tAt(e.clientX);
  let idx = -1, best = 0.08;
  (c.words || []).forEach((wd, i) => { if (i && Math.abs(wd.start - t) < best) { best = Math.abs(wd.start - t); idx = i - 1; } });
  if (idx < 0) { actionsRef.pause(); setTime(t); return; }
  e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch {}
  beginLive();
  cv.onpointermove = (ev) => { live((p) => { M.setWordBoundary(p, c.id, idx, tAt(ev.clientX)); }, "retime"); drawStrip(cv, M.clipById(S.project, c.id)); };
  cv.onpointerup = () => { cv.onpointermove = cv.onpointerup = null; endLive("retime word"); };
}

/* ---------------------------------------------------------------- the facecam block */
function facecamSection(c, p) {
  const spans = M.sceneSpans(p);
  const rows = el("div", { class: "kfrows", style: { gridTemplateColumns: "64px 70px 80px auto" } }, el("span", { class: "h", text: "cut at" }), el("span", { class: "h", text: "state" }), el("span", { class: "h", text: "captions" }), el("span"));
  (c.states || []).forEach((s, i) => {
    const tIn = el("input", { type: "number", step: 1 / fps(), value: s.t, style: { width: "64px" }, disabled: i === 0 });
    tIn.onchange = () => patch([c.id], (q, p2) => M.moveBoundary(p2, i, +tIn.value));
    const stSel = el("select", {}, ...M.STATES.map((x) => el("option", { value: x, text: x, selected: s.state === x })));
    stSel.onchange = () => patch([c.id], (q, p2) => M.setSpanState(p2, i, { state: stSel.value }));
    const sysSel = el("select", {}, ...[["", "auto"], ["capFace", "face (white)"], ["capSeam", "seam pill"], ["capSide", "beside the bubble"], ["capGround", "on the ground"]].map(([v, l]) => el("option", { value: v, text: l, selected: (s.sys || "") === v })));
    sysSel.onchange = () => patch([c.id], (q, p2) => M.setSpanState(p2, i, { sys: sysSel.value || null }));
    for (const x of [tIn, stSel, sysSel]) x.onkeydown = (e) => e.stopPropagation();
    rows.append(tIn, stSel, sysSel, el("span", {}, el("button", { class: "kfbtn some", html: "&#9654;", title: "go", onclick: () => { actionsRef.pause(); setTime(s.t); } }), i ? el("button", { class: "kfbtn", text: "x", title: "remove this cut", onclick: () => patch([c.id], (q, p2) => M.removeBoundary(p2, i), "remove scene cut") }) : null));
  });
  const counts = { full: 0, stack: 0, bubble: 0, none: 0 }; for (const s of spans) counts[s.state]++;
  const sub = (k, key, d) => num(c, null, { get: (q) => q[k]?.[key] ?? d, set: (q, v) => (q[k] = { ...(q[k] || {}), [key]: v }) });
  return sec("Facecam window",
    row("Footage", el("span", { class: "dim", text: c.src, style: { wordBreak: "break-all" } })),
    row("Focus x / y", sub("focus", "x", 50), sub("focus", "y", 38), el("span", { class: "dim", text: "% of the video kept centred (your eyes)" })),
    row("Stack x / y", sub("stack", "x", 60), sub("stack", "y", 930)),
    row("Stack w / h", sub("stack", "w", 960), sub("stack", "h", 740), sub("stack", "r", 44), el("span", { class: "dim", text: "w / h / round" })),
    row("Bubble x / y", sub("bubble", "x", 60), sub("bubble", "y", 1250), sub("bubble", "size", 400), el("span", { class: "dim", text: "x / y / size" })),
    row("Bubble ring", (() => { const i = el("input", { type: "color", value: c.bubble?.ring || "#2B59FF" }); i.onchange = () => patch([c.id], (q) => (q.bubble = { ...(q.bubble || {}), ring: i.value })); return i; })()),
    row("Move time", num(c, "move", { step: 0.05 }), el("span", { class: "dim", text: "seconds the window takes to change shape" })),
    row("Scenes", el("span", { class: "dim", text: `${spans.length}: full ${counts.full} · stack ${counts.stack} · bubble ${counts.bubble} · none ${counts.none}` })),
    rows,
    el("div", { class: "btns" }, btn("+ cut at playhead", actionsRef.addBoundary, "snapped to your own cut or the silence"), btn("captions per scene", actionsRef.sceneCaptions), btn("sound on scene changes", actionsRef.soundOnScenes), btn("Board", actionsRef.board)),
    el("div", { class: "dim", text: "Each scene change moves the window: shrink into stack, collapse into the bubble, drop out (none), grow back (full). Use all three types; no type more than 4 scenes in a row." }),
  );
}

/* ---------------------------------------------------------------- sequence (nothing selected) */
function renderProject(p) {
  const set = (fn) => commit("project settings", fn);
  $("#fxTitle").textContent = p.title; $("#fxSub").textContent = "sequence"; $("#fxDot").style.background = "#555";
  root.append(sec("Sequence",
    row("Id", el("span", { class: "dim", text: p.id })),
    row("Title", (() => { const i = el("input", { type: "text", value: p.title }); i.onchange = () => set((q) => (q.title = i.value)); i.onkeydown = (e) => e.stopPropagation(); return i; })()),
    row("Assets", el("span", { class: "dim", text: p.reel != null ? `assets/r${String(p.reel).padStart(2, "0")}` : "none" })),
    row("Duration", (() => { const i = el("input", { type: "number", step: 0.1, min: 0.1, value: p.duration }); i.onchange = () => set((q) => (q.duration = M.quant(+i.value, q.fps))); return i; })(), el("span", { class: "dim", text: `= ${fmtClock(p.duration, p.fps)}` })),
    row("fps", (() => { const i = el("input", { type: "number", value: p.fps }); i.onchange = () => set((q) => (q.fps = +i.value || 30)); return i; })()),
    row("Size", el("span", { class: "dim", text: `${p.width} x ${p.height}` })),
    row("Background", (() => { const i = el("input", { type: "color", value: p.background }); const t = el("input", { type: "text", value: p.background, style: { width: "84px" } }); i.onchange = () => set((q) => (q.background = i.value)); t.onchange = () => set((q) => (q.background = t.value)); t.onkeydown = (e) => e.stopPropagation(); return el("span", { class: "in" }, i, t); })()),
    row("Watermark", (() => { const i = el("input", { type: "checkbox", checked: p.watermark?.on }); i.onchange = () => set((q) => (q.watermark.on = i.checked)); const t = el("input", { type: "text", value: p.watermark?.text || "", style: { width: "120px" } }); t.onchange = () => set((q) => (q.watermark.text = t.value)); t.onkeydown = (e) => e.stopPropagation(); return el("span", { class: "in" }, i, t); })()),
    row("Style", (() => { const s = el("select", {}, ...[["", "none (plain)"], ["window", "WINDOW (facecam)"]].map(([v, l]) => el("option", { value: v, text: l, selected: (p.style || "") === v }))); s.onchange = () => set((q) => (q.style = s.value || null)); return s; })()),
    row("Words", el("span", { class: "dim", text: p.words?.length ? `${p.words.length} words loaded` : "none" })),
    row("Markers", el("span", { class: "dim", text: `${(p.markers || []).length}` })),
  ));
  const sfx = {}; for (const c of M.allClips(p)) if (c.type === "audio") sfx[c.src] = (sfx[c.src] || 0) + 1;
  const over = Object.entries(sfx).filter(([, n]) => n > 8);
  root.append(sec("Tracks", ...p.tracks.map((t) => row(t.name, el("span", { class: "dim", text: `${t.kind} · ${M.clipsOnTrack(p, t.id).length} clips${t.locked ? " · locked" : ""}${t.hidden ? " · hidden" : ""}${t.muted ? " · muted" : ""}` })))));
  root.append(sec("Sound", row("Files", el("span", { class: "dim", text: `${Object.keys(sfx).length} distinct` })), over.length ? el("div", { class: "dim", style: { color: "#ffb3b3" }, text: `over the 8-use ceiling: ${over.map(([s, n]) => `${s.split("/").pop()} x${n}`).join(", ")}` }) : el("div", { class: "dim", text: "every sound is under the 8-use ceiling" })));
  root.append(el("div", { class: "dim", style: { padding: "8px" }, text: "select a clip on the timeline or in the Program monitor to edit it" }));
}
