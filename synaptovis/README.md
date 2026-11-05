# SynaptoVis 动画系统

基于 **Remotion 4.0.540 + GSAP 3.15** 的代码动画系统：可复用角色组件、动作预设、2.5D 镜头、转场，以及三层动画质量检测（QC）。

视觉风格：**SignalSketch Color+ Fusion v2.0**（手绘墨线 + 错位色块 + 信号波形元素）与 **Vibrant Editorial + Colorful 2.5D**（粗体编辑排版、高饱和配色、硬投影卡片、视差层）。所有颜色、字号、间距、时长都集中在 `src/design/tokens.ts`。

## 快速开始

```bash
cd synaptovis
npm install
npm run dev            # Remotion Studio 预览
npm run test:render    # 静态 QC → 布局 QC → 渲染 720p60 → 视频 QC
```

在无法下载 Remotion 自带浏览器的环境（例如部分云端沙箱）里，设置本地 Chrome Headless Shell：

```bash
export REMOTION_BROWSER=/path/to/chrome-headless-shell
```

本机正常联网时不需要设置，Remotion 会使用自带浏览器（官方推荐）。

## 已安装的官方 Skills

位于仓库根目录 `.claude/skills/`（项目级，随仓库提交），来源和哈希记录在 `skills-lock.json`。

| Skill | 用途 |
|---|---|
| `/remotion-best-practices` | Remotion 总入口，自动分派到下面的子 Skill |
| `/remotion-markup` | 动画、排版、转场、字体、测量文字 |
| `/remotion-render` | 渲染视频或单帧 |
| `/remotion-studio` | 打开预览 |
| `/gsap-timeline` | 时间轴编排（position 参数、label、stagger） |
| `/gsap-core`、`/gsap-utils`、`/gsap-performance` | GSAP 基础 API、工具函数、性能 |

升级：`npx skills update -p`（Remotion 也可用 `/remotion-upgrade`）。

## 目录结构

```
src/
  design/tokens.ts        风格令牌（颜色、字号、阴影、视差、时长、安全区、overscan）
  design/fonts.ts         本地字体加载（渲染前阻塞，避免字体回退导致文字跳动）
  engine/motion.ts        纯数学：缓动、shortest-arc 角度插值、关键帧、确定性噪声
  engine/gsap-frame.ts    GSAP ↔ Remotion 桥接（暂停时间轴 + 逐帧 seek）
  engine/Camera.tsx       虚拟镜头 + 2.5D 视差层（Layer depth）
  engine/Presence.tsx     元素出现/消失（最短 0.2 秒，只动 opacity/transform）
  engine/transitions.tsx  转场：cardPush / inkWipe / softFade
  character/rig.ts        骨骼：固定骨长，手臂 FK，腿部双骨 IK
  character/actions.ts    动作预设：idle walk wave point talk think celebrate nod present
  character/track.ts      动作轨道：片段排程、自适应混合、步频由位移推导、自动眨眼
  character/Character.tsx SVG 角色渲染（2.5D 转身）
  components/             文字、图表（GSAP 驱动）、舞台背景、卡片
  qc/LayoutProbe.tsx      浏览器端布局检测
  test/                   30 秒测试片：plan.ts（时间轴数据）+ Scenes.tsx
scripts/
  qc-static.ts            静态 QC（不渲染，约 1 秒）
  qc-layout.mjs           布局 QC（渲染时逐帧测量文字框）
  qc-video.ts             视频 QC（解码成片逐帧分析像素）
  fetch-fonts.mjs         字体子集下载
```

## 角色系统

```tsx
<Character track={track} look={LOOKS.neo} />
```

`track` 是纯数据，写在 `plan.ts` 之类的文件里：

```ts
{
  id: "neo", seed: 1, blend: 22,
  x: [{ t: 10, v: -90 }, { t: 230, v: 300, ease: "smooth" }],   // 根节点位置（帧）
  facing: [{ t: 0, v: 1 }, { t: 200, v: 1 }, { t: 236, v: -1 }], // 平滑转身
  clips: [
    { action: "walk", from: 0 },
    { action: "idle", from: 214, blend: 26 },
    { action: "wave", from: 252 },
    { action: "point", from: 330, params: { dir: 104 } },
  ],
}
```

针对常见问题的设计：

| 问题 | 机制 |
|---|---|
| 肢体变形、拉长 | 骨长固定；腿用解析 IK，膝盖永远朝前；手肘、膝盖限位 |
| 动作切换突然跳动 | 新片段淡入时旧片段继续运行，C2 连续 smootherstep 混合；角度走最短弧 |
| 大幅动作切换太快 | **自适应混合**：按两姿态间关节最大位移自动延长混合，关节峰值速度 ≤ 9 px/帧 |
| 滑步、太空步 | 步态相位 = 实际位移 ÷ 步长；摆动脚在世界坐标规划，离地和落地时速度、加速度均为 0 |
| 转身时角色消失或翻面跳变 | 2.5D 转身：关节 x 随朝向缩放，头、躯干、鞋保持宽度，脸滑向中间（正面），四肢在正面时左右分开 |
| 僵硬 | 所有动作叠加呼吸、低频摆动；按角色 seed 自动眨眼 |

## GSAP 用法（必须遵守）

Remotion 会乱序、并行渲染帧，GSAP **不能自己播放**。统一使用：

```ts
const s = useFrameTimeline(initialState, buildTimeline, startFrame);
```

时间轴是暂停的，只补间普通对象（不直接操作 DOM），每帧 `seek(frame / fps)` 后读取状态再渲染。数组状态要写成 `[{ v: 0 }, …]`，因为 GSAP 会把数组当成多个 target。

## 质量检测（QC）

| 命令 | 检查内容 | 失败条件 |
|---|---|---|
| `npm run qc:static` | 总时长、内联时长与 plan 一致、转场长度、片段顺序和长度、关键帧范围、GSAP 时间轴不超出场景、**逐帧**角色检测（关节突跳、速度、IK 过伸、关节限位、挤压拉伸、滑行、滑步、穿地板）、镜头覆盖（视差层是否露底）、字体子集是否缺字 | 任一 error |
| `npm run qc:layout` | 渲染时逐帧测量文字的**实际可见字形**：文字互相重叠、间距过小、被画面边缘裁切、超出安全区、意外换行、溢出、与角色重叠 | 重叠、裁切、换行、溢出，或有帧未测量 |
| `npm run qc:video` | 解码成片：分辨率、帧率、帧数、时长、编码；16×9 分块逐帧分析：空白帧、**单帧闪烁**、**突然出现/消失**、运动中重复帧；并生成人工审片拼图 | 空白帧、单帧闪烁、规格不符 |

报告在 `out/qc/*.json`，审片拼图在 `out/qc/sheet-*.png`。**QC 通过不等于画面合格**，每次仍需看拼图和关键帧。

## 添加中文文字后

```bash
npm run fonts     # 重新下载字体子集；qc:static 会检查是否有缺字
```
