import Foundation

/// 语音识别输出的一个带时间戳的片段（可能是一个字、一个词或一句话）
public struct TimedToken: Equatable, Sendable {
    public var text: String
    public var start: TimeInterval
    public var end: TimeInterval

    public init(text: String, start: TimeInterval, end: TimeInterval) {
        self.text = text
        self.start = start
        self.end = end
    }
}

/// 对齐后的一个字/词
public struct AlignedWord: Equatable, Sendable, Codable {
    /// 显示用原文（含紧随其后的标点和空格）
    public var text: String
    public var start: TimeInterval
    public var end: TimeInterval
    /// true 表示直接命中了识别结果；false 表示时间是插值估计出来的
    public var isMatched: Bool

    public init(text: String, start: TimeInterval, end: TimeInterval, isMatched: Bool) {
        self.text = text
        self.start = start
        self.end = end
        self.isMatched = isMatched
    }
}

/// 对齐后的一行歌词
public struct AlignedLine: Identifiable, Equatable, Sendable, Codable {
    public var id: UUID
    public var text: String
    public var start: TimeInterval
    public var end: TimeInterval
    public var words: [AlignedWord]
    /// 0...1，该行中与识别结果匹配上的字/词比例，低值说明需要人工检查
    public var confidence: Double

    public init(id: UUID = UUID(), text: String, start: TimeInterval, end: TimeInterval,
                words: [AlignedWord], confidence: Double) {
        self.id = id
        self.text = text
        self.start = start
        self.end = end
        self.words = words
        self.confidence = confidence
    }

    /// 整行平移（保持逐字时间的相对位置）
    public mutating func shift(by delta: TimeInterval) {
        let delta = max(delta, -start)
        start += delta
        end += delta
        for i in words.indices {
            words[i].start += delta
            words[i].end += delta
        }
    }
}
