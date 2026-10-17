// The editor's data model. The project JSON is the only source of truth for a reel.
// Every edit the UI can make is a function here, so the CLI, the tests and the UI share one
// set of rules. Works in Node and in the browser (no imports beyond this folder).
//
// Times are seconds, frame-quantised to the project fps. Geometry is composition pixels.
// x/y are the top-left of the UNTRANSFORMED box; scale and rotation act around the centre.

export const SCHEMA = 1;
export const DEFAULT_FPS = 30;
export const EPS = 1e-4;
export const TYPES = ["video", "image", "text", "shape", "audio", "caption", "facecam", "chapter", "cta", "group"];
/* a GROUP is a container clip (Premiere's nest): its own tracks and clips, kept in REAL reel time, so
   grouping and ungrouping never move a number. One level only; the facecam and CTA blocks stay outside. */
export const GROUPABLE = new Set(["video", "image", "text", "shape", "audio", "caption", "chapter"]);
export const isGroup = (c) => !!c && c.type === "group";
export const rootOf = (p) => p.root || p;
export const MEDIA_TYPES = new Set(["video", "audio", "facecam"]);
export const VISUAL_TYPES = new Set(["video", "image", "text", "shape", "caption", "facecam", "chapter", "cta"]);
export const BLOCK_TYPES = new Set(["facecam", "chapter", "cta"]);

const now = () => new Date().toISOString();
export const r3 = (t) => Math.round(t * 1000) / 1000;
export function quant(t, fps = DEFAULT_FPS) { return r3(Math.round(t * fps) / fps); }
export function frame(t, fps = DEFAULT_FPS) { return Math.round(t * fps); }
export const clipEnd = (c) => r3(c.start + c.duration);
export const isMedia = (c) => MEDIA_TYPES.has(c.type);
export const isVisual = (c) => VISUAL_TYPES.has(c.type);
export const trackKindFor = (type) => (type === "audio" ? "audio" : "video");

export function touch(p) { p.meta = p.meta || {}; p.meta.modified = now(); return p; }

/* ------------------------------------------------------------------ ids */
/* every id in the project: clips, groups, their tracks and clips, root tracks, markers */
export function usedIds(p) {
  const R = rootOf(p); const s = new Set();
  const scanClips = (list) => { for (const c of list || []) { s.add(c.id); if (c.type === "group") { scanClips(c.clips); (c.tracks || []).forEach((t) => s.add(t.id)); } } };
  scanClips(R.clips); (R.tracks || []).forEach((t) => s.add(t.id)); (R.markers || []).forEach((x) => s.add(x.id));
  return s;
}
/* an allocator for a burst of new ids: takes the highest number seen, registers each id it gives */
export function idAllocator(p) {
  const used = usedIds(p);
  return (prefix = "c") => {
    let max = 0;
    for (const id of used) { const mm = String(id).match(new RegExp(`^${prefix}(\\d+)$`)); if (mm) max = Math.max(max, +mm[1]); }
    const id = `${prefix}${max + 1}`; used.add(id); return id;
  };
}
export function nextId(p, prefix = "c") {
  const R = rootOf(p);
  let max = 0;
  const scan = (id) => { const m = String(id || "").match(new RegExp(`^${prefix}(\\d+)$`)); if (m) max = Math.max(max, +m[1]); };
  const scanClips = (list) => { for (const c of list || []) { scan(c.id); if (c.type === "group") { scanClips(c.clips); (c.tracks || []).forEach((t) => scan(t.id)); } } };
  scanClips(R.clips);
  (R.tracks || []).forEach((t) => scan(t.id));
  (R.markers || []).forEach((m) => scan(m.id));
  return `${prefix}${max + 1}`;
}

/* ------------------------------------------------------------------ project */
export function newProject(o = {}) {
  const p = {
    schema: SCHEMA,
    id: o.id || "untitled",
    title: o.title || o.id || "Untitled",
    reel: o.reel ?? null,
    fps: o.fps || DEFAULT_FPS,
    width: o.width || 1080,
    height: o.height || 1920,
    duration: o.duration || 60,
    background: o.background || "#F4F1EA",
    watermark: { on: false, text: "@yourhandle", top: 96, ...(o.watermark || {}) },
    style: o.style !== undefined ? o.style : "window",
    tracks: [],
    clips: [],
    markers: [],
    words: null,
    meta: { created: now(), modified: now(), app: "editor", version: SCHEMA },
  };
  for (const n of ["V1", "V2", "V3"]) addTrack(p, "video", n);
  for (const n of ["A1", "A2"]) addTrack(p, "audio", n);
  return p;
}

/* Fill in anything a hand-written or older project lacks. Safe to call on every load. */
export function normalize(p) {
  p.schema = p.schema || SCHEMA;
  p.fps = p.fps || DEFAULT_FPS;
  p.width = p.width || 1080; p.height = p.height || 1920;
  p.duration = +p.duration || 60;
  p.background = p.background || "#F4F1EA";
  p.watermark = { on: false, text: "@yourhandle", top: 96, ...(p.watermark || {}) };
  p.tracks = p.tracks || []; p.clips = p.clips || []; p.markers = p.markers || [];
  p.meta = p.meta || { created: now(), modified: now(), app: "editor", version: SCHEMA };
  if (!p.tracks.some((t) => t.kind === "video")) addTrack(p, "video", "V1");
  if (!p.tracks.some((t) => t.kind === "audio")) addTrack(p, "audio", "A1");
  p.tracks.forEach((t) => { t.locked = !!t.locked; t.hidden = !!t.hidden; t.muted = !!t.muted; });
  p.clips = p.clips.map((c) => defaultClip(c.type, c, p, true));
  for (const g of p.clips) if (g.type === "group") {
    g.tracks = g.tracks || []; g.tracks.forEach((t) => { t.locked = !!t.locked; t.hidden = !!t.hidden; t.muted = !!t.muted; });
    g.clips = (g.clips || []).filter((c) => c.type !== "group").map((c) => defaultClip(c.type, c, p, true));
  }
  normalizeGroups(p);
  return p;
}

/* ------------------------------------------------------------------ tracks */
export function newTrack(kind, name) {
  return { id: null, kind, name: name || "", locked: false, hidden: false, muted: false };
}
export function tracksOf(p, kind) { return p.tracks.filter((t) => t.kind === kind); }
export const videoTracks = (p) => tracksOf(p, "video");
export const audioTracks = (p) => tracksOf(p, "audio");
export function trackById(p, id) {
  let t = p.tracks.find((x) => x.id === id); if (t) return t;
  const R = rootOf(p);
  if (R !== p) { t = R.tracks.find((x) => x.id === id); if (t) return t; }
  for (const g of R.clips) if (g.type === "group") { const k = (g.tracks || []).find((x) => x.id === id); if (k) return k; }
  return null;
}
export function groupOf(p, clipId) { const R = rootOf(p); for (const g of R.clips) if (g.type === "group" && g.clips.some((c) => c.id === clipId)) return g; return null; }
export function groupOfTrack(p, trackId) { const R = rootOf(p); for (const g of R.clips) if (g.type === "group" && (g.tracks || []).some((t) => t.id === trackId)) return g; return null; }
/* index among tracks of the same kind: video 0 = bottom of the stack */
export function trackIndex(p, id) {
  const t = trackById(p, id); if (!t) return -1;
  const R = rootOf(p);
  if (R.tracks.includes(t)) return R.tracks.filter((x) => x.kind === t.kind).indexOf(t);
  const g = groupOfTrack(R, id); if (g) return g.tracks.filter((x) => x.kind === t.kind).indexOf(t);
  return p.tracks.filter((x) => x.kind === t.kind).indexOf(t);
}

