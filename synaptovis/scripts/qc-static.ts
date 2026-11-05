/**
 * Static animation QC: runs in Node in ~1 s, before any rendering.
 *
 *   npm run qc:static
 *
 * Timeline   total length, inline durations match the plan, transition
 *            lengths, clip ordering / minimum length, keyframes in range,
 *            GSAP chart timelines finish before their scene ends.
 * Character  evaluated on EVERY frame of every scene (including transition
 *            overlap):
 *              pop          joint jerk (2nd difference) spike -> sudden jump
 *              speed        joint moves implausibly fast
 *              overreach    IK target out of reach -> leg snaps straight
 *              joint-limit  knee/elbow outside anatomical range -> deformation
 *              squash       stretch outside 0.85..1.15
 *              skate        body moves while not walking
 *              foot-slide   planted foot drifts during walk
 *              ground       foot below floor
 * Fonts      every CJK character used in src/ exists in the font subset.
 *
 * Exit code 1 if any error. Report: out/qc/static.json
 */
import fs from "node:fs";
import path from "node:path";
import { createFrameTimeline } from "../src/engine/gsap-frame";
import {
  barTimeline,
  lineTimeline,
  zeros,
} from "../src/components/chart-timelines";
import { TRACKED_JOINTS, solveSkeleton } from "../src/character/rig";
import { CharacterTrack, sampleTrack } from "../src/character/track";
import {
  CHARTS,
  FPS,
  HEIGHT,
  SCENES,
  TRANSITIONS,
  WIDTH,
  totalFrames,
} from "../src/test/plan";
import { sampleCamera } from "../src/engine/Camera";
import { depth, layout } from "../src/design/tokens";
// @ts-expect-error plain JS helper
import { collectCjk } from "./lib/charset.mjs";

type Issue = {
  level: "error" | "warn";
  check: string;
  where: string;
  frames?: string;
  detail: string;
};
const issues: Issue[] = [];
const add = (i: Issue) => issues.push(i);
const root = path.resolve(__dirname, "..");

const LIMITS = {
  popWarn: 3.5, // px / frame²
  popError: 6,
  speedWarn: 16, // px / frame
  speedError: 26,
  footSlide: 0.75, // px / frame while planted
  skate: 0.6, // px / frame of root motion without walking
  squash: [0.85, 1.15],
  kneeMax: 150,
  minClipExtra: 6, // a clip must outlast its blend by this many frames
};

/* ---------------- Timeline ---------------- */
const expected = 30 * FPS;
if (totalFrames() !== expected)
  add({
    level: "error",
    check: "duration",
    where: "plan",
    detail: `${totalFrames()} frames, expected ${expected}`,
  });

const compSrc = fs.readFileSync(
  path.join(root, "src/test/AnimationQATest.tsx"),
  "utf8",
);
const inline = [
  ...compSrc.matchAll(
    /TransitionSeries\.Sequence[^>]*durationInFrames=\{(\d+)\}/g,
  ),
].map((m) => Number(m[1]));
SCENES.forEach((s, i) => {
  if (inline[i] !== s.duration)
    add({
      level: "error",
      check: "duration-sync",
      where: s.id,
      detail: `composition has ${inline[i]}, plan has ${s.duration}`,
    });
});

TRANSITIONS.forEach((t, i) => {
  const a = SCENES[i];
  const b = SCENES[i + 1];
  if (!b)
    add({
      level: "error",
      check: "transition",
      where: `#${i}`,
      detail: "transition without a following scene",
    });
  else if (t.duration > Math.min(a.duration, b.duration) / 3)
    add({
      level: "warn",
      check: "transition",
      where: `${a.id}->${b.id}`,
      detail: `${t.duration}f is long relative to the scenes`,
    });
  if (t.duration < 0.3 * FPS)
    add({
      level: "warn",
      check: "transition",
      where: `${a.id}->${b?.id}`,
      detail: "shorter than 0.3 s reads as a cut",
    });
});

const keyCheck = (
  keys: { t: number }[] | undefined,
  where: string,
  dur: number,
) => {
  if (!keys) return;
  keys.forEach((k, i) => {
    if (i > 0 && k.t <= keys[i - 1].t)
      add({
        level: "error",
        check: "keys-order",
        where,
        detail: `key ${i} at ${k.t} not after ${keys[i - 1].t}`,
      });
    if (k.t > dur)
      add({
        level: "error",
        check: "keys-range",
        where,
        detail: `key at ${k.t} beyond scene end ${dur}`,
      });
  });
};

