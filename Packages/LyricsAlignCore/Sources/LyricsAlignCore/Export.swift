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
            let lines = lines.filter { $0.start != nil }
            var out: [String] = []
            if let title, !title.isEmpty { out.append("[ti:\(title)]") }
            if let artist, !artist.isEmpty { out.append("[ar:\(artist)]") }
            for line in lines {
                let start = line.start ?? 0
                if format == .enhancedLRC, !line.words.isEmpty {
                    let body = line.words.map { "<\(lrcTimestamp($0.start))>\($0.text)" }.joined()
                    out.append("[\(lrcTimestamp(start))]\(body)<\(lrcTimestamp(line.end ?? start))>")
                } else {
                    out.append("[\(lrcTimestamp(start))]\(line.text)")
                }
            }
            return out.joined(separator: "\n") + "\n"
        case .srt:
            let timed = lines.filter { $0.start != nil }
            return timed.enumerated().map { index, line in
                let start = line.start ?? 0
                let nextStart = index + 1 < timed.count ? timed[index + 1].start : nil
                let end: TimeInterval
                if let lineEnd = line.end, lineEnd > start + 0.05 {
                    end = lineEnd
                } else {
                    end = nextStart ?? start + 3
                }
                return "\(index + 1)\n\(srtTimestamp(start)) --> \(srtTimestamp(end))\n\(line.text)\n"
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
