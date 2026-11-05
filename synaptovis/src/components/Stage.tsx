import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { depth, layout, palette, stroke } from "../design/tokens";
import { hash, noise1 } from "../engine/motion";

/**
 * Hand-inked line between points. Wobble is seeded and *static* (no per-frame
 * "boil"): boiling lines are the main source of perceived flicker.
 */
export const sketchPath = (
  pts: { x: number; y: number }[],
  seed: number,
  amp = 1.6,
) => {
  const out: string[] = [];
  pts.forEach((p, i) => {
    const jx = (hash(seed + i * 3.1) - 0.5) * 2 * amp;
    const jy = (hash(seed + i * 7.7) - 0.5) * 2 * amp;
    if (i === 0) {
      out.push(`M ${(p.x + jx).toFixed(2)} ${(p.y + jy).toFixed(2)}`);
    } else {
      const prev = pts[i - 1];
      const mx = (prev.x + p.x) / 2 + (hash(seed + i * 11.3) - 0.5) * amp * 2;
      const my = (prev.y + p.y) / 2 + (hash(seed + i * 5.9) - 0.5) * amp * 2;
      out.push(
        `Q ${mx.toFixed(2)} ${my.toFixed(2)} ${(p.x + jx).toFixed(2)} ${(p.y + jy).toFixed(2)}`,
      );
    }
  });
  return out.join(" ");
};

/** Paper background, overscanned by layout.overscan on every side. */
export const Paper: React.FC = () => {
  const { width, height } = useVideoConfig();
  const ox = width * layout.overscan;
  const oy = height * layout.overscan;
  const dots: React.ReactNode[] = [];
  for (let y = -oy + 24; y < height + oy; y += 36) {
    for (let x = -ox + 24; x < width + ox; x += 36) {
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={1.4}
          fill={palette.inkSoft}
          opacity={0.13}
        />,
      );
    }
  }
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: -ox,
          top: -oy,
          width: width + 2 * ox,
          height: height + 2 * oy,
          backgroundColor: palette.paper,
        }}
      />
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {dots}
      </svg>
    </>
  );
};

/** Slow-drifting colour shapes on the far layer (2.5D backdrop). */
export const Blobs: React.FC<{ seed?: number; colors?: string[] }> = ({
  seed = 1,
  colors = [palette.sun, palette.pink, palette.teal],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      {colors.map((c, i) => {
        const cx = (0.15 + 0.35 * i) * width + noise1(t * 0.12, seed + i) * 30;
        const cy =
          (i % 2 ? 0.25 : 0.78) * height + noise1(t * 0.1, seed + i + 9) * 22;
        const r = 120 + hash(seed + i) * 80;
        return <circle key={i} cx={cx} cy={cy} r={r} fill={c} opacity={0.22} />;
      })}
    </svg>
  );
};

/** Signal waveform motif (static shape, slow phase drift). */
export const SignalWave: React.FC<{
  y: number;
  color?: string;
  amp?: number;
  opacity?: number;
}> = ({ y, color = palette.violet, amp = 14, opacity = 0.35 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const phase = (frame / fps) * 0.6;
  const pts: string[] = [];
  const ox = Math.ceil((width * layout.overscan) / 8) * 8;
  for (let x = -ox; x <= width + ox; x += 8) {
    const v = Math.sin(x / 46 + phase) * amp * (0.6 + 0.4 * Math.sin(x / 210));
    pts.push(`${x === -ox ? "M" : "L"} ${x} ${(y + v).toFixed(2)}`);
  }
  return (
    <svg
      width={width}
      height={y + amp * 3}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      <path
        d={pts.join(" ")}
        stroke={color}
        strokeWidth={3}
        fill="none"
        opacity={opacity}
        strokeLinecap="round"
      />
    </svg>
  );
};

/** Editorial 2.5D card: ink border + hard offset shadow + off-register colour. */
export const Card: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  level?: 1 | 2 | 3;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, w, h, color = palette.white, level = 2, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        translate: `${stroke.fusionOffset.x}px ${stroke.fusionOffset.y}px`,
        background: color,
        borderRadius: 22,
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 22,
        border: `${stroke.ink}px solid ${palette.ink}`,
        boxShadow: depth.shadow(level),
      }}
    />
    <div style={{ position: "absolute", inset: 0, padding: 28 }}>
      {children}
    </div>
  </div>
);

/** Floor line the characters stand on (hand-inked). */
export const Floor: React.FC<{ y: number; seed?: number }> = ({
  y,
  seed = 4,
}) => {
  const { width } = useVideoConfig();
  // Spans the overscan: a camera push-in must never reveal the line's end.
  const ox = width * layout.overscan;
  const pts = Array.from({ length: 24 }, (_, i) => ({
    x: -ox + (i * (width + 2 * ox)) / 23,
    y,
  }));
  return (
    <svg
      width={width}
      height={y + 10}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      <path
        d={sketchPath(pts, seed, 1.2)}
        stroke={palette.ink}
        strokeWidth={stroke.ink}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
};