SCENES.forEach((scene) => {
  keyCheck(scene.camera.x, `${scene.id}.camera.x`, scene.duration);
  keyCheck(scene.camera.y, `${scene.id}.camera.y`, scene.duration);
  keyCheck(scene.camera.zoom, `${scene.id}.camera.zoom`, scene.duration);
  for (const c of scene.characters) {
    const where = `${scene.id}.${c.id}`;
    keyCheck(c.x, `${where}.x`, scene.duration);
    keyCheck(c.facing, `${where}.facing`, scene.duration);
    if (c.clips[0]?.from !== 0)
      add({
        level: "error",
        check: "clip-gap",
        where,
        detail: "first clip must start at frame 0",
      });
    c.clips.forEach((clip, i) => {
      const next = c.clips[i + 1]?.from ?? scene.duration;
      const len = next - clip.from;
      const blend = c.clips[i + 1]?.blend ?? c.blend;
      if (len <= 0)
        add({
          level: "error",
          check: "clip-order",
          where,
          detail: `clip ${i} (${clip.action}) has length ${len}`,
        });
      else if (i > 0 && len < (clip.blend ?? c.blend) + LIMITS.minClipExtra)
        add({
          level: "warn",
          check: "clip-short",
          where,
          detail: `clip ${i} (${clip.action}) ${len}f barely outlasts its blend`,
        });
      if (clip.from >= scene.duration)
        add({
          level: "error",
          check: "clip-range",
          where,
          detail: `clip ${i} starts after scene end`,
        });
      void blend;
    });
  }
});

/* ---------------- Camera coverage ---------------- */
// For every frame and parallax depth, the world rect the viewport sees must stay
// inside the overscanned background, or a strip of the previous scene / bare
// colour shows (caught once by video QC as a strip vanishing at frame 984).
for (const scene of SCENES) {
  const bad: Record<string, number[]> = {};
  for (let f = 0; f < scene.duration; f++) {
    const cam = sampleCamera(scene.camera, f, WIDTH, HEIGHT);
    for (const [name, d] of Object.entries(depth.parallax)) {
      const z = 1 + (cam.zoom - 1) * d;
      const cx = WIDTH / 2 + (cam.x - WIDTH / 2) * d;
      const cy = HEIGHT / 2 + (cam.y - HEIGHT / 2) * d;
      const hw = WIDTH / (2 * z);
      const hh = HEIGHT / (2 * z);
      const ox = WIDTH * layout.overscan;
      const oy = HEIGHT * layout.overscan;
      if (
        cx - hw < -ox ||
        cx + hw > WIDTH + ox ||
        cy - hh < -oy ||
        cy + hh > HEIGHT + oy ||
        z < 1 / (1 + 2 * layout.overscan)
      )
        (bad[name] ??= []).push(f);
    }
  }
  for (const [name, frames] of Object.entries(bad))
    add({
      level: "error",
      check: "coverage",
      where: `${scene.id}.camera`,
      frames: `${frames[0]}-${frames[frames.length - 1]}`,
      detail: `${name} layer leaves the overscanned background`,
    });
}

/* ---------------- GSAP chart timelines ---------------- */
const chartChecks: [string, number, number][] = [];
{
  const bar = createFrameTimeline(
    {
      axis: 0,
      bars: zeros(CHARTS.bars.n),
      labels: zeros(CHARTS.bars.n),
      values: zeros(CHARTS.bars.n),
    },
    barTimeline(CHARTS.bars.n),
  );
  const line = createFrameTimeline(
    { draw: 0, area: 0, dots: zeros(CHARTS.line.n), callout: 0 },
    lineTimeline(CHARTS.line.n),
  );
  chartChecks.push(
    ["bars", CHARTS.bars.at, bar.tl.duration()],
    ["line", CHARTS.line.at, line.tl.duration()],
  );
  for (const [name, at, dur] of chartChecks) {
    const chart = CHARTS[name as keyof typeof CHARTS];
    const sceneIdx = SCENES.findIndex((s) => s.id === chart.scene);
    const scene = SCENES[sceneIdx];
    const outT = TRANSITIONS[sceneIdx]?.duration ?? 0;
    const end = at + dur * FPS;
    // Chart must be finished and readable for at least 1 s before the scene starts leaving.
    if (end > scene.duration - outT - FPS)
      add({
        level: "error",
        check: "gsap-overrun",
        where: name,
        detail: `ends at ${end.toFixed(0)}f, scene leaves at ${scene.duration - outT}f`,
      });
  }
}

