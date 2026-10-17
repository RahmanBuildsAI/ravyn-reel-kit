// The command box (Ctrl+/): type what you want, Enter runs it. Commands come from app.js.
import { $, el, layer } from "/ui/util.js";

const box = $("#palette"), input = $("#paletteInput"), list = $("#paletteList");
let commands = [], cursor = 0, shown = [];

export function initPalette(cmds) {
  commands = cmds;
  $("#paletteBox").onclick = open;
  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(shown.length - 1, cursor + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(0, cursor - 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); run(shown[cursor]); }
  });
  document.addEventListener("pointerdown", (e) => { if (!box.hidden && !box.contains(e.target) && e.target !== $("#paletteBox")) close(); });
}
export function open() { if (box.parentNode !== layer()) layer().append(box); box.hidden = false; input.value = ""; cursor = 0; refresh(); input.focus(); }
export function close() { box.hidden = true; input.blur(); }
export const isOpen = () => !box.hidden;
function score(cmd, q) {
  if (!q) return 1;
  const hay = (cmd.label + " " + (cmd.group || "") + " " + (cmd.keys || "") + " " + (cmd.alias || "")).toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) { const i = hay.indexOf(w); if (i < 0) return 0; s += i === 0 || hay[i - 1] === " " ? 3 : 1; }
  return s;
}
function refresh() {
  const q = input.value.trim();
  shown = commands.filter((c) => !c.when || c.when()).map((c) => [score(c, q), c]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, c]) => c).slice(0, 14);
  cursor = 0; paint();
}
function paint() {
  list.innerHTML = "";
  shown.forEach((c, i) => list.append(el("div", { class: `pi${i === cursor ? " on" : ""}`, onclick: () => run(c) }, el("span", { class: "g", text: c.group || "" }), el("span", { text: c.label }), c.keys ? el("span", { class: "k", text: c.keys }) : null)));
  if (!shown.length) list.append(el("div", { class: "pi dim", text: "nothing matches" }));
}
function run(c) { if (!c) return; close(); try { const r = c.run(); if (r && r.catch) r.catch((e) => console.error(e)); } catch (e) { console.error(e); } }
