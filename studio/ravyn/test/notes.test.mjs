// node ravyn/test/notes.test.mjs   (run from the reels root or anywhere)
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as M from "../lib/model.mjs";
import * as N from "../lib/notes.mjs";
import * as O from "../lib/node-ops.mjs";

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("ok   " + name); } catch (e) { console.log("FAIL " + name + "\n     " + (e.stack || e)); process.exitCode = 1; } };

function demo() {
  const p = M.newProject({ id: "t", fps: 30, duration: 10 });
  const [v1, v2] = M.videoTracks(p).map((t) => t.id);
  M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 10, mediaDuration: 20, track: v1, x: 0, y: 0, w: 1080, h: 1920 });
  M.addClip(p, "text", { start: 2, duration: 3, track: v2, text: "HELLO", x: 100, y: 1500, w: 600, h: 120 });
  p.words = [{ text: "one", start: 2, end: 2.4 }, { text: "two", start: 2.4, end: 2.9 }, { text: "three", start: 3.1, end: 3.6 }];
  return p;
}

test("a click on the caption spot lists the text first, then the footage under it", () => {
  const p = demo();
  const ctx = N.captureContext(p, 2.5, 300, 1550);
  assert.deepEqual(ctx.clips.map((c) => c.type), ["text", "video"]);
  assert.equal(ctx.clips[0].text, "HELLO");
  assert.deepEqual(ctx.clips[0].box, [100, 1500, 600, 120]);
  assert.equal(ctx.word, "two");
  assert.match(ctx.line, /one two three/);
});
test("a click outside the text, or after it ends, does not name it", () => {
  const p = demo();
  assert.deepEqual(N.captureContext(p, 2.5, 900, 300).clips.map((c) => c.type), ["video"]);
  assert.deepEqual(N.captureContext(p, 6, 300, 1550).clips.map((c) => c.type), ["video"]);
});
test("a box catches every clip it meets", () => {
  const p = demo();
  const ctx = N.captureContext(p, 3, 650, 1400, 200, 150);
  assert.deepEqual(ctx.clips.map((c) => c.type), ["text", "video"]);
});
test("makeNote quantises to the frame, numbers in order, keeps the spot", () => {
  const p = demo(); const doc = N.emptyNotes("t");
  const a = N.makeNote(p, doc, { t: 2.5123, x: 300.4, y: 1550.6, text: "too low" }); doc.notes.push(a);
  const b = N.makeNote(p, doc, { t: 1, x: 10, y: 10 });
  assert.equal(a.t, 2.5); assert.equal(a.frame, 75); assert.equal(a.x, 300); assert.equal(a.y, 1551);
  assert.equal(a.n, 1); assert.equal(b.n, 2); assert.equal(a.status, "open");
});
test("normalizeNotes sorts by time, fills numbers, keeps status", () => {
  const d = N.normalizeNotes({ notes: [{ t: 5, text: "b", status: "fixed" }, { t: 1, n: 4, text: "a" }, { nope: 1 }] }, "t");
  assert.deepEqual(d.notes.map((x) => x.text), ["a", "b"]);
  assert.deepEqual(d.notes.map((x) => x.n), [4, 5]);
  assert.equal(d.notes[1].status, "fixed");
});
test("the report says the time, the spot, the words and what is under it", () => {
  const p = demo(); const doc = N.emptyNotes("t");
  doc.notes.push(N.makeNote(p, doc, { t: 2.5, x: 300, y: 1550, text: "captions too low" }));
  const r = N.report(doc);
  for (const s of ["#1  0:02.50", "frame 75", "point 300,1550", '"captions too low"', "saying:", "text", "HELLO"]) assert.ok(r.includes(s), `missing ${s}\n${r}`);
});
console.log(`\n${n} passed`);
