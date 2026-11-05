/**
 * 30 s / 720p60 animation-system test: the whole timeline as data.
 * Pure TS so `npm run qc` can validate it without rendering.
 *
 * All frame numbers are relative to the scene they belong to.
 */
import type { CameraKeys } from "../engine/Camera";
import type { CharacterTrack } from "../character/track";

export const FPS = 60;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR_Y = 612;

export type SceneId = "intro" | "bars" | "line" | "outro";
export type TransitionKind = "cardPush" | "inkWipe" | "softFade";

export type ScenePlan = {
  id: SceneId;
  duration: number;
  characters: CharacterTrack[];
  camera: CameraKeys;
};

const BLEND = 22;

export const SCENES: ScenePlan[] = [
  {
    id: "intro",
    duration: 450,
    camera: {
      x: [
        { t: 0, v: 640 },
        { t: 450, v: 668 },
      ],
      y: [{ t: 0, v: 360 }],
      zoom: [
        { t: 0, v: 1 },
        { t: 450, v: 1.045 },
      ],
    },
    characters: [
      {
        id: "neo",
        seed: 1,
        blend: BLEND,
        x: [
          { t: 10, v: -90 },
          { t: 230, v: 300, ease: "smooth" },
        ],
        y: [{ t: 0, v: FLOOR_Y }],
        clips: [
          { action: "walk", from: 0 },
          { action: "idle", from: 214, blend: 26 },
          { action: "wave", from: 252 },
          { action: "talk", from: 372 },
        ],
      },
    ],
  },
  {
    id: "bars",
    duration: 570,
    camera: {
      x: [
        { t: 0, v: 640 },
        { t: 170, v: 640 },
        { t: 280, v: 700 },
        { t: 470, v: 700 },
        { t: 570, v: 650 },
      ],
      y: [
        { t: 0, v: 360 },
        { t: 170, v: 360 },
        { t: 280, v: 345 },
        { t: 470, v: 345 },
        { t: 570, v: 360 },
      ],
      zoom: [
        { t: 0, v: 1 },
        { t: 170, v: 1 },
        { t: 280, v: 1.07 },
        { t: 470, v: 1.07 },
        { t: 570, v: 1 },
      ],
    },
    characters: [
      {
        id: "neo",
        seed: 1,
        blend: BLEND,
        x: [{ t: 0, v: 230 }],
        y: [{ t: 0, v: FLOOR_Y }],
        clips: [
          { action: "talk", from: 0 },
          { action: "point", from: 170, params: { dir: 104 } },
          { action: "present", from: 330 },
          { action: "nod", from: 450 },
        ],
      },
    ],
  },
  {
    id: "line",
    duration: 510,
    camera: {
      x: [
        { t: 0, v: 300 },
        { t: 40, v: 300 },
        { t: 210, v: 640 },
      ],
      y: [
        { t: 0, v: 430 },
        { t: 40, v: 430 },
        { t: 210, v: 360 },
      ],
      zoom: [
        { t: 0, v: 1.38 },
        { t: 40, v: 1.38 },
        { t: 210, v: 1 },
      ],
    },
    characters: [
      {
        id: "neo",
        seed: 1,
        blend: BLEND,
        x: [{ t: 0, v: 200 }],
        y: [{ t: 0, v: FLOOR_Y }],
        clips: [
          { action: "think", from: 0 },
          { action: "idle", from: 200 },
          { action: "celebrate", from: 330, blend: 16 },
        ],
      },
      {
        id: "ivy",
        seed: 7,
        blend: BLEND,
        scale: 0.94,
        x: [
          { t: 70, v: 1420 },
          { t: 260, v: 1075, ease: "smooth" },
        ],
        y: [{ t: 0, v: FLOOR_Y }],
        facing: [{ t: 0, v: -1 }],
        clips: [
          { action: "walk", from: 0 },
          { action: "idle", from: 246, blend: 26 },
          { action: "present", from: 282 },
          {
            action: "celebrate",
            from: 352,
            blend: 16,
            params: { period: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: "outro",
    duration: 378,
    camera: {
      x: [{ t: 0, v: 640 }],
      y: [{ t: 0, v: 360 }],
      zoom: [
        { t: 0, v: 1.03 },
        { t: 378, v: 1 },
      ],
    },
    characters: [
      {
        id: "neo",
        seed: 1,
        blend: BLEND,
        x: [{ t: 0, v: 930 }],
        y: [{ t: 0, v: FLOOR_Y }],
        facing: [
          { t: 0, v: -1 },
          { t: 200, v: -1 },
          { t: 236, v: 1 },
        ],
        clips: [
          { action: "talk", from: 0 },
          { action: "idle", from: 190 },
          { action: "wave", from: 240 },
        ],
      },
      {
        id: "ivy",
        seed: 7,
        blend: BLEND,
        scale: 0.94,
        x: [{ t: 0, v: 1110 }],
        y: [{ t: 0, v: FLOOR_Y }],
        facing: [{ t: 0, v: -1 }],
        clips: [
          { action: "nod", from: 0 },
          { action: "idle", from: 150 },
          { action: "wave", from: 262, params: { speed: 1.8 } },
        ],
      },
    ],
  },
];

export const TRANSITIONS: { kind: TransitionKind; duration: number }[] = [
  { kind: "cardPush", duration: 36 },
  { kind: "inkWipe", duration: 36 },
  { kind: "softFade", duration: 36 },
];

export const totalFrames = () =>
  SCENES.reduce((a, s) => a + s.duration, 0) -
  TRANSITIONS.reduce((a, t) => a + t.duration, 0);

/** Absolute start frame of each scene in the final video. */
export const sceneStarts = () => {
  const starts: number[] = [];
  let f = 0;
  SCENES.forEach((s, i) => {
    starts.push(f);
    f += s.duration - (TRANSITIONS[i]?.duration ?? 0);
  });
  return starts;
};

/** GSAP-driven chart blocks: start frame within their scene + data size. */
export const CHARTS = {
  bars: { scene: "bars" as SceneId, at: 60, n: 5 },
  line: { scene: "line" as SceneId, at: 150, n: 9 },
};
