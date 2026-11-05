/**
 * Video QC on the RENDERED file (not the code). Pixels don't lie.
 *
 *   npm run qc:video -- out/AnimationQATest.mp4
 *
 * 1. Container: resolution, fps, frame count, duration, codec, pixel format.
 * 2. Decodes every frame (320x180 grey) and analyses a 16x9 block grid:
 *      blank     black / empty frame                                   (error)
 *      flash     a block changes for exactly one frame and returns:
 *                frame i differs from i-1 and i+1, but i-1 ≈ i+1        (error)
 *      pop       a block changes a lot in exactly ONE frame while the
 *                frames before and after are quiet: an element appeared,
 *                vanished or teleported without animation             (warn)
 *      judder    a duplicated frame in the middle of motion            (warn)
 * 3. Writes review sheets for a human pass:
 *      out/qc/sheet-seconds.png   one frame per second
 *      out/qc/sheet-transitions-N.png  every 4th frame across each transition
 *      out/qc/sheet-flags.png     neighbours of the worst flagged frames
 * Report: out/qc/video.json. Exit 1 on errors.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  FPS,
  HEIGHT,
  SCENES,
  TRANSITIONS,
  WIDTH,
  sceneStarts,
  totalFrames,
} from "../src/test/plan";

const root = path.resolve(__dirname, "..");
const file = path.resolve(
  process.argv[2] ?? path.join(root, "out/AnimationQATest.mp4"),
);
const outDir = path.join(root, "out/qc");
fs.mkdirSync(outDir, { recursive: true });

type Issue = {
  level: "error" | "warn" | "info";
  check: string;
  frame?: number;
  detail: string;
};
const issues: Issue[] = [];

/* ---------- 1. container ---------- */
const probe = JSON.parse(
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,codec_name,pix_fmt:format=duration",
    "-of",
    "json",
    file,
  ]).toString(),
);
const st = probe.streams[0];
const meta = {
  width: st.width,
  height: st.height,
  fps: st.r_frame_rate,
  frames: Number(st.nb_read_frames),
  duration: Number(probe.format.duration),
  codec: st.codec_name,
  pix_fmt: st.pix_fmt,
};
const expectFrames = totalFrames();
if (meta.width !== WIDTH || meta.height !== HEIGHT)
  issues.push({
    level: "error",
    check: "resolution",
    detail: `${meta.width}x${meta.height}`,
  });
if (meta.fps !== `${FPS}/1`)
  issues.push({ level: "error", check: "fps", detail: meta.fps });
if (meta.frames !== expectFrames)
  issues.push({
    level: "error",
    check: "frames",
    detail: `${meta.frames}, expected ${expectFrames}`,
  });
if (Math.abs(meta.duration - expectFrames / FPS) > 0.05)
  issues.push({
    level: "error",
    check: "duration",
    detail: `${meta.duration}s`,
  });
if (meta.codec !== "h264" || meta.pix_fmt !== "yuv420p")
  issues.push({
    level: "warn",
    check: "codec",
    detail: `${meta.codec}/${meta.pix_fmt} (h264/yuv420p plays everywhere)`,
  });

/* ---------- 2. pixel analysis ---------- */
const W = 320;
const H = 180;
const BX = 16;
const BY = 9;
const bw = W / BX;
const bh = H / BY;
const NB = BX * BY;
const size = W * H;

const blockDiff = (a: Buffer, b: Buffer, out: Float32Array, off: number) => {
  out.fill(0, off, off + NB);
  for (let y = 0; y < H; y++) {
    const by = Math.floor(y / bh);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      out[off + by * BX + Math.floor(x / bw)] += Math.abs(a[i] - b[i]);
    }
  }
  for (let k = 0; k < NB; k++) out[off + k] /= bw * bh;
};

const decode = () =>
  new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `scale=${W}:${H}:flags=area,format=gray`,
      "-f",
      "rawvideo",
      "-",
    ]);
    let pending = Buffer.alloc(0);
    ff.stdout.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= size) {
        onFrame(Buffer.from(pending.subarray(0, size)));
        pending = pending.subarray(size);
      }
    });
    ff.on("close", (c) =>
      c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)),
    );
  });

const N = meta.frames;
const mean = new Float32Array(N);
const sd = new Float32Array(N);
const d = new Float32Array(N * NB); // d[i] = |f_i - f_{i-1}| per block
const skip = new Float32Array(N * NB); // skip[i] = |f_{i+1} - f_{i-1}| per block (filled at i+1)
const global = new Float32Array(N);
let f0: Buffer | null = null;
let f1: Buffer | null = null;
let n = 0;
const onFrame = (f: Buffer) => {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < size; i++) {
    s += f[i];
    s2 += f[i] * f[i];
  }
  mean[n] = s / size;
  sd[n] = Math.sqrt(Math.max(0, s2 / size - mean[n] * mean[n]));
  if (f1) {
    blockDiff(f, f1, d, n * NB);
    let g = 0;
    for (let k = 0; k < NB; k++) g += d[n * NB + k];
    global[n] = g / NB;
  }
  if (f0) blockDiff(f, f0, skip, (n - 1) * NB);
  f0 = f1;
  f1 = f;
  n++;
};

const transitionWindows = (() => {
  const starts = sceneStarts();
  return TRANSITIONS.map((t, i) => ({
    from: starts[i + 1],
    to: starts[i + 1] + t.duration,
    kind: t.kind,
  }));
})();
const context = (f: number) => {
  const starts = sceneStarts();
  let s = 0;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) s = i;
  const tw = transitionWindows.find((w) => f >= w.from && f < w.to);
  return tw ? `transition ${tw.kind}` : `${SCENES[s].id} +${f - starts[s]}f`;
};

