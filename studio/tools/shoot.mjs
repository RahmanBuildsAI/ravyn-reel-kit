#!/usr/bin/env node
// SHOOT: turn HTML slides into PNGs with headless Chrome. For carousel posts and reel covers.
//
//   node tools/shoot.mjs <file.html | folder> [--size 1080x1350] [--out <folder>] [--transparent]
//
// A folder shoots every .html inside it (slide-01.html, slide-02.html ...) in name order.
// Each PNG lands next to its HTML (or in --out) with the same name. Default size 1080x1350 (4:5
// post); use --size 1080x1920 for a reel cover, 1280x720 for a YouTube thumbnail.
import { existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").startsWith("--"));
if (!target) { console.log("usage: node tools/shoot.mjs <file.html | folder> [--size 1080x1350] [--out <folder>]"); process.exit(2); }
const [W, H] = flag("--size", "1080x1350").split("x").map(Number);
const transparent = argv.includes("--transparent");   // PNG with an alpha channel (the page background must be transparent too)

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) { console.log("Chrome or Edge not found. Install Chrome, or set CHROME_PATH to chrome.exe"); process.exit(1); }

const abs = resolve(target);
const files = statSync(abs).isDirectory()
  ? readdirSync(abs).filter((f) => extname(f).toLowerCase() === ".html").sort().map((f) => join(abs, f))
  : [abs];
const outDir = flag("--out") ? resolve(flag("--out")) : null;
if (outDir) mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const png = join(outDir || dirname(f), basename(f, extname(f)) + ".png");
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--window-size=${W},${H}`, "--virtual-time-budget=4000", ...(transparent ? ["--default-background-color=00000000"] : []), `--screenshot=${png}`, pathToFileURL(f).href], { encoding: "utf8" });
  console.log(existsSync(png) && r.status === 0 ? `shot ${basename(png)} (${W}x${H})` : `FAILED ${basename(f)}: ${(r.stderr || "").trim().split("\n").pop()}`);
}
