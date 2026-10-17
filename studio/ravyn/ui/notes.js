// Review notes on the picture. N arms one note: click a spot or drag a box, type (or talk), Enter.
// Shift+N arms an ARROW note: drag from the thing to where it should go. The note keeps the frame,
// the spot in composition px and what is under it (lib/notes.mjs), and saves to
// projects/notes/<id>.json, outside the project and its undo. The same file holds your scene
// verdicts (G good / X bad) and whether you passed each of Claude's fixes.
// Pins show on the picture around their frame; every [data-notes-list] host lists the notes (the
// review panel and the Notes drawer), a click jumps to the frame and flashes the pin.
import { S, bus, api, setTime } from "/ui/state.js";
import { $, $$, el, clamp, fmtClock, contextMenu } from "/ui/util.js";
import * as N from "/lib/notes.mjs";

const SVGNS = "http://www.w3.org/2000/svg";
const wrap = $("#stageWrap"), viewport = $("#viewport"), pins = $("#notePins"), box = $("#noteBox"), modeTag = $("#noteModeTag");
const SHOW_WINDOW = 0.35;          // seconds either side of a note's frame that its pin shows
const MIN_DRAG = 24;               // composition px: a wobble is still a click
let actionsRef = null, doc = null, editing = null, drag = null, focusId = null, focusTimer = 0, saving = Promise.resolve();
let pickArrow = false;             // the note box asked "where should it go?": the next click answers
let rec = null;                    // the voice note being recorded

export const notes = {
  arm, disarm, load, save, goTo, next, open: (id) => { const n = find(id); if (n) { goTo(id); openBox(n, false); } },
  doc: () => doc, verdictFor: (scene) => N.verdictFor(doc, scene), setVerdict, fixesToCheck, passFix, rejectFix,
};

export function initNotes(actions) {
  actionsRef = actions;
  S.noteMode = null; S.notes = [];
  S.notesShowFixed = localStorage.getItem("ravyn.notesShowFixed") === "1";
  bus.on("project", (o) => { if (o?.reason === "load") load(); else draw(); });
  bus.on("time", draw);
  bus.on("notes-remote", (d) => { if (S.project && d?.id === S.project.id && !editing) load(); });
  bus.on("note-focus", (id) => goTo(id));
  window.addEventListener("resize", draw);
  new ResizeObserver(draw).observe(viewport);
  window.addEventListener("focus", () => { if (S.project && !editing) load(); });
  // in note mode the picture belongs to the note: capture before the stage's select / move
  wrap.addEventListener("pointerdown", onDown, true);
  wrap.addEventListener("pointermove", onMove, true);
  wrap.addEventListener("pointerup", onUp, true);
  wrap.addEventListener("dblclick", (e) => { if (S.noteMode || pickArrow) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  wrap.addEventListener("contextmenu", (e) => { if (S.noteMode) { e.stopImmediatePropagation(); e.preventDefault(); disarm(); } }, true);
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pickArrow) { e.preventDefault(); e.stopImmediatePropagation(); pickArrow = false; banner(null); return; }
    if (S.noteMode && !editing) { e.preventDefault(); e.stopImmediatePropagation(); disarm(); }
  }, true);
  $("#btnNote").onclick = () => (S.noteMode ? disarm() : arm());
  for (const f of $$("[data-notes-filter]")) {
    f.value = S.notesShowFixed ? "all" : "open";
    f.onchange = (e) => { S.notesShowFixed = e.target.value === "all"; localStorage.setItem("ravyn.notesShowFixed", S.notesShowFixed ? "1" : "0"); for (const g of $$("[data-notes-filter]")) g.value = e.target.value; render(); draw(); bus.emit("notes"); };
  }
  for (const b of $$("[data-notes-arm]")) b.onclick = () => arm(b.dataset.notesArm || "spot");
}

