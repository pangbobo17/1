/**
 * SynaptoVis design tokens.
 *
 * Visual language: "SignalSketch Color+ Fusion v2.0" (hand-inked outlines with
 * colour fills that sit slightly off-register, signal/waveform motifs) combined
 * with "Vibrant Editorial + Colorful 2.5D" (bold editorial type, saturated
 * accents, layered cards with hard offset shadows and parallax depth).
 *
 * Every visual decision lives here so scenes never hard-code colours, sizes
 * or timings. Change a token, every scene follows.
 */

export const palette = {
  paper: "#FFF7EA",
  paperShade: "#F4E9D6",
  ink: "#1E1B2E",
  inkSoft: "#4A4560",
  muted: "#8C86A0",
  coral: "#FF5A5F",
  sun: "#FFC23C",
  teal: "#16B39A",
  blue: "#3D6BFF",
  violet: "#8E5CF7",
  pink: "#FF8FC7",
  white: "#FFFFFF",
} as const;

/** Ordered accent cycle for charts / categorical items. */
export const accents = [
  palette.coral,
  palette.sun,
  palette.teal,
  palette.blue,
  palette.violet,
  palette.pink,
] as const;

export const fonts = {
  /** Editorial display face for headlines. */
  display: "'Noto Sans SC', 'Space Grotesk', sans-serif",
  /** Body / label face. */
  body: "'Noto Sans SC', 'Space Grotesk', sans-serif",
  /** Numbers in charts: tabular figures keep digits from jittering while counting. */
  numeric: "'Space Grotesk', 'Noto Sans SC', sans-serif",
} as const;

/**
 * Type scale for a 1280x720 canvas (scaled from the 1080-wide minimums in the
 * Remotion layout rules: headline >= 84px@1080 -> ~72px here).
 */
export const type = {
  hero: { size: 76, weight: 900, lineHeight: 1.12, tracking: -0.01 },
  title: { size: 52, weight: 900, lineHeight: 1.15, tracking: -0.005 },
  subtitle: { size: 30, weight: 700, lineHeight: 1.3, tracking: 0 },
  body: { size: 26, weight: 500, lineHeight: 1.4, tracking: 0 },
  label: { size: 20, weight: 700, lineHeight: 1.25, tracking: 0.02 },
  caption: { size: 16, weight: 500, lineHeight: 1.3, tracking: 0.04 },
} as const;

export type TypeRole = keyof typeof type;

export const stroke = {
  ink: 4,
  inkThin: 2.5,
  /** Offset of the colour fill relative to the ink outline ("Color+ Fusion"). */
  fusionOffset: { x: 5, y: 4 },
} as const;

/** 2.5D depth: hard offset shadow + parallax factor per layer. */
export const depth = {
  shadow: (level: 1 | 2 | 3) => {
    const d = level * 6;
    return `${d}px ${d}px 0 ${palette.ink}`;
  },
  /** Parallax multipliers for camera motion: background moves least. */
  parallax: { far: 0.35, mid: 0.7, near: 1, front: 1.25 },
} as const;

export const layout = {
  width: 1280,
  height: 720,
  /** Safe area: key text stays inside these margins. */
  safe: { x: 72, y: 56 },
  /** Minimum gap between any two text boxes (px). */
  minTextGap: 12,
  gutter: 24,
  /**
   * Background layers extend this fraction of the canvas beyond every edge, so
   * camera pans/zooms on parallax layers never expose an uncovered strip.
   * `npm run qc:static` verifies every camera frame stays inside it.
   */
  overscan: 0.6,
} as const;

/** Timing tokens in seconds; convert with `fps` at call sites. */
export const timing = {
  /** Shortest allowed appear/disappear. Anything faster reads as a pop. */
  minFade: 0.2,
  enter: 0.5,
  exit: 0.35,
  stagger: 0.08,
  /** Character action cross-fade window. */
  actionBlend: 0.3,
  /** Scene transition length (named to avoid Remotion's CSS-transition lint rule). */
  sceneChange: 0.6,
  hold: 0.8,
} as const;