export function addTrack(p, kind, name, at) {
  const t = newTrack(kind, name);
  t.id = nextId(p, kind === "video" ? "v" : "a");
  if (!t.name) t.name = (kind === "video" ? "V" : "A") + (tracksOf(p, kind).length + 1);
  if (at == null || at >= tracksOf(p, kind).length) {
    // append after the last track of this kind so kinds stay grouped
    const same = tracksOf(p, kind);
    const last = same.length ? p.tracks.indexOf(same[same.length - 1]) : (kind === "video" ? -1 : p.tracks.length - 1);
    p.tracks.splice(last + 1, 0, t);
  } else {
    const target = tracksOf(p, kind)[at];
    p.tracks.splice(p.tracks.indexOf(target), 0, t);
  }
  touch(p);
  return t;
}
export function removeTrack(p, id, { deleteClips = false } = {}) {
  const t = trackById(p, id); if (!t) return false;
  const mine = clipsOnTrack(p, id);
  if (mine.length && !deleteClips) return false;
  p.clips = p.clips.filter((c) => c.track !== id);
  p.tracks = p.tracks.filter((x) => x.id !== id);
  if (!tracksOf(p, t.kind).length) addTrack(p, t.kind);
  touch(p); return true;
}
export function moveTrack(p, id, dir) {
  const t = trackById(p, id); if (!t) return false;
  const same = tracksOf(p, t.kind); const i = same.indexOf(t); const j = i + dir;
  if (j < 0 || j >= same.length) return false;
  const a = p.tracks.indexOf(same[i]), b = p.tracks.indexOf(same[j]);
  [p.tracks[a], p.tracks[b]] = [p.tracks[b], p.tracks[a]];
  touch(p); return true;
}
export function renameTrack(p, id, name) { const t = trackById(p, id); if (t) { t.name = name; touch(p); } return !!t; }
export function setTrack(p, id, patch) { const t = trackById(p, id); if (t) { Object.assign(t, patch); touch(p); } return t; }
/* paint order: bottom video track = 10, next = 20 … the watermark sits at 900 */
/* paint order: bottom video track = 10, next = 20 ... a group's children sit just above the group's
   own slot (up to nine distinct layers inside a group; more share the top one). */
export function zIndexOf(p, clip) {
  const R = rootOf(p);
  const g = groupOf(R, clip.id);
  if (g) { const gi = trackIndex(R, g.track); const j = trackIndex(R, clip.track); return 10 + Math.max(0, gi) * 10 + 1 + Math.min(8, Math.max(0, j)); }
  const i = trackIndex(R, clip.track); return 10 + Math.max(0, i) * 10;
}

/* ------------------------------------------------------------------ clips */
export function defaultClip(type, o = {}, p = null, keepId = false) {
  if (!TYPES.includes(type)) throw new Error(`unknown clip type ${type}`);
  const W = p?.width || 1080, H = p?.height || 1920;
  const base = {
    id: keepId && o.id ? o.id : (o.id || (p ? nextId(p, "c") : "c1")),
    track: o.track || null, type, name: o.name || type,
    start: 0, duration: 3,
    x: 0, y: 0, w: W, h: H, rotation: 0, scale: 1, opacity: 1,
    locked: false, label: null,
    enter: { type: "none", dur: 0.4, ease: "power3.out" },
    exit: { type: "none", dur: 0.3, ease: "power2.in" },
    keyframes: {}, effects: {},
  };
  const byType = {
    video: { src: "", mediaStart: 0, mediaDuration: null, fit: "cover", radius: 0, audio: false, volume: 1, mediaWidth: null, mediaHeight: null },
    image: { src: "", fit: "cover", radius: 0, mediaWidth: null, mediaHeight: null },
    text: { text: "Text", font: "Inter", weight: 800, italic: false, size: 64, lineHeight: 1.15, letterSpacing: 0, align: "center", valign: "middle", fill: "#FFFFFF", uppercase: false, shadow: "soft", pill: null, x: 60, y: 800, w: 960, h: 160, hAuto: true },
    shape: { shape: "rect", fill: "#D97757", stroke: null, radius: 0, x: 240, y: 760, w: 600, h: 400 },
    audio: { src: "", mediaStart: 0, mediaDuration: null, volume: 1, fadeIn: 0, fadeOut: 0 },
    caption: { words: [], hold: false, sys: "capFace", fill: "#FFFFFF", lit: "#2B59FF", size: 54, font: "Inter", weight: 800, x: 60, y: 1380, w: 960, h: 90, shadow: "soft" },
    // THE FACECAM BLOCK (styles/window): your camera as a WINDOW that changes shape per scene.
    // full = fills the frame, stack = a rounded window in the bottom half, bubble = a circle in the
    // corner, none = gone. focus = the point of the video (in %) kept centred in a small window.
    facecam: { src: "", mediaStart: 0, mediaDuration: null, focus: { x: 50, y: 38 }, stack: { x: 60, y: 930, w: 960, h: 740, r: 44 }, bubble: { x: 60, y: 1250, size: 400, ring: "#2B59FF" }, move: 0.5, states: [{ t: 0, state: "full" }], volume: 1, audio: false, x: 0, y: 0, w: W, h: H },
    // a chapter card: eyebrow + name
    chapter: { eyebrow: "SKILL 05 / 05", name: "+71% DEMAND", icon: "", accent: "#FFB020", ink: "#F2F5FA", ground: "#0B1220", ground2: "#0A0D14", x: 54, y: 236, w: 972, h: 560, radius: 26, hold: true },
    // the call to action: two lines over your full-frame face
    cta: { line1: "Comment", keyword: "GUIDE", brand: "#2B59FF", x: 0, y: 730, w: W, h: 330, pulse: true },
    group: { tracks: [], clips: [], x: 0, y: 0, w: W, h: H },
  };
  const c = { ...base, ...byType[type], ...o };
  c.enter = { ...base.enter, ...(o.enter || {}) };
  c.exit = { ...base.exit, ...(o.exit || {}) };
  c.keyframes = o.keyframes || {}; c.effects = o.effects || {};
  return c;
}
export function clipById(p, id) {
  let c = p.clips.find((x) => x.id === id); if (c) return c;
  const R = rootOf(p);
  if (R !== p) { c = R.clips.find((x) => x.id === id); if (c) return c; }
  for (const g of R.clips) if (g.type === "group") { const k = g.clips.find((x) => x.id === id); if (k) return k; }
  return null;
}
/* every clip that paints or sounds: root clips plus the children of every group (groups themselves excluded) */
export function allClips(p) { const R = rootOf(p); const out = []; for (const c of R.clips) { if (c.type === "group") out.push(...c.clips); else out.push(c); } return out; }
export function clipVisible(p, c) {
  const R = rootOf(p); const t = trackById(R, c.track);
  if (!t || t.hidden || (t.kind === "audio" && t.muted)) return false;
  const g = groupOf(R, c.id); if (g) { const gt = trackById(R, g.track); if (!gt || gt.hidden) return false; }
  return true;
}
/* the timeline you are editing: the project itself, or one group seen through the same API.
   Every edit op takes a scope, so the ops never learn about groups. */
