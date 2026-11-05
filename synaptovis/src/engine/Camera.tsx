import React, { createContext, useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Key, sampleKeys } from "./motion";

/**
 * Virtual camera with 2.5D parallax.
 *
 * Camera keys are in frames. x/y are the world point at the centre of the
 * frame; zoom 1 = framing the 1280x720 stage exactly. Segments default to
 * inOutCubic easing (zero velocity at each key), so the camera never jerks
 * when it starts or stops; for continuous moves use fewer keys, not linear.
 *
 * Each <Layer depth> moves by `depth` x the camera motion: far layers drift
 * less than near ones, which reads as depth without any 3D renderer.
 */
export type CameraKeys = { x: Key[]; y: Key[]; zoom: Key[]; rotate?: Key[] };
type CamState = { x: number; y: number; zoom: number; rotate: number };

const CameraCtx = createContext<CamState | null>(null);

export const sampleCamera = (
  keys: CameraKeys,
  frame: number,
  w: number,
  h: number,
): CamState => ({
  x: keys.x.length ? sampleKeys(keys.x, frame) : w / 2,
  y: keys.y.length ? sampleKeys(keys.y, frame) : h / 2,
  zoom: keys.zoom.length ? sampleKeys(keys.zoom, frame) : 1,
  rotate: keys.rotate ? sampleKeys(keys.rotate, frame) : 0,
});

export const Camera: React.FC<{
  keys: CameraKeys;
  children: React.ReactNode;
}> = ({ keys, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <CameraCtx.Provider value={sampleCamera(keys, frame, width, height)}>
      <AbsoluteFill style={{ overflow: "hidden" }}>{children}</AbsoluteFill>
    </CameraCtx.Provider>
  );
};

export const Layer: React.FC<{
  depth?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ depth = 1, children, style }) => {
  const cam = useContext(CameraCtx);
  const { width, height } = useVideoConfig();
  if (!cam) return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  const z = 1 + (cam.zoom - 1) * depth;
  const dx = (cam.x - width / 2) * depth;
  const dy = (cam.y - height / 2) * depth;
  return (
    <AbsoluteFill
      style={{
        ...style,
        transformOrigin: "0 0",
        // Order matters (centre -> zoom -> rotate -> pan), so a transform string is used.
        transform: `translate(${width / 2}px, ${height / 2}px) scale(${z}) rotate(${cam.rotate * depth}deg) translate(${-width / 2 - dx}px, ${-height / 2 - dy}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
