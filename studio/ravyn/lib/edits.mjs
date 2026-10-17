// Your hand edits survive a rebuild. cut.mjs deletes and rewrites the project on every run, so a
// caption you nudged in the editor used to vanish the next time Claude applied a note. Now:
//
//   build save  (cut.mjs, O.saveProject default)  -> the project as built is kept as the BASE
//                                                    (projects/edits/<id>.base.json), then your
//                                                    edits are re-applied on top and saved
//   editor save (the editor, /api/project)            -> your edits = diff(base, what you have now),
//                                                    written to projects/edits/<id>.json
//
// An edit is one clip change keyed by who the clip is (id, type, name, start), not just its id,
// because a rebuild can renumber clips. Re-applying: a prop the build ALSO changed since you edited
// it is dropped (Claude's newer fix wins, and says so); a prop the build already matches is
// "ported" (Claude moved it into cut.mjs); anything else is set back to your value.
import * as M from "./model.mjs";

const SKIP = new Set(["id"]);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const trackName = (p, id) => M.trackById(p, id)?.name ?? id;
const keyOf = (c) => ({ id: c.id, type: c.type, name: c.name || null, start: c.start });
/* the leaf clips, the ones that render (groups are containers; their children carry the edits) */
const leaves = (p) => M.allClips(p);

export function diffProjects(base, cur) {
  const out = [];
  const b = new Map(leaves(base).map((c) => [c.id, c])), n = new Map(leaves(cur).map((c) => [c.id, c]));
  for (const [id, c] of n) {
    const o = b.get(id);
    if (!o || o.type !== c.type) { out.push({ added: { ...JSON.parse(JSON.stringify(c)), track: trackName(cur, c.track) }, key: keyOf(c) }); continue; }
    const changes = {};
    for (const k of new Set([...Object.keys(o), ...Object.keys(c)])) {
      if (SKIP.has(k)) continue;
      if (k === "h" && c.type === "text" && c.hAuto !== false) continue;   // the editor measures auto-height text; not your edit
      if (k === "track") { const a = trackName(base, o.track), z = trackName(cur, c.track); if (a !== z) changes.track = { from: a, to: z }; continue; }
      if (!same(o[k], c[k])) changes[k] = { from: o[k] ?? null, to: c[k] ?? null };
    }
    if (Object.keys(changes).length) out.push({ key: keyOf(o), changes });
  }
  for (const [id, o] of b) if (!n.has(id)) out.push({ key: keyOf(o), deleted: true });
  return out;
}

/* the clip in p that an edit's key names: same id with the same type and name, else the same type
   and name nearest in time (within a second) */
export function findClip(p, key) {
  const all = leaves(p);
  const byId = all.find((c) => c.id === key.id && c.type === key.type && (c.name || null) === key.name);
  if (byId) return byId;
  let best = null, d = 1.0001;
  for (const c of all) if (c.type === key.type && (c.name || null) === key.name && Math.abs(c.start - key.start) < d) { d = Math.abs(c.start - key.start); best = c; }
  return best;
}
const scopeFor = (p, c) => { const g = M.groupOf(p, c.id); return g ? M.scopeOf(p, g.id) : p; };

/* re-apply your edits onto a freshly built project (mutates p). Returns what happened, per edit. */
export function applyEdits(p, edits) {
  const r = { applied: [], ported: [], dropped: [], missing: [] };
  const label = (e) => `${e.key.type}${e.key.name ? ` "${e.key.name}"` : ""} (${e.key.id} @${e.key.start}s)`;
  for (const e of edits || []) {
    if (e.added) {
      const a = e.added;
      if (findClip(p, { ...e.key, id: "" })) { r.ported.push(`${label(e)} added`); continue; }
      const t = p.tracks.find((x) => x.name === a.track);
      if (!t) { r.missing.push(`${label(e)} added: no track ${a.track}`); continue; }
      const c = { ...JSON.parse(JSON.stringify(a)), id: M.nextId(p, "c"), track: t.id };
      if (M.placeClip(p, c, "reject")) r.applied.push(`${label(e)} added`); else r.missing.push(`${label(e)} added: its track is taken there now`);
      continue;
    }
    const c = findClip(p, e.key);
    if (!c) { r.missing.push(`${label(e)}${e.deleted ? " deleted" : ""}: not in this build`); continue; }
    if (e.deleted) { M.removeClip(scopeFor(p, c), c.id); r.applied.push(`${label(e)} deleted`); continue; }
    for (const [k, { from, to }] of Object.entries(e.changes || {})) {
      if (k === "track") {
        const cur = trackName(p, c.track);
        if (cur === to) { r.ported.push(`${label(e)} track`); continue; }
        if (cur !== from) { r.dropped.push(`${label(e)} track: the build moved it to ${cur}`); continue; }
        const t = scopeFor(p, c).tracks.find((x) => x.name === to);
        if (!t) { r.missing.push(`${label(e)} track: no track ${to}`); continue; }
        c.track = t.id; r.applied.push(`${label(e)} track -> ${to}`); continue;
      }
      if (same(c[k], to)) { r.ported.push(`${label(e)} ${k}`); continue; }
      if (!same(c[k], from)) { r.dropped.push(`${label(e)} ${k}: the build changed it (${JSON.stringify(c[k])}), your ${JSON.stringify(to)} not applied`); continue; }
      c[k] = JSON.parse(JSON.stringify(to)); r.applied.push(`${label(e)} ${k} -> ${short(to)}`);
    }
  }
  M.normalizeGroups?.(p);
  return r;
}
const short = (v) => { const s = JSON.stringify(v); return s.length > 60 ? s.slice(0, 57) + "..." : s; };

/* plain text, for the CLI */
export function describe(edits) {
  if (!edits?.length) return "no hand edits";
  return edits.map((e) => {
    const who = `${e.key.type}${e.key.name ? ` "${e.key.name}"` : ""} ${e.key.id} @${e.key.start}s`;
    if (e.added) return `+ added ${who} on ${e.added.track}${e.added.text ? ` text "${e.added.text}"` : ""}`;
    if (e.deleted) return `- deleted ${who}`;
    return `~ ${who}: ` + Object.entries(e.changes).map(([k, v]) => `${k} ${short(v.from)} -> ${short(v.to)}`).join(", ");
  }).join("\n");
}
