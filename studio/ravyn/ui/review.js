// Review mode: for reviewing and very small changes. The
// default screen: the picture, a thin scene strip instead of the timeline, and a side panel with the
// scene you are on (thumbs up / down), Claude's fixes to check (before / after), your hand edits and
// the notes. E flips to Edit mode (the full editor, unchanged). Also here, for both modes: the
// playback speed, the real render in place of the live preview, and the Instagram overlay.
import { S, M, bus, api, setTime, select } from "/ui/state.js";
import { $, $$, el, clamp } from "/ui/util.js";
import * as N from "/lib/notes.mjs";
import { notes, focusHold, clearFocus } from "/ui/notes.js";
import { stage } from "/ui/stage.js";

const strip = $("#reviewStrip"), bar = $("#rsBar"), marks = $("#rsNotes"), head = $("#rsHead");
const video = $("#renderVideo"), frame = $("#stage");
const RATES = [1, 1.5, 2];
const STATE = { full: "your face full", stack: "face + element (stack)", bubble: "face + element (bubble)", none: "elements only", cut: "cut" };
let actionsRef = null, checking = null, before = null, editsInfo = { edits: [] };

export const review = {
  setMode, toggleMode: () => setMode(S.mode === "review" ? "edit" : "review"),
  scenes, sceneAt: (t = S.t) => scenes().find((s) => t >= s.t - 1e-4 && t < s.end) || null,
  scene(dir) { const list = scenes(), i = list.findIndex((s) => S.t >= s.t - 1e-4 && S.t < s.end); const s = list[clamp((i < 0 ? 0 : i) + dir, 0, list.length - 1)]; if (s) { actionsRef.pause(); setTime(s.t); } },
  verdict(v) { const s = review.sceneAt(); if (s) notes.setVerdict(s, v); },
  rate(dir) { const i = RATES.indexOf(S.rate); S.rate = RATES[clamp((i < 0 ? 0 : i) + dir, 0, RATES.length - 1)]; paintRate(); bus.emit("rate"); },
  toggleSource, toggleIG, beforeKey,
  isRender: () => S.source === "render",
  playMedia() { video.currentTime = S.t; video.playbackRate = S.rate; return video.play().catch(() => {}); },
  pauseMedia() { try { video.pause(); } catch {} },
  mediaTime: () => video.currentTime,
};

export function initReview(actions) {
  actionsRef = actions;
  S.rate = 1; S.source = "preview"; S.ig = false;
  const saved = localStorage.getItem("ravyn.mode");
  setMode(window.innerWidth < 800 ? "review" : saved === "edit" ? "edit" : "review", { quiet: true });
  for (const b of $$("#modeSwitch button")) b.onclick = () => setMode(b.dataset.mode);
  $("#btnRate").onclick = () => { const i = RATES.indexOf(S.rate); S.rate = RATES[(i + 1) % RATES.length]; paintRate(); bus.emit("rate"); };
  $("#btnSource").onclick = toggleSource;
  $("#chkIG").onchange = (e) => toggleIG(e.target.checked);
  $("#rvCheckStart").onclick = startCheck;
  bus.on("project", (o) => { if (o?.reason === "load") { endBefore(); checking = null; if (S.source === "render") toggleSource(); loadEdits(); } renderStrip(); renderSide(); });
  bus.on("notes", () => { renderStrip(); renderSide(); });
  bus.on("time", () => { paintHead(); paintScene(); if (S.source === "render" && !S.playing) { try { video.currentTime = S.t; } catch {} } });
  bus.on("save", () => { if (S.saveState === "saved") loadEditsSoon(); });
  bus.on("note-before", (id) => { notes.goTo?.(id); beforeToggle(id); });
  bus.on("rate", () => { video.playbackRate = S.rate; });
  new ResizeObserver(() => paintHead()).observe(bar);
  // the strip: press and drag to scrub
  bar.addEventListener("pointerdown", (e) => { if (!S.project) return; e.preventDefault(); try { bar.setPointerCapture(e.pointerId); } catch {} actionsRef.pause(); scrub(e); bar.onpointermove = scrub; });
  bar.addEventListener("pointerup", () => { bar.onpointermove = null; });
  paintRate();
}

