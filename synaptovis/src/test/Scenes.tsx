import React from "react";
import { AbsoluteFill } from "remotion";
import { Character, LOOKS } from "../character/Character";
import { BarChart, LineChart } from "../components/Charts";
import { Blobs, Card, Floor, Paper, SignalWave } from "../components/Stage";
import { EditorialText } from "../components/Text";
import { depth, fonts, layout, palette, type } from "../design/tokens";
import { Camera, Layer } from "../engine/Camera";
import { Presence } from "../engine/Presence";
import { CHARTS, FLOOR_Y, SCENES, SceneId } from "./plan";

const plan = (id: SceneId) => SCENES.find((s) => s.id === id)!;
const track = (id: SceneId, who: string) =>
  plan(id).characters.find((c) => c.id === who)!;

/** Shared layered stage. data-qc-scope keeps the layout probe from comparing two scenes mid-transition. */
const Stage: React.FC<{
  id: SceneId;
  blobs?: string[];
  children: React.ReactNode;
  back?: React.ReactNode;
  hud?: React.ReactNode;
}> = ({ id, blobs, children, back, hud }) => (
  <AbsoluteFill data-qc-scope={id}>
    <Camera keys={plan(id).camera}>
      <Layer depth={depth.parallax.far}>
        <Paper />
        <Blobs seed={id.length} colors={blobs} />
      </Layer>
      <Layer depth={depth.parallax.mid}>{back}</Layer>
      <Layer depth={depth.parallax.near}>
        <Floor y={FLOOR_Y} seed={id.length * 3} />
        {children}
      </Layer>
      {/* HUD: depth 0 = ignores the camera, so titles are never cropped by a push-in. */}
      <Layer depth={0}>{hud}</Layer>
    </Camera>
  </AbsoluteFill>
);

