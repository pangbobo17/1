/**
 * Action track: turns a declarative list of clips into a pose for any frame.
 *
 *   clips: [{ action: "walk", from: 0 }, { action: "wave", from: 90 }, ...]
 *
 * - Each clip runs until the next one starts (no gaps, no "nothing" frames).
 * - When a clip starts, the previous one keeps running while the new one fades
 *   in over `blend` frames with a C2-continuous curve -> no pose pops.
 * - Root position / facing come from keyframes; walk phase is derived from the
 *   distance actually travelled, so feet never slide or moonwalk.
 * - Blinks are scheduled deterministically per character.
 */
import { Key, hash, sampleKeys, smootherstep } from "../engine/motion";
import { ACTIONS, ActionName, ActionParams, WALK_STRIDE } from "./actions";
import { Pose, TRACKED_JOINTS, blendPose, solveSkeleton } from "./rig";

export type Clip = {
  action: ActionName;
  /** Start frame, relative to the track. */
  from: number;
  params?: ActionParams;
  /** Cross-fade length into this clip (frames). Defaults to the track blend. */
  blend?: number;
};

export type CharacterTrack = {
  id: string;
  seed: number;
  clips: Clip[];
  /** Root x/y keyframes in frames (scene px). */
  x: Key[];
  y?: Key[];
  /** +1 faces right, -1 faces left. Interpolated, so turns are animated. */
  facing?: Key[];
  /** Default (minimum) cross-fade in frames. */
  blend: number;
  /**
   * Max joint speed (px/frame) a cross-fade may produce. Blends between very
   * different poses are lengthened automatically to respect it. Default 9.
   */
  maxBlendSpeed?: number;
  scale?: number;
};

export type TrackSample = {
  pose: Pose;
  x: number;
  y: number;
  facing: number;
  /** Diagnostics for QC. */
  activeClip: number;
  blendWeight: number;
  phase: number;
};

/** Distance travelled along x from the first key to frame f (exact for monotonic eased segments). */
const travelled = (keys: Key[], f: number) => {
  if (keys.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f >= b.t) {
      d += Math.abs(b.v - a.v);
    } else if (f > a.t) {
      d += Math.abs(sampleKeys([a, b], f) - a.v);
      break;
    } else break;
  }
  return d;
};

const BLINK_FRAMES_SEC = 0.15;
const blinkAt = (seed: number, tSec: number) => {
  // Blink every 2.6-4.4 s, deterministic per character.
  let start = 0.8 + hash(seed) * 1.5;
  for (let i = 0; start <= tSec && i < 10000; i++) {
    const u = (tSec - start) / BLINK_FRAMES_SEC;
    if (u <= 1) return Math.sin(Math.PI * u);
    start += 2.6 + hash(seed * 13 + i) * 1.8;
  }
  return 0;
};

/** Peak speed of a smootherstep cross-fade is 1.875x the average speed. */
const SMOOTHERSTEP_PEAK = 1.875;
const blendCache = new WeakMap<CharacterTrack, Map<number, number>>();

/**
 * Adaptive blend length for clip i: long enough that no joint exceeds
 * maxBlendSpeed, never shorter than the declared blend, never longer than
 * the clip minus 6 frames.
 */
export const blendFrames = (
  track: CharacterTrack,
  i: number,
  fps: number,
): number => {
  let cache = blendCache.get(track);
  if (!cache) blendCache.set(track, (cache = new Map()));
  const hit = cache.get(i);
  if (hit !== undefined) return hit;
  const c = track.clips[i];
  const declared = c.blend ?? track.blend;
  const from = c.from;
  const prevPose = sampleUpTo(track, from, fps, i).pose;
  const nextPose = ACTIONS[c.action](
    { t: 0, phase: travelled(track.x, from) / WALK_STRIDE, seed: track.seed },
    c.params ?? {},
  );
  const a = solveSkeleton(prevPose);
  const b = solveSkeleton(nextPose);
  let d = 0;
  for (const j of TRACKED_JOINTS)
    d = Math.max(d, Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y));
  d *= track.scale ?? 1;
  const needed = Math.ceil(
    (SMOOTHERSTEP_PEAK * d) / (track.maxBlendSpeed ?? 9),
  );
  const clipLen = (track.clips[i + 1]?.from ?? Infinity) - from;
  const out = Math.max(declared, Math.min(needed, clipLen - 6));
  cache.set(i, out);
  return out;
};

export const sampleTrack = (
  track: CharacterTrack,
  frame: number,
  fps: number,
): TrackSample => sampleUpTo(track, frame, fps, track.clips.length);

/** Sample using only the first `n` clips (used for recursive blending). */
const sampleUpTo = (
  track: CharacterTrack,
  frame: number,
  fps: number,
  n: number,
): TrackSample => {
  const clips = track.clips;
  let idx = 0;
  for (let i = 0; i < n; i++) if (frame >= clips[i].from) idx = i;

  const x = sampleKeys(track.x, frame);
  const y = track.y ? sampleKeys(track.y, frame) : 0;
  const facing = track.facing ? sampleKeys(track.facing, frame) : 1;
  const phase = travelled(track.x, frame) / WALK_STRIDE;

  const evalClip = (i: number) => {
    const c = clips[i];
    const fn = ACTIONS[c.action];
    return fn(
      { t: (frame - c.from) / fps, phase, seed: track.seed },
      c.params ?? {},
    );
  };

  let pose = evalClip(idx);
  let w = 1;
  if (idx > 0) {
    const c = clips[idx];
    const u = (frame - c.from) / blendFrames(track, idx, fps);
    if (u < 1) {
      w = smootherstep(u);
      // The previous clip may itself still be blending: evaluate it recursively.
      const prev = sampleUpTo(track, frame, fps, idx).pose;
      pose = blendPose(prev, pose, w);
    }
  }

  const blink = blinkAt(track.seed, frame / fps);
  pose = { ...pose, blink: Math.max(pose.blink, blink) };

  return { pose, x, y, facing, activeClip: idx, blendWeight: w, phase };
};
