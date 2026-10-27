# 念念

记住在意的人：为家人朋友留住重要日子和日常小事，到日子前提醒你，想送礼时问问团团。

SwiftUI，最低 iOS 26。资料只存在手机上，AI 功能用手机上的 Apple 智能，不上传。

## 功能

- **人物主页**：大号形象站在首页（会轻轻呼吸，点一下会晃），右上角切换人物，下面是“下一个重要时刻”、重要时刻和小事记录
- **制作形象**：选一张照片 → 用 Image Playground 生成卡通形象（设备支持时）→ 用 Vision 自动去除背景。也可以直接把照片里的人抠出来
- **重要时刻**：生日、纪念日、考试、节日；每年重复的自动算下一次和岁数 / 第几年；可提前 0 / 1 / 3 / 7 天本地提醒
- **记一件小事**：可选日期，支持语音输入；“用 AI 整理”起标题、理顺文字，可撤销
- **问问团团**：根据 TA 的资料、重要时刻和小事聊天，给送礼建议；回答可以一键记成小事
- **桌面小组件**：小号、中号和锁屏三种；可选多个形象每小时轮流展示，选择提醒所有人的事或画面中的人的事
- **我的**：人物管理、小组件设置、提醒权限、导出备份 / 从备份恢复（JSON，包含形象图片）

AI 功能（整理、聊天、卡通形象）需要支持 Apple 智能的设备并在设置里打开；不支持时其他功能照常使用。

## 结构

- `App/`：App 界面
- `Widget/`：小组件扩展
- `Shared/`：App 和小组件共用的配色、吉祥物、小组件内容
- `Packages/NiannianCore/`：数据模型、日期计算、存储、提示词，带测试

App 和小组件通过 App Group `group.com.pangbobo17.niannian` 共享资料。

## 构建

需要装有 Xcode 26 的 Mac：

```bash
cd Niannian
brew install xcodegen
xcodegen                 # 生成 Niannian.xcodeproj
open Niannian.xcodeproj
```

核心测试：`swift test --package-path Niannian/Packages/NiannianCore`

不用 Mac：推送后 `.github/workflows/niannian.yml` 会在云端跑测试并编译。要装到手机，在仓库 Secrets 里配置 `ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_KEY_P8`、`TEAM_ID`，在 Actions 里手动运行 **TestFlight (念念)**。Bundle ID 是 `com.pangbobo17.niannian`（小组件是 `com.pangbobo17.niannian.widget`），需要先在 App Store Connect 里建好 App。
