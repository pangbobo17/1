/**
 * GSAP timeline builders for the charts. Pure (no React) so the QC script can
 * build them in Node and check they finish inside their scene.
 */
import type { TimelineBuilder } from "../engine/gsap-frame";

export type V = { v: number };
export const zeros = (n: number): V[] =>
  Array.from({ length: n }, () => ({ v: 0 }));

export type BarState = { axis: number; bars: V[]; labels: V[]; values: V[] };

export const barTimeline =
  (n: number): TimelineBuilder<BarState> =>
  (tl, s) => {
    tl.addLabel("axis", 0)
      .to(s, { axis: 1, duration: 0.55, ease: "power2.inOut" }, "axis")
      .addLabel("bars", 0.35);
    for (let i = 0; i < n; i++) {
      const at = `bars+=${i * 0.14}`;
      tl.to(s.bars[i], { v: 1, duration: 0.8, ease: "back.out(1.15)" }, at);
      tl.to(s.values[i], { v: 1, duration: 0.8, ease: "power2.out" }, at);
      tl.to(s.labels[i], { v: 1, duration: 0.4, ease: "power2.out" }, at);
    }
  };

export type LineState = {
  draw: number;
  area: number;
  dots: V[];
  callout: number;
};

export const lineTimeline =
  (n: number): TimelineBuilder<LineState> =>
  (tl, s) => {
    tl.to(s, { draw: 1, duration: 1.6, ease: "power1.inOut" }, 0)
      .to(s, { area: 1, duration: 0.8, ease: "power2.out" }, 0.9)
      .to(
        s.dots,
        { v: 1, duration: 0.35, ease: "back.out(1.6)", stagger: 1.4 / n },
        0.1,
      )
      .to(s, { callout: 1, duration: 0.55, ease: "power3.out" }, 1.75);
  };
