import Foundation

/// 没有提供歌词时：直接把识别结果按停顿和长度切成行
public enum LineSegmenter {
    public static func lines(from segments: [TimedToken], pause: TimeInterval = 0.7,
                             maxUnitsPerLine: Int = 16) -> [AlignedLine] {
        var lines: [AlignedLine] = []
        var words: [AlignedWord] = []
        var units = 0

        func flush() {
            guard let first = words.first, let last = words.last else { return }
            let text = trimLine(words.map(\.text).joined())
            if !text.isEmpty {
                lines.append(AlignedLine(text: text, start: first.start, end: last.end,
                                         words: words, confidence: 1))
            }
            words = []
            units = 0
        }

        for segment in segments {
            let trimmed = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let segmentUnits = Tokenizer.tokenize(trimmed).count
            // 停顿够长，或者放进这一段就超出每行上限，就先换行
            if let last = words.last, segment.start - last.end >= pause || units + segmentUnits > maxUnitsPerLine {
                flush()
            }
            if let prev = words.last?.text.last, let next = trimmed.first,
               needsSpace(between: prev, and: next) {
                words[words.count - 1].text.append(" ")
            }
            words.append(AlignedWord(text: trimmed, start: segment.start, end: segment.end, isMatched: true))
            units += segmentUnits
            if let end = trimmed.last, "。！？!?.".contains(end) { flush() }
        }
        flush()
        return lines
    }

    static func needsSpace(between a: Character, and b: Character) -> Bool {
        let aWord = (a.isLetter || a.isNumber || ",.!?;:".contains(a)) && !Tokenizer.isCJK(a)
        let bWord = (b.isLetter || b.isNumber) && !Tokenizer.isCJK(b)
        return aWord && bWord
    }

    /// 去掉行尾的标点（识别器会自动加标点，歌词一般不需要）
    static func trimLine(_ s: String) -> String {
        var s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while let last = s.last, "，。、,.；;：:".contains(last) { s.removeLast() }
        return s
    }
}
