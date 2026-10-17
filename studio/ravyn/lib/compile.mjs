// The editor's compiler. ONE module, used two ways:
//   Node    compileHtml(project) -> the HyperFrames composition written to variants/<id>.html,
//           with literal tl.set / tl.fromTo lines so the file can be read statically.
//   Browser clipElements + compileOps + applyOps drive the editor stage, so the stage IS the
//           composition. What you see is what renders.
//
// Contract: every plain clip is one element, a direct child of #root, id = clip id, class
// "clip cr-<type>", data-start / data-duration / data-track-index, data-media-start for trimmed
// media, z-index from its track. Blocks (facecam, chapter, cta) expand into a few fixed elements.
// Motion is GSAP only: gsap.set for the base transform, then fromTo/to/set at absolute times for
// enter, exit, keyframes and karaoke.
//
// data-track-index: 100 + video track index, 300 + audio track index, 11 for caption cues, 1000+
// for scene spans, so plain clips never sit on 10-19.

import { clipEnd, zIndexOf, trackById, trackIndex, isVisual, valueAt, r3, hasScenes, sceneSpans, facecamOf, allClips, clipVisible, windowRect } from "./model.mjs";
import { resolveFont, fallbackStack, fontFaceCss } from "./fonts.mjs";

export const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const f3 = (n) => (Math.round((+n || 0) * 1000) / 1000).toFixed(3);
const px = (n) => `${Math.round((+n || 0) * 100) / 100}px`;
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n, d = 0) => (Number.isFinite(+n) ? +n : d);

export const SHADOWS = {
  none: "none",
  soft: "0 2px 10px rgba(0,0,0,.55)",
  hard: "0 0 4px rgba(0,0,0,1),0 0 10px rgba(0,0,0,.98),0 0 22px rgba(0,0,0,.92),0 4px 12px rgba(0,0,0,.9)",
  glow: "0 0 24px rgba(255,255,255,.55),0 0 60px rgba(255,255,255,.3)",
  light: "0 0 4px rgba(255,255,255,.95),0 0 12px rgba(255,255,255,.9),0 2px 8px rgba(255,255,255,.85)",
  // the headline style's shadow: a hard offset down-right, no glow
  drop: "5px 6px 0 rgba(15,15,15,.55)",
  face: "0 4px 22px rgba(0,0,0,.45)",
};
/* the four caption systems of the window style (styles/window/STYLE.md, Captions).
   face = white over your full-frame video, seam = dark on a white pill over the stack window's top
   edge, side = dark beside the bubble, ground = dark on the plain ground. */
export const CAPTION_SYS = {
  capFace: { font: "Inter", weight: 800, italic: false, size: 76, lineHeight: 1.08, uppercase: false, fill: "#FFFFFF", shadow: "face", x: 60, w: 960 },
  capSeam: { font: "Inter", weight: 800, italic: false, size: 54, lineHeight: 1.2, uppercase: false, fill: "#141414", shadow: "none", x: 150, w: 780, pill: true },
  capSide: { font: "Inter", weight: 800, italic: false, size: 60, lineHeight: 1.12, uppercase: false, fill: "#141414", shadow: "none", x: 500, w: 520, align: "left" },
  capGround: { font: "Inter", weight: 800, italic: false, size: 72, lineHeight: 1.1, uppercase: false, fill: "#141414", shadow: "none", x: 60, w: 960 },
};
/* the emphasis word inside a caption (a word with em: true): serif italic in the accent */
export const EMPHASIS = { font: "Instrument Serif", weight: 400, italic: true, scale: 1.2 };
export const ENTER_TYPES = ["none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight", "pop", "blur", "sweep", "grow", "maskUp", "unfold"];
export const EASES = ["none", "power1.out", "power2.out", "power3.out", "power4.out", "back.out(1.6)", "expo.out", "sine.inOut", "power2.inOut", "power2.in", "power3.in"];
const CLASS_OF = { cta: "lockup" };

