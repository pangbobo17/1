import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { timing } from "../design/tokens";
import { EaseName, ease, invLerp } from "./motion";

/**
 * Every element that appears or disappears goes through <Presence>.
 *
 * - Enter/exit are never shorter than `timing.minFade` (a sub-200ms change
 *   reads as a pop or a flicker).
 * - Only opacity + transform are animated: layout never changes, so nothing
 *   around the element shifts while it animates (no reflow jumps).
 * - Before `in` and after the exit completes the element renders nothing.
 */
export type EnterStyle = "fade" | "rise" | "drop" | "pop" | "slideL" | "slideR";

const offsets: Record<EnterStyle, { x: number; y: number; s: number }> = {
  fade: { x: 0, y: 0, s: 1 },
  rise: { x: 0, y: 26, s: 1 },
  drop: { x: 0, y: -26, s: 1 },
  pop: { x: 0, y: 8, s: 0.86 },
  slideL: { x: -60, y: 0, s: 1 },
  slideR: { x: 60, y: 0, s: 1 },
};

export const presenceAt = (
  frame: number,
  fps: number,
  o: {
    in: number;
    out?: number;
    enter?: EnterStyle;
    exit?: EnterStyle;
    enterSec?: number;
    exitSec?: number;
    ease?: EaseName;
  },
) => {
  const minF = Math.ceil(timing.minFade * fps);
  const enterF = Math.max(minF, Math.round((o.enterSec ?? timing.enter) * fps));
  const exitF = Math.max(minF, Math.round((o.exitSec ?? timing.exit) * fps));
  const a = ease[o.ease ?? "outCubic"](invLerp(o.in, o.in + enterF, frame));
  const b =
    o.out === undefined
      ? 0
      : ease.inOutCubic(invLerp(o.out, o.out + exitF, frame));
  const en = offsets[o.enter ?? "rise"];
  const ex = offsets[o.exit ?? o.enter ?? "rise"];
  return {
    visible: frame >= o.in && (o.out === undefined || frame < o.out + exitF),
    opacity: a * (1 - b),
    x: en.x * (1 - a) + ex.x * b * -0.6,
    y: en.y * (1 - a) + ex.y * b * -0.6,
    scale: (en.s + (1 - en.s) * a) * (1 - (1 - ex.s) * b),
    progress: a,
  };
};

export const Presence: React.FC<{
  in: number;
  out?: number;
  enter?: EnterStyle;
  exit?: EnterStyle;
  enterSec?: number;
  exitSec?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ children, style, ...o }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = presenceAt(frame, fps, o);
  if (!p.visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        ...style,
        opacity: p.opacity,
        translate: `${p.x}px ${p.y}px`,
        scale: String(p.scale),
      }}
    >
      {children}
    </div>
  );
};
