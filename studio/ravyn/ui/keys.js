// Keyboard map (Premiere habits). Ignored while typing in a field.
import { S, M, bus, commit, undo, redo, select, selected, setTime, fps, T } from "/ui/state.js";
import { isTyping } from "/ui/util.js";

export function installKeys(actions) {
  window.addEventListener("keydown", (e) => {
    if (isTyping()) { if (e.key === "Escape") document.activeElement.blur(); return; }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, alt = e.altKey, shift = e.shiftKey;
    const p = S.project; if (!p && !(ctrl && k.toLowerCase() === "n")) return;
    const step = (n) => { actions.pause(); setTime(S.t + n / fps()); };
    const sel = selected();
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === " ") { stop(); actions.togglePlay(); return; }
    if (ctrl && (k === "/" || k === "?")) { stop(); actions.palette(); return; }
    if (ctrl && k.toLowerCase() === "g") { stop(); shift ? actions.ungroup() : actions.group(); return; }
    if (ctrl && k.toLowerCase() === "z") { stop(); shift ? redo() : undo(); return; }
    if (ctrl && k.toLowerCase() === "y") { stop(); redo(); return; }
    if (ctrl && k.toLowerCase() === "s") { stop(); actions.save(); return; }
    if (ctrl && k.toLowerCase() === "a") { stop(); select(T().clips.map((c) => c.id)); return; }
    if (ctrl && k.toLowerCase() === "k") { stop(); actions.splitAtPlayhead(); return; }
    if (ctrl && k.toLowerCase() === "d") { stop(); actions.duplicate(); return; }
    if (ctrl && k.toLowerCase() === "c") { stop(); actions.copy(); return; }
    if (ctrl && k.toLowerCase() === "v") { stop(); actions.paste(); return; }
    if (ctrl && (k === "]" || k === "[")) { stop(); actions.trackMove(k === "]" ? 1 : -1); return; }
    if (alt && (k === "ArrowUp" || k === "ArrowDown")) { stop(); actions.trackMove(k === "ArrowUp" ? 1 : -1); return; }
    if (alt && (k === "ArrowLeft" || k === "ArrowRight")) { stop(); actions.nudgeTime((k === "ArrowRight" ? 1 : -1) * (shift ? 10 : 1)); return; }
    if (ctrl && k.startsWith("Arrow")) { stop(); const d = shift ? 10 : 1; actions.nudgeXY(k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0); return; }
    if (k === "ArrowLeft") { stop(); step(shift ? -10 : -1); return; }
    if (k === "ArrowRight") { stop(); step(shift ? 10 : 1); return; }
    if (k === "ArrowUp" || k === "ArrowDown") { stop(); actions.jumpEdit(k === "ArrowUp" ? -1 : 1); return; }
    if (k === "Home") { stop(); actions.pause(); setTime(0); return; }
    if (k === "End") { stop(); actions.pause(); setTime(M.projectDuration(p)); return; }
    if (k === "Delete" || k === "Backspace") { stop(); shift ? actions.rippleDelete() : actions.del(); return; }
    if (k === "Escape") { stop(); actions.escape(); return; }
    if (ctrl || alt) return;
    switch (k.toLowerCase()) {
      case "j": stop(); actions.shuttle(-1); break;
      case "k": stop(); actions.pause(); break;
      case "l": stop(); actions.shuttle(1); break;
      case "v": stop(); actions.setTool("select"); break;
      case "c": stop(); actions.setTool("razor"); break;
      case "s": stop(); S.snap = !S.snap; bus.emit("ui"); break;
      case "m": stop(); actions.marker(); break;
      case "n": stop(); shift ? actions.noteArrow?.() : actions.note?.(); break;
      case "f": stop(); actions.fullscreen?.(); break;
      case "e": stop(); actions.toggleMode?.(); break;
      case "[": stop(); actions.notes?.next(-1); break;
      case "]": stop(); actions.notes?.next(1); break;
      case ",": stop(); actions.review?.scene(-1); break;
      case ".": stop(); actions.review?.scene(1); break;
      case "<": stop(); actions.review?.rate(-1); break;
      case ">": stop(); actions.review?.rate(1); break;
      case "g": stop(); actions.review?.verdict("good"); break;
      case "x": stop(); actions.review?.verdict("bad"); break;
      case "b": stop(); actions.review?.beforeKey(); break;
      case "p": stop(); actions.review?.toggleSource(); break;
      case "o": stop(); actions.review?.toggleIG(); break;
      case "t": stop(); actions.addText(); break;
      case "r": stop(); actions.addShape(); break;
      case "+": case "=": stop(); actions.zoom(1.25); break;
      case "-": case "_": stop(); actions.zoom(0.8); break;
      case "i": stop(); actions.toggleInspector?.(); break;
    }
  });
}