/* ---------------------------------------------------------------- the file */
const find = (id) => doc?.notes.find((x) => x.id === id) || null;
async function load() {
  if (!S.project) { doc = null; publish(); return; }
  const id = S.project.id;
  try { const d = await api(`/api/notes?id=${encodeURIComponent(id)}`); if (S.project?.id === id) { doc = N.normalizeNotes(d, id); publish(); } }
  catch (e) { bus.emit("toast", { text: `notes: ${e.message}`, bad: true }); }
}
function save() {
  if (!doc || !S.project) return;
  const id = S.project.id, body = { id, doc: JSON.parse(JSON.stringify(doc)) };
  saving = saving.then(() => api("/api/notes", body)).catch((e) => bus.emit("toast", { text: `notes not saved: ${e.message}`, bad: true }));
  publish();
}
function ensureDoc() { if (!doc) doc = N.emptyNotes(S.project.id); return doc; }
function publish() {
  S.notes = doc ? doc.notes : [];
  S.verdicts = doc ? doc.verdicts : [];
  const open = S.notes.filter((n) => n.status === "open").length;
  const badge = $("#notesBadge"); if (badge) { badge.textContent = open || ""; badge.hidden = !open; }
  bus.emit("notes");
  render(); draw();
}

/* ---------------------------------------------------------------- note mode */
function banner(text) { modeTag.hidden = !text; modeTag.textContent = text || ""; }
function arm(kind = "spot") {
  if (!S.project) return;
  actionsRef.pause();
  S.noteMode = kind === "arrow" ? "arrow" : "spot"; document.body.classList.add("notemode");
  banner(S.noteMode === "arrow" ? "ARROW NOTE · drag from the thing to where it should go · Esc to cancel" : "NOTE · click the spot, or drag a box around it · Esc to cancel");
  $("#btnNote").classList.add("on");
}
function disarm() {
  S.noteMode = null; drag = null; document.body.classList.remove("notemode"); banner(null);
  $("#btnNote").classList.remove("on"); draw();
}
const scaleK = () => wrap.getBoundingClientRect().width / (S.project?.width || 1080);
function pt(e) { const r = wrap.getBoundingClientRect(), k = scaleK(); return [clamp((e.clientX - r.left) / k, 0, S.project.width), clamp((e.clientY - r.top) / k, 0, S.project.height)]; }
function onDown(e) {
  if (!S.project || e.button !== 0) return;
  if (pickArrow && editing) {
    e.stopImmediatePropagation(); e.preventDefault();
    const [x, y] = pt(e); pickArrow = false; banner(null);
    editing = { ...N.withArrow(S.project, editing, { x, y }), isNew: editing.isNew };
    draw(); box.querySelector("textarea")?.focus(); refreshBoxHead();
    return;
  }
  if (!S.noteMode) return;
  e.stopImmediatePropagation(); e.preventDefault();
  try { wrap.setPointerCapture(e.pointerId); } catch {}
  const [x, y] = pt(e); drag = { x0: x, y0: y, x, y, kind: S.noteMode };
  draw();
}
function onMove(e) {
  if (!S.noteMode && !pickArrow) return;
  e.stopImmediatePropagation();
  if (!drag) return;
  [drag.x, drag.y] = pt(e); draw();
}
function onUp(e) {
  if (!S.noteMode || !drag) return;
  e.stopImmediatePropagation();
  try { wrap.releasePointerCapture(e.pointerId); } catch {}
  const d = drag; drag = null;
  const w = Math.abs(d.x - d.x0), h = Math.abs(d.y - d.y0), far = Math.hypot(w, h) > MIN_DRAG;
  let spot;
  if (d.kind === "arrow") spot = { x: d.x0, y: d.y0, w: 0, h: 0, to: far ? { x: d.x, y: d.y } : null };
  else spot = w > MIN_DRAG && h > MIN_DRAG ? { x: Math.min(d.x, d.x0), y: Math.min(d.y, d.y0), w, h } : { x: d.x0, y: d.y0, w: 0, h: 0 };
  disarm();
  const n = N.makeNote(S.project, ensureDoc(), { t: S.t, ...spot });
  openBox(n, true);
}

