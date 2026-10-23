# 歌词对齐（LyricSync）

包含两个版本：

- **网页版**（`web/`）：在 iPhone 的 Safari 里直接用，不需要 Mac，也不用上架。识别用 Whisper，在手机浏览器里本地运行。
- **iOS 原生版**（`App/` + `Packages/`）：需要 Mac 或云端构建 + 苹果开发者账号才能装到手机。

## 网页版

四个标签页：**制作**（导入歌曲和歌词，自动对齐或手动打点）、**时间轴**（逐字高亮播放、单句微调、慢放、整体偏移、导出 LRC / 逐字 LRC / SRT）、**作品**（多首歌连同音频保存在本机 IndexedDB）、**设置**（默认语言和模型、存储空间、删除已下载的模型）。

- 识别：[transformers.js](https://github.com/huggingface/transformers.js) 运行 Whisper（tiny / base / small，带逐词时间戳），模型首次使用时从 Hugging Face 下载并缓存；支持 WebGPU 时自动使用
- 普通话用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 转拼音比对，识别成同音字或繁体字也能对上
- 对齐算法 `web/align.js` 与 Swift 版一致，测试：`node web/align.test.mjs`
- 部署：推送到 `master` 后由 `.github/workflows/pages.yml` 发布到 GitHub Pages（仓库需公开，或使用付费 GitHub 方案；并在 Settings → Pages 里把 Source 设为 GitHub Actions）
- 本地预览：`cd web && python3 -m http.server`，然后打开 http://localhost:8000
- 像 App 一样使用：在 Safari 里点分享按钮 →“添加到主屏幕”。从桌面打开时全屏显示，页面本身可离线打开（`sw.js` 缓存）

---

以下是 iOS 原生版的说明。

一款 iOS / iPadOS 应用：导入音乐或音频，粘贴或导入歌词，生成**逐行**（以及逐字）的时间轴，导出 LRC / SRT。不提供歌词时会自动识别文字并分行。

## 功能

- 导入音频：mp3 / m4a / wav / aiff 等（从“文件” App 选取）
- 歌词：粘贴文本，或导入 `.txt` / `.lrc`（已有时间标签、`[Chorus]` 这类标记会被去掉）
- **强对齐**：歌词与语音识别结果做序列比对，每一行都会得到时间，识别错、漏的字会按前后插值
- 普通话按拼音比对，识别成同音错字也能对上
- **自动识别**：不给歌词时，直接识别并按停顿切分成行
- 时间轴编辑器：边播边高亮当前行；点一行跳到这一行；左右滑动做 ±0.1s 微调或“设为当前”；播放时按“打点”设置下一句的开始时间
- 导出：LRC（逐行）、LRC 逐字（卡拉 OK / Enhanced LRC）、SRT；也可以复制到剪贴板
- 识别在本机完成，不上传音频

## 原理

```
音频 ──► 端侧语音识别（SpeechAnalyzer / SFSpeechRecognizer）──► 带时间戳的字/词
                                                               │
歌词 ──► 分词（中日韩按字，英文按词）─────────────────────────────► 序列比对（Needleman–Wunsch）
                                                               │   · 识别结果首尾多余内容不扣分
                                                               │   · 同音字算近似匹配
                                                               ▼
                                         命中的字取识别时间，没命中的在前后锚点之间插值
                                                               ▼
                                                  逐行 / 逐字时间轴 ──► LRC / SRT
```

核心算法在独立的 Swift Package `Packages/LyricsAlignCore` 里，不依赖 UIKit，可以单独测试，以后也能直接用在 macOS 版里。

## 目录

```
project.yml                      XcodeGen 工程描述
App/LyricSync/                   SwiftUI 应用
  ContentView.swift              首页：导入音频、歌词、选语言
  EditorView.swift               时间轴编辑器 + 导出
  SpeechRecognition.swift        语音识别（带时间戳）
  LyricsProject.swift            状态与流程
  AudioPlayer.swift              播放器
Packages/LyricsAlignCore/        对齐核心（分词、对齐、自动分行、导出）+ 单元测试
```

## 构建

需要一台装了 Xcode 26 或更高版本的 Mac。应用最低支持 iOS 26（SpeechAnalyzer 从 iOS 26 起才有）。

```bash
brew install xcodegen
xcodegen                     # 生成 LyricSync.xcodeproj
open LyricSync.xcodeproj     # 选择你的开发者团队后运行到真机
```

运行核心算法测试：

```bash
cd Packages/LyricsAlignCore && swift test
```

> 语音识别要在真机上测试，模拟器上效果不可靠。首次识别某种语言时，系统会下载端侧语音模型。

## 已知限制与后续计划

- **带伴奏的歌曲**：系统语音识别主要为说话设计，伴奏响、唱腔重时识别率会下降。对齐只需要一部分字被认出来就能定位，但识别得越准，结果越好。计划：
  1. 先做人声分离（如把 Demucs / MDX 转成 Core ML 模型），再做识别
  2. 增加 WhisperKit（Whisper 的 Core ML 版本，带逐词时间戳）作为可选识别引擎，它对唱歌的识别通常更好
- 歌词里省略的重复段落（如“副歌 ×2”）需要在歌词里写全，否则会对到第一次出现的位置
- Apple Music 里的歌曲有 DRM，没法读取，需要用户自己的音频文件
- 上架 App Store 需要 Apple 开发者账号（每年 99 美元）