export function scopeOf(p, groupId) {
  const R = rootOf(p);
  if (!groupId) return R;
  const g = R.clips.find((c) => c.id === groupId && c.type === "group"); if (!g) return R;
  const s = { root: R, group: g };
  Object.defineProperties(s, {
    clips: { get: () => g.clips, set: (v) => { g.clips = v; }, enumerable: true },
    tracks: { get: () => g.tracks, set: (v) => { g.tracks = v; }, enumerable: true },
    duration: { get: () => R.duration, set: (v) => { R.duration = v; } },
    meta: { get: () => R.meta, set: (v) => { R.meta = v; } },
    fps: { get: () => R.fps }, width: { get: () => R.width }, height: { get: () => R.height },
    words: { get: () => R.words }, markers: { get: () => R.markers }, style: { get: () => R.style }, id: { get: () => R.id },
  });
  return s;
}
export function clipsOnTrack(p, trackId) { return p.clips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start); }
export function cloneClip(p, c, id) { const d = JSON.parse(JSON.stringify(c)); d.id = id || nextId(p, "c"); return d; }
export function overlaps(a, s, e) { return clipEnd(a) > s + EPS && a.start < e - EPS; }
export function overlapping(p, trackId, s, e, exceptId) { return clipsOnTrack(p, trackId).filter((c) => c.id !== exceptId && overlaps(c, s, e)); }
export function mediaMaxDuration(c) { return c.mediaDuration != null ? r3(c.mediaDuration - (c.mediaStart || 0)) : Infinity; }

function shiftIn(c, delta) {
  // move the in-point by delta seconds: start moves, content stays put
  c.start = r3(c.start + delta); c.duration = r3(c.duration - delta);
  if (isMedia(c)) c.mediaStart = r3(Math.max(0, (c.mediaStart || 0) + delta));
  if (c.type === "caption") c.words = (c.words || []).filter((w) => w.start >= c.start - EPS);
  shiftKeyframes(c, -delta, true);
}
function shiftKeyframes(c, delta, clampToClip) {
  for (const k of Object.keys(c.keyframes || {})) {
    let list = (c.keyframes[k] || []).map((kf) => ({ ...kf, t: r3(kf.t + delta) }));
    if (clampToClip) list = list.filter((kf) => kf.t >= -EPS && kf.t <= c.duration + EPS);
    c.keyframes[k] = list;
  }
}
export function valueAt(list, t) {
  if (!list || !list.length) return null;
  if (t <= list[0].t) return list[0].v;
  if (t >= list[list.length - 1].t) return list[list.length - 1].v;
  for (let i = 1; i < list.length; i++) if (t <= list[i].t) {
    const a = list[i - 1], b = list[i]; const u = (t - a.t) / Math.max(EPS, b.t - a.t);
    return a.v + (b.v - a.v) * u;
  }
  return list[list.length - 1].v;
}

/* ------------------------------------------------------------------ keyframes (phase 2) */
export const KF_PROPS = ["x", "y", "scale", "rotation", "opacity"];
export function hasKeys(c, prop) { return !!(c.keyframes && c.keyframes[prop] && c.keyframes[prop].length); }
/* the clip as it is at absolute time t: keyframed properties resolved, everything else base */
export function clipAt(c, t) {
  if (!c.keyframes) return c;
  const rel = t - c.start; let out = null;
  for (const k of KF_PROPS) {
    if (!hasKeys(c, k)) continue;
    if (!out) out = { ...c };
    out[k] = valueAt(c.keyframes[k], rel);
  }
  return out || c;
}
/* set a property "as of now": with keys on that property it upserts a key at tRel, else the base */
export function setPropAt(c, prop, value, tRel, fps = DEFAULT_FPS, ease) {
  if (!hasKeys(c, prop)) { c[prop] = value; return null; }
  return upsertKey(c, prop, tRel, value, fps, ease);
}
export function upsertKey(c, prop, tRel, value, fps = DEFAULT_FPS, ease) {
  c.keyframes = c.keyframes || {};
  const list = (c.keyframes[prop] = c.keyframes[prop] || []);
  const t = quant(Math.max(0, Math.min(c.duration, tRel)), fps);
  let k = list.find((x) => Math.abs(x.t - t) < 0.5 / fps);
  if (k) { k.v = value; if (ease) k.ease = ease; }
  else { k = { t, v: value, ease: ease || "power2.inOut" }; list.push(k); list.sort((a, b) => a.t - b.t); }
  return k;
}
export function removeKey(c, prop, tRel, fps = DEFAULT_FPS) {
  if (!hasKeys(c, prop)) return false;
  const n = c.keyframes[prop].length;
  c.keyframes[prop] = c.keyframes[prop].filter((x) => Math.abs(x.t - tRel) >= 0.5 / fps);
  if (!c.keyframes[prop].length) delete c.keyframes[prop];
  return c.keyframes[prop]?.length !== n;
}
export function clearKeys(c, prop) { if (c.keyframes) { if (prop) delete c.keyframes[prop]; else c.keyframes = {}; } }
/* turn a property's keys off but keep the value at t as the new base */
export function bakeKeys(c, prop, tRel) { if (hasKeys(c, prop)) { c[prop] = valueAt(c.keyframes[prop], tRel); delete c.keyframes[prop]; } }

/* Overwrite edit: whatever sits on [a,b) of this track is trimmed, split or removed. */
export function overwriteRange(p, trackId, a, b, exceptId) {
  for (const c of clipsOnTrack(p, trackId)) {
    if (c.id === exceptId || c.locked) continue;
    const s = c.start, e = clipEnd(c);
    if (e <= a + EPS || s >= b - EPS) continue;
    if (s >= a - EPS && e <= b + EPS) { p.clips = p.clips.filter((x) => x !== c); continue; }
    if (s < a - EPS && e > b + EPS) {
      const right = cloneClip(p, c); p.clips.push(right);
      shiftIn(right, r3(b - s));
      c.duration = r3(a - s); clampKeyframes(c);
      continue;
    }
    if (s < a - EPS) { c.duration = r3(a - s); clampKeyframes(c); continue; }
    shiftIn(c, r3(b - s));
  }
}
function clampKeyframes(c) { shiftKeyframes(c, 0, true); }

/* Ripple: everything on the track from t onward moves by delta (positive = later). */
export function rippleFrom(p, trackId, t, delta, exceptId) {
  for (const c of clipsOnTrack(p, trackId)) if (c.id !== exceptId && c.start >= t - EPS) c.start = r3(Math.max(0, c.start + delta));
}

