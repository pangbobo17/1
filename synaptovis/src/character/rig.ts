/**
 * Character rig: a 2D skeleton with fixed bone lengths.
 *
 * - Arms use forward kinematics (angles), legs use analytic two-bone IK
 *   (foot targets), so feet can be planted on the ground while the body moves.
 * - Bone lengths never change -> limbs cannot stretch or deform.
 * - All pose fields are plain numbers, so any two poses can be blended.
 *
 * Coordinate system: origin on the ground under the character, +x = the
 * direction the character faces, +y = down (SVG). Units are px at scale 1.
 * Pure TS: imported by both the renderer and the Node QC scripts.
 */
import { clamp, lerp, lerpAngle } from "../engine/motion";

export const BONES = {
  thigh: 60,
  shin: 58,
  torso: 86,
  neck: 12,
  headR: 36,
  upperArm: 46,
  forearm: 42,
  hipSpread: 7,
  shoulderSpread: 9,
} as const;

/** Standing hip height with a relaxed (slightly bent) knee. */
export const STAND_HIP = 124;

export type Pose = {
  /** Hip position relative to root. hipY is height above ground (positive). */
  hipX: number;
  hipY: number;
  /** Extra vertical lift of the whole body (jumps). */
  lift: number;
  /** Torso lean in degrees, + = forward. */
  torso: number;
  /** Head tilt relative to torso, + = forward/down. */
  head: number;
  /** Upper-arm angle from hanging straight down, + = swings forward/up. */
  shoulderF: number;
  shoulderB: number;
  /** Elbow bend, 0 = straight, + = forearm folds forward. */
  elbowF: number;
  elbowB: number;
  /** Foot targets relative to root on the ground; y = height above ground. */
  footFX: number;
  footFY: number;
  footBX: number;
  footBY: number;
  /** Toe pitch in degrees (+ = toe up). */
  toeF: number;
  toeB: number;
  /** Volume-preserving squash & stretch: 1 = none, <1 squash, >1 stretch. */
  stretch: number;
  /** Face. */
  blink: number;
  mouth: number;
  smile: number;
  brow: number;
  gazeX: number;
  gazeY: number;
};

export const BASE_POSE: Pose = {
  hipX: 0,
  hipY: STAND_HIP,
  lift: 0,
  torso: 2,
  head: 0,
  shoulderF: 6,
  shoulderB: -4,
  elbowF: 12,
  elbowB: 10,
  footFX: 9,
  footFY: 0,
  footBX: -9,
  footBY: 0,
  toeF: 0,
  toeB: 0,
  stretch: 1,
  blink: 0,
  mouth: 0,
  smile: 0.35,
  brow: 0,
  gazeX: 0.2,
  gazeY: 0,
};

const ANGLE_KEYS: ReadonlySet<keyof Pose> = new Set<keyof Pose>([
  "torso",
  "head",
  "shoulderF",
  "shoulderB",
  "elbowF",
  "elbowB",
  "toeF",
  "toeB",
]);

/** Blend two poses. Angles use shortest-arc interpolation. */
export const blendPose = (a: Pose, b: Pose, t: number): Pose => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    out[k] = ANGLE_KEYS.has(k) ? lerpAngle(a[k], b[k], t) : lerp(a[k], b[k], t);
  }
  return out;
};

export type Vec = { x: number; y: number };

