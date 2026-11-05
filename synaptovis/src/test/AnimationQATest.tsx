import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ensureFonts } from "../design/fonts";
import { Blobs, Paper } from "../components/Stage";
import { palette } from "../design/tokens";
import { cardPush, inkWipe, softFade } from "../engine/transitions";
import { LayoutProbe } from "../qc/LayoutProbe";
import { TRANSITIONS } from "./plan";
import { BarsScene, IntroScene, LineScene, OutroScene } from "./Scenes";

ensureFonts();

const presentation = (i: number) => {
  const kind = TRANSITIONS[i].kind;
  return kind === "cardPush"
    ? cardPush()
    : kind === "inkWipe"
      ? inkWipe()
      : softFade();
};

export type QAProps = { qc: boolean };

export const AnimationQATest: React.FC<QAProps> = ({ qc }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill data-qc-root style={{ backgroundColor: palette.paper }}>
      {/* Persistent backdrop: whatever a transition reveals is never a bare, blank frame. */}
      <AbsoluteFill>
        <Paper />
        <Blobs seed={11} colors={[palette.sun, palette.teal, palette.pink]} />
      </AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence name="Intro" durationInFrames={450}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={presentation(0)}
          timing={linearTiming({ durationInFrames: TRANSITIONS[0].duration })}
        />
        <TransitionSeries.Sequence name="Bars" durationInFrames={570}>
          <BarsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={presentation(1)}
          timing={linearTiming({ durationInFrames: TRANSITIONS[1].duration })}
        />
        <TransitionSeries.Sequence name="Line" durationInFrames={510}>
          <LineScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={presentation(2)}
          timing={linearTiming({ durationInFrames: TRANSITIONS[2].duration })}
        />
        <TransitionSeries.Sequence name="Outro" durationInFrames={378}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {qc ? <LayoutProbe width={width} height={height} /> : null}
    </AbsoluteFill>
  );
};
