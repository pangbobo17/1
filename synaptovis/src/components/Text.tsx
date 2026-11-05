import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fonts, palette, type, TypeRole, timing } from "../design/tokens";
import { ease, invLerp } from "../engine/motion";

/**
 * Editorial text with a staggered reveal.
 *
 * Layout safety rules (fixes overlapping / jumping text):
 *  - Every token is laid out from frame 0 (invisible until revealed), so line
 *    breaks and spacing never change during the animation.
 *  - Only opacity and translate are animated, never width/letter-spacing/size.
 *  - Line breaks are explicit ("\n") for headlines; `maxWidth` is the hard box.
 *  - CJK is revealed per character, Latin per word (words never split).
 *  - Each block carries data-qc attributes so the layout probe can measure it.
 */
const TOKEN = /[A-Za-z0-9][A-Za-z0-9.,%+\-'’/:]*|\s+|./gu;

export const EditorialText: React.FC<{
  text: string;
  role?: TypeRole;
  color?: string;
  /** Frame (relative to the parent sequence) when the reveal starts. */
  at?: number;
  /** Seconds between tokens. */
  stagger?: number;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  /** Highlight these substrings with a marker swipe. */
  highlight?: { text: string; color: string; at?: number }[];
  qcId: string;
  style?: React.CSSProperties;
  weight?: number;
}> = ({
  text,
  role = "title",
  color = palette.ink,
  at = 0,
  stagger,
  maxWidth,
  align = "left",
  highlight = [],
  qcId,
  style,
  weight,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = type[role];
  const per =
    (stagger ?? (role === "hero" || role === "title" ? 0.045 : 0.02)) * fps;
  const dur = timing.enter * fps;
  const lines = text.split("\n");
  let index = 0;

  return (
    <div
      data-qc="text"
      data-qc-id={qcId}
      data-qc-lines={lines.length}
      style={{
        fontFamily:
          role === "label" || role === "caption" ? fonts.body : fonts.display,
        fontSize: t.size,
        fontWeight: weight ?? t.weight,
        lineHeight: t.lineHeight,
        letterSpacing: `${t.tracking}em`,
        color,
        maxWidth,
        textAlign: align,
        whiteSpace: "nowrap",
        fontKerning: "normal",
        ...style,
      }}
    >
      {lines.map((line, li) => {
        const tokens = line.match(TOKEN) ?? [];
        return (
          <div key={li} style={{ position: "relative" }}>
            {highlight
              .filter((h) => line.includes(h.text))
              .map((h) => (
                <Marker
                  key={h.text}
                  line={line}
                  h={h}
                  frame={frame}
                  fps={fps}
                  t0={at}
                />
              ))}
            {tokens.map((tok, ti) => {
              if (/^\s+$/.test(tok)) return <span key={ti}>{tok}</span>;
              const start = at + index * per;
              index++;
              const p = ease.outCubic(invLerp(start, start + dur, frame));
              return (
                <span
                  key={ti}
                  data-qc-token
                  style={{
                    display: "inline-block",
                    position: "relative",
                    opacity: p,
                    translate: `0px ${(1 - p) * 0.32}em`,
                  }}
                >
                  {tok}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** Marker swipe behind a substring; width measured in em to stay layout-free. */
const Marker: React.FC<{
  line: string;
  h: { text: string; color: string; at?: number };
  frame: number;
  fps: number;
  t0: number;
}> = ({ line, h, frame, fps, t0 }) => {
  const before = line.slice(0, line.indexOf(h.text));
  // Latin-1 glyphs ~0.56em, CJK glyphs exactly 1em in Noto Sans SC.
  const em = (s: string) =>
    [...s].reduce((a, c) => a + (c.charCodeAt(0) < 256 ? 0.56 : 1), 0);
  const start = h.at ?? t0 + 0.5 * fps;
  const p = ease.inOutCubic(invLerp(start, start + 0.45 * fps, frame));
  return (
    <span
      style={{
        position: "absolute",
        left: `${em(before)}em`,
        width: `${em(h.text) * p}em`,
        top: "0.52em",
        height: "0.5em",
        background: h.color,
        borderRadius: "0.12em",
        zIndex: 0,
        opacity: 0.85,
      }}
    />
  );
};