/* ---------------------------------------------------------------- the pins + arrows */
function isVisible(n) {
  if (n.id === focusId || n.id === editing?.id) return true;
  if (n.status === "fixed" && !S.notesShowFixed) return false;
  return Math.abs(S.t - n.t) <= SHOW_WINDOW;
}
const anchor = (n) => (n.w > 0 && n.h > 0 ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : { x: n.x, y: n.y });
function svgEl(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
function arrow(svg, from, to, u, cls) {
  const a = Math.atan2(to.y - from.y, to.x - from.x), L = 26 * u, W = 13 * u;
  const bx = to.x - Math.cos(a) * L, by = to.y - Math.sin(a) * L;
  svg.append(svgEl("line", { x1: from.x, y1: from.y, x2: bx, y2: by, class: `narrow ${cls}`, "stroke-width": 5 * u, "stroke-dasharray": `${14 * u} ${9 * u}` }));
  svg.append(svgEl("polygon", { class: `nhead ${cls}`, points: `${to.x},${to.y} ${bx - Math.sin(a) * W},${by + Math.cos(a) * W} ${bx + Math.sin(a) * W},${by - Math.cos(a) * W}` }));
  svg.append(svgEl("circle", { class: `ntarget ${cls}`, cx: to.x, cy: to.y, r: 30 * u, "stroke-width": 3 * u }));
}
function statusCls(n) { return n.status === "open" ? "open" : n.checked ? "fixed checked" : "fixed tocheck"; }
function draw() {
  pins.innerHTML = "";
  if (!S.project) return;
  const k = scaleK() || 0.3, u = 1 / k;               // u = one screen px in composition px
  const svg = svgEl("svg", { class: "narrows", viewBox: `0 0 ${S.project.width} ${S.project.height}`, width: S.project.width, height: S.project.height });
  pins.append(svg);
  const list = [...(doc?.notes || [])];
  if (editing) { const i = list.findIndex((n) => n.id === editing.id); if (i >= 0) list[i] = editing; else list.push(editing); }
  for (const n of list) {
    if (!isVisible(n)) continue;
    const exact = Math.abs(S.t - n.t) < 0.5 / (S.project.fps || 30), sc = statusCls(n);
    if (n.w > 0 && n.h > 0) pins.append(el("div", { class: `nbox ${sc}${n.id === focusId ? " focus" : ""}`, style: { left: n.x + "px", top: n.y + "px", width: n.w + "px", height: n.h + "px", borderWidth: 2 * u + "px" } }));
    if (n.to) arrow(svg, anchor(n), n.to, u, sc);
    const size = 26 * u;
    pins.append(el("div", {
      class: `npin ${sc}${n.id === focusId ? " focus" : ""}${exact ? " exact" : ""}`, title: `#${n.n} ${N.clock(n.t)} · ${n.text}`,
      style: { left: n.x - size / 2 + "px", top: n.y - size * 1.21 + "px", width: size + "px", height: size + "px", fontSize: 13 * u + "px", borderWidth: 2 * u + "px" },
      onpointerdown: (e) => { e.stopPropagation(); },
      onclick: (e) => { e.stopPropagation(); if (n.id !== editing?.id) openBox(find(n.id) || n, false); },
      oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); pinMenu(e, n); },
    }, el("span", { text: String(n.n) })));
  }
  if (drag) {
    if (drag.kind === "arrow") { if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > MIN_DRAG) arrow(svg, { x: drag.x0, y: drag.y0 }, { x: drag.x, y: drag.y }, u, "open draft"); }
    else {
      const x = Math.min(drag.x, drag.x0), y = Math.min(drag.y, drag.y0), w = Math.abs(drag.x - drag.x0), h = Math.abs(drag.y - drag.y0);
      if (w > MIN_DRAG && h > MIN_DRAG) pins.append(el("div", { class: "nbox draft", style: { left: x + "px", top: y + "px", width: w + "px", height: h + "px", borderWidth: 2 * u + "px" } }));
    }
  }
  if (editing) placeBox();
}
function pinMenu(e, n) {
  contextMenu(e.clientX, e.clientY, [
    ["Edit the note", "click", () => openBox(find(n.id), false)],
    [n.status === "open" ? "Mark fixed" : "Reopen", "", () => toggleFixed(n)],
    ...(n.status === "fixed" ? [["Before / after", "B", () => bus.emit("note-before", n.id)]] : []),
    null,
    ["Delete the note", "", () => remove(n)],
  ]);
}