export function placeClip(p, clip, mode = "overwrite") {
  const t = trackById(p, clip.track);
  if (!t) throw new Error(`no track ${clip.track}`);
  if (t.kind !== trackKindFor(clip.type)) throw new Error(`a ${clip.type} clip cannot sit on ${t.kind} track ${t.name}`);
  clip.start = quant(Math.max(0, clip.start), p.fps);
  clip.duration = quant(Math.max(1 / p.fps, Math.min(clip.duration, mediaMaxDuration(clip))), p.fps);
  const e = clipEnd(clip);
  if (mode === "reject" && overlapping(p, clip.track, clip.start, e, clip.id).length) return null;
  // the newcomer is registered BEFORE the overwrite: a clip it splits in two is cloned with nextId, and an
  // unregistered newcomer let the clone take the newcomer's own id
  if (!p.clips.includes(clip)) p.clips.push(clip);
  if (mode === "insert") rippleFrom(p, clip.track, clip.start, clip.duration, clip.id);
  if (mode === "overwrite") overwriteRange(p, clip.track, clip.start, e, clip.id);
  if (e > p.duration) p.duration = quant(e, p.fps);
  touch(p);
  return clip;
}
export function addClip(p, type, o = {}, mode = "overwrite") {
  const c = defaultClip(type, o, p);
  if (!c.track) { const k = trackKindFor(type); c.track = tracksOf(p, k)[0].id; }
  return placeClip(p, c, mode);
}
export function removeClip(p, id) { const n = p.clips.length; p.clips = p.clips.filter((c) => c.id !== id); if (p.clips.length !== n) touch(p); return p.clips.length !== n; }
export function rippleDelete(p, id, { allTracks = false } = {}) {
  const c = clipById(p, id); if (!c) return false;
  const s = c.start, d = c.duration;
  removeClip(p, id);
  const tracks = allTracks ? p.tracks.map((t) => t.id) : [c.track];
  for (const tid of tracks) {
    // a clip that straddles the gap is not moved; only clips starting after the gap ripple
    rippleFrom(p, tid, s + d - EPS, -d);
  }
  touch(p); return true;
}
export function setClip(p, id, patch) {
  const c = clipById(p, id); if (!c) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "start" || k === "duration") c[k] = quant(Math.max(k === "start" ? 0 : 1 / p.fps, v), p.fps);
    else if (v && typeof v === "object" && !Array.isArray(v) && (k === "enter" || k === "exit")) c[k] = { ...c[k], ...v };
    else c[k] = v;
  }
  touch(p); return c;
}
/* move = overwrite edit at the destination; returns false when the track kind does not match */
export function moveClip(p, id, { start, track } = {}, mode = "overwrite") {
  const c = clipById(p, id); if (!c || c.locked) return false;
  const tid = track || c.track; const t = trackById(p, tid);
  if (!t || t.kind !== trackKindFor(c.type)) return false;
  const ns = quant(Math.max(0, start ?? c.start), p.fps);
  if (mode === "reject" && overlapping(p, tid, ns, ns + c.duration, id).length) return false;
  if (c.type === "group") shiftGroup(c, r3(ns - c.start));
  c.track = tid; c.start = ns;
  if (mode === "overwrite") overwriteRange(p, tid, ns, clipEnd(c), id);
  if (clipEnd(c) > p.duration) p.duration = quant(clipEnd(c), p.fps);
  touch(p); return true;
}
export function moveClipToTrack(p, id, dir) {
  const c = clipById(p, id); if (!c) return false;
  const kind = trackKindFor(c.type); const same = tracksOf(p, kind);
  const i = same.findIndex((t) => t.id === c.track); const j = i + dir;
  if (j < 0) return false;
  const target = j >= same.length ? addTrack(p, kind) : same[j];
  if (overlapping(p, target.id, c.start, clipEnd(c), id).length) return false;
  c.track = target.id; touch(p); return true;
}
/* trim: move the in point (start) or the out point (end). Clamped to media and neighbours. */
export function trimClip(p, id, { start, end } = {}) {
  const c = clipById(p, id); if (!c || c.locked) return false;
  const fps = p.fps, minDur = 1 / fps;
  const neighbours = clipsOnTrack(p, c.track).filter((x) => x.id !== id);
  const prevEnd = Math.max(0, ...neighbours.filter((x) => clipEnd(x) <= c.start + EPS).map(clipEnd));
  const nextStart = Math.min(Infinity, ...neighbours.filter((x) => x.start >= clipEnd(c) - EPS).map((x) => x.start));
  if (c.type === "group") {
    if (start != null) {
      const ns = Math.min(Math.max(quant(start, fps), prevEnd), clipEnd(c) - minDur);
      c.clips = c.clips.filter((k) => clipEnd(k) > ns + EPS);
      for (const k of c.clips) if (k.start < ns - EPS) { const minS = isMedia(k) ? r3(k.start - (k.mediaStart || 0)) : 0; shiftIn(k, r3(Math.max(ns, minS) - k.start)); }
    }
    if (end != null) {
      const ne = Math.max(Math.min(quant(end, fps), nextStart), c.start + minDur);
      c.clips = c.clips.filter((k) => k.start < ne - EPS);
      for (const k of c.clips) if (clipEnd(k) > ne + EPS) { k.duration = r3(ne - k.start); clampKeyframes(k); if (k.type === "caption") k.words = (k.words || []).filter((w) => w.start < ne - EPS); }
    }
    if (!fitGroup(c)) { p.clips = p.clips.filter((x) => x !== c); touch(p); return true; }
    touch(p); return true;
  }
  if (start != null) {
    let ns = quant(start, fps);
    const minStart = isMedia(c) ? r3(c.start - (c.mediaStart || 0)) : 0;
    ns = Math.max(ns, minStart, prevEnd);
    ns = Math.min(ns, clipEnd(c) - minDur);
    shiftIn(c, r3(ns - c.start));
  }
  if (end != null) {
    let ne = quant(end, fps);
    const maxEnd = r3(c.start + mediaMaxDuration(c));
    ne = Math.min(ne, maxEnd, nextStart);
    ne = Math.max(ne, c.start + minDur);
    c.duration = r3(ne - c.start); clampKeyframes(c);
    if (c.type === "caption") c.words = (c.words || []).filter((w) => w.start < ne - EPS);
  }
  if (clipEnd(c) > p.duration) p.duration = quant(clipEnd(c), fps);
  touch(p); return true;
}
/* slip: the clip stays where it is, the media inside slides by delta seconds */
export function slipClip(p, id, delta) {
  const c = clipById(p, id); if (!c || !isMedia(c) || c.locked) return false;
  const maxStart = c.mediaDuration != null ? Math.max(0, r3(c.mediaDuration - c.duration)) : Infinity;
  c.mediaStart = r3(Math.min(maxStart, Math.max(0, (c.mediaStart || 0) + delta)));
  touch(p); return true;
}
/* split one clip at absolute time t; returns [leftId, rightId] or null */
export function splitClip(p, id, t) {
  const c = clipById(p, id); if (!c || c.locked) return null;
  const tq = quant(t, p.fps);
  if (tq <= c.start + EPS || tq >= clipEnd(c) - EPS) return null;
  if (c.type === "group") {
    const scope = scopeOf(p, c.id);
    for (const k of [...c.clips]) if (k.start < tq - EPS && clipEnd(k) > tq + EPS) splitClip(scope, k.id, tq);
    const alloc = idAllocator(p);
    const rightG = defaultClip("group", { name: c.name, track: c.track, label: c.label, id: alloc("c") }, p);
    const map = new Map();
    for (const tr of c.tracks) { const nt = { ...tr, id: alloc(tr.kind === "video" ? "v" : "a") }; rightG.tracks.push(nt); map.set(tr.id, nt.id); }
    rightG.clips = c.clips.filter((k) => k.start >= tq - EPS).map((k) => { k.track = map.get(k.track); return k; });
    c.clips = c.clips.filter((k) => k.start < tq - EPS);
    p.clips.push(rightG);
    fitGroup(c); fitGroup(rightG);
    touch(p);
    return [c.id, rightG.id];
  }
  const right = cloneClip(p, c);
  const rel = r3(tq - c.start);
  // continuity: keyframed values at the cut become explicit keyframes on both sides
  for (const k of Object.keys(c.keyframes || {})) {
    const list = c.keyframes[k]; if (!list || !list.length) continue;
    const v = valueAt(list, rel);
    if (!list.some((kf) => Math.abs(kf.t - rel) < EPS)) { list.push({ t: rel, v, ease: "none" }); list.sort((a, b) => a.t - b.t); }
    right.keyframes[k] = JSON.parse(JSON.stringify(list));
  }
  p.clips.push(right);
  shiftIn(right, rel);
  c.duration = rel; clampKeyframes(c);
  if (c.type === "caption") c.words = (c.words || []).filter((w) => w.start < tq - EPS);
  c.exit = { ...c.exit, type: "none" };
  right.enter = { ...right.enter, type: "none" };
  right.name = c.name;
  touch(p);
  return [c.id, right.id];
}
/* the razor: split every unlocked clip under t (or only the given ids) */
export function splitAt(p, t, { ids = null, tracks = null } = {}) {
  const out = [];
  const targets = p.clips.filter((c) => (ids ? ids.includes(c.id) : true) && (tracks ? tracks.includes(c.track) : true));
  for (const c of [...targets]) { const r = splitClip(p, c.id, t); if (r) out.push(r); }
  return out;
}
export function duplicateClip(p, id, mode = "insert") {
  const c = clipById(p, id); if (!c) return null;
  const d = cloneClip(p, c); d.name = c.name;
  if (c.type === "group") { reidGroup(p, d); shiftGroup(d, r3(clipEnd(c) - c.start)); }
  d.start = clipEnd(c);
  return placeClip(p, d, mode);
}

