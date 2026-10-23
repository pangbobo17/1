# 歌词对齐（LyricSync）

包含两个版本：

- **网页版**（`web/`）：在 iPhone 的 Safari 里直接用，不需要 Mac，也不用上架。识别用 Whisper，在手机浏览器里本地运行。
- **iOS 原生版**（`App/` + `Packages/`）：需要 Mac 或云端构建 + 苹果开发者账号才能装到手机。

## 网页版

四个标签页：**制作**（两种方式：“对齐歌词”导入歌曲和歌词后自动对齐或手动打点；“识别字幕”不需要文字，直接从音频或视频识别出字幕，可选简体 / 繁体和每行长度）。也可以粘贴音频 / 视频文件的直链导入（抖音、B站、音乐平台等分享链接是网页，会提示先保存到手机）、**时间轴**（逐字高亮播放、单句微调、慢放、整体偏移、导出 LRC / 逐字 LRC / SRT）、**作品**（多首歌连同音频保存在本机 IndexedDB）、**设置**（默认语言和模型、存储空间、删除已下载的模型）。

- 识别：[transformers.js](https://github.com/huggingface/transformers.js) 运行 Whisper（tiny / base / small，带逐词时间戳），模型首次使用时从 Hugging Face 下载并缓存；支持 WebGPU 时自动使用
- 普通话用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 转拼音比对，识别成同音字或繁体字也能对上
- 对齐算法 `web/align.js` 与 Swift 版一致，测试：`node web/align.test.mjs`、`node web/link.test.mjs`
- 部署：推送到 `master` 后由 `.github/workflows/pages.yml` 发布到 GitHub Pages（仓库需公开，或使用付费 GitHub 方案；并在 Settings → Pages 里把 Source 设为 GitHub Actions）
- 本地预览：`cd web && python3 -m http.server`，然后打开 http://localhost:8000
- 像 App 一样使用：在 Safari 里点分享按钮 →“添加到主屏幕”。从桌面打开时全屏显示，页面本身可离线打开（`sw.js` 缓存）

---

以下是 iOS 原生版的说明。

## iOS 原生版

功能与网页版一致，用 SwiftUI 写成，最低 iOS 26（系统自带液态玻璃标签栏）：

- **制作**：对齐歌词（自动对齐或手动打点）/ 识别字幕（支持视频，简体 / 繁体，每行长度）；右上角可粘贴文件直链导入
- **时间轴**：逐字高亮、波形进度和每句标记、打点、单句改字 / 微调 / 删除、慢放、整体偏移、撤销、导出 LRC / 逐字 LRC / SRT
- **作品**：作品和音频保存在 App 的 Documents/Projects
- **设置**：默认语言和模型、存储占用、删除已下载的模型

识别用 [WhisperKit](https://github.com/argmaxinc/WhisperKit)（Whisper 的 Core ML 版本，带逐词时间戳），语言默认自动判断（取歌曲中间三段投票）。对齐算法在 `Packages/LyricsAlignCore`，与网页版 `web/align.js` 一致。

### 构建

需要装有 Xcode 26 或更高版本的 Mac：

```bash
brew install xcodegen
xcodegen                     # 生成 LyricSync.xcodeproj
open LyricSync.xcodeproj
```

对齐核心测试：`cd Packages/LyricsAlignCore && swift test`

### 发布到 TestFlight

- 在 Mac 上：Xcode 选 Any iOS Device → Product → Archive → Distribute App → TestFlight & App Store
- 不用 Mac：在仓库 Secrets 里配置 `ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_KEY_P8`（App Store Connect API 密钥）和 `TEAM_ID`，然后在 Actions 里手动运行 **TestFlight** 工作流

Bundle ID 是 `com.pangbobo17.lyricsync`，需要先在开发者网站登记，并在 App Store Connect 里建好 App。

### 已知限制

- 带伴奏的歌曲识别率会比纯人声低；对齐只需要一部分字被认出来，但识别越准结果越好。可以用“精准”模型，或者手动打点
- 歌词里省略的重复段落（如“副歌 ×2”）需要写全
- Apple Music 里的歌曲有 DRM，没法读取
