// node ravyn/test/edits.test.mjs   (run from the reels root or anywhere)
// Your hand edits survive a rebuild (lib/edits.mjs).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as M from "../lib/model.mjs";
import * as E from "../lib/edits.mjs";
import * as O from "../lib/node-ops.mjs";

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("ok   " + name); } catch (e) { console.log("FAIL " + name + "\n     " + (e.stack || e)); process.exitCode = 1; } };
const clone = (x) => JSON.parse(JSON.stringify(x));

/* what cut.mjs would build: the same reel every time */
function build({ captionY = 1380 } = {}) {
  const p = M.newProject({ id: "t", fps: 30, duration: 10 });
  const [v1, v2, v3] = M.videoTracks(p).map((t) => t.id);
  M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 10, mediaDuration: 20, track: v1, name: "face" });
  M.addClip(p, "text", { start: 2, duration: 3, track: v2, text: "HELLO", name: "hook", x: 100, y: 1500, w: 600, h: 120, hAuto: false });
  M.addClip(p, "text", { start: 6, duration: 2, track: v2, text: "CAP", name: "cap", x: 60, y: captionY, w: 960, h: 90, hAuto: false });
  M.addClip(p, "shape", { start: 1, duration: 2, track: v3, name: "flash" });
  return p;
}
const byName = (p, name) => M.allClips(p).find((c) => c.name === name);

test("no edits: an untouched project diffs to nothing", () => {
  const b = build(); assert.deepEqual(E.diffProjects(b, M.normalize(clone(b))), []);
});
test("you move the hook, fix a typo, delete the flash: three edits", () => {
  const base = build(), cur = clone(base);
  byName(cur, "hook").y = 1200; byName(cur, "hook").text = "HELLO!";
  cur.clips = cur.clips.filter((c) => c.name !== "flash");
  const d = E.diffProjects(base, cur);
  assert.equal(d.length, 2);
  assert.deepEqual(Object.keys(d.find((e) => e.changes).changes).sort(), ["text", "y"]);
  assert.ok(d.find((e) => e.deleted && e.key.name === "flash"));
});
test("a rebuild re-applies them, even when the clip ids moved", () => {
  const base = build(), cur = clone(base);
  byName(cur, "hook").y = 1200; cur.clips = cur.clips.filter((c) => c.name !== "flash");
  const edits = E.diffProjects(base, cur);
  const next = build();                                    // a fresh build
  M.addClip(next, "shape", { start: 0, duration: 1, track: M.videoTracks(next)[2].id, name: "new first", x: 0, y: 0 });
  for (const c of M.allClips(next)) c.id = "z" + c.id;      // every id different now
  const r = E.applyEdits(next, edits);
  assert.equal(byName(next, "hook").y, 1200);
  assert.equal(byName(next, "flash"), undefined);
  assert.equal(r.applied.length, 2); assert.equal(r.missing.length, 0);
});
test("Claude's newer fix to the same prop wins, and is reported", () => {
  const base = build(), cur = clone(base);
  byName(cur, "cap").y = 1300;                              // you nudged the caption
  const edits = E.diffProjects(base, cur);
  const next = build({ captionY: 600 });                   // then a note fix moved it in cut.mjs
  const r = E.applyEdits(next, edits);
  assert.equal(byName(next, "cap").y, 600);
  assert.equal(r.dropped.length, 1);
});
test("an edit Claude ported into cut.mjs counts as ported, not re-applied", () => {
  const base = build(), cur = clone(base);
  byName(cur, "cap").y = 1300;
  const r = E.applyEdits(build({ captionY: 1300 }), E.diffProjects(base, cur));
  assert.equal(r.ported.length, 1); assert.equal(r.applied.length, 0);
});
test("a clip you added comes back once, not twice", () => {
  const base = build(), cur = clone(base);
  M.addClip(cur, "text", { start: 8.5, duration: 1, track: M.videoTracks(cur)[1].id, text: "MINE", name: "my text" });
  const edits = E.diffProjects(base, cur);
  const next = build(); E.applyEdits(next, edits);
  assert.equal(M.allClips(next).filter((c) => c.name === "my text").length, 1);
  E.applyEdits(next, edits);
  assert.equal(M.allClips(next).filter((c) => c.name === "my text").length, 1);
});
test("auto-height text measured by the editor is not an edit", () => {
  const base = build(), cur = clone(base);
  const h = byName(cur, "hook"); h.hAuto = true; byName(base, "hook").hAuto = true; h.h = 131;
  assert.deepEqual(E.diffProjects(base, cur), []);
});
console.log(`\n${n} passed`);