/* ------------------------------------------------------------------ helpers */
/* every clip that renders: groups are opened here, so the output never knows they exist */
export function visibleClips(p) {
  return allClips(p).filter((c) => clipVisible(p, c));
}
export function baseVars(c) {
  if (c.type === "caption") return { x: 0, y: 0, scale: num(c.scale, 1), rotation: num(c.rotation), opacity: num(c.opacity, 1), transformOrigin: "50% 50%" };
  return { x: num(c.x), y: num(c.y), scale: num(c.scale, 1), rotation: num(c.rotation), opacity: num(c.opacity, 1), transformOrigin: "50% 50%" };
}
function effectsFilter(c) {
  const e = c.effects || {}; const parts = [];
  if (e.blur) parts.push(`blur(${num(e.blur)}px)`);
  if (e.brightness != null && e.brightness !== 1) parts.push(`brightness(${num(e.brightness, 1)})`);
  if (e.contrast != null && e.contrast !== 1) parts.push(`contrast(${num(e.contrast, 1)})`);
  if (e.saturate != null && e.saturate !== 1) parts.push(`saturate(${num(e.saturate, 1)})`);
  if (e.grayscale) parts.push(`grayscale(${num(e.grayscale)})`);
  return parts.join(" ");
}
export function fontsUsed(p) {
  const set = new Map();
  const add = (fam, w, it) => { const e = resolveFont(fam, w, it); set.set(e.file, e); };
  for (const c of visibleClips(p)) {
    if (c.type === "text") add(c.font, c.weight, c.italic);
    if (c.type === "caption") {
      const s = CAPTION_SYS[c.sys] || CAPTION_SYS.capFace; add(c.font || s.font, c.weight || s.weight, c.italic ?? s.italic);
      if ((c.words || []).some((w) => w.em)) add(EMPHASIS.font, EMPHASIS.weight, EMPHASIS.italic);
    }
    if (c.type === "chapter") { add("JetBrains Mono", 600, false); add("Inter", 800, false); }
    if (c.type === "cta") { add("Inter", 800, false); add("Inter", 900, false); }
  }
  if (p.watermark?.on) add("Inter", 800, false);
  if (hasScenes(p)) for (const s of Object.values(CAPTION_SYS)) add(s.font, s.weight, s.italic);
  return [...set.values()];
}
/* a caption's base colour: its own fill when it differs from the old white default on a dark-ink system */
export const captionFill = (c) => { const sys = CAPTION_SYS[c.sys] || CAPTION_SYS.capFace; return c.fill && !(sys.fill !== "#FFFFFF" && /^#fff(fff)?$/i.test(c.fill)) ? c.fill : sys.fill; };
const trackIdx = (p, c) => { const ti = trackIndex(p, c.track); return c.type === "caption" ? 11 : c.type === "audio" ? 300 + ti : 100 + ti; };

/* ------------------------------------------------------------------ per-clip css + html */
/* DIRECTIONAL MOTION BLUR (a 30 fps render reads less smooth than a 60 Hz screen without it). A clip with `mblur` owns one SVG filter, <feGaussianBlur stdDeviation="x y">, referenced from its CSS
   filter. The compiler tweens the two deviations along the axis of travel only: vertical for rises, drops and unfolds,
   horizontal for slides in from the side, and for keyframed x / y moves an amount taken from the per-frame displacement
   (about half of it, a 180 degree shutter), decaying as the move settles or building into an exit. A round CSS blur() was
   the old approximation; a smear along the motion reads as camera blur. The "blur" enter/exit types keep owning the CSS
   filter and never get the SVG filter. */
export const hasMotionBlur = (c) => num(c.mblur, 0) > 0 && (c.type === "text" || c.type === "shape" || c.type === "image" || c.type === "video") && c.enter?.type !== "blur" && c.exit?.type !== "blur";
const mbSel = (c) => `#mbg-${c.id}`;
export function clipStyle(p, c) {
  const z = zIndexOf(p, c);
  const s = [`position:absolute`, `left:0`, `top:0`, `width:${px(c.w)}`, `height:${px(c.h)}`, `z-index:${z}`];
  const fx = [hasMotionBlur(c) ? `url(#mb-${c.id})` : "", effectsFilter(c)].filter(Boolean).join(" "); if (fx) s.push(`filter:${fx}`);
  if (c.type === "video" || c.type === "image") {
    s.push(`object-fit:${c.fit || "cover"}`, `display:block`);
    if (c.radius) s.push(`border-radius:${px(c.radius)}`);
    if (c.stroke?.width) s.push(`outline:${px(c.stroke.width)} solid ${c.stroke.color || "#fff"}`, `outline-offset:-${px(c.stroke.width)}`);
  }
  if (c.type === "shape") {
    s.push(`background:${c.fill || "#fff"}`, `border-radius:${c.shape === "ellipse" ? "50%" : px(c.radius || 0)}`);
    if (c.stroke?.width) s.push(`border:${px(c.stroke.width)} solid ${c.stroke.color || "#fff"}`);
  }
  if (c.type === "text") {
    const f = resolveFont(c.font, c.weight, c.italic);
    const j = c.valign === "top" ? "flex-start" : c.valign === "bottom" ? "flex-end" : "center";
    const a = c.align === "left" ? "flex-start" : c.align === "right" ? "flex-end" : "center";
    s.push(`display:flex`, `flex-direction:column`, `justify-content:${j}`, `align-items:${a}`,
      `font:${f.style === "italic" ? "italic " : ""}${f.weight} ${px(c.size)}/${num(c.lineHeight, 1.15)} "${f.family}",${fallbackStack(f)}`,
      `color:${c.fill || "#fff"}`, `text-align:${c.align || "center"}`,
      `letter-spacing:${num(c.letterSpacing)}em`, `text-transform:${c.uppercase ? "uppercase" : "none"}`,
      `text-shadow:${SHADOWS[c.shadow] || SHADOWS.none}`, `overflow:visible`);
  }
  if (c.type === "caption") {
    // captions carry their position in CSS (top/left)
    const sys = CAPTION_SYS[c.sys] || CAPTION_SYS.capFace;
    const f = resolveFont(c.font || sys.font, c.weight || sys.weight, c.italic ?? sys.italic);
    s[1] = `left:${px(c.x)}`; s[2] = `top:${px(c.y)}`;
    s.push(`text-align:${c.align || sys.align || "center"}`, `color:${captionFill(c)}`,
      `font:${f.style === "italic" ? "italic " : ""}${f.weight} ${px(c.size || sys.size)}/${sys.lineHeight} "${f.family}",${fallbackStack(f)}`,
      `text-transform:${(c.uppercase ?? sys.uppercase) ? "uppercase" : "none"}`, `text-shadow:${SHADOWS[c.shadow || sys.shadow || "none"] || "none"}`);
    // the seam system sits on a white pill: the box hugs the text
    if (sys.pill) s.push(`height:auto`, `background:#FFFFFF`, `border-radius:22px`, `padding:14px 24px`, `box-shadow:0 10px 30px rgba(0,0,0,.15)`);
  }
  if (c.type === "chapter") {
    s.push(`display:flex`, `flex-direction:column`, `align-items:center`, `justify-content:center`, `text-align:center`, `overflow:hidden`,
      `border-radius:${px(c.radius ?? 26)}`, `background:linear-gradient(180deg,${c.ground || "#0B1220"} 0%,${c.ground2 || "#0A0D14"} 100%)`,
      `border:2px solid rgba(255,255,255,.12)`, `box-shadow:0 26px 70px rgba(0,0,0,.65)`);
  }
  if (c.type === "cta") s.push(`text-align:center`);
  return s.join(";");
}

/* one clip -> one or more root elements. opts.assetBase prefixes project-relative media paths
   ("../" in variants/, "" at the reels root, "/reels/" in the editor); opts.srcMap swaps proxies. */
export function clipElements(p, c, opts = {}) {
  const base = opts.assetBase ?? "../";
  const src = (s) => { const m = opts.srcMap && opts.srcMap[s]; return m ? m : base + s; };
  const cls = CLASS_OF[c.type] || c.type;
  const klass = c.type === "caption" ? `${c.sys || "capFace"} cap clip cr-caption` : `clip cr-${cls}`;
  // graphics clips start 1 ms early: a start stored as r3(frame / fps) can round UP past its frame (48.7667 -> 48.767),
  // which made a clip appear one frame late and linger one frame into the next scene. Media keeps its exact start.
  const GRAPHIC = c.type === "text" || c.type === "shape" || c.type === "image" || c.type === "caption" || c.type === "chapter" || c.type === "cta";
  // plain video clips get the same 1 ms lead (measured on exact render frames): a clip starting at 11.167 appeared on
  // frame 336 (11.2 s) because frame 335 sits at 11.1667 < 11.167, leaving one frame of bare stage; and a clip ending
  // exactly on a boundary showed on the boundary frame while a graphic ending 1 ms early did not.
  // The 1 ms lead moves both edges: it lands the first frame on time and clears the boundary frame. The facecam block keeps
  // its exact start (its own path, start 0); data-media-start stays exact, a 1 ms media offset is invisible.
  const startAttr = (GRAPHIC || c.type === "video") && c.start > 0 ? f3(r3(c.start - 0.001)) : f3(c.start);
  // a graphic clip AT 0 cannot start early, so it ends 1 ms early instead: butt-joined cues on one track stay touching
  const durAttr = GRAPHIC && c.start <= 0 ? f3(r3(c.duration - 0.001)) : f3(c.duration);
  const common = `id="${c.id}" class="${klass}" data-start="${startAttr}" data-duration="${durAttr}" data-track-index="${trackIdx(p, c)}"`;
  const media = (c.mediaStart > 0.0005) ? ` data-media-start="${f3(c.mediaStart)}"` : "";
  const style = ` style="${esc(clipStyle(p, c))}"`;
  // the clip's own motion-blur filter, a zero-size svg beside it (a wide filter region so the smear is never clipped)
  const mbDef = hasMotionBlur(c) ? [{ id: `mb-${c.id}`, html: `<svg id="mbsvg-${c.id}" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs><filter id="mb-${c.id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur id="mbg-${c.id}" stdDeviation="0 0"/></filter></defs></svg>` }] : [];
  const one = (html) => [{ id: c.id, html }, ...mbDef];
  switch (c.type) {
    case "video": {
      const audio = c.audio ? ` data-has-audio="true" data-volume="${f3(num(c.volume, 1))}"` : ` muted`;
      return one(`<video ${common}${audio} playsinline preload="auto"${media} src="${esc(src(c.src))}"${style}></video>`);
    }
    case "image": return one(`<img ${common} src="${esc(src(c.src))}" alt=""${style}/>`);
    case "audio": return one(`<audio ${common} data-volume="${f3(num(c.volume, 1))}"${media} src="${esc(src(c.src))}"></audio>`);
    case "shape": return one(`<div ${common}${style}></div>`);
    case "text": {
      const pill = c.pill ? `background:${c.pill.color || "rgba(0,0,0,.6)"};border-radius:${px(c.pill.radius ?? 18)};padding:${px(c.pill.padY ?? 10)} ${px(c.pill.padX ?? 22)};` : "";
      const lines = String(c.text ?? "").split("\n").map(esc).join("<br>");
      return one(`<div ${common}${style}><span style="display:inline-block;white-space:pre-wrap;max-width:100%;${pill}">${lines}</span></div>`);
    }
    case "caption": {
      const words = (c.words || []).map((w, i) => `<span id="${c.id}w${i}"${w.em ? ` class="em"` : ""} data-ws="${f3(w.start)}" data-we="${f3(w.end)}">${esc(w.text)}</span>`).join("&#8203;");
      return one(`<div ${common} data-kh="${esc(c.lit || "#2B59FF")}" data-kb="${esc(captionFill(c))}"${style}>${words}</div>`);
    }
    case "chapter": {
      const icon = c.icon ? `<span class="chapicon" style="display:inline-grid;place-items:center;width:180px;height:180px;border-radius:56px;background:#141C2B;border:2px solid #33465E;box-shadow:0 26px 70px rgba(0,0,0,.6)"><img src="${esc(src(c.icon))}" alt="" style="width:62%;height:62%;object-fit:contain"/></span>` : "";
      return one(`<div ${common}${style}>` +
        `<div class="chapeye" style="font:600 26px/1 &quot;JetBrains Mono&quot;,ui-monospace,monospace;letter-spacing:.30em;color:${esc(c.accent || "#FFB020")};opacity:.95;margin-bottom:26px">${esc(c.eyebrow || "")}</div>` +
        icon +
        `<div class="chapname" style="margin-top:26px;font:800 78px/1.04 &quot;Inter&quot;,&quot;Segoe UI&quot;,sans-serif;color:${esc(c.accent || "#FFB020")};letter-spacing:-.02em;text-shadow:0 3px 16px rgba(0,0,0,.6);padding:0 90px">${esc(c.name || "")}</div>` +
        `<i class="chapbar" style="display:block;width:132px;height:8px;border-radius:5px;background:${esc(c.accent || "#FFB020")};margin:28px auto 0"></i></div>`);
    }
    case "cta": {
      const kw = String(c.keyword || "").toUpperCase();
      // lh1 / lh2 (with size1 / size2 in baseCss): a compact lockup for a take where the only free lane is the
      // narrow band between the watermark and your head
      const lh1 = num(c.lh1, 104), lh2 = num(c.lh2, 200);
      return one(`<div ${common}${style}>` +
        `<div class="cta1" style="height:${lh1}px;line-height:${lh1}px;opacity:0">${esc(c.line1 || "Comment")}</div>` +
        `<div class="cta2" style="height:${lh2}px;line-height:${lh2}px;opacity:0">&ldquo;${esc(kw)}&rdquo;</div></div>`);
    }
    case "facecam": {
      const z = zIndexOf(p, c);
      // the facecam video takes the fixed lane 2: HyperFrames reads data-track-index as a lane
      const vid = `<video id="fcvid" class="clip"${c.audio ? ` data-has-audio="true" data-volume="${f3(num(c.volume, 1))}"` : " muted"} playsinline preload="auto" data-start="${f3(c.start)}" data-duration="${f3(c.duration)}" data-track-index="2"${media} src="${esc(src(c.src))}"></video>`;
      const b = windowRect(c, "bubble", p.width, p.height);
      const ring = `<div id="fcring" style="z-index:${z + 1};left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)};box-shadow:0 0 0 10px ${esc(c.bubble?.ring || "#2B59FF")},0 20px 50px rgba(0,0,0,.3)"></div>`;
      return [{ id: "fcwrap", html: `<div id="fcwrap" data-cr="${c.id}" style="z-index:${z}">${vid}</div>` }, { id: "fcring", html: ring }];
    }
  }
  return [];
}
export function clipHtml(p, c, opts = {}) { return clipElements(p, c, opts).map((e) => e.html).join("\n"); }

/* ------------------------------------------------------------------ motion ops */
const ENTER = {
  fade: (b) => [{ opacity: 0 }, { opacity: b.opacity }],
  slideUp: (b) => [{ opacity: 0, y: b.y + 60 }, { opacity: b.opacity, y: b.y }],
  slideDown: (b) => [{ opacity: 0, y: b.y - 60 }, { opacity: b.opacity, y: b.y }],
  slideLeft: (b) => [{ opacity: 0, x: b.x + 90 }, { opacity: b.opacity, x: b.x }],
  slideRight: (b) => [{ opacity: 0, x: b.x - 90 }, { opacity: b.opacity, x: b.x }],
  pop: (b) => [{ opacity: 0, scale: b.scale * 0.8 }, { opacity: b.opacity, scale: b.scale }, "back.out(1.6)"],
  blur: (b) => [{ opacity: 0, filter: "blur(14px)" }, { opacity: b.opacity, filter: "blur(0px)" }],
  sweep: () => [{ scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, transformOrigin: "0% 50%" }, "power1.inOut"],
  grow: () => [{ scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, transformOrigin: "50% 100%" }, "power2.out"],
  // the headline style: the word rises through a horizontal mask fixed at the box's
  // bottom edge; y and the inset move together so the mask line never moves. Ease-out, zero overshoot.
  maskUp: (b, c) => [{ y: b.y + Math.max(40, num(c?.h, 120)), clipPath: "inset(100% 0% 0% 0%)" }, { y: b.y, clipPath: "inset(0% 0% 0% 0%)" }, "power3.out"],
  // TABLOID sticker: unfolds from a flat line at its centre, small elastic settle
  unfold: () => [{ scaleY: 0, transformOrigin: "50% 50%" }, { scaleY: 1, transformOrigin: "50% 50%" }, "back.out(2)"],
};
const EXIT = {
  fade: (b) => [{ opacity: b.opacity }, { opacity: 0 }],
  slideUp: (b) => [{ opacity: b.opacity, y: b.y }, { opacity: 0, y: b.y - 60 }],
  slideDown: (b) => [{ opacity: b.opacity, y: b.y }, { opacity: 0, y: b.y + 60 }],
  slideLeft: (b) => [{ opacity: b.opacity, x: b.x }, { opacity: 0, x: b.x - 90 }],
  slideRight: (b) => [{ opacity: b.opacity, x: b.x }, { opacity: 0, x: b.x + 90 }],
  pop: (b) => [{ opacity: b.opacity, scale: b.scale }, { opacity: 0, scale: b.scale * 0.8 }, "power2.in"],
  blur: (b) => [{ opacity: b.opacity, filter: "blur(0px)" }, { opacity: 0, filter: "blur(14px)" }],
  sweep: () => [{ scaleX: 1, transformOrigin: "100% 50%" }, { scaleX: 0, transformOrigin: "100% 50%" }, "power1.inOut"],
  grow: () => [{ scaleY: 1, transformOrigin: "50% 100%" }, { scaleY: 0, transformOrigin: "50% 100%" }, "power2.in"],
  maskDown: (b, c) => [{ y: b.y, clipPath: "inset(0% 0% 0% 0%)" }, { y: b.y + Math.max(40, num(c?.h, 120)), clipPath: "inset(100% 0% 0% 0%)" }, "power2.in"],
  unfold: () => [{ scaleY: 1, transformOrigin: "50% 50%" }, { scaleY: 0, transformOrigin: "50% 50%" }, "power2.in"],
};
const KF_PROPS = ["x", "y", "scale", "rotation", "opacity"];

/* returns { init: [{sel, vars}], tweens: [{kind, sel, from, to, at}], raw: [code] } */
export function compileOps(p) {
  const init = [], tweens = [], raw = [];
  for (const c of visibleClips(p)) {
    if (!isVisual(c)) continue;
    const sel = `#${c.id}`, b = baseVars(c), s = c.start, e = clipEnd(c), d = c.duration;
    if (c.type === "facecam") { facecamOps(p, c, init, tweens, raw); continue; }
    init.push({ sel, vars: b });
    // c.mblur (px): the peak motion blur on this clip's fast moves, directional. Never on the "blur" types, they own
    // the CSS filter.
    const mb = hasMotionBlur(c) ? num(c.mblur, 0) : 0;
    const fps = p.fps || 30;
    const dev = (axis, n) => (axis === "x" ? `${f3num(n)} 0` : axis === "y" ? `0 ${f3num(n)}` : `${f3num(n)} ${f3num(n)}`);
    // blur that decays as the move settles (an entrance, an ease-out segment) or builds into a fast exit (an ease-in)
    const smear = (axis, amount, dur, at, mode) => {
      if (!(mb > 0) || amount < 1.5 || dur <= 0) return;
      const a = Math.round(Math.min(amount, mb * 3) * 10) / 10;
      // immediateRender:false on every smear: a GSAP fromTo renders its from-state the moment the timeline is built,
      // so a mid-clip drop showed its blur from the clip's first frame
      const IR = { immediateRender: false };
      if (mode === "in") tweens.push({ kind: "fromTo", sel: mbSel(c), from: { attr: { stdDeviation: dev(axis, 0) } }, to: { attr: { stdDeviation: dev(axis, a) }, duration: r3(dur), ease: "power2.in", ...IR }, at: r3(at) });
      else if (mode === "inOut") { const h = r3(dur / 2); tweens.push({ kind: "fromTo", sel: mbSel(c), from: { attr: { stdDeviation: dev(axis, 0) } }, to: { attr: { stdDeviation: dev(axis, a) }, duration: h, ease: "power1.in", ...IR }, at: r3(at) }, { kind: "fromTo", sel: mbSel(c), from: { attr: { stdDeviation: dev(axis, a) } }, to: { attr: { stdDeviation: dev(axis, 0) }, duration: h, ease: "power1.out", ...IR }, at: r3(at + h) }); }
      else tweens.push({ kind: "fromTo", sel: mbSel(c), from: { attr: { stdDeviation: dev(axis, a) } }, to: { attr: { stdDeviation: dev(axis, 0) }, duration: r3(dur * 0.85), ease: "power2.out", ...IR }, at: r3(at) });
    };
    const kfProps = new Set();
    for (const k of KF_PROPS) {
      const list = (c.keyframes || {})[k]; if (!list || !list.length) continue;
      kfProps.add(k);
      const sorted = [...list].sort((a, z) => a.t - z.t);
      tweens.push({ kind: "set", sel, to: { [k]: sorted[0].v }, at: r3(s) });
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], z = sorted[i];
        const dur = Math.max(0.001, r3(z.t - a.t));
        const ease = z.ease || "power2.inOut";
        tweens.push({ kind: "fromTo", sel, from: { [k]: a.v }, to: { [k]: z.v, duration: dur, ease }, at: r3(s + a.t) });
        // a keyframed x / y move under 0.8 s that travels 40 px or more smears along its axis: about half the
        // per-frame displacement, capped at three times the clip's mblur
        if ((k === "x" || k === "y") && Math.abs(z.v - a.v) >= 40 && dur <= 0.8) {
          const perFrame = Math.abs(z.v - a.v) / Math.max(1, dur * fps);
          // an ease-in keyframe move ends fast INSIDE the clip (a fall, a snap): blur up then down, never left on
          const mode = /inOut/.test(ease) ? "inOut" : /\.in\b|\.in\(|\.in$/.test(ease) ? "inOut" : "out";
          smear(k, perFrame * 0.5, dur, s + a.t, mode);
        }
      }
    }
    const strip = (o) => { const r = { ...o }; for (const k of kfProps) delete r[k]; return r; };
    const en = c.enter || {}, ex = c.exit || {};
    const axisOf = (type) => (/^(slideLeft|slideRight)$/.test(type) ? "x" : /^(slideUp|slideDown|maskUp|maskDown|unfold|grow)$/.test(type) ? "y" : "xy");
    if (en.type && en.type !== "none" && ENTER[en.type]) {
      const [from, to, ease] = ENTER[en.type](b, c);
      const dur = Math.min(num(en.dur, 0.4), d);
      tweens.push({ kind: "fromTo", sel, from: strip(from), to: { ...strip(to), duration: r3(dur), ease: en.ease || ease || "power3.out" }, at: r3(s) });
      if (/^(slide|mask|unfold|grow)/.test(en.type)) smear(axisOf(en.type), mb, dur, s, "out");
    }
    if (ex.type && ex.type !== "none" && EXIT[ex.type]) {
      const [from, to, ease] = EXIT[ex.type](b, c);
      const dur = Math.min(num(ex.dur, 0.3), d);
      tweens.push({ kind: "fromTo", sel, from: strip(from), to: { ...strip(to), duration: r3(dur), ease: ex.ease || ease || "power2.in" }, at: r3(e - dur) });
      if (/^(slide|mask|unfold|grow)/.test(ex.type)) smear(axisOf(ex.type), mb, dur, e - dur, "in");
      // the hard kill on the boundary (HyperFrames lint gsap_exit_missing_hard_kill)
      tweens.push({ kind: "set", sel, to: strip(to), at: r3(e) });
    }
    if (c.type === "caption") {
      const lit = c.lit || "#2B59FF", base = captionFill(c);
      (c.words || []).forEach((w, i) => {
        const ws = `#${c.id}w${i}`;
        // the emphasis word lights up and stays lit; every other word lights while it is spoken
        tweens.push({ kind: "set", sel: ws, to: { color: lit }, at: r3(Math.max(s, w.start)) });
        // hold: true keeps every word lit once spoken (the paper style: grey arrives, settles to ink, stays)
        if (!w.em && !c.hold) tweens.push({ kind: "set", sel: ws, to: { color: base }, at: r3(Math.min(e, w.end)) });
      });
    }
    if (c.type === "chapter") {
      // develop-in: card rises, icon pops, bar draws, a slow hold drift, out on the boundary
      const hold = Math.max(0.6, d - 0.4);
      tweens.push({ kind: "fromTo", sel, from: { opacity: 0, y: b.y + 34, scale: b.scale * 0.94 }, to: { opacity: b.opacity, y: b.y, scale: b.scale, duration: 0.46, ease: "power3.out" }, at: r3(s + 0.1) });
      tweens.push({ kind: "fromTo", sel: `${sel} .chapicon`, from: { scale: 0.72, rotate: -8 }, to: { scale: 1, rotate: 0, duration: 0.55, ease: "back.out(1.7)" }, at: r3(s + 0.16) });
      tweens.push({ kind: "fromTo", sel: `${sel} .chapbar`, from: { scaleX: 0, transformOrigin: "center" }, to: { scaleX: 1, transformOrigin: "center", duration: 0.42, ease: "power2.out" }, at: r3(s + 0.34) });
      if (c.hold !== false) tweens.push({ kind: "to", sel, to: { y: b.y - 26, duration: r3(hold), ease: "none" }, at: r3(s + 0.1) });
      // the exit keeps its momentum: the card rises out, grows a touch and blurs as it goes. Nothing just fades.
      tweens.push({ kind: "to", sel, to: { y: b.y - 120, scale: b.scale * 1.05, filter: "blur(10px)", opacity: 0, duration: 0.26, ease: "power2.in" }, at: r3(Math.max(s + 0.5, e - 0.26)) });
      tweens.push({ kind: "set", sel, to: { opacity: 0 }, at: r3(e) });
    }
    if (c.type === "cta") {
      // line 1 then line 2, 0.24s apart, y 20 -> 0 + scale .9 -> 1, one slow glow pulse, nothing else
      tweens.push({ kind: "fromTo", sel: `${sel} .cta1`, from: { opacity: 0, y: 20, scale: 0.9 }, to: { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: "power2.out" }, at: r3(s + 0.35) });
      tweens.push({ kind: "fromTo", sel: `${sel} .cta2`, from: { opacity: 0, y: 20, scale: 0.9 }, to: { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: "power2.out" }, at: r3(s + 0.59) });
      if (c.pulse !== false && d > 1.6) tweens.push({ kind: "fromTo", sel: `${sel} .cta2`, from: { scale: 1 }, to: { scale: 1.03, duration: r3(Math.max(0.6, (d - 1.2) / 2)), ease: "sine.inOut", yoyo: true, repeat: 1 }, at: r3(s + 1.0) });
    }
  }
  tweens.sort((a, z) => a.at - z.at);
  return { init, tweens, raw };
}
/* THE FACECAM BLOCK: the window IS the transition (styles/window/STYLE.md, Movement).
   Each scene change moves the window from the old state's rectangle to the new one in `move`
   seconds: shrink into the stack window, collapse into the bubble, drop out of the frame, grow
   back to full. The bubble carries its accent ring. */
/* The window is the full-frame video, scaled and moved with a transform, and cut to the window's
   shape with a clip-path. Both interpolate sub-pixel, so a slow move never judders (left/top/width
   snap to whole pixels under frame-by-frame capture). For a small window the video is scaled to
   cover it and slid so the focus point (your eyes) sits in the middle of the window. */
export function windowXform(c, state, W = 1080, H = 1920) {
  const R = windowRect(c, state === "none" ? "stack" : state, W, H);
  if (state === "full") return { x: 0, y: 0, scale: 1, clipPath: "inset(0px 0px 0px 0px round 0px)" };
  const s = Math.max(R.w / W, R.h / H);
  const fx = num(c.focus?.x, 50) / 100, fy = num(c.focus?.y, 38) / 100;
  const clampT = (t, lo, size, span) => Math.min(lo, Math.max(lo + span - size, t));
  const tx = clampT(R.x + R.w / 2 - fx * W * s, R.x, W * s, R.w);
  let ty = clampT(R.y + R.h / 2 - fy * H * s, R.y, H * s, R.h);
  const k = (v) => Math.round(v * 100) / 100;
  const clip = `inset(${k((R.y - ty) / s)}px ${k(W - (R.x + R.w - tx) / s)}px ${k(H - (R.y + R.h - ty) / s)}px ${k((R.x - tx) / s)}px round ${k(R.r / s)}px)`;
  if (state === "none") ty += H - R.y + 60;   // the stack window, dropped below the frame
  return { x: k(tx), y: k(ty), scale: +s.toFixed(5), clipPath: clip };
}
function facecamOps(p, c, init, tweens) {
  const spans = sceneSpans(p);
  const W = p.width || 1080, H = p.height || 1920;
  const move = Math.max(0.05, num(c.move, 0.5));
  const first = spans[0]?.state || "full";
  init.push({ sel: "#fcwrap", vars: { ...windowXform(c, first, W, H), transformOrigin: "0 0", opacity: 1 } });
  init.push({ sel: "#fcring", vars: { opacity: first === "bubble" ? 1 : 0, scale: 1, transformOrigin: "50% 50%" } });
  // "none" keeps the shape it left in (or will arrive in) and sits below the frame: the window
  // drops out as it is and rises back in already shaped, it never morphs while off screen
  const dropped = (st) => { const v = windowXform(c, st, W, H); const r = windowRect(c, st, W, H); return { ...v, y: Math.round((v.y + H - r.y + 60) * 100) / 100 }; };
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1], s = spans[i];
    // a boundary stored as r3(frame / fps) can round UP past the frame it names, so fire 1 ms early
    const t = r3(s.t - 0.001);
    const dur = r3(Math.min(move, s.dur * 0.8));
    // leaving the frame accelerates out; everything else lands with a small overshoot
    const ease = s.state === "none" ? "power2.in" : a.state === "none" ? "power3.out" : "back.out(1.15)";
    const from = a.state === "none" ? dropped(s.state) : windowXform(c, a.state, W, H);
    const to = s.state === "none" ? dropped(a.state) : windowXform(c, s.state, W, H);
    tweens.push({ kind: "fromTo", sel: "#fcwrap", from, to: { ...to, duration: dur, ease, immediateRender: false }, at: t });
    // the bubble's ring lands with the circle (second half of the move) and pops off when it leaves
    const half = r3(dur / 2);
    if (s.state === "bubble") tweens.push({ kind: "fromTo", sel: "#fcring", from: { opacity: 0, scale: 1.12 }, to: { opacity: 1, scale: 1, duration: half, ease: "power2.out", immediateRender: false }, at: r3(t + half) });
    else if (a.state === "bubble") tweens.push({ kind: "fromTo", sel: "#fcring", from: { opacity: 1, scale: 1 }, to: { opacity: 0, scale: 0.9, duration: r3(Math.min(0.15, half)), ease: "power2.in", immediateRender: false }, at: t });
  }
}