/* ---------------------------------------------------------------- mode */
function setMode(m, { quiet = false } = {}) {
  S.mode = m === "edit" ? "edit" : "review";
  document.body.classList.toggle("mode-review", S.mode === "review");
  document.body.classList.toggle("mode-edit", S.mode === "edit");
  for (const b of $$("#modeSwitch button")) b.classList.toggle("on", b.dataset.mode === S.mode);
  try { localStorage.setItem("ravyn.mode", S.mode); } catch {}
  if (S.mode === "review" && S.project) { select([]); S.tool = "select"; }
  requestAnimationFrame(() => { stage.fit(); paintHead(); });
  if (!quiet) bus.emit("ui");
  renderStrip(); renderSide();
}

/* ---------------------------------------------------------------- scenes */
/* reels with a facecam block: its scenes. Others: your jump cuts (markers) split the reel. */
function scenes() {
  const p = S.project; if (!p) return [];
  const end = M.projectDuration(p);
  if (M.facecamOf(p)) return M.sceneSpans(p).map((s, i) => ({ n: i + 1, t: s.t, end: s.end, state: s.state }));
  const cuts = [...new Set((p.markers || []).map((m) => M.r3(m.t)).filter((t) => t > 0.05 && t < end - 0.05))].sort((a, b) => a - b);
  const pts = [0, ...cuts, end];
  return pts.slice(0, -1).map((t, i) => ({ n: i + 1, t, end: pts[i + 1], state: "cut" }));
}
function wordsIn(s, n = 5) { return (S.project?.words || []).filter((w) => w.start >= s.t - 0.02 && w.start < s.end).slice(0, n).map((w) => w.text).join(" "); }
const dur = () => (S.project ? M.projectDuration(S.project) : 1);
function scrub(e) { const r = bar.getBoundingClientRect(); setTime(clamp((e.clientX - r.left) / r.width, 0, 1) * dur()); }
function renderStrip() {
  bar.innerHTML = ""; marks.innerHTML = "";
  if (!S.project || S.mode !== "review") return;
  const D = dur(), W = bar.clientWidth || 1000;
  for (const s of scenes()) {
    const v = notes.verdictFor(s)?.verdict;
    const b = el("div", { class: `rsScene ${s.state}${v ? " v-" + v : ""}`, style: { left: (s.t / D) * 100 + "%", width: ((s.end - s.t) / D) * 100 + "%" }, title: `scene ${s.n} · ${STATE[s.state] || s.state} · ${N.clock(s.t)} · "${wordsIn(s, 8)}"` },
      ((s.end - s.t) / D) * W > 16 ? el("b", { text: String(s.n) }) : null, v ? el("i", { class: "rsV", text: v === "good" ? "\u{1F44D}" : "✕" }) : null);
    b.dataset.t = s.t; b.dataset.end = s.end;
    bar.append(b);
  }
  for (const n of S.notes || []) {
    if (n.status === "fixed" && n.checked && !S.notesShowFixed) continue;
    marks.append(el("i", { class: `rsPin ${n.status === "open" ? "open" : n.checked ? "checked" : "tocheck"}`, style: { left: (n.t / D) * 100 + "%" }, title: `#${n.n} ${N.clock(n.t)}: ${n.text}`, text: String(n.n), onclick: () => notes.goTo(n.id) }));
  }
  paintHead(); paintScene();
}
function paintHead() { if (!S.project) return; head.style.left = (S.t / dur()) * 100 + "%"; }
function paintScene() {
  const s = review.sceneAt();
  for (const b of bar.children) b.classList.toggle("now", !!s && Math.abs(+b.dataset.t - s.t) < 1e-3);
  const box = $("#rvScene"); if (!box || S.mode !== "review") return;
  const key = s ? `${s.t}|${notes.verdictFor(s)?.verdict || ""}` : "";
  if (box.dataset.key === key) return;
  box.dataset.key = key; box.innerHTML = "";
  if (!s) { box.append(el("div", { class: "dim", text: "no scenes" })); return; }
  const v = notes.verdictFor(s)?.verdict, list = scenes();
  box.append(
    el("div", { class: "rvTitle" }, el("b", { text: `Scene ${s.n} of ${list.length}` }), el("span", { class: "dim", text: ` · ${STATE[s.state] || s.state} · ${N.clock(s.t)} to ${N.clock(s.end)}` })),
    el("div", { class: "rvWords dim", text: wordsIn(s, 14) ? `"${wordsIn(s, 14)}..."` : "" }),
    el("div", { class: "rvBtns" },
      el("button", { class: `vgood${v === "good" ? " on" : ""}`, title: "this scene is good, leave it alone (G)", text: "\u{1F44D} good", onclick: () => review.verdict("good") }),
      el("button", { class: `vbad${v === "bad" ? " on" : ""}`, title: "this scene is not right (X). Add a note to say why, or Claude will ask", text: "✕ not right", onclick: () => review.verdict("bad") }),
      el("span", { class: "spacer" }),
      el("button", { class: "quiet", title: "previous scene (,)", text: "◀", onclick: () => review.scene(-1) }),
      el("button", { class: "quiet", title: "next scene (.)", text: "▶", onclick: () => review.scene(1) }),
    ),
  );
}