/* ---------------- Character motion ---------------- */
type Pt = { x: number; y: number };
const worldOf = (c: CharacterTrack, f: number) => {
  const s = sampleTrack(c, f, FPS);
  const sk = solveSkeleton(s.pose);
  const k = c.scale ?? 1;
  const sy = s.pose.stretch;
  const sx = 1 / Math.sqrt(sy);
  const w = (p: Pt): Pt => ({
    x: s.x + p.x * s.facing * k * sx,
    y: s.y + p.y * k * sy,
  });
  const joints = Object.fromEntries(
    TRACKED_JOINTS.map((j) => [j, w(sk[j] as Pt)]),
  ) as Record<string, Pt>;
  return { s, sk, joints, k };
};

const ranges = (frames: number[]) => {
  const out: string[] = [];
  let a = -1;
  let b = -1;
  for (const f of frames) {
    if (f === b + 1) b = f;
    else {
      if (a >= 0) out.push(a === b ? `${a}` : `${a}-${b}`);
      a = b = f;
    }
  }
  if (a >= 0) out.push(a === b ? `${a}` : `${a}-${b}`);
  return out.join(",");
};

const stats: Record<
  string,
  { maxSpeed: number; maxJerk: number; maxSlide: number }
> = {};

SCENES.forEach((scene, si) => {
  // Scenes render during the incoming/outgoing transitions too, so check the whole span.
  const span = scene.duration;
  for (const c of scene.characters) {
    const where = `${scene.id}.${c.id}`;
    const flagged: Record<
      string,
      {
        frames: number[];
        level: "error" | "warn";
        detail: string;
        worst: number;
      }
    > = {};
    const flag = (
      check: string,
      f: number,
      level: "error" | "warn",
      val: number,
      detail: string,
    ) => {
      const e = (flagged[check] ??= { frames: [], level, detail, worst: 0 });
      if (e.frames[e.frames.length - 1] !== f) e.frames.push(f);
      if (level === "error") e.level = "error";
      if (val > e.worst) {
        e.worst = val;
        e.detail = detail;
      }
    };
    let prev: ReturnType<typeof worldOf> | null = null;
    let prev2: ReturnType<typeof worldOf> | null = null;
    const st = (stats[where] = { maxSpeed: 0, maxJerk: 0, maxSlide: 0 });
    for (let f = 0; f < span; f++) {
      const cur = worldOf(c, f);
      const { s, sk } = cur;
      if (sk.ikOverreach > 0.5)
        flag(
          "overreach",
          f,
          "warn",
          sk.ikOverreach,
          `${sk.ikOverreach.toFixed(1)}px beyond leg length`,
        );
      if (Math.max(sk.kneeBendF, sk.kneeBendB) > LIMITS.kneeMax)
        flag(
          "joint-limit",
          f,
          "error",
          Math.max(sk.kneeBendF, sk.kneeBendB),
          `knee bend ${Math.max(sk.kneeBendF, sk.kneeBendB).toFixed(0)}°`,
        );
      if (
        s.pose.stretch < LIMITS.squash[0] ||
        s.pose.stretch > LIMITS.squash[1]
      )
        flag(
          "squash",
          f,
          "error",
          Math.abs(1 - s.pose.stretch),
          `stretch ${s.pose.stretch.toFixed(2)}`,
        );
      if (s.pose.footFY < -0.01 || s.pose.footBY < -0.01)
        flag("ground", f, "error", 1, "foot below floor");
      if (prev) {
        for (const j of TRACKED_JOINTS) {
          const v = Math.hypot(
            cur.joints[j].x - prev.joints[j].x,
            cur.joints[j].y - prev.joints[j].y,
          );
          st.maxSpeed = Math.max(st.maxSpeed, v);
          if (v > LIMITS.speedError)
            flag("speed", f, "error", v, `${j} ${v.toFixed(1)}px/frame`);
          else if (v > LIMITS.speedWarn)
            flag("speed", f, "warn", v, `${j} ${v.toFixed(1)}px/frame`);
          if (prev2) {
            const ax =
              cur.joints[j].x - 2 * prev.joints[j].x + prev2.joints[j].x;
            const ay =
              cur.joints[j].y - 2 * prev.joints[j].y + prev2.joints[j].y;
            const a = Math.hypot(ax, ay);
            st.maxJerk = Math.max(st.maxJerk, a);
            if (a > LIMITS.popError)
              flag(
                "pop",
                f,
                "error",
                a,
                `${j} jumps ${a.toFixed(1)}px (clip ${s.activeClip}: ${c.clips[s.activeClip].action})`,
              );
            else if (a > LIMITS.popWarn)
              flag(
                "pop",
                f,
                "warn",
                a,
                `${j} accel ${a.toFixed(1)}px/f² (clip ${s.activeClip}: ${c.clips[s.activeClip].action})`,
              );
          }
        }
        const dx = Math.abs(cur.s.x - prev.s.x);
        const walking =
          c.clips[s.activeClip].action === "walk" ||
          (s.blendWeight < 1 && c.clips[s.activeClip - 1]?.action === "walk");
        if (dx > LIMITS.skate && !walking)
          flag(
            "skate",
            f,
            "error",
            dx,
            `root moves ${dx.toFixed(2)}px/frame while "${c.clips[s.activeClip].action}"`,
          );
        // Planted-foot drift (only when fully in walk, foot on the ground in both frames).
        if (
          c.clips[s.activeClip].action === "walk" &&
          s.blendWeight === 1 &&
          prev.s.blendWeight === 1
        ) {
          for (const [ank, fy] of [
            ["ankleF", "footFY"],
            ["ankleB", "footBY"],
          ] as const) {
            if (s.pose[fy] < 0.01 && prev.s.pose[fy] < 0.01) {
              const slide = Math.abs(cur.joints[ank].x - prev.joints[ank].x);
              st.maxSlide = Math.max(st.maxSlide, slide);
              if (slide > LIMITS.footSlide)
                flag(
                  "foot-slide",
                  f,
                  "warn",
                  slide,
                  `${ank} slides ${slide.toFixed(2)}px/frame`,
                );
            }
          }
        }
      }
      prev2 = prev;
      prev = cur;
    }
    for (const [check, e] of Object.entries(flagged)) {
      add({
        level: e.level,
        check,
        where,
        frames: ranges(e.frames),
        detail: e.detail,
      });
    }
  }
  void si;
});

