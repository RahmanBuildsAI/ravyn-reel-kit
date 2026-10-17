// node ravyn/test/model.test.mjs   (run from the reels root or anywhere)
import assert from "node:assert/strict";
import * as M from "../lib/model.mjs";
import { compileHtml, compileOps } from "../lib/compile.mjs";

const r3 = M.r3;
let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("ok   " + name); } catch (e) { console.log("FAIL " + name + "\n     " + (e.message || e)); process.exitCode = 1; } };

test("new project has 3 video + 2 audio tracks and frame-quantises", () => {
  const p = M.newProject({ id: "t", fps: 30 });
  assert.equal(M.videoTracks(p).length, 3); assert.equal(M.audioTracks(p).length, 2);
  assert.equal(M.quant(1.02, 30), 1.033);
  assert.equal(M.quant(1.02, 29.97), 1.034);
  assert.equal(M.quant(1.0166, 30), 1);
});

test("addClip lands on the first track of its kind and extends the project", () => {
  const p = M.newProject({ id: "t", duration: 5 });
  const c = M.addClip(p, "video", { src: "a.mp4", start: 4, duration: 3, mediaDuration: 10 });
  assert.equal(c.track, M.videoTracks(p)[0].id);
  assert.equal(p.duration, 7);
  assert.throws(() => M.addClip(p, "audio", { src: "x.mp3", track: M.videoTracks(p)[0].id }));
});

test("overwrite: dropping a clip on another trims, splits or removes it", () => {
  const p = M.newProject({ id: "t" });
  const v1 = M.videoTracks(p)[0].id;
  const big = M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 10, mediaDuration: 20, track: v1 });
  M.addClip(p, "video", { src: "b.mp4", start: 3, duration: 2, mediaDuration: 5, track: v1 });
  const list = M.clipsOnTrack(p, v1);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((c) => [c.start, c.duration, c.mediaStart]), [[0, 3, 0], [3, 2, 0], [5, 5, 5]]);
  assert.equal(list[2].src, "a.mp4"); assert.notEqual(list[2].id, big.id);
});

test("trim in/out respects media bounds and neighbours", () => {
  const p = M.newProject({ id: "t" });
  const v1 = M.videoTracks(p)[0].id;
  const a = M.addClip(p, "video", { src: "a.mp4", start: 2, duration: 4, mediaDuration: 6, mediaStart: 1, track: v1 });
  const b = M.addClip(p, "video", { src: "b.mp4", start: 8, duration: 2, mediaDuration: 10, mediaStart: 3, track: v1 });
  M.trimClip(p, a.id, { end: 12 });            // media allows 5s from mediaStart 1 -> end 7
  assert.equal(M.clipEnd(a), 7);
  M.trimClip(p, a.id, { start: -3 });          // mediaStart 1 -> can go back 1s, not 5
  assert.equal(a.start, 1); assert.equal(a.mediaStart, 0); assert.equal(a.duration, 6);
  M.trimClip(p, b.id, { start: 2 });           // media allows back to 5, but a ends at 7
  assert.equal(b.start, 7); assert.equal(b.mediaStart, 2); assert.equal(b.duration, 3);
  M.trimClip(p, b.id, { start: 9 });
  assert.equal(b.start, 9); assert.equal(b.mediaStart, 4); assert.equal(b.duration, 1);
  const c = M.addClip(p, "video", { src: "c.mp4", start: 20, duration: 2, mediaDuration: 10, track: v1 });
  M.trimClip(p, c.id, { start: 15 });          // mediaStart 0: nothing earlier exists, so no change
  assert.equal(c.start, 20);
});

