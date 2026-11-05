/**
 * Pure motion math shared by scenes, the character rig and the QC scripts.
 * No React, no Remotion runtime: everything here must be importable from Node.
 */

export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) =>
  a === b ? (v >= b ? 1 : 0) : clamp((v - a) / (b - a));

/** C1-continuous (zero velocity at both ends). */
export const smoothstep = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
/** C2-continuous: zero velocity AND acceleration at both ends. Use for blends. */
export const smootherstep = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const ease = {
  linear: (t: number) => clamp(t),
  inOutCubic: (t: number) => {
    const x = clamp(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  },
  outCubic: (t: number) => 1 - Math.pow(1 - clamp(t), 3),
  inCubic: (t: number) => Math.pow(clamp(t), 3),
  outQuart: (t: number) => 1 - Math.pow(1 - clamp(t), 4),
  outExpo: (t: number) => {
    const x = clamp(t);
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
  },
  /** Gentle overshoot (~5%). Never use large overshoot on text: it reads as a jump. */
  outBack: (t: number) => {
    const x = clamp(t);
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  smooth: smoothstep,
  smoother: smootherstep,
} as const;

export type EaseName = keyof typeof ease;

/** Shortest-arc angle interpolation in degrees: avoids 350deg -> 10deg spins. */
export const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * t;
};

/**
 * Damped spring response evaluated analytically (deterministic, frame-rate
 * independent). Returns 0 -> 1 with optional mild overshoot.
 */
export const springStep = (
  tSec: number,
  { freq = 2.2, damping = 0.75 } = {},
) => {
  if (tSec <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = Math.min(damping, 0.999);
  const wd = w * Math.sqrt(1 - z * z);
  return (
    1 -
    Math.exp(-z * w * tSec) *
      (Math.cos(wd * tSec) + ((z * w) / wd) * Math.sin(wd * tSec))
  );
};

/** Keyframe track: piecewise eased interpolation between [time, value] keys. */
export type Key = { t: number; v: number; ease?: EaseName };

export const sampleKeys = (keys: readonly Key[], t: number): number => {
  if (keys.length === 0) return 0;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const e = ease[b.ease ?? "inOutCubic"];
      return lerp(a.v, b.v, e(invLerp(a.t, b.t, t)));
    }
  }
  return last.v;
};

/** Deterministic hash noise (no Math.random: renders must be reproducible). */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth 1D value noise in [-1, 1]; low frequency only, so it never flickers. */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 101);
  const b = hash(i + 1 + seed * 101);
  return lerp(a, b, smootherstep(f)) * 2 - 1;
};