/* roll edit: the seam between two touching clips moves to t; both edges follow */
export function rollEdit(p, leftId, rightId, t) {
  const L = clipById(p, leftId), R = clipById(p, rightId); if (!L || !R || L.locked || R.locked) return false;
  const seam = clipEnd(L); const nt = quant(t, p.fps);
  if (Math.abs(R.start - seam) > 1.5 / p.fps) return false;
  if (nt > seam) { trimClip(p, R.id, { start: nt }); trimClip(p, L.id, { end: R.start }); }
  else { trimClip(p, L.id, { end: nt }); trimClip(p, R.id, { start: clipEnd(L) }); }
  touch(p); return true;
}

/* ------------------------------------------------------------------ captions */
/* 3-word cues, a new cue on punctuation or a pause over `pause` seconds, butt-joined inside a
   run. Returns [{start, duration, words}] with absolute word times. */
export function buildCues(words, { fps = DEFAULT_FPS, maxWords = 3, pause = 0.24, tail = 0.3 } = {}) {
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) { cues.push({ words: cur.slice() }); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], prev = words[i - 1];
    if (cur.length && prev && w.start - prev.end > pause) flush();
    cur.push({ text: w.text, start: w.start, end: w.end });
    if (/[.,!?:;]$/.test(w.text) || cur.length >= maxWords) flush();
  }
  flush();
  const time = () => {
    for (let i = 0; i < cues.length; i++) {
      const q = cues[i]; q.start = quant(q.words[0].start, fps);
      const lastEnd = q.words[q.words.length - 1].end;
      const next = cues[i + 1]; const gap = next ? next.words[0].start - lastEnd : 1;
      const end = next && gap <= pause ? next.words[0].start : lastEnd + Math.min(tail, gap);
      q.duration = r3(Math.max(1 / fps, quant(end, fps) - q.start));
    }
  };
  time();
  // a cue shorter than 0.16 s is invisible (CUE_MIN_DUR). Never stretch it into the next
  // cue and never drop it: fold its words into the previous cue when that stays under maxWords,
  // else into the next one, else keep it as it is.
  for (let i = 0; i < cues.length; ) {
    const q = cues[i];
    if (q.duration >= 0.16 || cues.length === 1) { i++; continue; }
    const prev = cues[i - 1], next = cues[i + 1];
    if (prev && prev.words.length + q.words.length <= maxWords) { prev.words = prev.words.concat(q.words); cues.splice(i, 1); time(); continue; }
    if (next && next.words.length + q.words.length <= maxWords) { next.words = q.words.concat(next.words); cues.splice(i, 1); time(); continue; }
    i++;
  }
  return cues;
}
/* split a caption cue after word index i: the rest becomes a new cue right after it */
export function splitCaptionAfter(p, id, i) {
  const c = clipById(p, id); if (!c || c.type !== "caption" || i < 0 || i >= c.words.length - 1) return null;
  const t = quant(c.words[i + 1].start, p.fps);
  const right = cloneClip(p, c);
  right.words = c.words.slice(i + 1); right.start = t; right.duration = r3(clipEnd(c) - t); right.name = right.words.map((w) => w.text).join(" ");
  c.words = c.words.slice(0, i + 1); c.duration = r3(t - c.start); c.name = c.words.map((w) => w.text).join(" ");
  p.clips.push(right); touch(p); return right;
}
/* merge a cue with the next cue on its track */
export function mergeCaptionNext(p, id) {
  const c = clipById(p, id); if (!c || c.type !== "caption") return false;
  const next = clipsOnTrack(p, c.track).find((x) => x.type === "caption" && x.start >= clipEnd(c) - EPS);
  if (!next) return false;
  c.words = c.words.concat(next.words); c.duration = r3(clipEnd(next) - c.start); c.name = c.words.map((w) => w.text).join(" ");
  removeClip(p, next.id); touch(p); return true;
}
/* move the boundary between word i and i+1 inside a cue (both words keep their order) */
export function setWordBoundary(p, id, i, t) {
  const c = clipById(p, id); if (!c || c.type !== "caption") return false;
  const a = c.words[i], b = c.words[i + 1]; if (!a || !b) return false;
  const nt = r3(Math.max(a.start + 0.05, Math.min(b.end - 0.05, t)));
  a.end = nt; b.start = nt;
  syncWord(p, a); syncWord(p, b); touch(p); return true;
}
/* the transcript (project.words) follows edits made in cues, matched by original start time */
export function syncWord(p, w) {
  if (!p.words) return;
  const src = p.words.find((x) => Math.abs(x.start - (w.srcStart ?? w.start)) < 0.011);
  if (src) { src.text = w.text; src.start = w.start; src.end = w.end; }
}

