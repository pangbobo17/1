/**
 * GSAP inside Remotion, done safely.
 *
 * Remotion renders frames out of order and in parallel tabs, so GSAP must never
 * run on its own clock (requestAnimationFrame). Instead:
 *   1. Build a *paused* timeline that tweens a plain state object (not DOM).
 *   2. On every frame, seek the timeline to frame / fps.
 *   3. Read the state and render it with React.
 * This gives GSAP's sequencing tools (position parameter, labels, stagger,
 * eases) while staying deterministic: the same frame always yields the same
 * state, whatever order frames are rendered in.
 */
import gsap from "gsap";
import { useEffect, useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type TimelineBuilder<S extends object> = (
  tl: gsap.core.Timeline,
  state: S,
) => void;

/** Builds a paused timeline over a fresh copy of `initial`. Usable from Node (QC). */
/** Plain-data copy; skips GSAP's internal `_gsap` cache that it attaches to every target. */
const snapshot = <S>(v: S): S =>
  JSON.parse(JSON.stringify(v, (k, x) => (k === "_gsap" ? undefined : x)));

export const createFrameTimeline = <S extends object>(
  initial: S,
  build: TimelineBuilder<S>,
) => {
  const state = snapshot(initial);
  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: "power3.out", duration: 0.6 },
  });
  build(tl, state);
  return { tl, state };
};

/** Seeks and returns a snapshot of the state at `seconds`. */
export const sampleFrameTimeline = <S extends object>(
  t: { tl: gsap.core.Timeline; state: S },
  seconds: number,
): S => {
  t.tl.seek(seconds, true);
  return snapshot(t.state);
};

/**
 * React hook: state of a GSAP timeline at the current frame.
 * `initial` and `build` must be stable (module-level or useMemo): the timeline is built once.
 * `startFrame` delays the timeline relative to the current sequence.
 */
export const useFrameTimeline = <S extends object>(
  initial: S,
  build: TimelineBuilder<S>,
  startFrame = 0,
): S => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useMemo(
    () => createFrameTimeline(initial, build),
    [initial, build],
  );
  useEffect(() => () => void t.tl.kill(), [t]);
  return sampleFrameTimeline(t, Math.max(0, frame - startFrame) / fps);
};
