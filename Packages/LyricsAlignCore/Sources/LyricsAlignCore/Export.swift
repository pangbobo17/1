import Foundation

public enum LyricsExporter {
    public enum Format: String, CaseIterable, Identifiable, Sendable {
        case lrc, enhancedLRC, srt

        public var id: String { rawValue }
        public var fileExtension: String { self == .srt ? "srt" : "lrc" }
        public var title: String {
            switch self {
            case .lrc: return "LRC（逐行）"
            case .enhancedLRC: return "LRC（逐字/卡拉OK）"
            case .srt: return "SRT 字幕"
            }
        }
    }

    public static func export(_ lines: [AlignedLine], format: Format, title: String? = nil,
                              artist: String? = nil) -> String {
        switch format {
        case .lrc, .enhancedLRC:
            var out: [String] = []
            if let title, !title.isEmpty { out.append("[ti:\(title)]") }
            if let artist, !artist.isEmpty { out.append("[ar:\(artist)]") }
            for line in lines {
                if format == .enhancedLRC, !line.words.isEmpty {
                    let body = line.words.map { "<\(lrcTimestamp($0.start))>\($0.text)" }.joined()
                    out.append("[\(lrcTimestamp(line.start))]\(body)<\(lrcTimestamp(line.end))>")
                } else {
                    out.append("[\(lrcTimestamp(line.start))]\(line.text)")
                }
            }
            return out.joined(separator: "\n") + "\n"
        case .srt:
            return lines.enumerated().map { index, line in
                let end = max(line.end, line.start + 0.5)
                return "\(index + 1)\n\(srtTimestamp(line.start)) --> \(srtTimestamp(end))\n\(line.text)\n"
            }.joined(separator: "\n")
        }
    }

    /// mm:ss.xx
    public static func lrcTimestamp(_ t: TimeInterval) -> String {
        let cs = Int((max(t, 0) * 100).rounded())
        return String(format: "%02d:%02d.%02d", cs / 6000, (cs / 100) % 60, cs % 100)
    }

    /// hh:mm:ss,mmm
    public static func srtTimestamp(_ t: TimeInterval) -> String {
        let ms = Int((max(t, 0) * 1000).rounded())
        return String(format: "%02d:%02d:%02d,%03d", ms / 3_600_000, (ms / 60_000) % 60, (ms / 1000) % 60, ms % 1000)
    }
}

public enum LyricsText {
    /// 把用户输入/导入的歌词整理成行：去掉 LRC 时间标签、[ti:] 等元信息、[Chorus] 等段落标记和空行
    public static func lines(from raw: String) -> [String] {
        raw.components(separatedBy: .newlines)
            .map {
                $0.replacingOccurrences(of: #"\[[^\]]*\]|<\d+:\d+(\.\d+)?>"#, with: "", options: .regularExpression)
                    .trimmingCharacters(in: .whitespaces)
            }
            .filter { !$0.isEmpty }
    }
}