const jsVal = (v) => (typeof v === "string" ? JSON.stringify(v) : typeof v === "boolean" ? String(v) : v && typeof v === "object" ? jsObj(v) : f3num(v));
const jsObj = (o) => "{" + Object.entries(o).map(([k, v]) => `${k}:${jsVal(v)}`).join(",") + "}";
const f3num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
export function serializeOps(ops) {
  const out = [...(ops.raw || [])];
  for (const i of ops.init) out.push(`gsap.set(${JSON.stringify(i.sel)},${jsObj(i.vars)});`);
  for (const t of ops.tweens) {
    if (t.kind === "set") out.push(`tl.set(${JSON.stringify(t.sel)},${jsObj(t.to)},${f3(t.at)});`);
    else if (t.kind === "fromTo") out.push(`tl.fromTo(${JSON.stringify(t.sel)},${jsObj(t.from)},${jsObj(t.to)},${f3(t.at)});`);
    else if (t.kind === "to") out.push(`tl.to(${JSON.stringify(t.sel)},${jsObj(t.to)},${f3(t.at)});`);
  }
  return out.join("\n");
}
/* the browser side: build a real GSAP timeline from the same ops */
export function applyOps(ops, gsap, tl) {
  for (const i of ops.init) gsap.set(i.sel, i.vars);
  for (const t of ops.tweens) {
    if (t.kind === "set") tl.set(t.sel, t.to, t.at);
    else if (t.kind === "fromTo") tl.fromTo(t.sel, t.from, t.to, t.at);
    else if (t.kind === "to") tl.to(t.sel, t.to, t.at);
  }
  return tl;
}

