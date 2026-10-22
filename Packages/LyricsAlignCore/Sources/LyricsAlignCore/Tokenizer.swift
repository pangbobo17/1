import Foundation

/// 歌词中的最小对齐单元：中日韩文字按单字，拉丁文字按单词
public struct LyricToken: Equatable, Sendable {
    /// 显示用原文（含紧随其后的标点和空格）
    public var display: String
    /// 比对用的规范化文本（小写、去标点）
    public var key: String
}

public enum Tokenizer {
    public static func tokenize(_ text: String) -> [LyricToken] {
        var tokens: [LyricToken] = []
        var prefix = ""  // 第一个 token 之前的标点/空格
        var word = ""

        func appendToken(_ display: String) {
            tokens.append(LyricToken(display: prefix + display, key: normalize(display)))
            prefix = ""
        }
        func flushWord() {
            guard !word.isEmpty else { return }
            appendToken(word)
            word = ""
        }

        for ch in text {
            if isCJK(ch) {
                flushWord()
                appendToken(String(ch))
            } else if ch.isLetter || ch.isNumber || (isApostrophe(ch) && !word.isEmpty) {
                word.append(ch)
            } else {
                flushWord()
                if tokens.isEmpty {
                    prefix.append(ch)
                } else {
                    tokens[tokens.count - 1].display.append(ch)
                }
            }
        }
        flushWord()
        return tokens
    }

    /// 把识别结果拆成与歌词同粒度的 token，片段时间按字符数均分
    public static func tokenize(recognized segments: [TimedToken]) -> [TimedToken] {
        var out: [TimedToken] = []
        for segment in segments {
            let keys = tokenize(segment.text).map(\.key).filter { !$0.isEmpty }
            guard !keys.isEmpty else { continue }
            let totalChars = Double(keys.reduce(0) { $0 + $1.count })
            let duration = max(segment.end - segment.start, 0)
            var t = segment.start
            for key in keys {
                let d = duration * Double(key.count) / totalChars
                out.append(TimedToken(text: key, start: t, end: t + d))
                t += d
            }
        }
        return out
    }

    public static func normalize(_ s: String) -> String {
        String(s.lowercased().filter { $0.isLetter || $0.isNumber })
    }

    public static func isCJK(_ ch: Character) -> Bool {
        guard let v = ch.unicodeScalars.first?.value else { return false }
        switch v {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0x20000...0x2A6DF, 0xF900...0xFAFF:  // 汉字
            return true
        case 0x3040...0x30FF:  // 平假名、片假名
            return true
        case 0xAC00...0xD7AF:  // 韩文音节
            return true
        default:
            return false
        }
    }

    static func isApostrophe(_ ch: Character) -> Bool {
        ch == "'" || ch == "\u{2019}"
    }
}
