import React, { useMemo } from "react";
import { accents, fonts, palette, stroke, type } from "../design/tokens";
import { useFrameTimeline } from "../engine/gsap-frame";
import {
  BarState,
  LineState,
  barTimeline,
  lineTimeline,
  zeros,
} from "./chart-timelines";
import { sketchPath } from "./Stage";

/**
 * Charts are choreographed with GSAP timelines (position parameter + stagger)
 * and rendered from the sampled state. Numbers use tabular figures and fixed
 * width boxes so counting digits never shift neighbouring text.
 */

export type BarDatum = { label: string; value: number; color?: string };

export const BarChart: React.FC<{
  data: BarDatum[];
  x: number;
  y: number;
  w: number;
  h: number;
  at?: number;
  max?: number;
  unit?: string;
  qcId: string;
}> = ({ data, x, y, w, h, at = 0, max, unit = "", qcId }) => {
  const n = data.length;
  const initial = useMemo<BarState>(
    () => ({ axis: 0, bars: zeros(n), labels: zeros(n), values: zeros(n) }),
    [n],
  );
  const build = useMemo(() => barTimeline(n), [n]);
  const s = useFrameTimeline(initial, build, at);
  const top = max ?? Math.max(...data.map((d) => d.value)) * 1.15;
  const labelH = 34;
  const plotH = h - labelH;
  const slot = w / n;
  const bw = Math.min(78, slot * 0.56);
  const baseY = plotH;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <svg
        width={w}
        height={h}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {[0.25, 0.5, 0.75, 1].map((g, i) => (
          <line
            key={g}
            x1={0}
            x2={w * s.axis}
            y1={baseY - g * plotH * 0.87}
            y2={baseY - g * plotH * 0.87}
            stroke={palette.ink}
            strokeOpacity={0.1}
            strokeWidth={2}
            strokeDasharray="6 8"
            data-i={i}
          />
        ))}
        {data.map((d, i) => {
          const bh = (d.value / top) * plotH * s.bars[i].v;
          const cx = slot * i + slot / 2;
          const color = d.color ?? accents[i % accents.length];
          return (
            <g key={d.label}>
              {/* Off-register fill + ink outline + hard 2.5D side. */}
              <rect
                x={cx - bw / 2 + 7}
                y={baseY - bh + 7}
                width={bw}
                height={Math.max(0, bh)}
                fill={palette.ink}
                rx={8}
                opacity={bh > 1 ? 1 : 0}
              />
              <rect
                x={cx - bw / 2 + stroke.fusionOffset.x * 0.6}
                y={baseY - bh + stroke.fusionOffset.y * 0.6}
                width={bw}
                height={Math.max(0, bh - stroke.fusionOffset.y * 0.6)}
                fill={color}
                rx={8}
              />
              <rect
                x={cx - bw / 2}
                y={baseY - bh}
                width={bw}
                height={Math.max(0, bh)}
                fill="none"
                stroke={palette.ink}
                strokeWidth={stroke.ink}
                rx={8}
                opacity={bh > 1 ? 1 : 0}
              />
            </g>
          );
        })}
        <path
          d={sketchPath(
            [
              { x: -6, y: baseY },
              { x: w * s.axis * 0.5, y: baseY },
              { x: w * s.axis + 6, y: baseY },
            ],
            21,
            0.8,
          )}
          stroke={palette.ink}
          strokeWidth={stroke.ink}
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {data.map((d, i) => {
        const cx = slot * i + slot / 2;
        const bh = (d.value / top) * plotH * s.bars[i].v;
        const v = Math.round(d.value * s.values[i].v);
        return (
          <React.Fragment key={d.label}>
            <div
              data-qc="text"
              data-qc-id={`${qcId}-value-${i}`}
              style={{
                position: "absolute",
                left: cx - 60,
                width: 120,
                top: baseY - bh - 42,
                textAlign: "center",
                fontFamily: fonts.numeric,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                fontSize: 26,
                lineHeight: "34px",
                color: palette.ink,
                opacity: s.labels[i].v,
              }}
            >
              {v}
              {unit}
            </div>
            <div
              data-qc="text"
              data-qc-id={`${qcId}-label-${i}`}
              style={{
                position: "absolute",
                left: cx - slot / 2 + 4,
                width: slot - 8,
                top: baseY + 8,
                textAlign: "center",
                fontFamily: fonts.body,
                fontWeight: type.label.weight,
                fontSize: type.label.size,
                lineHeight: `${labelH - 8}px`,
                color: palette.inkSoft,
                whiteSpace: "nowrap",
                opacity: s.labels[i].v,
                translate: `0px ${(1 - s.labels[i].v) * 8}px`,
              }}
            >
              {d.label}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const LineChart: React.FC<{
  values: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  at?: number;
  color?: string;
  callout: string;
  qcId: string;
}> = ({ values, x, y, w, h, at = 0, color = palette.coral, callout, qcId }) => {
  const n = values.length;
  const initial = useMemo<LineState>(
    () => ({ draw: 0, area: 0, dots: zeros(n), callout: 0 }),
    [n],
  );
  const build = useMemo(() => lineTimeline(n), [n]);
  const s = useFrameTimeline(initial, build, at);
  const max = Math.max(...values) * 1.1;
  const pts = values.map((v, i) => ({
    x: (i / (n - 1)) * w,
    y: h - (v / max) * h,
  }));
  const d = sketchPath(pts, 33, 0.6);
  // Path length estimate for dash drawing (polyline length is close enough for a draw-on).
  const len =
    pts
      .slice(1)
      .reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0) *
    1.04;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <svg
        width={w}
        height={h}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          <clipPath id={`${qcId}-clip`}>
            <rect x={-20} y={-40} width={(w + 40) * s.draw} height={h + 60} />
          </clipPath>
        </defs>
        <path
          d={`${d} L ${w} ${h} L 0 ${h} Z`}
          fill={color}
          opacity={0.18 * s.area}
          clipPath={`url(#${qcId}-clip)`}
        />
        <path
          d={d}
          stroke={palette.ink}
          strokeWidth={stroke.ink + 6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - s.draw)}
        />
        <path
          d={d}
          stroke={color}
          strokeWidth={stroke.ink + 1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - s.draw)}
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={8 * s.dots[i].v}
            fill={palette.white}
            stroke={palette.ink}
            strokeWidth={3.5 * Math.min(1, s.dots[i].v * 2)}
          />
        ))}
        <line
          x1={0}
          y1={h + 2}
          x2={w}
          y2={h + 2}
          stroke={palette.ink}
          strokeWidth={stroke.ink}
          strokeLinecap="round"
        />
      </svg>
      <div
        data-qc="text"
        data-qc-id={`${qcId}-callout`}
        style={{
          position: "absolute",
          // Top-left of the plot is always empty for a rising series: no collision with line or card edge.
          left: 16,
          top: 0,
          width: 220,
          padding: "8px 14px",
          background: palette.sun,
          border: `${stroke.inkThin}px solid ${palette.ink}`,
          borderRadius: 14,
          boxShadow: `4px 4px 0 ${palette.ink}`,
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: type.label.size,
          lineHeight: 1.3,
          color: palette.ink,
          textAlign: "center",
          whiteSpace: "nowrap",
          opacity: s.callout,
          translate: `0px ${(1 - s.callout) * 14}px`,
          scale: String(0.9 + 0.1 * s.callout),
        }}
      >
        {callout}
      </div>
    </div>
  );
};
