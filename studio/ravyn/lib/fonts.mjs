// The font registry: every file in studio/fonts/ mapped to a family, weight and style.
// The compiler emits @font-face only for the faces a project uses. Every font here is SIL Open
// Font License (see fonts/OFL.txt): free to use in your videos, free to share.

const F = (family, weight, style, file, opts = {}) => ({ family, weight, style, file, format: file.endsWith(".ttf") ? "truetype" : "woff2", ...opts });

export const FONTS = [
  F("Inter", 300, "normal", "Inter-latin-300.woff2"),
  F("Inter", 500, "normal", "Inter-latin-500.woff2"),
  F("Inter", 800, "normal", "Inter-latin-800.woff2"),
  F("Inter", 900, "normal", "Inter-latin-900.woff2"),
  F("Inter", 300, "italic", "Inter-Italic300.woff2"),
  F("Inter", 900, "italic", "Inter-Italic900.woff2"),
  F("JetBrains Mono", 400, "normal", "JetBrainsMono-latin-400.woff2", { mono: true }),
  F("JetBrains Mono", 500, "normal", "JetBrainsMono-latin-500.woff2", { mono: true }),
  F("JetBrains Mono", 600, "normal", "JetBrainsMono-latin-600.woff2", { mono: true }),
  F("JetBrains Mono", 700, "normal", "JetBrainsMono-latin-700.woff2", { mono: true }),
  F("Anton", 400, "normal", "Anton-400.woff2", { display: true }),
  F("Poppins", 500, "normal", "Poppins-latin-500.woff2"),
  F("Poppins", 600, "normal", "Poppins-latin-600.woff2"),
  F("Poppins", 700, "normal", "Poppins-latin-700.woff2"),
  F("Poppins", 800, "normal", "Poppins-latin-800.woff2"),
  F("Merriweather", 900, "italic", "Merriweather-Italic900.woff2", { serif: true }),
  F("Caveat", 700, "normal", "Caveat-700.ttf", { script: true }),
  F("Playfair Display", 700, "normal", "PlayfairDisplay-latin-700.woff2", { serif: true }),
  F("Playfair Display", 800, "normal", "PlayfairDisplay-latin-800.woff2", { serif: true }),
  F("Playfair Display", 700, "italic", "PlayfairDisplay-Italic700.woff2", { serif: true }),
  F("Playfair Display", 900, "italic", "PlayfairDisplay-Italic900.woff2", { serif: true }),
  F("Archivo", 800, "italic", "Archivo-Italic800.woff2"),
  F("Bodoni Moda", 400, "italic", "BodoniModa-Italic.woff2", { serif: true }),
  F("Bodoni Moda", 800, "italic", "BodoniModa-Italic800.woff2", { serif: true }),
  F("Cormorant", 300, "italic", "Cormorant-Italic300.woff2", { serif: true }),
  F("Cormorant", 600, "italic", "Cormorant-Italic600.woff2", { serif: true }),
  F("DM Serif Display", 400, "normal", "DMSerifDisplay-400.woff2", { serif: true }),
  F("DM Serif Display", 400, "italic", "DMSerifDisplay-Italic.woff2", { serif: true }),
  F("Epilogue", 800, "italic", "Epilogue-Italic800.woff2"),
  F("Fraunces", 400, "italic", "Fraunces-Italic.woff2", { serif: true }),
  F("Fraunces", 900, "italic", "Fraunces-Italic900.woff2", { serif: true }),
  F("Instrument Serif", 400, "italic", "InstrumentSerif-Italic.woff2", { serif: true }),
  F("Libre Baskerville", 700, "italic", "LibreBaskerville-Italic700.woff2", { serif: true }),
  F("Montserrat", 800, "normal", "Montserrat-latin-800.woff2"),
  F("Montserrat", 800, "italic", "Montserrat-Italic800.woff2"),
  F("Newsreader", 700, "italic", "Newsreader-Italic700.woff2", { serif: true }),
  F("Source Sans 3", 400, "italic", "SourceSans3-Italic400.woff2"),
  F("Source Sans 3", 600, "italic", "SourceSans3-Italic600.woff2"),
  F("Space Grotesk", 700, "normal", "SpaceGrotesk-700.woff2"),
];

export function fallbackStack(entry) {
  if (!entry) return '"Segoe UI",system-ui,sans-serif';
  if (entry.mono) return "ui-monospace,Consolas,monospace";
  if (entry.display) return "Impact,sans-serif";
  if (entry.serif) return "Georgia,serif";
  if (entry.script) return "cursive";
  return '"Segoe UI",system-ui,sans-serif';
}

/* one row per family with the weights/styles on disk, for the font picker */
export function families() {
  const map = new Map();
  for (const f of FONTS) {
    const row = map.get(f.family) || { family: f.family, faces: [], serif: !!f.serif, mono: !!f.mono, display: !!f.display, script: !!f.script };
    row.faces.push({ weight: f.weight, style: f.style });
    map.set(f.family, row);
  }
  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
}

/* nearest face on disk: exact style first, then the closest weight; falls back to Inter 800 */
export function resolveFont(family, weight = 800, italic = false) {
  const want = italic ? "italic" : "normal";
  let pool = FONTS.filter((f) => f.family === family);
  if (!pool.length) pool = FONTS.filter((f) => f.family === "Inter");
  const styled = pool.filter((f) => f.style === want);
  const cands = styled.length ? styled : pool;
  return cands.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best), cands[0]);
}

export function fontFaceCss(entries, base = "../fonts/") {
  const seen = new Set(); const out = [];
  for (const e of entries) {
    if (!e || seen.has(e.file)) continue; seen.add(e.file);
    out.push(`@font-face{font-family:"${e.family}";src:url("${base}${e.file}") format("${e.format}");font-weight:${e.weight};font-style:${e.style};font-display:block}`);
  }
  return out.join("\n");
}