/* ------------------------------------------------------------------ the facecam block + scene states */
export const STATES = ["full", "stack", "bubble", "none"];
export function facecamOf(p) { return p.clips.find((c) => c.type === "facecam") || null; }
export function hasScenes(p) { return !!facecamOf(p); }
/* the window rectangle for a state, in composition pixels (r = corner radius) */
export function windowRect(fc, state, W = 1080, H = 1920) {
  const st = { x: 60, y: 930, w: 960, h: 740, r: 44, ...(fc?.stack || {}) };
  const bu = { x: 60, y: 1250, size: 400, ...(fc?.bubble || {}) };
  if (state === "stack") return { x: st.x, y: st.y, w: st.w, h: st.h, r: st.r };
  if (state === "bubble") return { x: bu.x, y: bu.y, w: bu.size, h: bu.size, r: bu.size / 2 };
  if (state === "none") return { x: st.x, y: H + 40, w: st.w, h: st.h, r: st.r };
  return { x: 0, y: 0, w: W, h: H, r: 0 };
}
/* the scenes: one span per state change, from the block's start to the project end */
export function sceneSpans(p) {
  const fc = facecamOf(p); if (!fc) return [];
  const end = r3(projectDuration(p));
  const states = [...(fc.states || [])].filter((s) => s.t < end).sort((a, b) => a.t - b.t);
  if (!states.length || states[0].t > fc.start + EPS) states.unshift({ t: fc.start, state: "full" });
  const out = [];
  for (let i = 0; i < states.length; i++) {
    const t = r3(Math.max(fc.start, states[i].t)), e = i + 1 < states.length ? r3(states[i + 1].t) : end;
    if (e - t <= EPS) continue;
    out.push({ id: `S${String(out.length + 1).padStart(2, "0")}`, t, end: e, dur: r3(e - t), state: STATES.includes(states[i].state) ? states[i].state : "full", sys: states[i].sys || null, idx: i });
  }
  return out;
}
export function stateAt(p, t) { const s = sceneSpans(p).find((x) => t >= x.t - EPS && t < x.end); return s ? s.state : "none"; }
/* THE CUT RULE: a scene change sits on one of your own jump cuts when one is within reach, else in
   the silence: last_word.end + 0.10 <= t <= next_word.start - 0.12; with no real pause
   (gap < 0.14) a word-edge cut is right. */
export function snapBoundary(p, t, { cutTol = 0.85 } = {}) {
  let best = null, bd = cutTol;
  for (const m of p.markers || []) if (/cut/i.test(m.label || "")) { const d = Math.abs(m.t - t); if (d < bd) { bd = d; best = m.t; } }
  if (best != null) return quant(best, p.fps);
  const W = p.words || [];
  if (!W.length) return quant(t, p.fps);
  const prev = W.filter((w) => w.end <= t + 0.05).at(-1);
  const next = W.find((w) => w.start >= t - 0.3 && w.start > (prev ? prev.end - 0.01 : 0));
  if (!prev || !next) return quant(t, p.fps);
  const gap = next.start - prev.end;
  if (gap < 0.14) return quant(prev.end + 0.005, p.fps);
  const lo = prev.end + 0.10, hi = next.start - 0.12;
  const target = lo <= hi ? Math.min(hi, Math.max(lo, t)) : hi;
  return quant(target, p.fps);
}
export function addBoundary(p, t, state = null) {
  const fc = facecamOf(p); if (!fc) return null;
  const nt = snapBoundary(p, t);
  fc.states = fc.states || [];
  if (fc.states.some((s) => Math.abs(s.t - nt) < 0.5 / p.fps)) return null;
  const cur = stateAt(p, nt);
  const s = { t: nt, state: state || (cur === "full" ? "stack" : cur === "stack" ? "none" : "full") };
  fc.states.push(s); fc.states.sort((a, b) => a.t - b.t); touch(p); return s;
}
export function setSpanState(p, idx, patch) { const fc = facecamOf(p); if (!fc || !fc.states[idx]) return false; Object.assign(fc.states[idx], patch); touch(p); return true; }
export function cycleSpanState(p, idx) { const fc = facecamOf(p); const s = fc?.states[idx]; if (!s) return false; s.state = STATES[(STATES.indexOf(s.state) + 1) % STATES.length]; touch(p); return true; }
export function moveBoundary(p, idx, t) {
  const fc = facecamOf(p); const s = fc?.states[idx]; if (!s || idx === 0) return false;
  const prev = fc.states[idx - 1], next = fc.states[idx + 1];
  const nt = snapBoundary(p, t);
  const lo = prev.t + 0.2, hi = (next ? next.t : projectDuration(p)) - 0.2;
  s.t = quant(Math.min(hi, Math.max(lo, nt)), p.fps); touch(p); return true;
}
export function removeBoundary(p, idx) { const fc = facecamOf(p); if (!fc || idx === 0 || !fc.states[idx]) return false; fc.states.splice(idx, 1); touch(p); return true; }
/* the caption system and its y for each scene state (styles/window, Captions) */
export const CAPTION_FOR = {
  full: { sys: "capFace", y: 1390 },
  stack: { sys: "capSeam", y: 870 },
  bubble: { sys: "capSide", y: 1330 },
  none: { sys: "capGround", y: 1330 },
};
/* captions per scene: cues never cross a scene boundary, consecutive cues butt-join, a scene's last
   cue runs to the scene's last frame, the system and position follow the window state, nothing
   under the CTA. */