/* ---------------------------------------------------------------- the side panel */
function renderSide() {
  if (S.mode !== "review") return;
  $("#rvScene").dataset.key = "-"; paintScene();
  const todo = notes.fixesToCheck();
  const start = $("#rvCheckStart"); start.hidden = !todo.length || !!checking; start.textContent = `Check Claude's fixes (${todo.length})`;
  renderCheck();
  const n = editsInfo.edits.length, e = $("#rvEdits");
  e.hidden = !n; e.textContent = n ? `Your hand edits: ${n}, kept through every rebuild` : "";
  e.title = "moved, retyped or deleted in the editor; cut.mjs re-applies them on every build (cli.mjs edits <reel>)";
}
let editsTimer = 0;
function loadEditsSoon() { clearTimeout(editsTimer); editsTimer = setTimeout(loadEdits, 400); }
async function loadEdits() { if (!S.project) return; try { editsInfo = await api(`/api/edits?id=${encodeURIComponent(S.project.id)}`); } catch { editsInfo = { edits: [] }; } renderSide(); }

/* checking Claude's fixes, one by one: jump there, flip before / after, pass it or send it back */
function startCheck() { const todo = notes.fixesToCheck(); if (!todo.length) return; checking = { id: todo[0].id }; focusHold(checking.id); renderSide(); }
function stopCheck() { checking = null; endBefore(); clearFocus(); renderSide(); }
function advance() {
  endBefore();
  const todo = notes.fixesToCheck();
  if (!todo.length) { checking = null; clearFocus(); bus.emit("toast", { text: "every fix checked" }); renderSide(); return; }
  const i = todo.findIndex((n) => n.id === checking?.id);
  checking = { id: (todo[i + 1] || todo[0]).id }; focusHold(checking.id); renderSide();
}
function renderCheck() {
  const card = $("#rvCheck"); card.innerHTML = ""; card.hidden = !checking;
  if (!checking) return;
  const n = notes.doc()?.notes.find((x) => x.id === checking.id); if (!n) { checking = null; card.hidden = true; return; }
  const left = notes.fixesToCheck().length;
  const said = el("input", { type: "text", placeholder: "what is still wrong (optional)" });
  said.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") reject(); if (e.key === "Escape") said.blur(); };
  const reject = () => { const id = n.id; notes.rejectFix(id, said.value.trim()); advance(); };
  card.append(
    el("div", { class: "rvTitle" }, el("b", { text: `Check fix #${n.n}` }), el("span", { class: "dim", text: ` · ${N.clock(n.t)} · ${left} left` })),
    el("div", { class: "ntext", text: n.text }),
    n.fix?.note ? el("div", { class: "nfix", text: `Claude: ${n.fix.note}` }) : null,
    el("div", { class: "rvBtns" },
      el("button", { class: before ? "on" : "", title: "flip between the reel now and the reel when you wrote the note (B)", text: before ? "◑ showing BEFORE" : "◐ before / after", onclick: () => beforeToggle(n.id) }),
      el("button", { class: "quiet", title: "play this moment", text: "▶ play it", onclick: () => { setTime(Math.max(0, n.t - 1)); actionsRef.play(); } }),
    ),
    el("div", { class: "rvBtns" },
      el("button", { class: "vgood", text: "✓ fixed, good", onclick: () => { notes.passFix(n.id); advance(); } }),
      el("button", { class: "vbad", text: "✕ still wrong", onclick: reject }),
      el("span", { class: "spacer" }),
      el("button", { class: "quiet", text: "skip", onclick: advance }),
      el("button", { class: "quiet", text: "stop", onclick: stopCheck }),
    ),
    said,
  );
}

