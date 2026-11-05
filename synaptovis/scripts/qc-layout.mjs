/**
 * Layout QC: renders the LayoutQC composition (quarter scale, it is only for
 * measurement) and aggregates the QC_LAYOUT lines printed by LayoutProbe.
 *
 *   npm run qc:layout
 *
 * Errors: overlap, clipped, wrap, overflow. Warnings: tight, unsafe, figure.
 * Report: out/qc/layout.json. Exit code 1 on errors or if any frame was not
 * measured.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const ERR = new Set(["overlap", "clipped", "wrap", "overflow"]);
fs.mkdirSync(path.join(root, "out/qc"), { recursive: true });

const args = [
  "remotion",
  "render",
  "AnimationQATest-LayoutQC",
  "out/qc/layout-pass.mp4",
  "--scale=0.25",
  "--log=verbose",
  ...process.argv.slice(2),
];
const child = spawn("npx", args, { cwd: root, env: process.env });
const frames = new Map();
let buf = "";
const onData = (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const k = line.indexOf("QC_LAYOUT ");
    if (k >= 0) {
      try {
        const r = JSON.parse(line.slice(k + 10));
        frames.set(r.frame, r);
      } catch {}
    } else if (/Rendered \d+\/\d+/.test(line) && /0\/|00\//.test(line))
      process.stdout.write(".");
  }
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
const code = await new Promise((r) => child.on("close", r));
if (code !== 0) {
  console.error(`render failed (${code})`);
  process.exit(2);
}

const first = Math.min(...frames.keys());
const last = Math.max(...frames.keys());
const total = last - first + 1;
const missing = [];
for (let f = first; f <= last; f++) if (!frames.has(f)) missing.push(f);
const agg = new Map();
for (const [f, r] of [...frames.entries()].sort((a, b) => a[0] - b[0])) {
  for (const iss of r.issues) {
    const key = `${iss.type}|${iss.ids.join(" × ")}`;
    const e = agg.get(key) ?? {
      type: iss.type,
      ids: iss.ids,
      frames: [],
      detail: iss.detail,
    };
    e.frames.push(f);
    agg.set(key, e);
  }
}
const ranges = (fs_) => {
  const out = [];
  let a = fs_[0],
    b = fs_[0];
  for (const f of fs_.slice(1)) {
    if (f === b + 1) b = f;
    else {
      out.push(a === b ? `${a}` : `${a}-${b}`);
      a = b = f;
    }
  }
  out.push(a === b ? `${a}` : `${a}-${b}`);
  return out.join(",");
};
const issues = [...agg.values()].map((e) => ({
  level: ERR.has(e.type) ? "error" : "warn",
  type: e.type,
  ids: e.ids,
  frames: ranges(e.frames),
  count: e.frames.length,
  detail: e.detail,
}));
fs.writeFileSync(
  path.join(root, "out/qc/layout.json"),
  JSON.stringify({ measuredFrames: frames.size, missing, issues }, null, 2),
);
console.log(
  `\nmeasured ${frames.size}/${total} frames${missing.length ? `, MISSING ${missing.length}` : ""}`,
);
for (const i of issues)
  console.log(
    `  [${i.level.toUpperCase()}] ${i.type.padEnd(8)} ${i.ids.join(" × ").padEnd(44)} ${i.count}f  (${i.frames})${i.detail ? "  " + i.detail : ""}`,
  );
const errors =
  issues.filter((i) => i.level === "error").length + (missing.length ? 1 : 0);
console.log(
  `layout QC: ${errors} error(s), ${issues.length - issues.filter((i) => i.level === "error").length} warning(s)`,
);
process.exit(errors ? 1 : 0);
