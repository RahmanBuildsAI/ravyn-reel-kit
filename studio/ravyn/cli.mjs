#!/usr/bin/env node
// The ravyn CLI. Run from anywhere (paths resolve from this file).
//   node ravyn/cli.mjs new <reel> <slug> [--title "..."] [--fps 30] [--size 1920x1080] [--no-ingest]
//   node ravyn/cli.mjs list
//   node ravyn/cli.mjs compile <id>                 -> variants/<id>.html + .ravyn/build/<id>/index.html
//   node ravyn/cli.mjs check <id> [--from a --to b]  -> npx hyperframes check on the build dir
//   node ravyn/cli.mjs render <id> [--from a --to b] [--quality draft|standard|high] [--no-gpu]
//   node ravyn/cli.mjs proxy <id>                   -> proxies for every video clip in the project
//   node ravyn/cli.mjs probe <src>
//   node ravyn/cli.mjs validate <id>
//   node ravyn/cli.mjs notes <id|reel> [--all]        -> your review notes: time, spot, what is under it
//   node ravyn/cli.mjs note-fix <id|reel> <n> "what changed"   -> mark note #n fixed (the editor updates live)
//   node ravyn/cli.mjs note-reopen <id|reel> <n>
//   node ravyn/cli.mjs edits <id|reel> [--clear]     -> your hand edits in the editor (re-applied on every build)
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as M from "./lib/model.mjs";
import * as O from "./lib/node-ops.mjs";
import * as N from "./lib/notes.mjs";
import * as E from "./lib/edits.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const pos = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(arr[i - 1] || "").startsWith("--") || /^--(no-ingest|no-gpu)$/.test(arr[i - 1] || ""));
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const out = (s) => process.stdout.write(s);

async function main() {
  switch (cmd) {
    case "new": {
      const reel = +pos[0]; const slug = pos[1] || "untitled";
      const [sw, sh] = String(flag("--size", "1080x1920")).split("x").map(Number);
      const r = O.createProject({ reel: Number.isFinite(reel) ? reel : null, slug, title: flag("--title"), fps: +flag("--fps", 0) || undefined, width: sw, height: sh, importIngest: !has("--no-ingest") });
      out(`created projects/${r.project.id}.json\n` + r.notes.map((n) => "  " + n + "\n").join(""));
      return;
    }
    case "list": { for (const p of O.listProjects()) out(`${p.id.padEnd(40)} ${String(p.clips).padStart(4)} clips  ${p.duration}s  ${p.modified}\n`); return; }
    case "validate": { const p = O.loadProject(pos[0]); const v = M.validate(p); out(JSON.stringify(v, null, 2) + "\n"); process.exitCode = v.ok ? 0 : 1; return; }
    case "compile": { const p = O.loadProject(pos[0]); const b = O.buildProject(p); out(`compiled ${O.toPosix(b.variant)}\n         ${O.toPosix(b.index)}\n`); if (!b.validate.ok) out("validate: " + b.validate.errors.join("; ") + "\n"); return; }
    case "check": {
      const p = O.loadProject(pos[0]); const slice = flag("--from") != null ? { from: +flag("--from"), to: +flag("--to") } : null;
      const b = O.buildProject(p, { slice });
      const j = await O.runJob("npx", O.hfArgs("check", b.dir), { onLine: out });
      process.exitCode = j.code; return;
    }
    case "render": {
      const p = O.loadProject(pos[0]); const slice = flag("--from") != null ? { from: +flag("--from"), to: +flag("--to") } : null;
      const b = O.buildProject(p, { slice });
      const o = slice ? join(O.RENDERS, `${p.id}-test-${String(slice.from).replace(".", "_")}s.mp4`) : O.nextRenderName(p.id);
      const args = O.hfArgs("render", b.dir, "-o", o, "--fps", String(p.fps), "--sdr", "--video-frame-format", "png", "-q", flag("--quality", "standard"), "--workers", flag("--workers", "2"));
      if (!has("--no-gpu")) args.push("--gpu");
      const j = await O.runJob("npx", args, { onLine: out });
      out(j.code === 0 ? `\nrendered ${O.toPosix(o)}\n` : `\nrender failed (${j.code})\n`);
      process.exitCode = j.code; return;
    }
    case "proxy": {
      const p = O.loadProject(pos[0]);
      const srcs = O.videoSrcs(p);
      for (const s of srcs) { out(`proxy ${s} `); const r = await O.makeProxy(s, (pct) => out(pct % 20 === 0 ? `${pct}% ` : "")); out(r.ok ? `-> ${r.proxy}${r.cached ? " (cached)" : ""}\n` : `FAILED ${r.error}\n`); }
      return;
    }
    case "notes": {
      const id = O.resolveProjectId(argv[1]); const doc = O.loadNotes(id);
      let fps = 30; try { fps = O.loadProject(id).fps || 30; } catch {}
      out(N.report(doc, { all: has("--all"), fps }) + "\n"); return;
    }
    case "note-fix": case "note-reopen": {
      const id = O.resolveProjectId(argv[1]); const num = +argv[2]; const doc = O.loadNotes(id);
      const n = doc.notes.find((x) => x.n === num); if (!n) throw new Error(`${id} has no note #${argv[2]}`);
      if (cmd === "note-fix") { n.status = "fixed"; n.fix = { note: argv.slice(3).join(" ").trim() || null, at: new Date().toISOString() }; }
      else { n.status = "open"; n.fix = null; }
      n.modified = new Date().toISOString();
      O.saveNotes(id, doc);
      out(`${id} #${n.n} ${n.status}${n.fix?.note ? `: ${n.fix.note}` : ""}\n`); return;
    }
    case "edits": {
      const id = O.resolveProjectId(argv[1]); const { edits, updated } = O.loadEdits(id);
      if (has("--clear")) { O.saveEdits(id, []); out(`${id}: ${edits.length} hand edits cleared (port them into cut.mjs first)\n`); return; }
      out(`${id} · ${edits.length} hand edits${updated ? ` (last ${updated})` : ""}. Every build re-applies them; port them into cut.mjs to make them permanent.\n\n${E.describe(edits)}\n`); return;
    }
    case "probe": { out(JSON.stringify(O.probe(pos[0]), null, 2) + "\n"); return; }
    default:
      out(`ravyn: new | list | validate | compile | check | render | proxy | probe | notes | note-fix | note-reopen | edits\n`);
      if (cmd && !existsSync(join(O.PROJECTS, `${cmd}.json`))) process.exitCode = 2;
  }
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