const run = async () => {
  await decode();
  const flagged: { f: number; score: number; check: string }[] = [];

  for (let i = 0; i < n; i++) {
    if (mean[i] < 10 || sd[i] < 1.5)
      issues.push({
        level: "error",
        check: "blank",
        frame: i,
        detail: `mean ${mean[i].toFixed(1)} sd ${sd[i].toFixed(1)}`,
      });
  }
  for (let i = 2; i < n - 2; i++) {
    let worstFlash = 0;
    let worstPop = 0;
    let popBlock = -1;
    for (let k = 0; k < NB; k++) {
      const a = d[i * NB + k];
      const b = d[(i + 1) * NB + k];
      const back = skip[i * NB + k];
      // One-frame flash: i differs from both neighbours, neighbours agree.
      if (a > 6 && b > 6 && back < 0.25 * Math.min(a, b))
        worstFlash = Math.max(worstFlash, Math.min(a, b));
      // Pop: a one-frame step. Continuous motion spreads change over several
      // frames; a fade spreads it over >= 12. A step has quiet neighbours.
      const before = d[(i - 1) * NB + k];
      if (a > 12 && Math.max(before, b) < 0.3 * a && a > worstPop) {
        worstPop = a;
        popBlock = k;
      }
    }
    if (worstFlash > 0) {
      issues.push({
        level: "error",
        check: "flash",
        frame: i,
        detail: `block change ${worstFlash.toFixed(1)} returns next frame (${context(i)})`,
      });
      flagged.push({ f: i, score: worstFlash * 10, check: "flash" });
    }
    if (popBlock >= 0) {
      const bx = popBlock % BX;
      const by = Math.floor(popBlock / BX);
      // Inside a planned transition a wipe edge legitimately flips blocks in one frame.
      const inTransition = transitionWindows.some(
        (w) => i >= w.from && i < w.to,
      );
      issues.push({
        level: inTransition ? "info" : "warn",
        check: "pop",
        frame: i,
        detail: `Δ${worstPop.toFixed(1)} at block (${bx},${by}) ≈ px (${bx * 80},${by * 80}) (${context(i)})`,
      });
      flagged.push({ f: i, score: worstPop, check: "pop" });
    }
    if (global[i] < 0.02 && global[i - 1] > 0.6 && global[i + 1] > 0.6)
      issues.push({
        level: "warn",
        check: "judder",
        frame: i,
        detail: `duplicate frame mid-motion (${context(i)})`,
      });
  }

  /* ---------- 3. review sheets ---------- */
  // One extraction per frame so each tile is labelled with its real frame number.
  const tileLabeled = (
    frames: number[],
    cols: number,
    out: string,
    w = 320,
  ) => {
    const tmp = fs.mkdtempSync(path.join(outDir, "tmp-"));
    frames.forEach((f, i) => {
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        file,
        "-vf",
        `select='eq(n\\,${f})',scale=${w}:-1,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${f}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6`,
        "-frames:v",
        "1",
        "-vsync",
        "vfr",
        path.join(tmp, `${String(i).padStart(4, "0")}.png`),
      ]);
    });
    const rows = Math.ceil(frames.length / cols);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(tmp, "%04d.png"),
      "-vf",
      `tile=${cols}x${rows}`,
      "-frames:v",
      "1",
      out,
    ]);
    fs.rmSync(tmp, { recursive: true });
  };
  tileLabeled(
    Array.from({ length: Math.floor(n / FPS) }, (_, s) => s * FPS + 30),
    6,
    path.join(outDir, "sheet-seconds.png"),
  );
  transitionWindows.forEach((w, i) => {
    const fr: number[] = [];
    for (let f = w.from - 4; f <= w.to + 4; f += 4) fr.push(f);
    tileLabeled(
      fr,
      6,
      path.join(outDir, `sheet-transitions-${i + 1}.png`),
      256,
    );
  });
  const worst = flagged.sort((a, b) => b.score - a.score).slice(0, 4);
  if (worst.length) {
    const fr = worst.flatMap((w) => [w.f - 1, w.f, w.f + 1]);
    tileLabeled(fr, 3, path.join(outDir, "sheet-flags.png"), 426);
  }

  /* ---------- report ---------- */
  const perSecond = Array.from({ length: Math.ceil(n / FPS) }, (_, s) => {
    const g = Array.from(global.slice(s * FPS, (s + 1) * FPS));
    return {
      second: s,
      maxChange: Number(Math.max(...g).toFixed(2)),
      meanChange: Number((g.reduce((a, b) => a + b, 0) / g.length).toFixed(2)),
    };
  });
  fs.writeFileSync(
    path.join(outDir, "video.json"),
    JSON.stringify(
      { file, meta, transitionWindows, issues, perSecond },
      null,
      2,
    ),
  );
  console.log(
    `${path.relative(root, file)}: ${meta.width}x${meta.height} @ ${meta.fps}, ${meta.frames} frames, ${meta.duration.toFixed(3)} s, ${meta.codec}/${meta.pix_fmt}`,
  );
  const errors = issues.filter((i) => i.level === "error");
  const shown = issues.filter((i) => i.level !== "info");
  const info = issues.length - shown.length;
  for (const i of shown.slice(0, 60))
    console.log(
      `  [${i.level.toUpperCase()}] ${i.check.padEnd(7)} ${i.frame !== undefined ? `f${String(i.frame).padEnd(5)}` : ""} ${i.detail}`,
    );
  if (shown.length > 60)
    console.log(`  … ${shown.length - 60} more in out/qc/video.json`);
  console.log(
    `video QC: ${errors.length} error(s), ${shown.length - errors.length} warning(s), ${info} info (expected edges inside transitions); sheets in out/qc/`,
  );
  process.exit(errors.length ? 1 : 0);
};
run();
