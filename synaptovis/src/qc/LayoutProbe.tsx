import { useLayoutEffect } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import { layout } from "../design/tokens";

/**
 * Browser-side layout QC. Mounted only in the QC composition.
 *
 * After each frame is laid out it measures every [data-qc="text"] box *as it
 * appears on screen* (transforms, camera zoom included) and reports:
 *   overlap      two visible text boxes in the same scene intersect      (error)
 *   tight        gap between two text boxes < layout.minTextGap           (warn)
 *   clipped      visible text crosses the frame edge                      (error)
 *   unsafe       fully visible text outside the safe area                 (warn)
 *   wrap         rendered line count > declared line count                (error)
 *   figure       text overlaps a character                                (warn)
 * Results are printed as `QC_LAYOUT {json}` lines and collected by
 * scripts/qc-layout.mjs from the render log.
 */
type Box = {
  id: string;
  scope: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  opacity: number;
  el: Element;
  scopeMoving: boolean;
};

const effectiveOpacity = (el: Element | null) => {
  let o = 1;
  for (
    let e: Element | null = el;
    e && e !== document.body;
    e = e.parentElement
  ) {
    o *= parseFloat(getComputedStyle(e).opacity || "1");
    if (o < 0.01) return 0;
  }
  return o;
};

/**
 * Text boxes are measured by their glyph extents (a DOM Range over the text),
 * not the element box: a centred label in a wide slot only occupies its text.
 */
const boxOf = (el: Element, root: DOMRect, glyphs: boolean): Box => {
  let r = el.getBoundingClientRect();
  let opacity = effectiveOpacity(el);
  // Text revealed token by token: only tokens that are actually visible count.
  const tokens = [...el.querySelectorAll("[data-qc-token]")].filter(
    (t) => parseFloat(getComputedStyle(t).opacity) > 0.05,
  );
  const allTokens = el.querySelectorAll("[data-qc-token]").length;
  if (glyphs && allTokens > 0) {
    if (tokens.length === 0) opacity = 0;
    else {
      const rs = tokens.map((t) => t.getBoundingClientRect());
      const x0 = Math.min(...rs.map((q) => q.left));
      const x1 = Math.max(...rs.map((q) => q.right));
      // Vertical extent: the line boxes holding visible tokens.
      const lines = [...new Set(tokens.map((t) => t.parentElement!))].map((l) =>
        l.getBoundingClientRect(),
      );
      const y0 = Math.min(...lines.map((q) => q.top));
      const y1 = Math.max(...lines.map((q) => q.bottom));
      r = new DOMRect(x0, y0, x1 - x0, y1 - y0);
      opacity *= Math.max(
        ...tokens.map((t) => parseFloat(getComputedStyle(t).opacity)),
      );
    }
  } else if (glyphs) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const g = range.getBoundingClientRect();
    // Horizontal extent from the glyphs; vertical from the line boxes (the font's
    // content area is ~1.45em for CJK, taller than both the ink and the line).
    if (g.width > 0 && g.height > 0)
      r = new DOMRect(g.left, r.top, g.width, r.height);
  }
  const scopeEl = el.closest("[data-qc-scope]");
  const sr = scopeEl?.getBoundingClientRect();
  return {
    id: el.getAttribute("data-qc-id") ?? el.tagName,
    scope: scopeEl?.getAttribute("data-qc-scope") ?? "root",
    // A scene that is itself displaced/scaled is mid-transition.
    scopeMoving:
      !!sr &&
      (Math.abs(sr.left - root.left) > 1 ||
        Math.abs(sr.top - root.top) > 1 ||
        Math.abs(sr.width - root.width) > 1),
    x0: r.left - root.left,
    y0: r.top - root.top,
    x1: r.right - root.left,
    y1: r.bottom - root.top,
    opacity,
    el,
  };
};

const inter = (a: Box, b: Box, pad = 0) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + pad;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + pad;
  return w > 0 && h > 0 ? w * h : 0;
};

export const LayoutProbe: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    // Measure right before the screenshot: wait two animation frames so
    // premounted sequences are revealed and layout has settled.
    const handle = delayRender(`layout-probe-${frame}`);
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        measureLayout(frame, width, height);
        continueRender(handle);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      continueRender(handle);
    };
  }, [frame, width, height]);
  return null;
};

const measureLayout = (frame: number, width: number, height: number) => {
  const rootEl = document.querySelector("[data-qc-root]");
  if (!rootEl) return;
  const root = rootEl.getBoundingClientRect();
  // Composition may be scaled by --scale; normalise to composition px.
  const k = width / root.width;
  const norm = (b: Box): Box => ({
    ...b,
    x0: b.x0 * k,
    x1: b.x1 * k,
    y0: b.y0 * k,
    y1: b.y1 * k,
  });
  const texts = [...document.querySelectorAll('[data-qc="text"]')]
    .map((e) => norm(boxOf(e, root, true)))
    .filter((b) => b.opacity > 0.05 && b.x1 > b.x0);
  const figures = [...document.querySelectorAll('[data-qc="figure"]')]
    .map((e) => norm(boxOf(e, root, false)))
    .filter((b) => b.opacity > 0.05);
  const issues: { type: string; ids: string[]; detail?: string }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (a.scope !== b.scope) continue;
      // Nested boxes (e.g. a kicker inside a group) are not collisions.
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const area = inter(a, b);
      if (area > 4)
        issues.push({
          type: "overlap",
          ids: [a.id, b.id],
          detail: `${area.toFixed(0)}px²`,
        });
      else if (
        inter(a, b, layout.minTextGap) > 0 &&
        Math.min(a.opacity, b.opacity) > 0.5
      )
        issues.push({ type: "tight", ids: [a.id, b.id] });
    }
    if (a.scopeMoving) {
      // Edge checks don't apply while the whole scene slides/scales in a transition.
    } else if (
      a.opacity > 0.5 &&
      (a.x0 < -1 || a.y0 < -1 || a.x1 > width + 1 || a.y1 > height + 1)
    )
      issues.push({ type: "clipped", ids: [a.id] });
    else if (
      a.opacity > 0.95 &&
      (a.x0 < layout.safe.x - 30 ||
        a.x1 > width - layout.safe.x + 30 ||
        a.y0 < layout.safe.y - 30 ||
        a.y1 > height - layout.safe.y + 30)
    )
      issues.push({ type: "unsafe", ids: [a.id] });
    const declared = Number(a.el.getAttribute("data-qc-lines") || 0);
    if (declared > 0) {
      const lh = parseFloat(getComputedStyle(a.el).lineHeight) || 1;
      const lines = Math.round(((a.el as HTMLElement).offsetHeight || 0) / lh);
      if (lines > declared)
        issues.push({
          type: "wrap",
          ids: [a.id],
          detail: `${lines} > ${declared} lines`,
        });
    }
    const he = a.el as HTMLElement;
    if (
      he.scrollWidth > he.clientWidth + 1 &&
      getComputedStyle(he).maxWidth !== "none"
    )
      issues.push({ type: "overflow", ids: [a.id] });
    for (const f of figures) {
      if (f.scope === a.scope && inter(a, f) > 400 && a.opacity > 0.5)
        issues.push({ type: "figure", ids: [a.id, f.id] });
    }
  }
  console.log(
    `QC_LAYOUT ${JSON.stringify({ frame, texts: texts.length, issues })}`,
  );
};
