import XCTest
@testable import LyricsAlignCore

final class LyricsAlignCoreTests: XCTestCase {
    func testTokenizeMixedScripts() {
        let tokens = Tokenizer.tokenize("你好, world! Don't stop")
        XCTAssertEqual(tokens.map(\.key), ["你", "好", "world", "dont", "stop"])
        XCTAssertEqual(tokens.map(\.display).joined(), "你好, world! Don't stop")
    }

    func testRecognizedSegmentsSplitEvenly() {
        let tokens = Tokenizer.tokenize(recognized: [TimedToken(text: "你好", start: 1, end: 2)])
        XCTAssertEqual(tokens, [TimedToken(text: "你", start: 1, end: 1.5), TimedToken(text: "好", start: 1.5, end: 2)])
    }

    func testAlignsLinesAndSkipsNoise() {
        let recognized = [
            TimedToken(text: "嗯啊", start: 0, end: 1),       // 前奏杂音
            TimedToken(text: "你好世界", start: 2, end: 4),
            TimedToken(text: "再见", start: 6, end: 7),
            TimedToken(text: "谢谢", start: 9, end: 10),      // 结尾多余内容
        ]
        let lines = LyricsAligner.align(lines: ["你好世界", "再见"], recognized: recognized, duration: 10)
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(lines[0].start!, 2, accuracy: 0.001)
        XCTAssertEqual(lines[0].end!, 4, accuracy: 0.001)
        XCTAssertEqual(lines[1].start!, 6, accuracy: 0.001)
        XCTAssertEqual(lines[1].confidence, 1)
    }

    func testHomophonesAndMissingWords() {
        let pinyin: [String: String] = ["好": "hao", "号": "hao"]
        var options = AlignmentOptions()
        options.phonetic = { pinyin[$0] ?? $0 }
        // 识别把“好”听成了“号”，并且漏掉了“见”
        let recognized = [TimedToken(text: "你号世界", start: 1, end: 3), TimedToken(text: "再朋友", start: 4, end: 5.5)]
        let lines = LyricsAligner.align(lines: ["你好世界", "再见朋友"], recognized: recognized,
                                        duration: 6, options: options)
        XCTAssertEqual(lines[0].confidence, 1)
        XCTAssertEqual(lines[1].start!, 4, accuracy: 0.001)
        XCTAssertFalse(lines[1].words[1].isMatched)
        XCTAssertEqual(lines[1].words[1].start, lines[1].words[0].end, accuracy: 0.001)
    }

    func testEnglishLyrics() {
        let recognized = [TimedToken(text: "hello darkness", start: 1, end: 2),
                          TimedToken(text: "my old friend", start: 2.2, end: 3.5)]
        let lines = LyricsAligner.align(lines: ["Hello darkness, my old friend"], recognized: recognized, duration: 4)
        XCTAssertEqual(lines[0].start!, 1, accuracy: 0.001)
        XCTAssertEqual(lines[0].end!, 3.5, accuracy: 0.001)
    }

    func testNoRecognitionSpreadsEvenly() {
        let lines = LyricsAligner.align(lines: ["一二", "三四"], recognized: [], duration: 8)
        XCTAssertEqual(lines.map(\.start), [0, 4])
    }

    func testSegmenterSplitsOnPause() {
        let segments = [TimedToken(text: "hello", start: 0, end: 0.5), TimedToken(text: "world", start: 0.6, end: 1),
                        TimedToken(text: "again", start: 3, end: 3.5)]
        let lines = LineSegmenter.lines(from: segments)
        XCTAssertEqual(lines.map(\.text), ["hello world", "again"])
    }

    func testExportFormats() {
        let line = AlignedLine(text: "你好", start: 65.432, end: 66,
                               words: [AlignedWord(text: "你", start: 65.432, end: 65.7, isMatched: true),
                                       AlignedWord(text: "好", start: 65.7, end: 66, isMatched: true)],
                               confidence: 1)
        XCTAssertEqual(LyricsExporter.export([line], format: .lrc), "[01:05.43]你好\n")
        XCTAssertEqual(LyricsExporter.export([line], format: .enhancedLRC), "[01:05.43]<01:05.43>你<01:05.70>好<01:06.00>\n")
        XCTAssertEqual(LyricsExporter.export([line], format: .srt), "1\n00:01:05,432 --> 00:01:06,000\n你好\n")
    }

    func testCleanLyricsText() {
        let raw = "[ti:歌名]\n[00:01.00]第一句\n\n[Chorus]\n第二句 <00:02.00>\n"
        XCTAssertEqual(LyricsText.lines(from: raw), ["第一句", "第二句"])
    }

    func testSegmenterBreaksBeforeExceedingLimit() {
        let segments = [TimedToken(text: "大家好", start: 0, end: 1), TimedToken(text: "欢迎来到", start: 1, end: 2),
                        TimedToken(text: "我的频道", start: 2, end: 3)]
        XCTAssertEqual(LineSegmenter.lines(from: segments, maxUnitsPerLine: 10).map(\.text), ["大家好欢迎来到", "我的频道"])
    }

    func testExportSkipsUntimedLinesAndChainsSRTEnds() {
        let lines = [AlignedLine(text: "a", start: 1, end: 1), AlignedLine(text: "b", start: 4, end: 4),
                     AlignedLine(text: "c", start: nil, end: nil)]
        XCTAssertEqual(LyricsExporter.export(lines, format: .srt),
                       "1\n00:00:01,000 --> 00:00:04,000\na\n\n2\n00:00:04,000 --> 00:00:07,000\nb\n")
        XCTAssertEqual(LyricsExporter.export(lines, format: .lrc), "[00:01.00]a\n[00:04.00]b\n")
    }

    func testSetStartShiftsWordsOrSetsTime() {
        var tapped = AlignedLine(text: "x", start: nil, end: nil)
        tapped.setStart(2.345)
        XCTAssertEqual(tapped.start, 2.35)
        var aligned = AlignedLine(text: "你好", start: 1, end: 2,
                                  words: [AlignedWord(text: "你", start: 1, end: 1.5, isMatched: true),
                                          AlignedWord(text: "好", start: 1.5, end: 2, isMatched: true)])
        aligned.setStart(3)
        XCTAssertEqual(aligned.start, 3)
        XCTAssertEqual(aligned.end!, 4, accuracy: 0.001)
        XCTAssertEqual(aligned.words[1].start, 3.5, accuracy: 0.001)
    }
}