export function buildSceneCues(p, opts = {}) {
  const words = p.words || []; const spans = sceneSpans(p); if (!words.length || !spans.length) return [];
  const ctas = p.clips.filter((c) => c.type === "cta").map((c) => [c.start, clipEnd(c)]);
  const inCta = (t) => ctas.some(([a, b]) => t >= a - EPS && t < b);
  const out = [];
  // a word that starts less than 0.15 s before a cut is spoken across it: it rides into the next
  // scene's first cue instead of becoming an invisible 1-frame cue
  const owner = (w) => {
    let i = spans.findIndex((s) => w.start >= s.t - 0.001 && w.start < s.end - 0.001);
    if (i < 0) return -1;
    if (spans[i].end - w.start < 0.15 && i + 1 < spans.length) i += 1;
    return i;
  };
  const byScene = spans.map(() => []);
  for (const w of words) { const i = owner(w); if (i >= 0 && !inCta(w.start)) byScene[i].push(w); }
  const fc = facecamOf(p);
  for (const [si, s] of spans.entries()) {
    if (inCta(s.t) || inCta(s.end - 0.01)) continue;
    const ws = byScene[si].map((w) => (w.start < s.t ? { ...w, start: s.t } : w));
    if (!ws.length) continue;
    const cues = buildCues(ws, { fps: p.fps, maxWords: opts.maxWords || 4, pause: opts.pause || 0.24 });
    const cf = CAPTION_FOR[s.state] || CAPTION_FOR.full;
    // the seam pill rides the top edge of the stack window, wherever the window is
    const y = s.state === "stack" ? windowRect(fc, "stack").y - 60 : cf.y;
    for (let i = 0; i < cues.length; i++) {
      const q = cues[i];
      const nextStart = i + 1 < cues.length ? cues[i + 1].start : s.end;
      q.duration = r3(Math.max(1 / p.fps, nextStart - q.start));
      out.push({ ...q, sys: s.sys || cf.sys, y, scene: s.id, state: s.state });
    }
  }
  return out;
}
/* the style's sequence rules as warnings (styles/window/STYLE.md, Sequence rules) */
export function validateScenes(p) {
  const warnings = [];
  if (!hasScenes(p)) return warnings;
  const spans = sceneSpans(p);
  for (const st of ["full", "none"]) if (!spans.some((s) => s.state === st)) warnings.push(`no "${st}" scene: every reel uses full face, face + element and elements only`);
  if (!spans.some((s) => s.state === "stack" || s.state === "bubble")) warnings.push(`no face + element scene (stack or bubble)`);
  let run = 1;
  for (let i = 1; i < spans.length; i++) { run = spans[i].state === spans[i - 1].state ? run + 1 : 1; if (run === 5) warnings.push(`five "${spans[i].state}" scenes in a row at ${spans[i].t}s: switch it up after four`); }
  for (const s of spans) if (s.state === "none" && s.dur > 8) warnings.push(`elements-only stretch of ${s.dur}s at ${s.t}s: keep it under 8 s`);
  const fc = facecamOf(p);
  for (const c of p.clips.filter((x) => x.type === "text")) {
    const st = stateAt(p, c.start + c.duration / 2);
    if (st !== "stack" && st !== "bubble") continue;
    const r = windowRect(fc, st);
    const ox = Math.min(c.x + c.w, r.x + r.w) - Math.max(c.x, r.x), oy = Math.min(c.y + c.h, r.y + r.h) - Math.max(c.y, r.y);
    if (ox > 40 && oy > 40) warnings.push(`text "${(c.text || "").slice(0, 20)}" at ${c.start}s sits on the face window during a ${st} scene`);
  }
  for (const c of p.clips) if (c.type !== "facecam" && c.type !== "audio" && c.type !== "group" && isVisual(c) && c.y >= 1700 && c.y < (p.height || 1920)) warnings.push(`${c.type} "${c.name || c.id}" starts below y 1700, where the app buttons sit`);
  return warnings;
}

/* ------------------------------------------------------------------ markers + words */
export function addMarker(p, t, label = "", color = "#FFD400") { const m = { id: nextId(p, "m"), t: quant(t, p.fps), label, color }; p.markers.push(m); p.markers.sort((a, b) => a.t - b.t); touch(p); return m; }
export function removeMarker(p, id) { p.markers = p.markers.filter((m) => m.id !== id); touch(p); }

/* ------------------------------------------------------------------ whole-project ops */
export function projectDuration(p) { const R = rootOf(p); return r3(Math.max(R.duration || 0, ...R.clips.map(clipEnd))); }

/* Cut a window out of the project for a test render: shift by -from, trim, drop the rest. */
export function sliceProject(p0, from, to) {
  const p = flattenProject(p0);
  const q = JSON.parse(JSON.stringify(p));
  const a = quant(from, p.fps), b = quant(to, p.fps);
  q.id = `${p.id}-test`; q.title = `${p.title} (test ${a}s to ${b}s)`;
  q.duration = r3(b - a);
  q.clips = [];
  const spanAtA = sceneSpans(p).find((x) => a >= x.t - EPS && a < x.end) || null;
  for (const c0 of p.clips) {
    const c = JSON.parse(JSON.stringify(c0));
    const s = c.start, e = clipEnd(c);
    if (e <= a + EPS || s >= b - EPS) continue;
    if (c.type === "facecam") {
      // the block's scene states are absolute times: shift them and open the window in the state
      // that was live at `from`, else a test render shows the wrong scene states
      const kept = (c.states || []).filter((st) => st.t > a + EPS && st.t < b - EPS).map((st) => ({ ...st, t: r3(st.t - a) }));
      const first = { t: 0, state: spanAtA ? spanAtA.state : "full" }; if (spanAtA?.sys) first.sys = spanAtA.sys;
      c.states = [first, ...kept];
    }
    if (s < a) shiftIn(c, r3(a - s));
    if (clipEnd(c) > b) { c.duration = r3(b - c.start); clampKeyframes(c); if (c.type === "caption") c.words = (c.words || []).filter((w) => w.start < b - EPS); }
    c.start = r3(c.start - a);
    if (c.type === "caption") c.words = (c.words || []).map((w) => ({ ...w, start: r3(w.start - a), end: r3(w.end - a) }));
    q.clips.push(c);
  }
  q.markers = (p.markers || []).filter((m) => m.t >= a && m.t < b).map((m) => ({ ...m, t: r3(m.t - a) }));
  return q;
}

export function snapPoints(p, { exclude = [], playhead = null } = {}) {
  const s = new Set([0, r3(p.duration)]);
  for (const c of p.clips) if (!exclude.includes(c.id)) { s.add(r3(c.start)); s.add(clipEnd(c)); }
  for (const m of p.markers || []) s.add(r3(m.t));
  if (playhead != null) s.add(r3(playhead));
  return [...s].sort((x, y) => x - y);
}

export function validate(p0) {
  const p = rootOf(p0);
  const errors = [], warnings = [];
  const ids = new Set();
  const scopes = [p, ...p.clips.filter((c) => c.type === "group").map((g) => scopeOf(p, g.id))];
  for (const sc of scopes) for (const c of sc.clips) {
    if (ids.has(c.id)) errors.push(`duplicate clip id ${c.id}`); ids.add(c.id);
    if (!sc.tracks.some((t) => t.id === c.track)) errors.push(`clip ${c.id} sits on missing track ${c.track}`);
    if (!(c.duration > 0)) errors.push(`clip ${c.id} has no duration`);
    if ((c.type === "video" || c.type === "image" || c.type === "audio") && !c.src) errors.push(`clip ${c.id} (${c.type}) has no src`);
    if (isMedia(c) && c.mediaDuration != null && (c.mediaStart || 0) + c.duration > c.mediaDuration + 0.05) errors.push(`clip ${c.id} declares ${c.duration}s from ${c.mediaStart}s but the media is ${c.mediaDuration}s`);
    if (clipEnd(c) > p.duration + EPS) warnings.push(`clip ${c.id} runs past the project end (${clipEnd(c)} > ${p.duration})`);
    if (sc !== p && (c.type === "group" || c.type === "facecam" || c.type === "cta")) errors.push(`a ${c.type} cannot live inside a group (${sc.group.id})`);
    if (c.type === "group") { const ext = c.clips.length ? [Math.min(...c.clips.map((k) => k.start)), Math.max(...c.clips.map(clipEnd))] : null; if (!ext) errors.push(`group ${c.id} is empty`); else if (Math.abs(ext[0] - c.start) > EPS || Math.abs(ext[1] - clipEnd(c)) > EPS) errors.push(`group ${c.id} window ${c.start}-${clipEnd(c)} does not match its clips ${ext[0]}-${ext[1]}`); }
  }
  for (const sc of scopes) for (const t of sc.tracks) {
    const list = clipsOnTrack(sc, t.id);
    for (let i = 1; i < list.length; i++) if (list[i].start < clipEnd(list[i - 1]) - EPS) errors.push(`clips ${list[i - 1].id} and ${list[i].id} overlap on ${t.name}${sc !== p ? ` in group ${sc.group.id}` : ""}`);
  }
  if (/\u2014/.test(JSON.stringify(p))) warnings.push("an em dash is in the project text (it reads as AI-written; use a comma or a period)");
  if (p.clips.filter((c) => c.type === "facecam").length > 1) errors.push("only one facecam block per project");
  warnings.push(...validateScenes(p));
  return { errors, warnings, ok: !errors.length };
}