/* ---------------- Fonts ---------------- */
const charsetPath = path.join(root, "public/fonts/charset.txt");
if (!fs.existsSync(charsetPath))
  add({
    level: "error",
    check: "font-subset",
    where: "public/fonts",
    detail: "missing; run npm run fonts",
  });
else {
  const have = new Set([...fs.readFileSync(charsetPath, "utf8")]);
  const missing = (collectCjk(path.join(root, "src")) as string[]).filter(
    (c) => !have.has(c),
  );
  if (missing.length)
    add({
      level: "error",
      check: "font-subset",
      where: "src",
      detail: `missing glyphs ${missing.join("")} -> run npm run fonts`,
    });
}

/* ---------------- Report ---------------- */
fs.mkdirSync(path.join(root, "out/qc"), { recursive: true });
fs.writeFileSync(
  path.join(root, "out/qc/static.json"),
  JSON.stringify({ issues, stats, charts: chartChecks }, null, 2),
);
const errors = issues.filter((i) => i.level === "error");
console.log("\nCharacter motion envelope (max per frame):");
for (const [k, v] of Object.entries(stats))
  console.log(
    `  ${k.padEnd(12)} speed ${v.maxSpeed.toFixed(1).padStart(5)}px  accel ${v.maxJerk.toFixed(2).padStart(5)}px/f²  foot-slide ${v.maxSlide.toFixed(2)}px`,
  );
console.log("\nGSAP chart timelines:");
for (const [n, at, d] of chartChecks)
  console.log(`  ${n.padEnd(6)} starts ${at}f, runs ${(d * FPS).toFixed(0)}f`);
console.log(`\n${issues.length ? "" : "No issues."}`);
for (const i of issues)
  console.log(
    `  [${i.level.toUpperCase()}] ${i.check.padEnd(12)} ${i.where.padEnd(14)} ${i.frames ? `frames ${i.frames}  ` : ""}${i.detail}`,
  );
console.log(
  `\nstatic QC: ${errors.length} error(s), ${issues.length - errors.length} warning(s)`,
);
process.exit(errors.length ? 1 : 0);
