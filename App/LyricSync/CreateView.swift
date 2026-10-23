import SwiftUI
import UniformTypeIdentifiers

struct CreateView: View {
    @Environment(AppModel.self) private var app
    @State private var pickingAudio = false
    @State private var editingLyrics = false
    @State private var importingLink = false

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            VStack(spacing: 12) {
                Picker("制作方式", selection: $app.mode) {
                    Text("对齐歌词").tag(ProjectKind.lyrics)
                    Text("识别字幕").tag(ProjectKind.subtitle)
                }
                .pickerStyle(.segmented)

                songCard

                if app.mode == .lyrics {
                    lyricsCard
                } else {
                    VStack(spacing: 0) {
                        OptionRow(title: "中文字形") {
                            Picker("中文字形", selection: $app.script) {
                                ForEach(ChineseScript.allCases) { Text($0.title).tag($0) }
                            }
                        }
                        Divider().padding(.leading, 16)
                        OptionRow(title: "每行长度") {
                            Picker("每行长度", selection: $app.lineLength) {
                                ForEach(LineLength.allCases) { Text($0.title).tag($0) }
                            }
                        }
                    }
                    .card()
                }

                VStack(spacing: 0) {
                    OptionRow(title: "语言") {
                        Picker("语言", selection: $app.language) {
                            ForEach(SpokenLanguage.allCases) { Text($0.title).tag($0) }
                        }
                    }
                    Divider().padding(.leading, 16)
                    OptionRow(title: "识别模型") {
                        Picker("识别模型", selection: $app.model) {
                            ForEach(WhisperModel.allCases) { Text($0.title).tag($0) }
                        }
                    }
                }
                .card()

                Spacer(minLength: 0)
                footer
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .background(AmbientBackground(hue: app.hue))
            .navigationTitle("制作")
            .fileImporter(isPresented: $pickingAudio, allowedContentTypes: [.audio, .movie, .video]) { result in
                if case .success(let url) = result { Task { await app.importAudio(url) } }
            }
            .sheet(isPresented: $editingLyrics) { LyricsSheet() }
            .sheet(isPresented: $importingLink) { LinkSheet() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("从链接导入", systemImage: "link") { importingLink = true }
                }
            }
        }
    }

    private var songCard: some View {
        Button { pickingAudio = true } label: {
            Group {
                if app.isImportingAudio {
                    HStack(spacing: 12) { ProgressView(); Text("正在读取…").foregroundStyle(.secondary) }
                        .frame(maxWidth: .infinity, minHeight: 64)
                } else if app.draftAudio != nil {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(app.draftName).font(.headline).lineLimit(1)
                            Spacer()
                            Text(app.draftDuration.lrc.prefix(5)).font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        WaveformView(peaks: app.draftPeaks, accent: .accent(hue: app.hue))
                            .frame(height: 44)
                    }
                } else {
                    HStack(spacing: 14) {
                        Image(systemName: "plus")
                            .font(.title2.weight(.semibold))
                            .frame(width: 52, height: 52)
                            .background(Color.accent(hue: app.hue).gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(.black.opacity(0.8))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.mode == .subtitle ? "选择音频或视频" : "选择歌曲").font(.headline)
                            Text(app.mode == .subtitle ? "mp3、m4a、mp4、mov 都可以" : "mp3、m4a、wav 都可以")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .card()
    }

    private var lyricsCard: some View {
        Button { editingLyrics = true } label: {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(app.lyricLines.isEmpty ? "歌词" : "歌词 · \(app.lyricLines.count) 行")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text(app.lyricLines.isEmpty ? "粘贴或导入歌词。不填也行，会自动识别。" : app.lyricLines.prefix(3).joined(separator: "\n"))
                        .foregroundStyle(app.lyricLines.isEmpty ? Color.secondary : Color.primary)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .card()
    }

    private var footer: some View {
        VStack(spacing: 10) {
            if let status = app.status {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(status)
                        Spacer()
                        if let p = app.progress { Text("\(Int(p * 100))%").monospacedDigit() }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    if let p = app.progress { ProgressView(value: p) } else { ProgressView().frame(maxWidth: .infinity, alignment: .leading) }
                }
            } else if let error = app.errorMessage {
                Text(error).font(.footnote).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await app.runRecognition() }
            } label: {
                Text(ctaTitle).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(app.draftAudio == nil || app.busy)

            if app.mode == .lyrics {
                Button("不识别，边听边手动打点") { app.startManual() }
                    .font(.subheadline.weight(.semibold))
                    .disabled(app.draftAudio == nil || app.lyricLines.isEmpty || app.busy)
            }
        }
    }

    private var ctaTitle: String {
        if app.mode == .subtitle { return "开始识别字幕" }
        return app.lyricLines.isEmpty ? "自动识别歌词" : "自动对齐"
    }
}

/// 卡片里的一行：左边标题，右边是系统菜单选择器
struct OptionRow<Content: View>: View {
    var title: String
    @ViewBuilder var content: Content

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            content.pickerStyle(.menu).labelsHidden()
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .frame(minHeight: 50)
    }
}

struct LyricsSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @FocusState private var focused: Bool

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            TextEditor(text: $app.lyricsText)
                .focused($focused)
                .scrollContentBackground(.hidden)
                .font(.body)
                .lineSpacing(6)
                .padding(.horizontal, 12)
                .overlay(alignment: .topLeading) {
                    if app.lyricsText.isEmpty {
                        Text("每行一句，例如：\n窗外的麻雀\n在电线杆上多嘴\n\n不填的话，会自动识别歌词并分行。\n已有的 LRC 时间标签、[副歌] 之类的标记会被忽略。")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 17)
                            .padding(.top, 8)
                            .allowsHitTesting(false)
                    }
                }
                .navigationTitle("歌词")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("导入文件") { importing = true }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("完成", systemImage: "checkmark") { dismiss() }
                            .buttonStyle(.glassProminent)
                    }
                }
                .fileImporter(isPresented: $importing, allowedContentTypes: [.plainText, UTType(filenameExtension: "lrc") ?? .plainText]) { result in
                    guard case .success(let url) = result else { return }
                    let accessing = url.startAccessingSecurityScopedResource()
                    defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                    guard let data = try? Data(contentsOf: url) else { return }
                    // 老的中文 .lrc 常是 GBK 编码
                    let gbk = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue)))
                    app.lyricsText = String(data: data, encoding: .utf8) ?? String(data: data, encoding: gbk) ?? ""
                }
                .onAppear { if app.lyricsText.isEmpty { focused = true } }
        }
        .presentationDetents([.large])
    }
}

/// 粘贴音频/视频文件的链接导入
struct LinkSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                TextField("粘贴音频或视频文件的链接，例如 https://…/song.mp3", text: $text, axis: .vertical)
                    .lineLimit(3...5)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .padding(12)
                    .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Text("需要是文件本身的链接（mp3、m4a、mp4 等）。抖音、B站、网易云等平台的分享链接是网页，没法直接读取，请先保存到手机再从文件导入。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let error {
                    Text(error).font(.callout).foregroundStyle(.orange)
                }
                Spacer(minLength: 0)
                Button {
                    Task {
                        error = await app.importFromLink(text)
                        if error == nil {
                            app.toast("已导入")
                            dismiss()
                        }
                    }
                } label: {
                    Group {
                        if app.isImportingAudio { ProgressView() } else { Text("导入").font(.headline) }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || app.isImportingAudio)
            }
            .padding(20)
            .navigationTitle("从链接导入")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("取消", systemImage: "xmark") { dismiss() }
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}