/* before / after: the stage shows the project as it was when the note was made */
async function beforeToggle(id) {
  if (before) { endBefore(); return; }
  const n = notes.doc()?.notes.find((x) => x.id === id); if (!n || !S.project) return;
  const mod = n.ctx?.projectModified;
  if (!mod) return bus.emit("toast", { text: "this note has no saved version to compare with", bad: true });
  if (mod === S.project.meta?.modified) return bus.emit("toast", { text: "nothing changed since this note: the reel is the same version" });
  try {
    const { project } = await api(`/api/snapshot?id=${encodeURIComponent(S.project.id)}&modified=${encodeURIComponent(mod)}`);
    before = { id, project }; stage.showProject(project);
    $("#beforeTag").hidden = false; $("#beforeTag").textContent = `BEFORE · the reel when you wrote note #${n.n} · B flips back`;
    renderCheck();
  } catch (e) { bus.emit("toast", { text: e.message === "no snapshot for that version" ? "no before-copy for this note" : e.message, bad: true }); }
}
function endBefore() { if (!before) return; before = null; stage.showProject(null); $("#beforeTag").hidden = true; renderCheck(); }
function beforeKey() {
  if (before) return endBefore();
  const id = checking?.id || (S.notes || []).find((n) => n.status === "fixed" && Math.abs(n.t - S.t) < 0.5)?.id;
  if (id) beforeToggle(id); else bus.emit("toast", { text: "B flips before / after on a fixed note: jump to one first" });
}

/* ---------------------------------------------------------------- speed, render, Instagram */
function paintRate() { $("#btnRate").textContent = `${S.rate}x`; $("#btnRate").classList.toggle("on", S.rate !== 1); }
async function toggleSource() {
  actionsRef.pause();
  if (S.source === "render") { S.source = "preview"; video.pause(); video.hidden = true; video.removeAttribute("src"); frame.style.visibility = ""; $("#btnSource").classList.remove("on"); $("#btnSource").textContent = "▣ preview"; $("#srcTag").hidden = true; bus.emit("source"); return; }
  if (!S.project) return;
  const list = (await api(`/api/renders?id=${encodeURIComponent(S.project.id)}`)).filter((r) => !/-test-/.test(r.file));
  if (!list.length) return bus.emit("toast", { text: "no render of this reel yet: Export > Render the reel", bad: true });
  const r = list[0];
  S.source = "render"; video.src = r.url; video.hidden = false; frame.style.visibility = "hidden"; video.playbackRate = S.rate;
  video.onloadedmetadata = () => { try { video.currentTime = S.t; } catch {} };
  $("#btnSource").classList.add("on"); $("#btnSource").textContent = "▶ render";
  const stale = S.project.meta?.modified && r.mtime < Date.parse(S.project.meta.modified);
  const tag = $("#srcTag"); tag.hidden = false; tag.classList.toggle("stale", !!stale);
  tag.textContent = `RENDER ${r.file.replace(S.project.id + "-", "").replace(/\.mp4$/, "")} · ${new Date(r.mtime).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${stale ? " · OLDER than the edit" : ""}`;
  bus.emit("source");
}
function toggleIG(on = !S.ig) {
  S.ig = !!on; $("#igOverlay").hidden = !S.ig; $("#chkIG").checked = S.ig;
  const t = String(S.project?.title || "").replace(/^Reel \d+\s*·\s*/, "");
  $("#igCaption").textContent = t.length > 44 ? t.slice(0, 44) + "... more" : t;
}