/* ------------------------------------------------------------------ the document */
export function baseCss(p) {
  const W = p.width, H = p.height;
  const fc = facecamOf(p);
  const capFont = (k) => { const s = CAPTION_SYS[k]; const f = resolveFont(s.font, s.weight, s.italic); return `${f.style === "italic" ? "italic " : ""}${f.weight} ${s.size}px/${s.lineHeight} "${f.family}",${fallbackStack(f)}`; };
  const ctas = p.clips.filter((c) => c.type === "cta"); const brand = ctas.length ? ctas[ctas.length - 1].brand || "#2B59FF" : "#2B59FF";
  // `ink`: line 1's colour, white by default; a dark ink when the lockup sits on a light ground (a pale wall above your head)
  const ctaInk = ctas.length ? ctas[ctas.length - 1].ink || "#FFFFFF" : "#FFFFFF";
  const ctaInkShadow = /^#f{6}$/i.test(ctaInk) ? "0 3px 16px rgba(0,0,0,.7)" : "0 2px 10px rgba(0,0,0,.22)";
  // the lockup's sizes: 54/104 and 108/200 unless the block sets size1 lh1 size2 lh2 (a compact lockup)
  const lastCta = ctas.length ? ctas[ctas.length - 1] : {};
  const ctaSz = [num(lastCta.size1, 54), num(lastCta.lh1, 104), num(lastCta.size2, 108), num(lastCta.lh2, 200)];
  return [
    `*{box-sizing:border-box;margin:0;padding:0}`,
    `html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}`,
    `#root{position:relative;overflow:hidden;width:${W}px;height:${H}px;background:${p.background || "#000"}}`,
    `.clip{position:absolute}`,
    `.sc{position:absolute;inset:0;pointer-events:none}`,
    `#root>video,#root>img{display:block}`,
    `.cap span,.cap b{font-weight:inherit;color:inherit;padding:0 .16em;-webkit-box-decoration-break:clone;box-decoration-break:clone}`,
    ...Object.keys(CAPTION_SYS).map((k) => `.${k}{font:${capFont(k)}}`),
    (() => { const f = resolveFont(EMPHASIS.font, EMPHASIS.weight, EMPHASIS.italic); return `.cap .em{font:italic ${f.weight} ${EMPHASIS.scale}em/1 "${f.family}",${fallbackStack(f)};letter-spacing:0}`; })(),
    `.cta1{font:800 ${ctaSz[0]}px/${ctaSz[1]}px "Inter","Segoe UI",system-ui,sans-serif;color:${ctaInk};text-shadow:${ctaInkShadow}}`,
    `.cta2{font:900 ${ctaSz[2]}px/${ctaSz[3]}px "Inter","Segoe UI",system-ui,sans-serif;letter-spacing:-.02em;color:${brand};text-shadow:0 0 40px ${brand}E6,0 3px 16px rgba(0,0,0,.55)}`,
    ...(fc ? [
      `#fcwrap{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:#000;transform-origin:0 0}`,
      `#fcwrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
      `#fcring{position:absolute;border-radius:50%;opacity:0}`,
    ] : []),
    `#wm{position:absolute;left:0;right:0;top:${num(p.watermark?.top, 96)}px;text-align:center;z-index:900;font:800 26px "Inter","Segoe UI",system-ui,sans-serif;pointer-events:none}`,
    `#wm span{display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(10,10,10,.55);color:#F2F2F2}`,
  ].join("\n");
}
export function sortedClips(p) {
  // paint order in the DOM mirrors z (bottom track first), then time
  return visibleClips(p).slice().sort((a, b) => (zIndexOf(p, a) - zIndexOf(p, b)) || (a.start - b.start));
}
export function sceneHtml(p) {
  if (!hasScenes(p)) return "";
  return sceneSpans(p).map((s, i) => `  <div class="sc clip${s.state === "none" ? " nf" : s.state === "full" ? " ff" : ""}" id="${s.id}" data-start="${f3(s.t)}" data-duration="${f3(s.dur)}" data-track-index="${1000 + i}"></div>`).join("\n");
}