/* ---------------------------------------------------------------- the note box */
function summary(n) {
  const c = n.ctx || {}, top = c.clips?.[0];
  const bits = [`#${n.n}`, N.clock(n.t), fmtClock(n.t, S.project?.fps || 30)];
  if (top) bits.push(`${top.type}${top.name ? ` "${top.name}"` : ""}`);
  if (c.scene) bits.push(`scene ${c.scene.n} ${c.scene.state}`);
  if (n.to) bits.push("arrow");
  return bits.join(" · ");
}
function refreshBoxHead() { const h = box.querySelector(".nhead b"); if (h && editing) h.textContent = (editing.isNew ? "New note " : "") + summary(editing); const a = box.querySelector("[data-arrow]"); if (a && editing) a.textContent = editing.to ? "➔ move the arrow" : "➔ add an arrow"; }
const canTalk = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function openBox(n, isNew) {
  if (!n) return;
  stopRec(false);
  editing = { ...n, isNew };
  box.innerHTML = "";
  const ta = el("textarea", { placeholder: "what is wrong here, and what should it do instead", value: n.text });
  const commitBox = () => {
    if (rec) return stopRec(true);
    const text = ta.value.trim();
    if (!text) { if (isNew) return closeBox(); return remove(n); }
    const now = new Date().toISOString(), { isNew: _, ...clean } = editing;
    if (isNew) ensureDoc().notes.push({ ...clean, text, modified: now });
    else { const cur = find(n.id); if (cur) Object.assign(cur, { text, to: clean.to, ctx: clean.ctx, voice: clean.voice || cur.voice, modified: now }); }
    doc.notes.sort((a, b) => a.t - b.t || a.n - b.n);
    closeBox(); save();
  };
  ta.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitBox(); }
    if (e.key === "Escape") { e.preventDefault(); closeBox(); }
  };
  const mic = canTalk() ? el("button", { class: "nmic", title: "talk instead of typing (Whisper types it)", text: "\u{1F3A4} talk", onclick: () => (rec ? stopRec(true) : startRec(ta)) }) : null;
  const tools = el("div", { class: "nbtns" },
    mic,
    el("button", { "data-arrow": "1", title: "then click where it should go", text: n.to ? "➔ move the arrow" : "➔ add an arrow", onclick: () => { pickArrow = true; banner("ARROW · click where it should go · Esc to cancel"); } }),
    canTalk() ? el("label", { class: "dim nauto", title: "start the mic on every new note" }, el("input", { type: "checkbox", checked: localStorage.getItem("ravyn.autoMic") === "1", onchange: (e) => localStorage.setItem("ravyn.autoMic", e.target.checked ? "1" : "0") }), " mic on new notes") : null,
  );
  const btns = el("div", { class: "nbtns" },
    el("button", { class: "primary", text: isNew ? "Add note" : "Save", onclick: commitBox }),
    !isNew ? el("button", { text: n.status === "open" ? "Mark fixed" : "Reopen", onclick: () => { closeBox(); toggleFixed(n); } }) : null,
    !isNew ? el("button", { class: "danger", text: "Delete", onclick: () => { closeBox(); remove(n); } }) : null,
    el("span", { class: "spacer" }),
    el("button", { class: "quiet", text: "Cancel", onclick: closeBox }),
  );
  const fix = n.status === "fixed" && n.fix?.note ? el("div", { class: "nfix", text: `fixed: ${n.fix.note}` }) : null;
  const status = el("div", { class: "nrec dim", hidden: true });
  box.append(...[el("div", { class: "nhead" }, el("b", { text: (isNew ? "New note " : "") + summary(n) })), ta, status, tools, fix, btns].filter(Boolean), el("div", { class: "dim nkeys", text: "Enter saves · Shift+Enter new line · Esc cancels" }));
  box.hidden = false;
  box.onpointerdown = (e) => e.stopPropagation();
  draw();
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  if (isNew && mic && localStorage.getItem("ravyn.autoMic") === "1") startRec(ta);
}
function placeBox() {
  const k = scaleK(), wr = wrap.getBoundingClientRect(), vr = viewport.getBoundingClientRect();
  if (window.innerWidth < 800) { box.style.left = "6px"; box.style.top = "6px"; return; }   // a phone: the box sits on top
  const ax = editing.w > 0 ? editing.x + editing.w : editing.x, ay = editing.y;
  const bw = box.offsetWidth || 300, bh = box.offsetHeight || 150;
  let x = wr.left - vr.left + ax * k + 18, y = wr.top - vr.top + ay * k - 20;
  if (x + bw > vr.width - 6) x = wr.left - vr.left + editing.x * k - bw - 18;
  box.style.left = clamp(x, 6, Math.max(6, vr.width - bw - 6)) + "px";
  box.style.top = clamp(y, 6, Math.max(6, vr.height - bh - 6)) + "px";
}
function closeBox() { stopRec(false); pickArrow = false; banner(S.noteMode ? modeTag.textContent : null); editing = null; box.hidden = true; box.innerHTML = ""; draw(); }

