import Foundation
import LyricsAlignCore
import Observation

@MainActor
@Observable
final class LyricsProject {
    enum Phase: Equatable {
        case idle
        case working(String)
        case done
        case failed(String)
    }

    var audioURL: URL?
    var audioName = ""
    var lyricsText = ""
    var language: RecognitionLanguage = .mandarin
    var lines: [AlignedLine] = []
    var phase: Phase = .idle

    var isWorking: Bool {
        if case .working = phase { return true }
        return false
    }
    var canStart: Bool { audioURL != nil && !isWorking }
    var hasLyrics: Bool { !LyricsText.lines(from: lyricsText).isEmpty }

    func importAudio(from url: URL) throws {
        let dest = try copyIntoSandbox(url)
        audioURL = dest
        audioName = url.deletingPathExtension().lastPathComponent
        lines = []
        phase = .idle
    }

    func importLyrics(from url: URL) throws {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        var encoding = String.Encoding.utf8
        lyricsText = try String(contentsOf: url, usedEncoding: &encoding)
    }

    func run() async {
        guard let audioURL else { return }
        let lyricLines = LyricsText.lines(from: lyricsText)
        phase = .working("正在识别音频…（首次使用某种语言需下载语音模型）")
        do {
            let recognized = try await SpeechRecognition.transcribe(url: audioURL, locale: language.locale)
            if lyricLines.isEmpty {
                lines = LineSegmenter.lines(from: recognized)
            } else {
                phase = .working("正在逐行对齐…")
                var options = AlignmentOptions()
                if language.usesPinyin { options.phonetic = { Phonetic.pinyin($0) } }
                let duration = SpeechRecognition.duration(of: audioURL)
                lines = await Task.detached(priority: .userInitiated) {
                    LyricsAligner.align(lines: lyricLines, recognized: recognized, duration: duration, options: options)
                }.value
            }
            phase = lines.isEmpty ? .failed("没有识别到人声，请检查音频或语言设置。") : .done
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func export(_ format: LyricsExporter.Format) -> String {
        LyricsExporter.export(lines, format: format, title: audioName)
    }

    // MARK: - 手动微调

    func shift(_ id: AlignedLine.ID, by delta: TimeInterval) {
        guard let i = lines.firstIndex(where: { $0.id == id }) else { return }
        lines[i].shift(by: delta)
    }

    func setStart(_ id: AlignedLine.ID, to time: TimeInterval) {
        guard let i = lines.firstIndex(where: { $0.id == id }) else { return }
        lines[i].shift(by: time - lines[i].start)
    }

    private func copyIntoSandbox(_ url: URL) throws -> URL {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(url.pathExtension)
        try FileManager.default.copyItem(at: url, to: dest)
        return dest
    }
}
