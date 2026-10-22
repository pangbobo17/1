import LyricsAlignCore
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    private enum ImportTarget { case audio, lyrics }

    @State private var project = LyricsProject()
    @State private var importTarget: ImportTarget?
    @State private var showEditor = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("① 音频") {
                    Button {
                        importTarget = .audio
                    } label: {
                        Label(project.audioURL == nil ? "选择音乐 / 音频文件" : project.audioName,
                              systemImage: "music.note")
                    }
                }

                Section {
                    TextEditor(text: $project.lyricsText)
                        .frame(minHeight: 180)
                    Button("从文件导入（.txt / .lrc）") { importTarget = .lyrics }
                } header: {
                    Text("② 歌词 / 文本（可选）")
                } footer: {
                    Text("每行一句。留空则自动识别文字并按停顿分行。已有的时间标签、[Chorus] 等标记会被忽略。")
                }

                Section("③ 语言") {
                    Picker("识别语言", selection: $project.language) {
                        ForEach(RecognitionLanguage.allCases) { Text($0.title).tag($0) }
                    }
                }

                Section {
                    Button {
                        Task {
                            await project.run()
                            if project.phase == .done { showEditor = true }
                        }
                    } label: {
                        HStack {
                            Text(project.hasLyrics ? "开始对齐" : "自动识别歌词")
                            Spacer()
                            if project.isWorking { ProgressView() }
                        }
                    }
                    .disabled(!project.canStart)

                    switch project.phase {
                    case .working(let message):
                        Text(message).foregroundStyle(.secondary)
                    case .failed(let message):
                        Text(message).foregroundStyle(.red)
                    case .idle, .done:
                        EmptyView()
                    }

                    if !project.lines.isEmpty && !project.isWorking {
                        Button("打开时间轴编辑器") { showEditor = true }
                    }
                }
            }
            .navigationTitle("歌词对齐")
            .fileImporter(isPresented: Binding(get: { importTarget != nil }, set: { if !$0 { importTarget = nil } }),
                          allowedContentTypes: importTarget == .lyrics ? lyricsTypes : [.audio]) { result in
                handleImport(result)
            }
            .navigationDestination(isPresented: $showEditor) {
                EditorView(project: project)
            }
            .alert("导入失败", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("好") {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private var lyricsTypes: [UTType] {
        [.plainText] + ["lrc", "srt"].compactMap { UTType(filenameExtension: $0) }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        let target = importTarget
        do {
            let url = try result.get()
            switch target {
            case .audio: try project.importAudio(from: url)
            case .lyrics: try project.importLyrics(from: url)
            case nil: break
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