/* ---------------------------------------------------------------- voice */
async function startRec(ta) {
  const status = box.querySelector(".nrec"), mic = box.querySelector(".nmic");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream), chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec = { mr, stream, chunks, ta, keep: true };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const r = rec; rec = null;
      if (mic) { mic.classList.remove("on"); mic.textContent = "\u{1F3A4} talk"; }
      if (!r?.keep || !chunks.length) { if (status) status.hidden = true; return; }
      if (status) { status.hidden = false; status.textContent = "typing out what you said..."; }
      try {
        const b64 = await blobToB64(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        const { text } = await api("/api/transcribe", { audio: b64 });
        if (text && editing) { ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + text; editing.voice = true; }
        if (status) status.hidden = true;
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (e) { if (status) status.textContent = `could not type it out: ${e.message}`; }
    };
    mr.start();
    if (mic) { mic.classList.add("on"); mic.textContent = "■ stop"; }
    if (status) { status.hidden = false; status.textContent = "listening... click stop (or Enter) when you are done"; }
  } catch (e) { if (status) { status.hidden = false; status.textContent = `no mic: ${e.message}`; } }
}
function stopRec(keep) { if (!rec) return; rec.keep = keep; try { rec.mr.stop(); } catch {} }
function blobToB64(blob) { return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = bad; r.readAsDataURL(blob); }); }

/* ---------------------------------------------------------------- edits */
function toggleFixed(n) {
  const cur = find(n.id); if (!cur) return;
  cur.status = cur.status === "open" ? "fixed" : "open";
  cur.fix = cur.status === "fixed" ? { note: "marked fixed in the editor", at: new Date().toISOString() } : null;
  cur.checked = cur.status === "fixed";               // you marked it yourself, nothing to check
  cur.modified = new Date().toISOString();
  save();
}
function remove(n) {
  if (!doc) return;
  if (!confirm(`Delete note #${n.n} at ${N.clock(n.t)}?\n\n"${n.text}"`)) return;
  doc.notes = doc.notes.filter((x) => x.id !== n.id);
  if (focusId === n.id) focusId = null;
  save();
}
function goTo(id, { hold = false } = {}) {
  const n = find(id); if (!n) return;
  actionsRef.pause(); setTime(n.t);
  focusId = id; clearTimeout(focusTimer);
  if (!hold) focusTimer = setTimeout(() => { focusId = null; draw(); render(); }, 2600);
  draw(); render();
}
/* [ and ]: the previous / next note from the playhead, among the listed ones */
function next(dir) {
  const list = (doc?.notes || []).filter((n) => S.notesShowFixed || n.status === "open" || !n.checked).sort((a, b) => a.t - b.t || a.n - b.n);
  const n = dir > 0 ? list.find((x) => x.t > S.t + 0.001) : [...list].reverse().find((x) => x.t < S.t - 0.001);
  if (n) goTo(n.id);
}
function setVerdict(scene, verdict) {
  if (!S.project || !scene) return;
  const cur = N.verdictFor(doc, scene);
  N.setVerdict(ensureDoc(), scene, cur?.verdict === verdict ? null : verdict);
  save();
}
function fixesToCheck() { return (doc?.notes || []).filter((n) => n.status === "fixed" && !n.checked).sort((a, b) => a.t - b.t); }
function passFix(id) { const n = find(id); if (!n) return; n.checked = true; n.modified = new Date().toISOString(); save(); }
function rejectFix(id, said) {
  const n = find(id); if (!n) return;
  n.history = [...(n.history || []), { fix: n.fix, rejected: new Date().toISOString(), said: said || null }];
  if (said) n.text = `${n.text}\nSTILL: ${said}`;
  n.status = "open"; n.fix = null; n.checked = false; n.modified = new Date().toISOString();
  save();
}
export function focusHold(id) { goTo(id, { hold: true }); }
export function clearFocus() { focusId = null; draw(); render(); }

