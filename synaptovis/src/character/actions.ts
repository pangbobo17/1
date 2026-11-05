/**
 * Action presets. Each preset is a pure function of local time that returns
 * a complete Pose. Presets describe the *steady state* of an action; entry and
 * exit are handled by the track's cross-fade, so presets never need to start
 * from a specific pose (that is what used to cause sudden jumps).
 *
 * Rules every preset follows:
 *  - Only low-frequency, deterministic motion (sin / value noise). No random.
 *  - Amplitudes stay inside anatomical limits checked by QC.
 *  - Secondary motion (breathing, sway) is always on so nothing freezes.
 */
import {
  clamp,
  ease,
  noise1,
  smootherstep,
  smoothstep,
} from "../engine/motion";
import { BASE_POSE, Pose, STAND_HIP } from "./rig";

export type ActionContext = {
  /** Seconds since the clip started. */
  t: number;
  /** Walk cycles completed, derived from distance travelled (no foot sliding). */
  phase: number;
  /** Per-character seed so two characters never move in lockstep. */
  seed: number;
};

export type ActionParams = Record<string, number | string | undefined>;
export type ActionFn = (ctx: ActionContext, params: ActionParams) => Pose;

const TAU = Math.PI * 2;

/** Breathing + micro sway applied on top of most actions. */
const life = (p: Pose, ctx: ActionContext, amount = 1): Pose => {
  const breath = Math.sin((TAU * ctx.t) / 3.4);
  return {
    ...p,
    hipY: p.hipY + breath * 0.9 * amount,
    torso: p.torso + noise1(ctx.t * 0.45, ctx.seed) * 1.4 * amount,
    head: p.head + noise1(ctx.t * 0.38, ctx.seed + 7) * 2.2 * amount,
    shoulderF: p.shoulderF + breath * 1.2 * amount,
    shoulderB: p.shoulderB + breath * 1.0 * amount,
  };
};

const num = (v: ActionParams[string], d: number) =>
  typeof v === "number" ? v : d;

export const idle: ActionFn = (ctx) => life({ ...BASE_POSE }, ctx);

/**
 * Walk cycle. `phase` advances with distance, so planted feet stay planted.
 * Stride (one full cycle) covers STRIDE px of ground.
 */
export const WALK_STRIDE = 110;
export const walk: ActionFn = (ctx) => {
  const step = WALK_STRIDE / 2;
  const legPhase = (off: number) => {
    const u = (((ctx.phase + off) % 1) + 1) % 1;
    if (u < 0.5) {
      // Stance: foot moves backward relative to the hip at body speed.
      const s = u / 0.5;
      return { x: step / 2 - s * step, y: 0, toe: 0 };
    }
    // Swing, planned in WORLD space: the foot leaves and lands with zero ground
    // velocity and acceleration (smootherstep over 2 steps), minus the body's own advance.
    // Planning it relative to the hip instead makes the foot jerk at lift-off.
    const s = (u - 0.5) / 0.5;
    const lift = Math.sin(Math.PI * s) ** 2;
    return {
      x: -step / 2 + smootherstep(s) * 2 * step - s * step,
      y: lift * 15,
      toe: lift * 12,
    };
  };
  const f = legPhase(0);
  const b = legPhase(0.5);
  const c = Math.cos(TAU * ctx.phase * 2);
  const swing = Math.sin(TAU * ctx.phase);
  return {
    ...BASE_POSE,
    // Lower hip while walking so the stride fits the leg length without locking the knee.
    hipY: STAND_HIP - 9 + c * 2.5,
    torso: 6 + Math.sin(TAU * ctx.phase * 2) * 0.8,
    head: -3,
    shoulderF: -swing * 24,
    shoulderB: swing * 24,
    // Smooth in swing (a max(0, x) here has a kink -> one-frame elbow jerk).
    elbowF: 30 - swing * 9,
    elbowB: 30 + swing * 9,
    footFX: f.x + 3,
    footFY: f.y,
    toeF: f.toe,
    footBX: b.x - 3,
    footBY: b.y,
    toeB: b.toe,
    smile: 0.45,
    gazeX: 0.6,
  };
};

/** Wave with the front arm raised. */
export const wave: ActionFn = (ctx, p) => {
  const speed = num(p.speed, 2.1);
  const w = Math.sin(TAU * speed * ctx.t);
  return life(
    {
      ...BASE_POSE,
      torso: -2,
      head: -5 + w * 1.5,
      shoulderF: 150 + w * 6,
      elbowF: 28 + w * 24,
      shoulderB: -8,
      elbowB: 14,
      smile: 0.9,
      brow: 0.5,
      gazeX: 0.9,
      mouth: 0.25,
    },
    ctx,
    0.6,
  );
};

/** Point at a direction (degrees from straight down, e.g. 95 = level forward). */
export const point: ActionFn = (ctx, p) => {
  const dir = num(p.dir, 95);
  const settle = Math.sin(TAU * 0.6 * ctx.t) * 1.5;
  return life(
    {
      ...BASE_POSE,
      torso: 5,
      head: clamp((95 - dir) * 0.35, -14, 14) - 2,
      shoulderF: dir + settle,
      elbowF: 6,
      shoulderB: -6,
      elbowB: 24,
      footFX: 13,
      footBX: -11,
      smile: 0.6,
      brow: 0.35,
      gazeX: 1,
      gazeY: clamp((95 - dir) / 60, -1, 1) * -1,
    },
    ctx,
    0.7,
  );
};