/* ------------------------------------------------------------------ groups (Premiere's nest, in real time)
   A group is a root clip holding its own tracks and clips. Children keep their REAL reel times, so
   grouping and ungrouping move nothing. The group's window always equals its children's extent
   (fitGroup); normalizeGroups runs after every edit and drops empty groups. Rules: one level only
   (grouping a group merges it), the facecam and CTA blocks never go in, ids stay global. */
const trackOrder = (R, t) => {
  const kindIdx = (list, x) => list.filter((y) => y.kind === x.kind).indexOf(x);
  if (R.tracks.includes(t)) return (t.kind === "audio" ? 1000 : 0) + kindIdx(R.tracks, t);
  const g = groupOfTrack(R, t.id); if (!g) return 0;
  const home = trackById(R, g.track);
  return (t.kind === "audio" ? 1000 : 0) + kindIdx(R.tracks, home) + (kindIdx(g.tracks, t) + 1) / 100;
};
export function fitGroup(g) {
  if (!g.clips || !g.clips.length) return false;
  const s = Math.min(...g.clips.map((c) => c.start)), e = Math.max(...g.clips.map(clipEnd));
  g.start = r3(s); g.duration = r3(e - s); return true;
}
export function shiftGroup(g, delta) {
  if (!delta) return;
  for (const k of g.clips) { k.start = r3(k.start + delta); if (k.type === "caption") k.words = (k.words || []).map((w) => ({ ...w, start: r3(w.start + delta), end: r3(w.end + delta) })); }
}
/* fresh ids for a copied group, its tracks and its clips (duplicate, paste) */
export function reidGroup(p, g) {
  const alloc = idAllocator(p);
  g.id = alloc("c");
  const map = new Map();
  for (const t of g.tracks) { const nid = alloc(t.kind === "video" ? "v" : "a"); map.set(t.id, nid); t.id = nid; }
  for (const k of g.clips) { k.track = map.get(k.track) || k.track; k.id = alloc("c"); }
  return g;
}
/* keep every group's window on its clips; drop empty groups; lift a group that now collides on its track */
export function normalizeGroups(p) {
  const R = rootOf(p); let changed = false;
  for (const g of [...R.clips]) {
    if (g.type !== "group") continue;
    if (!fitGroup(g)) { R.clips = R.clips.filter((c) => c !== g); changed = true; continue; }
    if (overlapping(R, g.track, g.start, clipEnd(g), g.id).length) {
      const vids = videoTracks(R); let i = vids.findIndex((t) => t.id === g.track) + 1, home = null;
      while (i < vids.length) { if (!overlapping(R, vids[i].id, g.start, clipEnd(g), g.id).length) { home = vids[i]; break; } i++; }
      g.track = (home || addTrack(R, "video")).id; changed = true;
    }
  }
  return changed;
}
/* gather root clips into one group on the lowest track they came from; groups in the selection merge */
export function groupClips(p, ids, name = "group") {
  const R = rootOf(p);
  const members = [];
  for (const id of ids) {
    const c = R.clips.find((x) => x.id === id); if (!c) throw new Error(`${id} is not on the main timeline; leave the group first`);
    if (c.type === "group") { for (const k of c.clips) members.push({ clip: k, track: trackById(R, k.track) }); continue; }
    if (!GROUPABLE.has(c.type)) throw new Error(`the ${c.type} block stays on the main timeline`);
    members.push({ clip: c, track: trackById(R, c.track) });
  }
  if (!members.length) return null;
  const vids = videoTracks(R);
  const rootTrackOf = (t) => (R.tracks.includes(t) ? t : trackById(R, groupOfTrack(R, t.id)?.track));
  const homes = members.map((m) => rootTrackOf(m.track)).filter((t) => t && t.kind === "video").sort((a, b) => vids.indexOf(a) - vids.indexOf(b));
  let home = homes[0] || vids[0];
  const srcTracks = [...new Set(members.map((m) => m.track))].sort((a, b) => trackOrder(R, a) - trackOrder(R, b));
  const alloc = idAllocator(R);
  const g = defaultClip("group", { name, track: home.id, id: alloc("c") }, R);
  const map = new Map();
  for (const t of srcTracks) { const nt = { id: alloc(t.kind === "video" ? "v" : "a"), kind: t.kind, name: t.name, locked: false, hidden: false, muted: false }; g.tracks.push(nt); map.set(t.id, nt.id); }
  const memberIds = new Set(members.map((m) => m.clip.id));
  R.clips = R.clips.filter((c) => !memberIds.has(c.id) && !(c.type === "group" && ids.includes(c.id)));
  for (const m of members) { m.clip.track = map.get(m.track.id); g.clips.push(m.clip); }
  fitGroup(g);
  if (overlapping(R, home.id, g.start, clipEnd(g)).length) home = addTrack(R, "video", null, vids.indexOf(home) + 1);
  g.track = home.id;
  R.clips.push(g);
  touch(R);
  return g;
}
/* put a group's clips back on the main timeline, on fresh tracks just above the group's track */
export function ungroup(p, gid) {
  const R = rootOf(p);
  const g = R.clips.find((c) => c.id === gid && c.type === "group"); if (!g) return null;
  const home = trackById(R, g.track); let at = videoTracks(R).indexOf(home) + 1;
  const map = new Map(); const out = [];
  for (const t of g.tracks) { const nt = t.kind === "video" ? addTrack(R, "video", t.name, at++) : addTrack(R, "audio", t.name); nt.locked = !!t.locked; nt.hidden = !!t.hidden; nt.muted = !!t.muted; map.set(t.id, nt.id); }
  R.clips = R.clips.filter((c) => c !== g);
  for (const c of g.clips) { c.track = map.get(c.track); R.clips.push(c); out.push(c.id); }
  touch(R); return out;
}
/* a deep copy with every group opened: what the render and the test-render slice see */
export function flattenProject(p) {
  const q = JSON.parse(JSON.stringify(rootOf(p)));
  for (const g of [...q.clips]) if (g.type === "group") ungroup(q, g.id);
  return q;
}
/* move a clip on the picture, keys included */
export function shiftXY(c, dx, dy) {
  if (!isVisual(c)) return;
  c.x = r3((c.x || 0) + dx); c.y = r3((c.y || 0) + dy);
  if (hasKeys(c, "x")) for (const k of c.keyframes.x) k.v = r3(k.v + dx);
  if (hasKeys(c, "y")) for (const k of c.keyframes.y) k.v = r3(k.v + dy);
}
