// The media panel: browse the reel's asset folders, studio/sfx and your SFX library. Click to
// inspect (and audition audio), double-click or "Add at playhead" to place, drag onto a track
// or the stage. Audio rows carry a use counter (the 8-use ceiling) and an audition button;
// risers are tagged intro-only. Proxies are requested per project and their progress shows here.
import { S, M, bus, api, select } from "/ui/state.js";
import { $, el, fmtDur, fmtBytes, mediaUrl } from "/ui/util.js";
import { Audio } from "/ui/audio.js";

const rootSel = $("#mediaRoot"), crumb = $("#mediaCrumb"), list = $("#mediaList"), info = $("#mediaInfo"), status = $("#proxyStatus");
let dir = "", cache = new Map(), actionsRef = null, picked = null, lastRows = [];
const progress = new Map();

export const media = {
  picked: () => picked,
  proxyProgress(d) {
    if (d.src) progress.set(d.src, { ...d, at: Date.now() });
    const rows = [...progress.values()].filter((x) => !x.done || Date.now() - (x.at || 0) < 4000);
    status.innerHTML = rows.map((x) => `${x.src.split("/").pop()}: ${x.done ? (x.ok ? "ready" : "failed " + (x.error || "")) : x.pct + "%"}`).join("<br>") || "";
    if (d.done) setTimeout(() => { progress.delete(d.src); media.proxyProgress({ src: "", done: true }); }, 4200);
  },
  refreshCounts() { paintCounts(); },
};
export function initMedia(actions) {
  actionsRef = actions;
  bus.on("project", (o) => { if (o?.reason === "load") pickDefaultRoot(); else paintCounts(); });
  rootSel.onchange = () => openDir(rootSel.value);
  $("#btnAddAtPlayhead").onclick = () => { if (picked) actions.addMedia(picked, { start: S.t }); };
  $("#btnProxies").onclick = async () => {
    if (!S.project) return;
    const srcs = [...new Set(M.allClips(S.project).flatMap((c) => (c.type === "video" || c.type === "facecam") ? [c.src].filter(Boolean) : []))];
    const r = await api("/api/proxy", { srcs });
    Object.assign(S.proxies, r.ready || {});
    status.textContent = r.queued ? `making ${r.queued} proxies (watch this space)` : "all proxies ready";
    if (Object.keys(r.ready || {}).length) bus.emit("project", { reason: "proxy" });
  };
  renderRoots();
}
function renderRoots() {
  rootSel.innerHTML = S.roots.map((r) => `<option value="${r.dir}">${r.label}</option>`).join("");
  if (S.roots.length && !dir) openDir(S.roots[0].dir);
}
function pickDefaultRoot() {
  renderRoots();
  const p = S.project; if (!p || p.reel == null) return;
  const want = `assets/r${String(p.reel).padStart(2, "0")}`;
  if (S.roots.some((r) => r.dir === want)) { rootSel.value = want; openDir(want); }
}
function useCounts() {
  const n = {}; if (!S.project) return n;
  for (const c of M.allClips(S.project)) if (c.type === "audio") n[c.src] = (n[c.src] || 0) + 1;
  return n;
}
function paintCounts() {
  const n = useCounts();
  for (const it of list.querySelectorAll(".it[data-src]")) {
    const u = it.querySelector(".use"); if (!u) continue;
    const k = n[it.dataset.src] || 0; u.textContent = k ? `x${k}` : ""; u.classList.toggle("over", k > 8); u.title = k > 8 ? "over the 8-use ceiling (rotate the family)" : `${k} use(s) in this reel`;
  }
}
async function openDir(d) {
  dir = d;
  const isPack = d.startsWith("pack:");
  const rootOf = S.roots.find((r) => d === r.dir || d.startsWith(r.dir + "/") || (r.dir === "pack:" && isPack));
  if (rootOf) rootSel.value = rootOf.dir;
  crumb.innerHTML = "";
  const parts = isPack ? d.slice(5).split("/").filter(Boolean) : d.split("/").filter(Boolean);
  let acc = isPack ? "pack:" : "";
  crumb.append(el("span", { text: isPack ? "pack" : "reels", onclick: () => openDir(isPack ? "pack:" : parts[0] || "assets") }));
  parts.forEach((seg, i) => { acc = acc + (i ? "/" : "") + seg; const target = acc; crumb.append(" / ", el("span", { text: seg, onclick: () => openDir(target) })); });
  list.innerHTML = `<div class="dim" style="padding:6px 8px">loading</div>`;
  const key = d + (isPack ? "" : "|probe");
  let r = cache.get(key);
  if (!r) { r = await api(`/api/media?dir=${encodeURIComponent(d)}&probe=${isPack ? 0 : 1}`); cache.set(key, r); }
  if (dir !== d) return;
  list.innerHTML = ""; lastRows = r.files;
  for (const sub of r.dirs) list.append(el("div", { class: "it", onclick: () => openDir((isPack ? (d === "pack:" ? "pack:" : d + "/") : d + "/") + sub) }, el("i", { class: "k dir" }), el("span", { class: "n", text: sub + "/" })));
  for (const f of r.files) {
    const isRiser = /riser/i.test(f.name), retired = /sfx-alarm|whoosh-soft|glow-soft/i.test(f.name);
    const it = el("div", { class: "it", draggable: "true", title: f.src, "data-src": f.src },
      el("i", { class: `k ${f.kind}` }), el("span", { class: "n", text: f.name }),
      f.kind === "audio" ? el("span", { class: "use" }) : null,
      isRiser ? el("span", { class: "tag", text: "intro only" }) : null,
      retired ? el("span", { class: "tag", text: "retired", style: { background: "#5a2b2b", color: "#ffb3b3" } }) : null,
      el("span", { class: "d", text: f.duration != null ? fmtDur(f.duration) : f.kind === "image" ? "" : fmtBytes(f.size) }),
      f.kind === "video" && f.proxy ? el("span", { class: "d", title: "proxy ready", text: "px" }) : null,
      f.kind === "audio" ? el("button", { class: "aud", html: "&#9654;", title: "audition", onclick: (e) => { e.stopPropagation(); Audio.audition(f.src); } }) : null);
    it.onclick = () => pick(f, it);
    it.ondblclick = () => { pick(f, it); actionsRef.addMedia(f, { start: S.t }); };
    it.ondragstart = (e) => { e.dataTransfer.setData("application/x-ravyn", JSON.stringify(f)); e.dataTransfer.effectAllowed = "copy"; pick(f, it); };
    list.append(it);
  }
  if (!r.dirs.length && !r.files.length) list.append(el("div", { class: "dim", style: { padding: "6px 8px" }, text: "nothing here" }));
  paintCounts();
}
async function pick(f, it) {
  for (const x of list.children) x.classList.toggle("on", x === it);
  picked = f;
  if (f.duration == null && f.kind !== "image") { const pr = await api(`/api/probe?src=${encodeURIComponent(f.src)}`); Object.assign(f, pr); }
  if ((f.kind === "image" || f.kind === "video") && f.width == null) { const pr = await api(`/api/probe?src=${encodeURIComponent(f.src)}`); Object.assign(f, pr); }
  info.innerHTML = "";
  info.append(el("div", { text: f.name }), el("div", { text: [f.kind, f.duration != null ? fmtDur(f.duration) : null, f.width ? `${f.width}x${f.height}` : null, f.fps ? `${f.fps} fps` : null, f.alpha ? "alpha" : null, f.hasAudio ? "has audio" : null, fmtBytes(f.size)].filter(Boolean).join(" · ") }));
  if (f.kind === "audio") { const a = el("audio", { controls: true, src: mediaUrl(f.src) }); info.append(a); }
  if (f.kind === "image") { const img = el("img", { src: mediaUrl(f.src), style: { maxWidth: "100%", maxHeight: "120px", marginTop: "4px", display: "block" } }); info.append(img); }
  if (f.kind === "video") { const v = el("video", { src: f.proxy || mediaUrl(f.src), muted: true, controls: true, preload: "metadata", style: { width: "100%", maxHeight: "140px", marginTop: "4px", display: "block", background: "#000" } }); info.append(v); }
}
