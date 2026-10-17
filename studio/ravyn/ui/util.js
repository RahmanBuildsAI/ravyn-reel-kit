// small DOM + formatting helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const r3 = (t) => Math.round(t * 1000) / 1000;
export function fmtClock(sec, fps = 30) {
  const f = Math.round(Math.max(0, sec) * fps);
  const ff = f % fps, s = Math.floor(f / fps), m = Math.floor(s / 60);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return `${p(m)}:${p(s % 60)}:${p(ff)}`;
}
export function fmtDur(sec) { if (sec == null) return ""; return sec >= 60 ? `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(1)}s` : `${(+sec).toFixed(2)}s`; }
export function fmtBytes(n) { if (n == null) return ""; if (n > 1e9) return (n / 1e9).toFixed(2) + " GB"; if (n > 1e6) return (n / 1e6).toFixed(1) + " MB"; if (n > 1e3) return (n / 1e3).toFixed(0) + " KB"; return n + " B"; }
export function debounce(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }
export function isTyping() { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); }
export const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
/* rotate a vector by a degrees */
export function rot(x, y, a) { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [x * c - y * s, x * s + y * c]; }
/* the four corners of a clip's box in composition px, after scale + rotation about the centre */
export function corners(c) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2, hw = (c.w * c.scale) / 2, hh = (c.h * c.scale) / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => { const [rx, ry] = rot(x, y, c.rotation || 0); return [cx + rx, cy + ry]; });
}
export function hit(c, px, py) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const [lx, ly] = rot(px - cx, py - cy, -(c.rotation || 0));
  const s = c.scale || 1;
  return Math.abs(lx) <= (c.w * s) / 2 && Math.abs(ly) <= (c.h * s) / 2;
}
export function mediaUrl(src, proxies, useProxy) {
  if (useProxy && proxies && proxies[src]) return proxies[src];
  if (src.startsWith("pack:")) return "/pack/" + src.slice(5).split("/").map(encodeURIComponent).join("/");
  return "/reels/" + src.split("/").map(encodeURIComponent).join("/");
}
export function typeColor(t) { return ({ video: "#3d6fa8", image: "#2f8f8a", text: "#b58a1e", shape: "#b8552b", audio: "#3f8f4f", caption: "#7a4fb8", group: "#6b7a8f", facecam: "#2f4f7a", chapter: "#8a5a1e", cta: "#a04a3a" })[t] || "#666"; }

/* where floating UI goes: inside the full-screen element when the picture is full screen
   (anything outside it is not drawn), else the body */
export const layer = () => document.fullscreenElement || document.body;

/* a right-click menu: items are [label, keys, fn] or null for a separator */
export function contextMenu(x, y, items) {
  for (const old of document.querySelectorAll(".ctxmenu")) old.remove();
  const m = el("div", { class: "ctxmenu", style: { left: x + "px", top: y + "px" } });
  for (const it of items) {
    if (!it) { m.append(el("hr")); continue; }
    const [label, keys, fn] = it;
    m.append(el("div", { onclick: () => { m.remove(); try { fn(); } catch (e) { console.error(e); } } }, label, keys ? el("span", { class: "k", text: keys }) : null));
  }
  layer().append(m);
  const r = m.getBoundingClientRect();
  if (r.right > window.innerWidth) m.style.left = Math.max(0, window.innerWidth - r.width - 4) + "px";
  if (r.bottom > window.innerHeight) m.style.top = Math.max(0, window.innerHeight - r.height - 4) + "px";
  setTimeout(() => document.addEventListener("pointerdown", (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }), 0);
  return m;
}
