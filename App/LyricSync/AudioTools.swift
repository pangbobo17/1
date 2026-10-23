import AVFoundation
import Foundation
import UniformTypeIdentifiers

enum AudioTools {
    enum Failure: LocalizedError {
        case noAudioTrack
        var errorDescription: String? { "这个文件里没有可用的声音" }
    }

    /// 导入文件：音频直接复制；视频先提取出声音（m4a）。返回 App 临时目录里的文件
    static func importMedia(from source: URL) async throws -> URL {
        let accessing = source.startAccessingSecurityScopedResource()
        defer { if accessing { source.stopAccessingSecurityScopedResource() } }
        let tmp = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        let name = source.deletingPathExtension().lastPathComponent

        let type = UTType(filenameExtension: source.pathExtension)
        if type?.conforms(to: .movie) == true || type?.conforms(to: .video) == true {
            let dest = tmp.appending(path: "\(name).m4a")
            let asset = AVURLAsset(url: source)
            guard try await !asset.loadTracks(withMediaType: .audio).isEmpty,
                  let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
                throw Failure.noAudioTrack
            }
            try await session.export(to: dest, as: .m4a)
            return dest
        }
        let dest = tmp.appending(path: source.lastPathComponent)
        try FileManager.default.copyItem(at: source, to: dest)
        return dest
    }

    static func duration(of url: URL) -> TimeInterval {
        guard let file = try? AVAudioFile(forReading: url) else { return 0 }
        return Double(file.length) / file.processingFormat.sampleRate
    }

    /// 波形：每段取峰值，归一化到 0...1
    static func peaks(of url: URL, bins: Int = 600) -> [Float] {
        guard let file = try? AVAudioFile(forReading: url) else { return [] }
        let total = AVAudioFrameCount(file.length)
        guard total > 0 else { return [] }
        let perBin = max(1, total / AVAudioFrameCount(bins))
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: perBin) else { return [] }
        var peaks: [Float] = []
        peaks.reserveCapacity(bins)
        while peaks.count < bins {
            do { try file.read(into: buffer, frameCount: perBin) } catch { break }
            if buffer.frameLength == 0 { break }
            guard let channel = buffer.floatChannelData?[0] else { break }
            var m: Float = 0
            var i = 0
            while i < Int(buffer.frameLength) {
                m = max(m, abs(channel[i]))
                i += 8
            }
            peaks.append(m)
        }
        let maxPeak = peaks.max() ?? 0
        return maxPeak > 0 ? peaks.map { $0 / maxPeak } : peaks
    }
}

enum ChineseScript: String, CaseIterable, Identifiable, Codable {
    case simplified, traditional, original

    var id: String { rawValue }
    var title: String {
        switch self {
        case .simplified: return "简体"
        case .traditional: return "繁体"
        case .original: return "保持原样"
        }
    }

    func convert(_ text: String) -> String {
        switch self {
        case .simplified: return text.applyingTransform(StringTransform("Hant-Hans"), reverse: false) ?? text
        case .traditional: return text.applyingTransform(StringTransform("Hans-Hant"), reverse: false) ?? text
        case .original: return text
        }
    }
}

enum Phonetic {
    /// 汉字 → 不带声调的拼音，用于同音字比对
    static func pinyin(_ s: String) -> String {
        let latin = s.applyingTransform(.mandarinToLatin, reverse: false) ?? s
        return (latin.applyingTransform(.stripDiacritics, reverse: false) ?? latin).lowercased()
    }
}
