import React from "react";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { AbsoluteFill } from "remotion";
import { palette } from "../design/tokens";
import { smoothstep } from "./motion";

/**
 * Custom transition presentations in the SynaptoVis style. All three:
 *  - are continuous in both directions (no element is cut abruptly),
 *  - only animate transform / opacity / clip-path,
 *  - keep the exiting scene fully drawn until it is covered (no blank frames).
 */
type P = Record<string, never>;

/**
 * 2.5D card push: the old scene recedes and dims while an OPAQUE card is revealed
 * by a moving edge that casts a soft shadow. The card's content only drifts
 * 20%, so thin lines never strobe (a full-width slide peaks at ~55 px/frame and
 * the video QC flags it as "flash"), and nothing is ever semi-transparent (a
 * faded card double-exposes both scenes).
 */
const CardPush: React.FC<TransitionPresentationComponentProps<P>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const t = presentationProgress;
  // Gentle ease: peak edge speed ~1.15x average (~41 px/frame).
  const p = 0.7 * t + 0.3 * smoothstep(t);
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill
        style={{
          scale: String(1 - 0.06 * p),
          translate: `${-60 * p}px 0px`,
          filter: `brightness(${1 - 0.12 * p})`,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  const edge = (1 - p) * 100;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${edge}%)` }}>
        <AbsoluteFill style={{ translate: `${(1 - p) * 20}% 0px` }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
      {/* Edge shadow cast by the card onto the old scene. Wide and soft on purpose:
          a thin dark strip moving ~40 px/frame occupies each spot for one frame = strobe. */}
      <AbsoluteFill
        style={{
          left: `calc(${edge}% - 90px)`,
          width: 90,
          background: `linear-gradient(90deg, rgba(30,27,46,0) 0%, rgba(30,27,46,0.28) 100%)`,
          opacity: Math.sin(Math.PI * t),
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Ink wipe: a diagonal band in brand colour sweeps across and reveals the new scene.
 * The band is wide (24%) so any point sees it for ~4.5 frames: a thin fast band
 * reads as a strobe (video QC flags it as a one-frame flash).
 */
const InkWipe: React.FC<TransitionPresentationComponentProps<P>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  // Gentle ease (peak speed ~1.15x average): a strong in-out would race the band past.
  const t = presentationProgress;
  const p = 0.7 * t + 0.3 * smoothstep(t);
  if (presentationDirection === "exiting")
    return <AbsoluteFill>{children}</AbsoluteFill>;
  // Reveal edge travels far enough that band + slant fully clear the frame.
  const BAND = 24;
  const SLANT = 18;
  const e = -BAND + p * (100 + BAND * 2 + SLANT);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          clipPath: `polygon(0 0, ${e}% 0, ${e - SLANT}% 100%, 0 100%)`,
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          clipPath: `polygon(${e}% 0, ${e + BAND}% 0, ${e + BAND - SLANT}% 100%, ${e - SLANT}% 100%)`,
          background: `linear-gradient(100deg, ${palette.violet} 0%, ${palette.violet} 70%, ${palette.pink} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Soft dip: the old scene fades to paper, then the new one fades in with a slight
 * scale settle. A straight cross-fade double-exposes characters that stand in
 * different places in the two scenes (ghosting); a dip never shows both.
 */
const SoftFade: React.FC<TransitionPresentationComponentProps<P>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const t = presentationProgress;
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ opacity: 1 - smoothstep(t / 0.5) }}>
        {children}
      </AbsoluteFill>
    );
  }
  const p = smoothstep((t - 0.45) / 0.55);
  return (
    <AbsoluteFill style={{ opacity: p, scale: String(1.03 - 0.03 * p) }}>
      {children}
    </AbsoluteFill>
  );
};

export const cardPush = (): TransitionPresentation<P> => ({
  component: CardPush,
  props: {},
});
export const inkWipe = (): TransitionPresentation<P> => ({
  component: InkWipe,
  props: {},
});
export const softFade = (): TransitionPresentation<P> => ({
  component: SoftFade,
  props: {},
});