export type Skeleton = {
  hip: Vec;
  neck: Vec;
  headCenter: Vec;
  shoulderF: Vec;
  shoulderB: Vec;
  elbowF: Vec;
  elbowB: Vec;
  handF: Vec;
  handB: Vec;
  hipF: Vec;
  hipB: Vec;
  kneeF: Vec;
  kneeB: Vec;
  ankleF: Vec;
  ankleB: Vec;
  /** Absolute angles (deg) used by the renderer for oriented parts. */
  torsoAngle: number;
  headAngle: number;
  toeF: number;
  toeB: number;
  /** IK diagnostics for QC. */
  ikOverreach: number;
  kneeBendF: number;
  kneeBendB: number;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Direction for an angle measured from straight-down, + rotating toward +x. */
const down = (angleDeg: number): Vec => ({
  x: Math.sin(rad(angleDeg)),
  y: Math.cos(rad(angleDeg)),
});

/**
 * Two-bone IK. Knee always bends toward +x (forward), so legs never invert.
 * Returns knee/ankle and how far the target was out of reach (px).
 */
const solveLeg = (hip: Vec, target: Vec) => {
  const L1 = BONES.thigh;
  const L2 = BONES.shin;
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const rawD = Math.hypot(dx, dy);
  const maxD = L1 + L2 - 0.01;
  const minD = Math.abs(L1 - L2) + 1;
  const d = clamp(rawD, minD, maxD);
  const overreach = Math.max(0, rawD - maxD);
  // Angle of hip->target measured from straight down, + toward +x.
  const base = Math.atan2(dx, dy);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const a = Math.acos(cosA);
  // Knee forward: rotate the thigh toward +x.
  const thighAngle = base + a;
  const knee = {
    x: hip.x + Math.sin(thighAngle) * L1,
    y: hip.y + Math.cos(thighAngle) * L1,
  };
  const ankle = {
    x: hip.x + Math.sin(base) * d,
    y: hip.y + Math.cos(base) * d,
  };
  const cosK = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const kneeBend = 180 - deg(Math.acos(cosK));
  return { knee, ankle, overreach, kneeBend };
};

export const solveSkeleton = (p: Pose): Skeleton => {
  const hip: Vec = { x: p.hipX, y: -(p.hipY + p.lift) };
  const torsoAngle = p.torso;
  // Torso points up from the hip: rotate "up" by lean (+ = toward +x).
  const neck: Vec = {
    x: hip.x + Math.sin(rad(torsoAngle)) * BONES.torso,
    y: hip.y - Math.cos(rad(torsoAngle)) * BONES.torso,
  };
  const headAngle = torsoAngle + p.head;
  const headCenter: Vec = {
    x: neck.x + Math.sin(rad(headAngle)) * (BONES.neck + BONES.headR * 0.85),
    y: neck.y - Math.cos(rad(headAngle)) * (BONES.neck + BONES.headR * 0.85),
  };
  const shoulderBase: Vec = {
    x: neck.x - Math.sin(rad(torsoAngle)) * 8,
    y: neck.y + Math.cos(rad(torsoAngle)) * 8,
  };
  const shoulderF = {
    x: shoulderBase.x + BONES.shoulderSpread * 0.4,
    y: shoulderBase.y,
  };
  const shoulderB = {
    x: shoulderBase.x - BONES.shoulderSpread * 0.4,
    y: shoulderBase.y,
  };

  const arm = (s: Vec, shoulder: number, elbow: number) => {
    const ua = torsoAngle + shoulder;
    const e = {
      x: s.x + down(ua).x * BONES.upperArm,
      y: s.y + down(ua).y * BONES.upperArm,
    };
    const fa = ua + elbow;
    const h = {
      x: e.x + down(fa).x * BONES.forearm,
      y: e.y + down(fa).y * BONES.forearm,
    };
    return { e, h };
  };
  const aF = arm(shoulderF, p.shoulderF, clamp(p.elbowF, 0, 155));
  const aB = arm(shoulderB, p.shoulderB, clamp(p.elbowB, 0, 155));

  const hipF = { x: hip.x + BONES.hipSpread * 0.5, y: hip.y };
  const hipB = { x: hip.x - BONES.hipSpread * 0.5, y: hip.y };
  // Ankle sits a little above the ground (shoe sole thickness).
  const legF = solveLeg(hipF, { x: p.footFX, y: -(p.footFY + 8) });
  const legB = solveLeg(hipB, { x: p.footBX, y: -(p.footBY + 8) });

  return {
    hip,
    neck,
    headCenter,
    shoulderF,
    shoulderB,
    elbowF: aF.e,
    elbowB: aB.e,
    handF: aF.h,
    handB: aB.h,
    hipF,
    hipB,
    kneeF: legF.knee,
    kneeB: legB.knee,
    ankleF: legF.ankle,
    ankleB: legB.ankle,
    torsoAngle,
    headAngle,
    toeF: p.toeF,
    toeB: p.toeB,
    ikOverreach: Math.max(legF.overreach, legB.overreach),
    kneeBendF: legF.kneeBend,
    kneeBendB: legB.kneeBend,
  };
};

/** Joints checked by QC for velocity / jerk. */
export const TRACKED_JOINTS = [
  "hip",
  "neck",
  "headCenter",
  "elbowF",
  "elbowB",
  "handF",
  "handB",
  "kneeF",
  "kneeB",
  "ankleF",
  "ankleB",
] as const satisfies readonly (keyof Skeleton)[];