/** Talking with hand gestures; mouth driven by smooth syllable noise. */
export const talk: ActionFn = (ctx, p) => {
  const intensity = num(p.intensity, 1);
  const g = noise1(ctx.t * 1.1, ctx.seed + 3);
  const g2 = noise1(ctx.t * 0.9, ctx.seed + 11);
  const syll = Math.abs(
    Math.sin(TAU * 2.6 * ctx.t + noise1(ctx.t * 2, ctx.seed) * 1.5),
  );
  const phraseGap = smoothstep((noise1(ctx.t * 0.6, ctx.seed + 5) + 0.6) / 0.5);
  return life(
    {
      ...BASE_POSE,
      torso: 4 + g * 2,
      head: g2 * 4,
      shoulderF: 38 + g * 16 * intensity,
      elbowF: 62 + g2 * 22 * intensity,
      shoulderB: 10 + g2 * 8 * intensity,
      elbowB: 40 + g * 14 * intensity,
      mouth: syll * 0.7 * phraseGap,
      smile: 0.5,
      brow: 0.2 + Math.max(0, g) * 0.4,
      gazeX: 0.85,
    },
    ctx,
    0.8,
  );
};

/** Thinking: hand to chin, eyes up. */
export const think: ActionFn = (ctx) => {
  const tap = Math.sin(TAU * 0.8 * ctx.t);
  return life(
    {
      ...BASE_POSE,
      torso: 0,
      head: 8 + tap * 1.2,
      shoulderF: 26,
      elbowF: 138 + tap * 4,
      shoulderB: 14,
      elbowB: 95,
      smile: 0,
      brow: 0.8,
      gazeX: 0.4,
      gazeY: -0.9,
    },
    ctx,
    0.6,
  );
};

/**
 * Celebration jump with anticipation, volume-preserving squash & stretch and
 * a soft landing. `period` seconds per jump; the clip loops it.
 */
export const celebrate: ActionFn = (ctx, p) => {
  const period = num(p.period, 1.3);
  const u = (((ctx.t % period) + period) % period) / period;
  // Arms rest at REST between jumps (not fully down) so they never whip 135°.
  const REST = 0.4;
  let crouch = 0;
  let lift = 0;
  let tuck = 0;
  let stretch = 1;
  let arms = REST;
  if (u < 0.28) {
    const s = ease.inOutCubic(u / 0.28);
    crouch = s * 20;
    stretch = 1 - s * 0.05;
    arms = REST - s * 0.12; // small wind-up
  } else if (u < 0.72) {
    const s = (u - 0.28) / 0.44;
    lift = Math.sin(Math.PI * s) * 46;
    tuck = Math.sin(Math.PI * s) ** 2 * 10;
    crouch = 20 * (1 - ease.inOutCubic(Math.min(1, s * 2.2)));
    // Continues from the anticipation squash (0.95) into a slight stretch, back to 1.
    stretch =
      1 +
      Math.sin(Math.PI * Math.min(1, s * 1.6)) ** 2 * 0.035 -
      0.05 * (1 - smootherstep(Math.min(1, s * 2.5)));
    arms = REST - 0.12 + (1 - REST + 0.12) * smootherstep(Math.min(1, s / 0.8));
  } else {
    const s = (u - 0.72) / 0.28;
    // sin² so the landing crouch eases in from the flat flight segment.
    const land = Math.sin(Math.PI * s) ** 2;
    crouch = land * 14;
    stretch = 1 - land * 0.04;
    arms = 1 - (1 - REST) * ease.inOutCubic(s);
  }
  return {
    ...BASE_POSE,
    hipY: STAND_HIP - crouch,
    lift,
    torso: 3 - arms * 4,
    head: -6 * arms,
    shoulderF: 20 + arms * 135,
    shoulderB: 10 + arms * 125,
    elbowF: 30 - arms * 15,
    elbowB: 30 - arms * 12,
    footFX: 10,
    footBX: -10,
    // Feet leave the floor with the body (otherwise the legs over-stretch).
    footFY: Math.max(0, lift - tuck * 0.2) + tuck * 0.6,
    footBY: Math.max(0, lift - tuck * 0.2) + tuck * 0.4,
    toeF: -8 * clamp(lift / 12),
    toeB: -8 * clamp(lift / 12),
    stretch,
    smile: 1,
    mouth: 0.35 + arms * 0.3,
    brow: 0.7,
    gazeX: 0.5,
  };
};

/** Agreeing nod while listening. */
export const nod: ActionFn = (ctx) => {
  const n = Math.max(0, Math.sin(TAU * 1.4 * ctx.t));
  return life(
    { ...BASE_POSE, head: 4 + n * 9, smile: 0.7, gazeX: 0.8 },
    ctx,
    0.6,
  );
};

/** Present: open palm toward content (calmer than point). */
export const present: ActionFn = (ctx) =>
  life(
    {
      ...BASE_POSE,
      torso: 3,
      shoulderF: 70,
      elbowF: 30,
      shoulderB: -6,
      elbowB: 20,
      smile: 0.65,
      gazeX: 1,
      footFX: 13,
    },
    ctx,
    0.8,
  );

export const ACTIONS = {
  idle,
  walk,
  wave,
  point,
  talk,
  think,
  celebrate,
  nod,
  present,
} as const;
export type ActionName = keyof typeof ACTIONS;
