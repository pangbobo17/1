import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { palette, stroke } from "../design/tokens";
import { BONES, Pose, Skeleton, Vec, solveSkeleton } from "./rig";
import { CharacterTrack, sampleTrack } from "./track";

export type CharacterLook = {
  skin: string;
  top: string;
  topBack: string;
  pants: string;
  pantsBack: string;
  shoes: string;
  hair: string;
  accent: string;
};

export const LOOKS = {
  neo: {
    skin: "#FFD2AE",
    top: palette.teal,
    topBack: "#0F8C78",
    pants: palette.blue,
    pantsBack: "#2A4FCC",
    shoes: palette.coral,
    hair: palette.ink,
    accent: palette.sun,
  },
  ivy: {
    skin: "#F2B98F",
    top: palette.coral,
    topBack: "#D9434A",
    pants: palette.violet,
    pantsBack: "#6C3FD0",
    shoes: palette.sun,
    hair: "#5B2E1E",
    accent: palette.teal,
  },
} satisfies Record<string, CharacterLook>;

const INK = palette.ink;
const OUT = stroke.ink;
const n2 = (v: number) => v.toFixed(2);

/**
 * 2.5D turning. `f` is facing in [-1, 1]: +1 profile right, -1 profile left,
 * 0 facing the camera. Joint x positions are multiplied by f (a rotating
 * puppet seen from the side), but round parts - head, torso, shoes - keep
 * their width, and the face slides toward the centre. Nothing is ever
 * mirrored abruptly or squashed to zero width, so turns never make the
 * character vanish or pop.
 */
const at = (p: Vec, f: number): Vec => ({ x: p.x * f, y: p.y });
/**
 * Paired limbs spread sideways as the character faces the camera (|f| -> 0):
 * legs stand apart and arms hang beside the torso instead of collapsing onto
 * one line. side = +1 near limb, -1 far limb; continuous through the turn.
 */
const atSide = (p: Vec, f: number, side: 1 | -1, spread: number): Vec => ({
  x: p.x * f + side * spread * (1 - Math.abs(f)),
  y: p.y,
});
const LEG_SPREAD = 13;
const ARM_SPREAD = 30;

