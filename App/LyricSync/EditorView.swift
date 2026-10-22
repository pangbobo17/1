import LyricsAlignCore
import SwiftUI
import UniformTypeIdentifiers

struct EditorView: View {
    @Bindable var project: LyricsProject
    @State private var player = AudioPlayer()
    @State private var exportFormat: LyricsExporter.Format?

    private var currentIndex: Int? {
        project.lines.lastIndex { $0.start <= player.currentTime }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                List {
                    ForEach(Array(project.lines.enumerated()), id: \.element.id) { index, line in
                        LineRow(line: line, isCurrent: index == currentIndex)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                player.seek(to: line.start)
                                if !player.isPlaying { player.play() }
                            }
                            .swipeActions(edge: .leading) {
                                Button("−0.1s") { project.shift(line.id, by: -0.1) }.tint(.gray)
                            }
                            .swipeActions(edge: .trailing) {
                                Button("设为当前") { project.setStart(line.id, to: player.currentTime) }.tint(.blue)
                                Button("+0.1s") { project.shift(line.id, by: 0.1) }.tint(.gray)
                            }
                    }
                }
                .listStyle(.plain)
                .onChange(of: currentIndex) { _, index in
                    guard let index, player.isPlaying else { return }
                    withAnimation { proxy.scrollTo(project.lines[index].id, anchor: .center) }
                }
            }
            PlayerBar(player: player, onTap: tapNextLine)
        }
        .navigationTitle(project.audioName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Menu {
                Section("导出文件") {
                    ForEach(LyricsExporter.Format.allCases) { format in
                        Button(format.title) { exportFormat = format }
                    }
                }
                Section("复制到剪贴板") {
                    ForEach(LyricsExporter.Format.allCases) { format in
                        Button(format.title) { UIPasteboard.general.string = project.export(format) }
                    }
                }
            } label: {
                Label("导出", systemImage: "square.and.arrow.up")
            }
        }
        .fileExporter(isPresented: Binding(get: { exportFormat != nil }, set: { if !$0 { exportFormat = nil } }),
                      document: LyricsDocument(text: exportFormat.map(project.export) ?? ""),
                      contentType: LyricsDocument.contentType(for: exportFormat ?? .lrc),
                      defaultFilename: "\(project.audioName).\((exportFormat ?? .lrc).fileExtension)") { _ in }
        .task {
            if let url = project.audioURL { try? player.load(url: url) }
        }
        .onDisappear { player.stop() }
    }

    /// 打点：听到下一句开始时点一下，把下一句的开始时间设为当前播放位置
    private func tapNextLine() {
        let next = (currentIndex ?? -1) + 1
        guard project.lines.indices.contains(next) else { return }
        project.setStart(project.lines[next].id, to: player.currentTime)
    }
}

private struct LineRow: View {
    let line: AlignedLine
    let isCurrent: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(LyricsExporter.lrcTimestamp(line.start))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            Text(line.text)
                .font(isCurrent ? .headline : .body)
                .foregroundStyle(isCurrent ? Color.accentColor : .primary)
            Spacer(minLength: 0)
            if line.confidence < 0.5 {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .accessibilityLabel("匹配度低，建议检查")
            }
        }
        .padding(.vertical, 4)
    }
}

private struct PlayerBar: View {
    let player: AudioPlayer
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Slider(value: Binding(get: { player.currentTime }, set: { player.seek(to: $0) }),
                   in: 0...max(player.duration, 0.1))
            HStack {
                Text("\(LyricsExporter.lrcTimestamp(player.currentTime)) / \(LyricsExporter.lrcTimestamp(player.duration))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Button { player.seek(to: player.currentTime - 5) } label: { Image(systemName: "gobackward.5") }
                Button { player.toggle() } label: {
                    Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill").font(.largeTitle)
                }
                Button { player.seek(to: player.currentTime + 5) } label: { Image(systemName: "goforward.5") }
                Spacer()
                Button("打点", action: onTap)
                    .buttonStyle(.borderedProminent)
                    .disabled(!player.isPlaying)
            }
        }
        .padding()
        .background(.bar)
    }
}

struct LyricsDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText] }
    static var writableContentTypes: [UTType] { [.plainText, lrc, srt] }

    static let lrc = UTType(filenameExtension: "lrc", conformingTo: .plainText) ?? .plainText
    static let srt = UTType(filenameExtension: "srt", conformingTo: .plainText) ?? .plainText

    static func contentType(for format: LyricsExporter.Format) -> UTType {
        format == .srt ? srt : lrc
    }

    var text: String

    init(text: String) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}
