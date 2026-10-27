# 念念

把在意的人放在心上：给家人朋友每人一个小角落，记下生日和纪念日、存下日常小事，到日子前提醒你，想送礼时问问团团。

用 Expo SDK 58（React Native）写成，可以直接用手机上的 **Expo Go** 打开，不需要 Mac。

## 在手机上试用（Expo Go）

1. 手机上安装 **Expo Go**（App Store / 应用商店搜索 “Expo Go”，确认是支持 SDK 58 的最新版）
2. 电脑（Windows、Linux、Mac 都行）安装 [Node.js](https://nodejs.org) 22 或更新版本
3. 在电脑上运行：

   ```bash
   cd niannian-app
   npm install
   npx expo start
   ```

4. 终端里会出现一个二维码：iPhone 用相机扫，安卓用 Expo Go 里的“Scan QR code”扫，App 就会在 Expo Go 里打开
5. 手机和电脑不在同一个 Wi-Fi，或者扫了打不开时，改用 `npx expo start --tunnel`

改了代码保存后，手机上会自动刷新。

## 功能

- **念着的人**：每个人一个主页，大号小人形象（会轻轻浮动，点一下会蹦），顶部一排头像切换人物
- **捏形象**：年龄、发型、发色、肤色、衣服颜色、眼镜；也可以直接用照片
- **重要日子**：生日、纪念日、考试、节日；每年重复的自动算下一次和岁数 / 第几年；可以提前 0 / 1 / 3 / 7 天在早上 9 点提醒
- **小事**：可选日期；“帮我整理”起标题、理顺文字，可以撤销。语音输入用键盘上的麦克风
- **问问团团**：根据 TA 的资料、日子和小事聊天、给送礼建议，回答可以一键记成小事
- **我的**：人物管理、提醒权限、AI 设置、导出备份 / 从备份恢复（JSON 文件，包含照片）

### AI

在“我的 → AI 设置”里填上 [Claude API Key](https://console.anthropic.com/settings/keys) 后，团团用 Claude 回答（`src/ai.ts`，模型 `claude-opus-5-5`，开了服务端拒答兜底 `fallbacks: "default"`）。Key 只存在手机上，费用按你自己的 Anthropic 账号算。

不填 Key 也能用：团团会用离线模式，根据记录里的关键词给送礼方向、回顾最近的小事。

## Expo Go 里做不到的

这些需要原生能力，Expo Go 里没有，要用 [EAS Build](https://docs.expo.dev/build/introduction/) 打包成独立 App 才行：

- 桌面小组件
- App 内语音识别（现在用键盘自带的麦克风代替）
- 照片自动抠图、AI 生成形象（现在用“捏形象”或直接用照片）

## 开发

- 结构：`App.tsx` 底部栏和页面切换；`src/screens/` 各个页面；`src/components/` 小人、团团和通用组件；`src/core/model.ts` 数据模型、日期计算、提示词（纯 TypeScript，有测试）；`src/store.tsx` 存储、提醒、备份
- 数据存在 AsyncStorage，照片复制到 App 的文档目录
- 测试：`npm test`；类型检查：`npm run typecheck`
- 推送后 `.github/workflows/niannian-app.yml` 会跑测试、类型检查，并打包 iOS / 安卓的 JS 代码
- 加依赖时用 `npx expo install <包名>`，它会选和 SDK 58 兼容的版本