test("split at the playhead keeps media continuity and keyframes", () => {
  const p = M.newProject({ id: "t" });
  const c = M.addClip(p, "video", { src: "a.mp4", start: 2, duration: 6, mediaDuration: 20, mediaStart: 3, keyframes: { x: [{ t: 0, v: 0 }, { t: 6, v: 600 }] }, exit: { type: "fade" } });
  const [l, r] = M.splitClip(p, c.id, 5);
  const L = M.clipById(p, l), R = M.clipById(p, r);
  assert.deepEqual([L.start, L.duration, L.mediaStart], [2, 3, 3]);
  assert.deepEqual([R.start, R.duration, R.mediaStart], [5, 3, 6]);
  assert.equal(M.valueAt(L.keyframes.x, 3), 300);
  assert.equal(R.keyframes.x[0].t, 0); assert.equal(R.keyframes.x[0].v, 300);
  assert.equal(L.exit.type, "none"); assert.equal(R.exit.type, "fade");
  assert.equal(M.splitClip(p, l, 2), null);   // on the edge = no split
});

test("razor across all tracks splits only what is under t", () => {
  const p = M.newProject({ id: "t" });
  const v = M.videoTracks(p), a = M.audioTracks(p);
  M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 10, mediaDuration: 10, track: v[0].id });
  M.addClip(p, "text", { start: 6, duration: 2, track: v[1].id });
  M.addClip(p, "audio", { src: "vo.mp3", start: 0, duration: 10, mediaDuration: 10, track: a[0].id });
  const cuts = M.splitAt(p, 4);
  assert.equal(cuts.length, 2); assert.equal(p.clips.length, 5);
});

test("ripple delete closes the gap on that track", () => {
  const p = M.newProject({ id: "t" });
  const v1 = M.videoTracks(p)[0].id;
  const a = M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 2, mediaDuration: 2, track: v1 });
  const b = M.addClip(p, "video", { src: "b.mp4", start: 2, duration: 2, mediaDuration: 2, track: v1 });
  const c = M.addClip(p, "video", { src: "c.mp4", start: 5, duration: 2, mediaDuration: 2, track: v1 });
  M.rippleDelete(p, b.id);
  assert.equal(M.clipById(p, c.id).start, 3); assert.equal(M.clipById(p, a.id).start, 0);
});

test("slip moves the media inside a fixed window", () => {
  const p = M.newProject({ id: "t" });
  const c = M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 4, mediaDuration: 10 });
  M.slipClip(p, c.id, 8);
  assert.equal(c.mediaStart, 6); assert.equal(c.start, 0); assert.equal(c.duration, 4);
  M.slipClip(p, c.id, -100); assert.equal(c.mediaStart, 0);
});

test("forward/back moves between tracks, creates one at the top, refuses occupied", () => {
  const p = M.newProject({ id: "t" });
  const v = M.videoTracks(p);
  const a = M.addClip(p, "text", { start: 0, duration: 2, track: v[0].id });
  const b = M.addClip(p, "text", { start: 0, duration: 2, track: v[1].id });
  assert.equal(M.moveClipToTrack(p, a.id, +1), false);      // b is there
  assert.equal(M.moveClipToTrack(p, a.id, -1), false);      // nothing below V1
  assert.equal(M.moveClipToTrack(p, b.id, +1), true); assert.equal(b.track, v[2].id);
  assert.equal(M.moveClipToTrack(p, b.id, +1), true); assert.equal(M.videoTracks(p).length, 4);
  assert.equal(M.zIndexOf(p, b), 40); assert.equal(M.zIndexOf(p, a), 10);
});

test("track reorder changes stacking and audio tracks stay grouped", () => {
  const p = M.newProject({ id: "t" });
  const v = M.videoTracks(p);
  M.moveTrack(p, v[0].id, +1);
  assert.equal(M.videoTracks(p)[1].id, v[0].id);
  const t = M.addTrack(p, "audio");
  assert.equal(t.name, "A3"); assert.equal(p.tracks[p.tracks.length - 1].id, t.id);
  M.addTrack(p, "video");
  assert.equal(M.videoTracks(p).length, 4); assert.equal(p.tracks.findIndex((x) => x.kind === "audio"), 4);
});