const Kicker: React.FC<{ text: string; color: string; qcId: string }> = ({
  text,
  color,
  qcId,
}) => (
  <div
    data-qc="text"
    data-qc-id={qcId}
    style={{
      display: "inline-block",
      padding: "6px 14px",
      background: color,
      border: `2.5px solid ${palette.ink}`,
      borderRadius: 999,
      boxShadow: `3px 3px 0 ${palette.ink}`,
      fontFamily: fonts.numeric,
      fontWeight: 700,
      fontSize: type.caption.size,
      letterSpacing: "0.12em",
      lineHeight: 1.3,
      color: palette.ink,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

export const IntroScene: React.FC = () => (
  <Stage
    id="intro"
    back={
      <>
        <SignalWave y={150} color={palette.violet} />
        <div
          style={{
            position: "absolute",
            left: 520,
            top: 168,
            width: 700,
            height: 340,
            background: palette.sun,
            borderRadius: 30,
            rotate: "-3deg",
            opacity: 0.85,
            border: `4px solid ${palette.ink}`,
          }}
        />
      </>
    }
  >
    <div style={{ position: "absolute", left: 560, top: 200, width: 640 }}>
      <Presence in={30} enter="pop">
        <Kicker
          text="SYNAPTOVIS · MOTION LAB"
          color={palette.pink}
          qcId="intro-kicker"
        />
      </Presence>
      <div style={{ position: "absolute", top: 52 }}>
        <EditorialText
          qcId="intro-hero"
          role="hero"
          at={55}
          text={"SynaptoVis\n动画系统 v3"}
          highlight={[{ text: "动画系统", color: palette.white }]}
        />
      </div>
      <div style={{ position: "absolute", top: 240 }}>
        <EditorialText
          qcId="intro-sub"
          role="body"
          at={125}
          text="角色 · 图表 · 镜头 · 转场  质量测试"
          color={palette.inkSoft}
        />
      </div>
    </div>
    <Character track={track("intro", "neo")} look={LOOKS.neo} />
  </Stage>
);

export const BarsScene: React.FC = () => (
  <Stage
    id="bars"
    blobs={[palette.teal, palette.sun, palette.pink]}
    back={<SignalWave y={660} color={palette.teal} amp={10} />}
    hud={
      <div
        style={{
          position: "absolute",
          left: layout.safe.x,
          top: layout.safe.y,
        }}
      >
        <EditorialText
          qcId="bars-title"
          role="title"
          at={20}
          text="月度信号强度"
        />
        <div style={{ marginTop: layout.minTextGap + 2 }}>
          <EditorialText
            qcId="bars-caption"
            role="caption"
            at={50}
            text="单位：千次 · 模拟数据"
            color={palette.muted}
          />
        </div>
      </div>
    }
  >
    <Presence in={40} enter="rise" style={{ left: 0, top: 0 }}>
      <Card x={470} y={150} w={740} h={420} color={palette.white}>
        <BarChart
          qcId="bars-chart"
          at={CHARTS.bars.at}
          x={22}
          y={46}
          w={630}
          h={300}
          data={[
            { label: "一月", value: 32 },
            { label: "二月", value: 48 },
            { label: "三月", value: 41 },
            { label: "四月", value: 63 },
            { label: "五月", value: 86 },
          ]}
        />
      </Card>
    </Presence>
    <Character track={track("bars", "neo")} look={LOOKS.neo} />
  </Stage>
);

export const LineScene: React.FC = () => (
  <Stage
    id="line"
    blobs={[palette.violet, palette.coral, palette.sun]}
    back={<SignalWave y={120} color={palette.coral} amp={12} opacity={0.3} />}
    hud={
      <div
        style={{
          position: "absolute",
          left: layout.safe.x,
          top: layout.safe.y,
        }}
      >
        <EditorialText
          qcId="line-title"
          role="title"
          at={215}
          text="信号持续增长"
          highlight={[{ text: "增长", color: palette.sun, at: 260 }]}
        />
      </div>
    }
  >
    <Presence in={12} out={170} enter="pop" style={{ left: 250, top: 236 }}>
      <div
        style={{
          width: 96,
          height: 70,
          borderRadius: 36,
          background: palette.white,
          border: `4px solid ${palette.ink}`,
          boxShadow: depth.shadow(1),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.numeric,
          fontWeight: 700,
          fontSize: 34,
          color: palette.violet,
        }}
      >
        ?
      </div>
    </Presence>
    <Presence in={110} enter="rise" style={{ left: 0, top: 0 }}>
      <Card x={380} y={156} w={560} h={330}>
        <LineChart
          qcId="line-chart"
          at={CHARTS.line.at}
          x={40}
          y={24}
          w={450}
          h={226}
          values={[20, 26, 24, 33, 41, 38, 52, 61, 74]}
          callout="+68% 增长"
        />
      </Card>
    </Presence>
    <Character track={track("line", "neo")} look={LOOKS.neo} />
    <Character track={track("line", "ivy")} look={LOOKS.ivy} />
  </Stage>
);

const ROWS = [
  { text: "人物：走路 · 挥手 · 指向 · 庆祝", color: palette.coral },
  { text: "图表：GSAP 时间轴逐帧驱动", color: palette.sun },
  { text: "镜头：推拉摇移 + 2.5D 视差", color: palette.teal },
  { text: "转场：卡片推入 · 墨迹擦除 · 淡入", color: palette.violet },
];

export const OutroScene: React.FC = () => (
  <Stage id="outro" blobs={[palette.sun, palette.teal, palette.coral]}>
    <div style={{ position: "absolute", left: layout.safe.x, top: 70 }}>
      <EditorialText
        qcId="outro-title"
        role="title"
        at={18}
        text="本次测试覆盖"
      />
    </div>
    {ROWS.map((r, i) => (
      <Presence
        key={r.text}
        in={50 + i * 26}
        enter="slideL"
        style={{ left: layout.safe.x, top: 180 + i * 72 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: r.color,
              border: `3px solid ${palette.ink}`,
              boxShadow: `3px 3px 0 ${palette.ink}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={22} height={22} viewBox="0 0 22 22">
              <path
                d="M4 11.5 L9 16 L18 6"
                stroke={palette.ink}
                strokeWidth={3.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <EditorialText
            qcId={`outro-row-${i}`}
            role="body"
            weight={700}
            at={50 + i * 26 + 6}
            stagger={0.012}
            text={r.text}
          />
        </div>
      </Presence>
    ))}
    <Presence in={230} enter="fade" style={{ left: layout.safe.x, top: 500 }}>
      <Kicker
        text="SYNAPTOVIS · ANIMATION QA · 720P60"
        color={palette.sun}
        qcId="outro-kicker"
      />
    </Presence>
    <Character track={track("outro", "neo")} look={LOOKS.neo} />
    <Character track={track("outro", "ivy")} look={LOOKS.ivy} />
  </Stage>
);
