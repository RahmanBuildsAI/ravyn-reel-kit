// node ravyn/test/group.test.mjs   the six safety rules for groups, as tests
import assert from "node:assert/strict";
import * as M from "../lib/model.mjs";
import { compileHtml } from "../lib/compile.mjs";

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("ok   " + name); } catch (e) { console.log("FAIL " + name + "\n     " + (e.stack || e.message || e).split("\n").slice(0, 3).join("\n     ")); process.exitCode = 1; } };
const stripDate = (h) => h.replace(/compiled [^\n]+/, "").replace(/z-index:\d+/g, "z-index:Z").replace(/data-track-index="\d+"/g, "data-track-index=\"T\"");

function demo() {
  const p = M.newProject({ id: "g", duration: 20 });
  const v = M.videoTracks(p), a = M.audioTracks(p);
  M.addClip(p, "video", { id: "bg", src: "a.mp4", start: 0, duration: 20, mediaDuration: 20, track: v[0].id });
  M.addClip(p, "shape", { id: "card", start: 4, duration: 6, track: v[1].id, x: 100, y: 100, w: 500, h: 300 });
  M.addClip(p, "text", { id: "title", text: "hello", start: 5, duration: 4, track: v[2].id, x: 120, y: 120, w: 400, h: 80, enter: { type: "slideUp", dur: 0.3 } });
  M.addClip(p, "caption", { id: "cap", start: 6, duration: 2, track: M.addTrack(p, "video", "CAPTIONS").id, words: [{ text: "hi", start: 6, end: 6.5 }, { text: "there", start: 6.5, end: 7.2 }] });
  M.addClip(p, "audio", { id: "sfx", src: "s.wav", start: 5, duration: 0.5, mediaDuration: 0.5, track: a[1].id });
  return p;
}

test("group then ungroup gives back the same render (rule 1) and the same clips", () => {
  const p = demo();
  const before = stripDate(compileHtml(p));
  const g = M.groupClips(p, ["card", "title", "cap", "sfx"], "card 1");
  assert.equal(g.type, "group"); assert.equal(g.clips.length, 4); assert.equal(g.tracks.length, 4);
  assert.equal(g.start, 4); assert.equal(M.clipEnd(g), 10);
  assert.equal(p.clips.length, 2, "bg + the group on the main timeline");
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
  // the render never knows (rule 2): same elements, same tweens, same z order
  assert.equal(stripDate(compileHtml(p)), before);
  const ids = M.ungroup(p, g.id);
  assert.deepEqual(ids.sort(), ["cap", "card", "sfx", "title"]);
  assert.equal(stripDate(compileHtml(p)), before);
  assert.ok(M.validate(p).ok);
  assert.equal(M.clipById(p, "title").start, 5, "nothing moved");
});

test("ids stay unique across groups (rule 3), including duplicate and paste", () => {
  const p = demo();
  const g = M.groupClips(p, ["card", "title"], "g1");
  const d = M.duplicateClip(p, g.id, "reject");
  assert.ok(d && d.type === "group");
  const all = [...p.clips.map((c) => c.id), ...p.clips.flatMap((c) => (c.type === "group" ? [...c.clips.map((k) => k.id), ...c.tracks.map((t) => t.id)] : []))];
  assert.equal(new Set(all).size, all.length, "duplicate ids: " + all.join(","));
  assert.equal(d.start, 10); assert.equal(d.clips.find((k) => k.type === "text").start, 11);
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
});

test("one level only: grouping a group merges it (rule 4)", () => {
  const p = demo();
  const g1 = M.groupClips(p, ["card", "title"], "g1");
  const g2 = M.groupClips(p, [g1.id, "cap"], "g2");
  assert.equal(p.clips.filter((c) => c.type === "group").length, 1);
  assert.equal(g2.clips.length, 3);
  assert.ok(g2.clips.every((k) => k.type !== "group"));
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
});

test("the facecam and CTA blocks refuse to be grouped (rule 5)", () => {
  const p = demo();
  M.addClip(p, "cta", { id: "cta1", start: 15, duration: 5, track: M.videoTracks(p)[1].id });
  assert.throws(() => M.groupClips(p, ["cta1", "title"]), /stays on the main timeline/);
  M.addClip(p, "facecam", { id: "fc", src: "f.mp4", start: 0, duration: 20, mediaDuration: 20, track: M.addTrack(p, "video").id });
  assert.throws(() => M.groupClips(p, ["fc"]), /stays on the main timeline/);
});