export function compileHtml(p, opts = {}) {
  const base = opts.assetBase ?? "../";
  const fontBase = opts.fontBase ?? `${base}fonts/`;
  const ops = compileOps(p);
  const clips = sortedClips(p).flatMap((c) => clipElements(p, c, { assetBase: base }).map((e) => "  " + e.html)).join("\n");
  const wm = p.watermark?.on ? `  <div id="wm"><span>${esc(p.watermark.text || "@yourhandle")}</span></div>` : "";
  const dur = f3(p.duration);
  return `<!doctype html>
<!-- ravyn BUILD · ${esc(p.title)} · compiled ${new Date().toISOString().slice(0, 16).replace("T", " ")} from projects/${esc(p.id)}.json
     Do not hand-edit: open the project in ravyn (node ravyn/server.mjs) and recompile. -->
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(p.title)}</title>
<script src="${GSAP_CDN}"></script>
<style>
${fontFaceCss(fontsUsed(p), fontBase)}
${baseCss(p)}
</style></head>
<body><div id="root" class="clip" data-composition-id="${esc(p.id)}" data-width="${p.width}" data-height="${p.height}" data-fps="${p.fps}" data-start="0" data-duration="${dur}" data-track-index="0">
${sceneHtml(p)}
${clips}
${wm}
</div>

<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines[${JSON.stringify(p.id)}] = tl;
${serializeOps(ops)}
tl.set({},{},${dur});
</script>
</body></html>
`;
}