test("slice for a test render shifts and trims everything", () => {
  const p = M.newProject({ id: "t", duration: 20 });
  M.addClip(p, "video", { src: "a.mp4", start: 0, duration: 20, mediaDuration: 20 });
  M.addClip(p, "text", { start: 4, duration: 2, track: M.videoTracks(p)[1].id });
  M.addClip(p, "caption", { start: 3, duration: 4, track: M.videoTracks(p)[2].id, words: [{ text: "a", start: 3, end: 4 }, { text: "b", start: 5.5, end: 6 }] });
  M.addMarker(p, 5.5, "cut");
  const q = M.sliceProject(p, 5, 8);
  assert.equal(q.duration, 3); assert.equal(q.id, "t-test");
  const vid = q.clips.find((c) => c.type === "video");
  assert.deepEqual([vid.start, vid.duration, vid.mediaStart], [0, 3, 5]);
  const txt = q.clips.find((c) => c.type === "text");
  assert.deepEqual([txt.start, txt.duration], [0, 1]);
  const cap = q.clips.find((c) => c.type === "caption");
  assert.equal(cap.words.length, 1); assert.equal(cap.words[0].start, 0.5);
  assert.equal(q.markers[0].t, 0.5);
});

test("validate catches overlap, missing src, media overrun and em-dashes", () => {
  const p = M.newProject({ id: "t" });
  const v1 = M.videoTracks(p)[0].id;
  M.addClip(p, "video", { src: "", start: 0, duration: 2, track: v1 });
  p.clips.push(M.defaultClip("video", { id: "zz", src: "b.mp4", start: 1, duration: 5, mediaDuration: 2, track: v1 }, p));
  M.addClip(p, "text", { text: "a \u2014 b", track: M.videoTracks(p)[1].id });
  const r = M.validate(p);
  assert.ok(r.errors.some((e) => /no src/.test(e)));
  assert.ok(r.errors.some((e) => /overlap/.test(e)));
  assert.ok(r.errors.some((e) => /media is/.test(e)));
  assert.ok(r.warnings.some((e) => /em dash/.test(e)), "an em dash is flagged");
});