test("move, trim, split and delete work on a group as one thing (rule 7)", () => {
  const p = demo();
  const g = M.groupClips(p, ["card", "title", "cap"], "g");
  M.moveClip(p, g.id, { start: 6 }, "reject");
  assert.equal(M.clipById(p, "card").start, 6); assert.equal(M.clipById(p, "title").start, 7);
  assert.equal(M.clipById(p, "cap").words[0].start, 8, "caption words move with the group");
  assert.equal(g.start, 6); assert.equal(M.clipEnd(g), 12);
  M.trimClip(p, g.id, { end: 9 });
  assert.equal(M.clipEnd(g), 9); assert.equal(M.clipEnd(M.clipById(p, "card")), 9); assert.equal(M.clipById(p, "cap").duration, 1);
  const [l, r] = M.splitClip(p, g.id, 7.5);
  const L = M.clipById(p, l), R = M.clipById(p, r);
  assert.equal(M.clipEnd(L), 7.5); assert.equal(R.start, 7.5);
  assert.equal(L.clips.length + R.clips.length, 5, "the two straddling clips were split, the caption was whole on the right");
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
  M.removeClip(p, r);
  assert.equal(M.clipById(p, "card").duration, 1.5);
  assert.equal(p.clips.filter((c) => c.type === "group").length, 1);
});

test("edits inside a group go through a scope and the window follows (fitGroup)", () => {
  const p = demo();
  const g = M.groupClips(p, ["card", "title"], "g");
  const sc = M.scopeOf(p, g.id);
  assert.equal(sc.clips.length, 2); assert.equal(sc.tracks.length, 2);
  M.moveClip(sc, "title", { start: 12 }, "reject");
  M.normalizeGroups(p);
  assert.equal(M.clipEnd(g), 16, "the group grew to hold the moved title");
  const t = M.addClip(sc, "text", { text: "inside", start: 2, duration: 1, track: sc.tracks[0].id }, "reject");
  assert.ok(t.id !== "card" && t.id !== "title" && !p.clips.some((c) => c.id === t.id), "a fresh global id");
  M.normalizeGroups(p);
  assert.equal(g.start, 2);
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
  M.removeClip(sc, "card"); M.removeClip(sc, "title"); M.removeClip(sc, t.id);
  M.normalizeGroups(p);
  assert.ok(!p.clips.some((c) => c.type === "group"), "an empty group is dropped");
});

test("a group that grows into a neighbour is lifted to a free track, never overwrites it", () => {
  const p = demo();
  const v = M.videoTracks(p);
  M.addClip(p, "shape", { id: "next", start: 12, duration: 3, track: v[1].id });
  const g = M.groupClips(p, ["card"], "g");           // on V2, 4 to 10; "next" sits 12 to 15 on V2
  M.moveClip(M.scopeOf(p, g.id), "card", { start: 9 }); // card now 9 to 15 -> the group collides with "next"
  M.normalizeGroups(p);
  assert.ok(M.clipById(p, "next"), "the neighbour survived");
  assert.notEqual(g.track, v[1].id, "the group moved up");
  assert.ok(M.validate(p).ok, M.validate(p).errors.join("; "));
});

test("z order: a group's children paint above its slot and below the next track", () => {
  const p = demo();
  const g = M.groupClips(p, ["card", "title"], "g");   // home = V2 (z 20), title on internal track 2
  assert.equal(M.zIndexOf(p, g), 20);
  assert.equal(M.zIndexOf(p, M.clipById(p, "card")), 21);
  assert.equal(M.zIndexOf(p, M.clipById(p, "title")), 22);
  assert.equal(M.zIndexOf(p, M.clipById(p, "cap")), 40, "the CAPTIONS track above still wins");
});

test("a test-render slice flattens groups first", () => {
  const p = demo();
  M.groupClips(p, ["card", "title"], "g");
  const q = M.sliceProject(p, 5, 8);
  assert.ok(!q.clips.some((c) => c.type === "group"));
  const t = q.clips.find((c) => c.type === "text"); assert.equal(t.start, 0); assert.equal(t.duration, 3);
});

console.log(`\n${n} passed${process.exitCode ? ", with failures" : ""}`);
