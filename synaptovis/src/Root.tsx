import { Composition, Folder } from "remotion";
import { AnimationQATest } from "./test/AnimationQATest";
import { FPS, HEIGHT, WIDTH, totalFrames } from "./test/plan";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="SynaptoVis">
      <Composition
        id="AnimationQATest"
        component={AnimationQATest}
        durationInFrames={totalFrames()}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ qc: false }}
      />
      <Composition
        id="AnimationQATest-LayoutQC"
        component={AnimationQATest}
        durationInFrames={totalFrames()}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ qc: true }}
      />
    </Folder>
  );
};
