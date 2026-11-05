/**
 * Vendors fonts into public/fonts so renders are offline and deterministic.
 *  - Noto Sans SC is subset to exactly the CJK characters used in src/.
 *  - Space Grotesk (latin) is downloaded whole.
 * Re-run after adding new Chinese text:  npm run fonts
 * The charset is written to public/fonts/charset.txt; `npm run qc` fails if
 * src/ uses a CJK character missing from it (that would render in a fallback
 * font and visibly change spacing).
 */
import fs from "node:fs";
import path from "node:path";
import { collectCjk } from "./lib/charset.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const out = path.join(root, "public/fonts");
fs.mkdirSync(out, { recursive: true });
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const fetchText = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
const download = async (url, file) => {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return fs.statSync(file).size;
};

const chars = collectCjk(path.join(root, "src"));
// Always include common CJK punctuation so new copy rarely needs a re-fetch.
const extra = "，。、：；！？“”‘’（）《》—…·「」【】％０１２３４５６７８９";
const text = [...new Set([...chars, ...extra])].join("");

for (const w of [500, 700, 900]) {
  const css = await fetchText(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${w}&text=${encodeURIComponent(text)}`,
  );
  const url = css.match(/url\((https:[^)]+)\)/)[1];
  const size = await download(url, path.join(out, `NotoSansSC-${w}.woff2`));
  console.log(`NotoSansSC-${w}.woff2  ${(size / 1024).toFixed(1)} KB`);
}
for (const w of [500, 700]) {
  const css = await fetchText(
    `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@${w}`,
  );
  // Pick the basic latin block.
  const blocks = css
    .split("@font-face")
    .filter((b) => b.includes("U+0000-00FF"));
  const url = blocks[0].match(/url\((https:[^)]+)\)/)[1];
  const size = await download(url, path.join(out, `SpaceGrotesk-${w}.woff2`));
  console.log(`SpaceGrotesk-${w}.woff2  ${(size / 1024).toFixed(1)} KB`);
}
fs.writeFileSync(path.join(out, "charset.txt"), text);
console.log(`charset: ${text.length} characters`);