/* ---------------------------------------------------------------- the lists */
function row(n) {
  const c = n.ctx || {}, top = c.clips?.[0];
  const meta = [top ? `${top.type}${top.name ? ` "${top.name}"` : ""}` : "background", c.scene ? `scene ${c.scene.n} ${c.scene.state}` : null, c.word ? `"${c.word}"` : null].filter(Boolean).join(" · ");
  const tag = n.status === "open" ? null : n.checked ? el("span", { class: "ntag ok", text: "passed" }) : el("span", { class: "ntag check", text: "check it" });
  return el("div", { class: `nrow ${statusCls(n)}${n.id === focusId ? " focus" : ""}`, onclick: () => goTo(n.id), ondblclick: () => { goTo(n.id); openBox(n, false); } },
    el("i", { class: "nnum", text: String(n.n) }),
    el("div", { class: "nbody" },
      el("div", { class: "ntime" }, el("b", { text: N.clock(n.t) }), el("span", { class: "dim", text: `${n.w > 0 ? " box" : ""}${n.to ? " ➔" : ""}${n.voice ? " \u{1F3A4}" : ""}` }), tag),
      el("div", { class: "ntext", text: n.text }),
      el("div", { class: "nmeta dim", text: meta }),
      n.status === "fixed" && n.fix?.note ? el("div", { class: "nfix", text: `fixed: ${n.fix.note}` }) : null,
    ),
    el("div", { class: "nact" },
      el("button", { class: "quiet", title: "edit", html: "&#9998;", onclick: (e) => { e.stopPropagation(); goTo(n.id); openBox(n, false); } }),
      n.status === "fixed" ? el("button", { class: "quiet", title: "before / after", html: "&#9680;", onclick: (e) => { e.stopPropagation(); bus.emit("note-before", n.id); } }) : null,
      el("button", { class: "quiet", title: n.status === "open" ? "mark fixed" : "reopen", html: n.status === "open" ? "&#10003;" : "&#8634;", onclick: (e) => { e.stopPropagation(); toggleFixed(n); } }),
      el("button", { class: "quiet danger", title: "delete", html: "&#10005;", onclick: (e) => { e.stopPropagation(); remove(n); } }),
    ),
  );
}
function render() {
  const all = doc?.notes || [];
  const open = all.filter((n) => n.status === "open").length, toCheck = fixesToCheck().length;
  for (const c of $$("[data-notes-count]")) c.textContent = S.project ? `${open} open · ${toCheck} to check · ${all.length - open - toCheck} done` : "";
  const list = all.filter((n) => S.notesShowFixed || n.status === "open" || !n.checked);
  for (const host of $$("[data-notes-list]")) {
    host.innerHTML = "";
    if (!S.project) { host.append(el("div", { class: "hint", text: "open a project first" })); continue; }
    if (!list.length) { host.append(el("div", { class: "hint", text: all.length ? "nothing open. Switch the filter to see every note." : "no notes yet. Press N and click the spot (drag for a box), or Shift+N and drag an arrow to where it should go." })); continue; }
    for (const n of list) host.append(row(n));
  }
}
