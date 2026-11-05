import fs from "node:fs";
import path from "node:path";

const CJK = /[　-〿㐀-䶿一-鿿＀-￯—…“”‘’·]/gu;

/** All CJK characters (incl. full-width punctuation) used in .ts/.tsx under dir. */
export const collectCjk = (dir) => {
  const set = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|json)$/.test(e.name)) {
        // Skip comments: they never render.
        const src = fs
          .readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        for (const m of src.match(CJK) ?? []) set.add(m);
      }
    }
  };
  walk(dir);
  return [...set];
};
