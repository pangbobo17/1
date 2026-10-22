import Foundation

public struct AlignmentOptions: Sendable {
    public var matchScore: Double = 2
    /// 读音相同（如同音字）的得分
    public var similarScore: Double = 1.5
    public var mismatchScore: Double = -1
    public var gapScore: Double = -1
    /// 没有任何识别结果可参考时，每个字/词的默认时长
    public var defaultTokenDuration: TimeInterval = 0.3
    /// 可选：把 token 映射为读音（例如汉字→拼音），用来容忍识别出的同音错字
    public var phonetic: (@Sendable (String) -> String)?

    public init(phonetic: (@Sendable (String) -> String)? = nil) {
        self.phonetic = phonetic
    }
}

/// 歌词强制对齐：把用户提供的歌词与语音识别结果做序列比对（Needleman–Wunsch，
/// 识别结果首尾的多余内容不计罚分），命中的字/词直接取识别时间，
/// 未命中的在相邻锚点之间插值，最后汇总成逐行（及逐字）时间轴。
public enum LyricsAligner {
    enum Pairing: Equatable { case match, similar, mismatch }

    struct Pair: Equatable {
        let asrIndex: Int
        let kind: Pairing
    }

    public static func align(lines: [String], recognized: [TimedToken], duration: TimeInterval,
                             options: AlignmentOptions = AlignmentOptions()) -> [AlignedLine] {
        let lineTokens = lines.map(Tokenizer.tokenize)
        let lyric = lineTokens.flatMap { $0 }
        let asr = Tokenizer.tokenize(recognized: recognized)
        let pairs = globalAlign(lyric.map(\.key), asr.map(\.text), options: options)
        let times = estimateTimes(pairs: pairs, asr: asr, duration: duration, options: options)

        var result: [AlignedLine] = []
        var k = 0
        var lastEnd: TimeInterval = 0
        for (lineIndex, tokens) in lineTokens.enumerated() {
            var words: [AlignedWord] = []
            var matched = 0
            for token in tokens {
                let kind = pairs[k]?.kind
                if kind == .match || kind == .similar { matched += 1 }
                words.append(AlignedWord(text: token.display, start: times[k].start, end: times[k].end,
                                         isMatched: kind != nil && kind != .mismatch))
                k += 1
            }
            let start = words.first?.start ?? lastEnd
            let end = words.last?.end ?? start
            lastEnd = end
            result.append(AlignedLine(
                text: lines[lineIndex].trimmingCharacters(in: .whitespaces),
                start: start, end: end, words: words,
                confidence: tokens.isEmpty ? 0 : Double(matched) / Double(tokens.count)))
        }
        return result
    }

    /// 返回与 a（歌词）等长的数组，每个元素是对应的 b（识别结果）下标，nil 表示该歌词 token 没有对应
    static func globalAlign(_ a: [String], _ b: [String], options: AlignmentOptions) -> [Pair?] {
        let n = a.count, m = b.count
        var result = [Pair?](repeating: nil, count: n)
        guard n > 0, m > 0 else { return result }

        let aPhon = options.phonetic.map { f in a.map(f) }
        let bPhon = options.phonetic.map { f in b.map(f) }
        func kind(_ i: Int, _ j: Int) -> Pairing {
            if a[i] == b[j] { return .match }
            if let aPhon, let bPhon, !aPhon[i].isEmpty, aPhon[i] == bPhon[j] { return .similar }
            return .mismatch
        }

        // trace: 0 = 对角（配对），1 = 上（歌词 token 无对应），2 = 左（跳过识别 token）
        let w = m + 1
        var score = [Double](repeating: 0, count: (n + 1) * w)
        var trace = [UInt8](repeating: 0, count: (n + 1) * w)
        for i in 1...n {
            score[i * w] = Double(i) * options.gapScore
            trace[i * w] = 1
        }
        for j in 1...m {
            score[j] = 0  // 跳过开头的识别内容（前奏杂音等）不扣分
            trace[j] = 2
        }
        for i in 1...n {
            for j in 1...m {
                let pairScore: Double
                switch kind(i - 1, j - 1) {
                case .match: pairScore = options.matchScore
                case .similar: pairScore = options.similarScore
                case .mismatch: pairScore = options.mismatchScore
                }
                let diag = score[(i - 1) * w + j - 1] + pairScore
                let up = score[(i - 1) * w + j] + options.gapScore
                // 最后一行向左走 = 跳过结尾的识别内容，同样不扣分
                let left = score[i * w + j - 1] + (i == n ? 0 : options.gapScore)
                var best = diag, t: UInt8 = 0
                if up > best { best = up; t = 1 }
                if left > best { best = left; t = 2 }
                score[i * w + j] = best
                trace[i * w + j] = t
            }
        }

        var i = n, j = m
        while i > 0 {
            if j == 0 { i -= 1; continue }
            switch trace[i * w + j] {
            case 0:
                result[i - 1] = Pair(asrIndex: j - 1, kind: kind(i - 1, j - 1))
                i -= 1
                j -= 1
            case 1:
                i -= 1
            default:
                j -= 1
            }
        }
        return result
    }

    static func estimateTimes(pairs: [Pair?], asr: [TimedToken], duration: TimeInterval,
                              options: AlignmentOptions) -> [(start: TimeInterval, end: TimeInterval)] {
        let n = pairs.count
        guard n > 0 else { return [] }
        let total = duration > 0 ? duration : (asr.last?.end ?? Double(n) * options.defaultTokenDuration)
        let anchors = pairs.indices.filter { pairs[$0] != nil }
        guard let first = anchors.first, let last = anchors.last else {
            // 完全没有可参考的识别结果：在整段音频内均分
            let step = total / Double(n)
            return (0..<n).map { (Double($0) * step, Double($0 + 1) * step) }
        }

        var out = [(start: TimeInterval, end: TimeInterval)](repeating: (0, 0), count: n)
        for i in anchors {
            let token = asr[pairs[i]!.asrIndex]
            out[i] = (token.start, token.end)
        }
        let d = options.defaultTokenDuration
        for i in stride(from: first - 1, through: 0, by: -1) {
            let end = out[i + 1].start
            out[i] = (max(0, end - d), end)
        }
        for i in (last + 1)..<n {
            let start = out[i - 1].end
            out[i] = (start, max(start, min(total, start + d)))
        }
        for (a, b) in zip(anchors, anchors.dropFirst()) where b - a > 1 {
            let gapStart = out[a].end
            let gapEnd = max(out[b].start, gapStart)
            let count = b - a - 1
            let step = (gapEnd - gapStart) / Double(count)
            for x in 0..<count {
                out[a + 1 + x] = (gapStart + Double(x) * step, gapStart + Double(x + 1) * step)
            }
        }
        // 保证时间单调不减
        for i in 1..<n {
            if out[i].start < out[i - 1].start { out[i].start = out[i - 1].start }
            if out[i].end < out[i].start { out[i].end = out[i].start }
        }
        return out
    }
}