const Limb: React.FC<{ pts: Vec[]; width: number; color: string }> = ({
  pts,
  width,
  color,
}) => {
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${n2(p.x)} ${n2(p.y)}`)
    .join(" ");
  return (
    <>
      <path
        d={d}
        stroke={INK}
        strokeWidth={width + OUT * 2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
};

const Hand: React.FC<{ p: Vec; skin: string }> = ({ p, skin }) => (
  <circle
    cx={p.x}
    cy={p.y}
    r={8.5}
    fill={skin}
    stroke={INK}
    strokeWidth={OUT}
  />
);

/** Shoe: 31px long in profile, 15px (front view) when f -> 0. Toe direction follows f continuously. */
const Shoe: React.FC<{ p: Vec; toe: number; f: number; color: string }> = ({
  p,
  toe,
  f,
  color,
}) => {
  const half = 15.5 * Math.max(Math.abs(f), 0.48);
  const cx = 6.5 * f;
  return (
    <g transform={`translate(${n2(p.x)} ${n2(p.y)}) rotate(${n2(-toe * f)})`}>
      <rect
        x={cx - half}
        y={-3}
        width={half * 2}
        height={13}
        rx={6.5}
        fill={color}
        stroke={INK}
        strokeWidth={OUT}
      />
      <line
        x1={cx - half + 3}
        y1={7}
        x2={cx + half - 3}
        y2={7}
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.35}
      />
    </g>
  );
};

const Torso: React.FC<{ s: Skeleton; f: number; look: CharacterLook }> = ({
  s,
  f,
  look,
}) => {
  const h = BONES.torso + 18;
  const fx = stroke.fusionOffset.x * 0.6;
  const fy = stroke.fusionOffset.y * 0.6;
  const hip = at(s.hip, f);
  return (
    <g
      transform={`translate(${n2(hip.x)} ${n2(hip.y)}) rotate(${n2(s.torsoAngle * f)})`}
    >
      {/* Colour fill sits slightly off-register from the ink: Color+ Fusion. */}
      <rect
        x={-25 + fx}
        y={-h + 8 + fy}
        width={50}
        height={h}
        rx={22}
        fill={look.top}
      />
      <rect
        x={-25}
        y={-h + 8}
        width={50}
        height={h}
        rx={22}
        fill="none"
        stroke={INK}
        strokeWidth={OUT}
      />
      <path
        d={`M ${-13 * f - 1} ${-h * 0.32} Q ${f * 1} ${-h * 0.26} ${13 * f + 1} ${-h * 0.32}`}
        stroke={INK}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
      <line
        x1={6 * f}
        y1={-h + 26}
        x2={8 * f}
        y2={-h + 44}
        stroke={INK}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle
        cx={8 * f}
        cy={-h + 47}
        r={3}
        fill={look.accent}
        stroke={INK}
        strokeWidth={2}
      />
    </g>
  );
};

const Head: React.FC<{
  s: Skeleton;
  f: number;
  look: CharacterLook;
  frame: number;
  fps: number;
  p: Pose;
}> = ({ s, f, look, frame, fps, p }) => {
  const r = BONES.headR;
  const fx = stroke.fusionOffset.x * 0.7;
  const fy = stroke.fusionOffset.y * 0.7;
  const c = at(s.headCenter, f);
  const eyeOpen = 1 - p.blink * 0.92;
  const gx = p.gazeX * 1.8 * f;
  const gy = p.gazeY * 1.8;
  const browY = -13 - p.brow * 3.5;
  const smile = p.smile * 6;
  const mouthOpen = p.mouth * 7;
  const faceX = 19.5 * f;
  const af = Math.abs(f);
  // Slow "signal" pulse on the antenna: low frequency, never flickers.
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 1.6);
  return (
    <g
      transform={`translate(${n2(c.x)} ${n2(c.y)}) rotate(${n2(s.headAngle * f)})`}
    >
      {/* Antenna: SynaptoVis signal motif. */}
      <path
        d={`M ${-4 * f} ${-r + 2} Q ${-10 * f} ${-r - 16} ${-2 * f} ${-r - 26}`}
        stroke={INK}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx={-2 * f}
        cy={-r - 29}
        r={6}
        fill={look.accent}
        stroke={INK}
        strokeWidth={2.5}
      />
      <path
        d={`M ${-2 * f + 10} ${-r - 37} A 11 11 0 0 1 ${-2 * f + 10} ${-r - 21}`}
        stroke={look.accent}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        opacity={0.35 + pulse * 0.5}
      />
      <circle cx={fx} cy={fy} r={r} fill={look.skin} />
      {/* Hair: symmetric cap (always) + a back tuft that follows the turn. */}
      <path
        d={`M ${-r * 0.97} ${-6} A ${r} ${r} 0 0 1 ${r * 0.97} ${-6} Q 0 ${-r * 0.62} ${-r * 0.97} ${-6} Z`}
        fill={look.hair}
      />
      <path
        d={`M ${-r * f} 2 Q ${-r * 0.95 * f} ${-r * 0.5} ${-r * 0.55 * f} ${-r * 0.55} L ${-r * 0.2 * f} ${-r * 0.3} Q ${-r * 0.6 * f} 2 ${-r * f} 2 Z`}
        fill={look.hair}
      />
      <circle cx={0} cy={0} r={r} fill="none" stroke={INK} strokeWidth={OUT} />
      {/* Ear on the far side; fades out as the head turns to the camera. */}
      <ellipse
        cx={-10 * f}
        cy={4}
        rx={6 * af}
        ry={8}
        fill={look.skin}
        stroke={INK}
        strokeWidth={2.5}
        opacity={Math.min(1, af * 2.5)}
      />
      {/* Face features are symmetric, so the slide toward centre never needs a flip. */}
      <g transform={`translate(${n2(faceX)} 2)`}>
        {[-7.5, 7.5].map((ex) => (
          <g key={ex}>
            <ellipse
              cx={ex}
              cy={-3}
              rx={4.4}
              ry={Math.max(0.6, 5.8 * eyeOpen)}
              fill={INK}
            />
            <circle
              cx={ex + gx + 1.2 * f}
              cy={-4.5 + gy}
              r={1.5}
              fill={palette.white}
              opacity={Math.min(1, Math.max(0, (eyeOpen - 0.4) * 3))}
            />
            <line
              x1={ex - 4.5}
              y1={browY}
              x2={ex + 4.5}
              y2={browY}
              stroke={INK}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </g>
        ))}
        <circle cx={-11.5} cy={9} r={4.8} fill={palette.pink} opacity={0.55} />
        <circle cx={11.5} cy={9} r={4.8} fill={palette.pink} opacity={0.55} />
        {mouthOpen > 0.6 ? (
          <path
            d={`M -6.5 12 Q 0 ${12 + smile * 0.4} 6.5 12 Q 0 ${12 + mouthOpen + smile * 0.6 + 2} -6.5 12 Z`}
            fill={INK}
            stroke={INK}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        ) : (
          <path
            d={`M -6.5 12 Q 0 ${12 + smile + mouthOpen} 6.5 12`}
            stroke={INK}
            strokeWidth={2.8}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </g>
    </g>
  );
};

export const Character: React.FC<{
  track: CharacterTrack;
  look?: CharacterLook;
}> = ({ track, look = LOOKS.neo }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const sample = sampleTrack(track, frame, fps);
  const s = solveSkeleton(sample.pose);
  const f = sample.facing;
  const k = track.scale ?? 1;
  const sy = sample.pose.stretch;
  const sx = 1 / Math.sqrt(sy);
  const shadowScale = 1 / (1 + sample.pose.lift / 70);
  const L = (v: Vec, side: 1 | -1) => atSide(v, f, side, LEG_SPREAD);
  const A = (v: Vec, side: 1 | -1, base: boolean) =>
    atSide(v, f, side, base ? ARM_SPREAD - 8 : ARM_SPREAD);

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      <g transform={`translate(${n2(sample.x)} ${n2(sample.y)})`}>
        <ellipse
          cx={0}
          cy={2}
          rx={52 * k * shadowScale}
          ry={9 * k * shadowScale}
          fill={INK}
          opacity={0.16 * shadowScale}
        />
        <g
          data-qc="figure"
          data-qc-id={track.id}
          transform={`scale(${(k * sx).toFixed(4)} ${(k * sy).toFixed(4)})`}
        >
          {/* Far limbs first, darker: gives 2.5D depth. */}
          <Limb
            pts={[
              A(s.shoulderB, -1, true),
              A(s.elbowB, -1, false),
              A(s.handB, -1, false),
            ]}
            width={15}
            color={look.topBack}
          />
          <Hand p={A(s.handB, -1, false)} skin={look.skin} />
          <Limb
            pts={[L(s.hipB, -1), L(s.kneeB, -1), L(s.ankleB, -1)]}
            width={19}
            color={look.pantsBack}
          />
          <Shoe p={L(s.ankleB, -1)} toe={s.toeB} f={f} color={look.shoes} />
          <Limb
            pts={[L(s.hipF, 1), L(s.kneeF, 1), L(s.ankleF, 1)]}
            width={19}
            color={look.pants}
          />
          <Shoe p={L(s.ankleF, 1)} toe={s.toeF} f={f} color={look.shoes} />
          <Torso s={s} f={f} look={look} />
          <Head
            s={s}
            f={f}
            look={look}
            frame={frame}
            fps={fps}
            p={sample.pose}
          />
          <Limb
            pts={[
              A(s.shoulderF, 1, true),
              A(s.elbowF, 1, false),
              A(s.handF, 1, false),
            ]}
            width={15}
            color={look.top}
          />
          <Hand p={A(s.handF, 1, false)} skin={look.skin} />
        </g>
      </g>
    </svg>
  );
};
