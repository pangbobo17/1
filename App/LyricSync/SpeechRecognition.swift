import AVFoundation
import Foundation
import LyricsAlignCore
import Speech

enum RecognitionLanguage: String, CaseIterable, Identifiable {
    case mandarin = "zh-CN"
    case cantonese = "zh-HK"
    case english = "en-US"
    case japanese = "ja-JP"
    case korean = "ko-KR"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }
    var title: String {
        switch self {
        case .mandarin: return "普通话"
        case .cantonese: return "粤语"
        case .english: return "English"
        case .japanese: return "日本語"
        case .korean: return "한국어"
        }
    }
    /// 普通话用拼音比对，容忍识别出的同音错字
    var usesPinyin: Bool { self == .mandarin }
}

enum RecognitionError: LocalizedError {
    case notAuthorized
    case unsupportedLocale
    case recognizerUnavailable

    var errorDescription: String? {
        switch self {
        case .notAuthorized: return "没有语音识别权限，请在“设置”中开启。"
        case .unsupportedLocale: return "本机不支持该语言的语音识别。"
        case .recognizerUnavailable: return "语音识别当前不可用。"
        }
    }
}

enum SpeechRecognition {
    /// 优先使用 iOS 26 的 SpeechAnalyzer（端侧、适合长音频），设备不支持时退回 SFSpeechRecognizer
    static func transcribe(url: URL, locale: Locale) async throws -> [TimedToken] {
        if SpeechTranscriber.isAvailable {
            return try await transcribeWithAnalyzer(url: url, locale: locale)
        }
        return try await transcribeLegacy(url: url, locale: locale)
    }

    private static func transcribeWithAnalyzer(url: URL, locale: Locale) async throws -> [TimedToken] {
        guard let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            throw RecognitionError.unsupportedLocale
        }
        let transcriber = SpeechTranscriber(locale: supported, transcriptionOptions: [],
                                            reportingOptions: [], attributeOptions: [.audioTimeRange])
        // 首次使用某种语言时需要下载端侧模型
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let collector = Task {
            var tokens: [TimedToken] = []
            for try await result in transcriber.results {
                for run in result.text.runs {
                    guard let range = run.audioTimeRange else { continue }
                    let text = String(result.text[run.range].characters)
                    tokens.append(TimedToken(text: text, start: range.start.seconds, end: range.end.seconds))
                }
            }
            return tokens
        }

        let file = try AVAudioFile(forReading: url)
        if let lastSample = try await analyzer.analyzeSequence(from: file) {
            try await analyzer.finalizeAndFinish(through: lastSample)
        } else {
            await analyzer.cancelAndFinishNow()
        }
        return try await collector.value
    }

    private static func transcribeLegacy(url: URL, locale: Locale) async throws -> [TimedToken] {
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard status == .authorized else { throw RecognitionError.notAuthorized }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw RecognitionError.recognizerUnavailable
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

        return try await withCheckedThrowingContinuation { continuation in
            var finished = false
            recognizer.recognitionTask(with: request) { result, error in
                guard !finished else { return }
                if let error {
                    finished = true
                    continuation.resume(throwing: error)
                } else if let result, result.isFinal {
                    finished = true
                    continuation.resume(returning: result.bestTranscription.segments.map {
                        TimedToken(text: $0.substring, start: $0.timestamp, end: $0.timestamp + $0.duration)
                    })
                }
            }
        }
    }

    static func duration(of url: URL) -> TimeInterval {
        guard let file = try? AVAudioFile(forReading: url) else { return 0 }
        return Double(file.length) / file.processingFormat.sampleRate
    }
}

enum Phonetic {
    /// 汉字 → 不带声调的拼音，用于同音字比对
    static func pinyin(_ s: String) -> String {
        let latin = s.applyingTransform(.mandarinToLatin, reverse: false) ?? s
        return (latin.applyingTransform(.stripDiacritics, reverse: false) ?? latin).lowercased()
    }
}