test("compile emits one element per clip, direct children of #root, literal tweens", () => {
  const p = M.newProject({ id: "demo-x", title: "X", duration: 6 }); p.watermark.on = true;
  const v = M.videoTracks(p);
  M.addClip(p, "video", { src: "assets/r01/a.mp4", start: 0, duration: 6, mediaDuration: 6, mediaStart: 1.5, track: v[0].id });
  M.addClip(p, "text", { text: "Hello <b>", start: 1, duration: 2, track: v[1].id, enter: { type: "slideUp", dur: 0.4 }, exit: { type: "fade" }, x: 100, y: 200, w: 800, h: 100 });
  M.addClip(p, "audio", { src: "assets/r01/vo.mp3", start: 0, duration: 6, mediaDuration: 6 });
  const html = compileHtml(p);
  assert.ok(html.includes('data-composition-id="demo-x"'));
  assert.ok(html.includes('data-media-start="1.500"'));
  assert.ok(html.includes("Hello &lt;b&gt;"));
  // font family names carry quotes; inside a double-quoted style attribute they must be escaped
  assert.ok(html.includes('font:800 64px/1.15 &quot;Inter&quot;,&quot;Segoe UI&quot;'), "style attribute escapes the font family quotes");
  assert.ok(!/style="[^"]*"Inter"/.test(html));
  assert.ok(/tl\.fromTo\("#c2",\{opacity:0,y:260\},\{opacity:1,y:200,duration:0\.4,ease:"power3\.out"\},1\.000\);/.test(html));
  assert.ok(/<audio id="c3" class="clip cr-audio"/.test(html));
  assert.ok(html.includes('tl.set("#c2",{opacity:0},3.000);'), "an exit fade gets a hard kill on the boundary (hyperframes lint gsap_exit_missing_hard_kill)");
  assert.ok(!/pointer-events:none[^#]*id="c2"/.test(html) && !html.includes('cr-text" data-start="1.000" data-duration="2.000" data-track-index="11" style="[^"]*pointer-events'), "no pointer-events:none on clips");
  assert.ok(!html.includes("\u2014"));
  // every clip element is a direct child of #root (no nested timed wrappers)
  const body = html.split('<div id="root"')[1].split("</div>\n\n<script>")[0];
  const depth = (body.match(/<div /g) || []).length;
  assert.equal(depth, 1 + 1, "one text div + the watermark div");
  const ops = compileOps(p);
  assert.equal(ops.init.length, 2);
});

test("keyframes: upsert, resolve at a time, set-as-of-now, bake", () => {
  const p = M.newProject({ id: "t" });
  const c = M.addClip(p, "text", { start: 2, duration: 4, x: 100 });
  assert.equal(M.setPropAt(c, "x", 150, 1), null);          // no keys: base moves
  assert.equal(c.x, 150);
  M.upsertKey(c, "x", 0, 0); M.upsertKey(c, "x", 2, 200);
  assert.equal(M.clipAt(c, 3).x, 100);                       // half way, absolute t=3 -> rel 1
  M.setPropAt(c, "x", 300, 2);                                // keys exist: updates the key at rel 2
  assert.equal(c.keyframes.x.length, 2); assert.equal(c.keyframes.x[1].v, 300);
  M.setPropAt(c, "x", 50, 4);                                 // new key at the clip end
  assert.equal(c.keyframes.x.length, 3);
  assert.equal(M.clipAt(c, 6).x, 50);
  assert.ok(M.removeKey(c, "x", 4)); assert.equal(c.keyframes.x.length, 2);
  M.bakeKeys(c, "x", 1); assert.equal(c.x, 150); assert.equal(M.hasKeys(c, "x"), false);
});

test("buildCues: 3-word cues, punctuation + pause breaks, no cue lost, none under 0.16s unless alone", () => {
  const words = [];
  let t = 0;
  for (const w of "Upwork just revealed which AI skills, are actually in demand. And the numbers".split(" ")) { words.push({ text: w, start: r3(t), end: r3(t + 0.2) }); t += 0.25; }
  words.push({ text: "shocked", start: r3(t + 0.6), end: r3(t + 0.9) });   // a pause before it
  words.push({ text: "me", start: r3(t + 0.9), end: r3(t + 0.95) });       // a very short last word
  const cues = M.buildCues(words, { fps: 30, maxWords: 3, pause: 0.24 });
  const placed = cues.reduce((a, q) => a + q.words.length, 0);
  assert.equal(placed, words.length, "every word lands in exactly one cue");
  assert.ok(cues.every((q) => q.words.length <= 3 || q.duration < 0.16 === false));
  assert.deepEqual(cues[1].words.map((w) => w.text), ["which", "AI", "skills,"]);   // punctuation ends the cue
  assert.equal(cues.find((q) => q.words[0].text === "shocked").start, M.quant(t + 0.6, 30));
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= r3(cues[i - 1].start + cues[i - 1].duration) - 1e-6, "cues never overlap");
  assert.ok(cues.every((q) => q.duration >= 0.16), "no invisible cue");
});

test("window: spans, cut snapping, per-scene cues, sliced states, the window moves", () => {
  const p = M.newProject({ id: "t", reel: 1, duration: 12 });
  p.words = [];
  let t = 0.3;
  for (const w of "one two three four. five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen".split(" ")) { p.words.push({ text: w, start: r3(t), end: r3(t + 0.3) }); t += 0.6; }
  M.addClip(p, "facecam", { src: "assets/r01/facecam.mp4", start: 0, duration: 12, mediaDuration: 12, states: [{ t: 0, state: "full" }] });
  M.addMarker(p, 4.0, "jump cut");
  const b1 = M.addBoundary(p, 3.8, "stack");           // your cut at 4.0 is within reach: it wins
  assert.equal(b1.t, 4);
  const b2 = M.addBoundary(p, 7.55, "none");           // no cut: lands in the silence after "twelve" ends (7.2+0.1..7.5-0.12)
  assert.ok(b2.t >= 7.3 && b2.t <= 7.4, `got ${b2.t}`);
  const spans = M.sceneSpans(p);
  assert.deepEqual(spans.map((s) => s.state), ["full", "stack", "none"]);
  assert.equal(M.stateAt(p, 5), "stack");
  const cues = M.buildSceneCues(p);
  assert.ok(cues.every((q) => q.words.length <= 4));
  for (const q of cues) { const s = spans.find((x) => x.id === q.scene); assert.ok(q.start >= s.t - 1e-6 && q.start + q.duration <= s.end + 1e-6, "cue inside its scene"); }
  const lastOf = (id) => cues.filter((q) => q.scene === id).at(-1);
  assert.equal(r3(lastOf("S01").start + lastOf("S01").duration), 4, "a scene's last cue runs to the cut");
  assert.equal(cues.find((q) => q.scene === "S01").sys, "capFace"); assert.equal(cues.find((q) => q.scene === "S02").sys, "capSeam");
  assert.equal(cues.find((q) => q.scene === "S02").y, 870, "the seam pill rides the stack window's top edge");
  assert.equal(cues.find((q) => q.scene === "S03").sys, "capGround");
  // a test-render slice opens in the state that was live at `from`
  const q = M.sliceProject(p, 5, 9);
  const fc = q.clips.find((c) => c.type === "facecam");
  assert.deepEqual(fc.states.map((s) => [s.t, s.state]), [[0, "stack"], [r3(b2.t - 5), "none"]]);
  const html = compileHtml(p);
  // the window starts full, shrinks into the stack window 1 ms before the cut, then drops out of the frame.
  // It moves on transforms + clip-path only (left/top would snap to whole pixels and judder).
  assert.ok(html.includes('gsap.set("#fcwrap",{x:0,y:0,scale:1,clipPath:"inset(0px 0px 0px 0px round 0px)"'), "starts full frame");
  const moves = html.split(/\r?\n/).filter((l) => l.startsWith('tl.fromTo("#fcwrap"'));
  assert.equal(moves.length, 2, "one window move per scene change");
  assert.ok(moves[0].includes("{x:60,y:651.47,scale:0.889,clipPath:") && moves[0].endsWith(",3.999);"), "full to stack at the cut");
  assert.ok(moves[1].includes("{x:60,y:1701.47,scale:0.889") && moves[1].includes(`ease:"power2.in"`), "stack drops out below the frame, same shape");
  assert.ok(!/fcwrap",\{[^}]*\b(left|top|width|height):/.test(html), "no layout properties in the window tweens");
  assert.ok(!/cutout|fccut|blurbed/.test(html), "no cutout layer anywhere");
  assert.ok(/<div class="sc clip ff" id="S01" data-start="0.000"/.test(html));
  // the bubble is a circle with the accent ring
  M.setSpanState(p, 1, { state: "bubble" });
  const h2 = compileHtml(p);
  assert.ok(h2.includes('scale:0.37,clipPath:"inset(189.6px 0px 650.4px 0px round 540px)"'), "bubble: a 400 px circle");
  assert.ok(h2.includes('tl.fromTo("#fcring",{opacity:0,scale:1.12}'), "the ring lands with the bubble");
  assert.deepEqual(M.validate(p).warnings.filter((w) => /no "(full|none)" scene|face \+ element/.test(w)), [], "all three scene types present");
});

console.log(`\n${n} passed${process.exitCode ? ", with failures" : ""}`);
