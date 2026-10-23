import Foundation
import LyricsAlignCore
import WhisperKit

enum WhisperModel: String, CaseIterable, Identifiable, Codable {
    case tiny = "openai_whisper-tiny"
    case base = "openai_whisper-base"
    case small = "openai_whisper-small"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .tiny: return "快速"
        case .base: return "标准"
        case .small: return "精准"
        }
    }
    var detail: String {
        switch self {
        case .tiny: return "约 75MB，速度最快，准确度一般"
        case .base: return "约 145MB，推荐"
        case .small: return "约 480MB，更准，但慢不少"
        }
    }
}

enum SpokenLanguage: String, CaseIterable, Identifiable, Codable {
    case auto, zh, yue, en, ja, ko

    var id: String { rawValue }
    var title: String {
        switch self {
        case .auto: return "自动识别"
        case .zh: return "普通话"
        case .yue: return "粤语"
        case .en: return "English"
        case .ja: return "日本語"
        case .ko: return "한국어"
        }
    }
    /// 传给 Whisper 的语言代码；nil 表示自动判断
    var whisperCode: String? {
        switch self {
        case .auto: return nil
        case .yue: return "zh" // 标准模型里粤语按中文识别更稳
        default: return rawValue
        }
    }

    static func displayName(code: String) -> String {
        ["zh": "中文", "yue": "粤语", "en": "英语", "ja": "日语", "ko": "韩语", "fr": "法语", "de": "德语",
         "es": "西班牙语", "ru": "俄语", "it": "意大利语", "pt": "葡萄牙语", "th": "泰语", "vi": "越南语"][code] ?? code
    }
}

enum RecognitionStage: Equatable {
    case downloading(Double)
    case loading
    case detecting
    case detected(String)
    case transcribing(Double)
}

/// 用 WhisperKit 在本机识别，输出带时间戳的词
@MainActor
final class Recognizer {
    static let shared = Recognizer()

    private var pipe: WhisperKit?
    private var loadedModel: WhisperModel?

    /// 模型下载到 Application Support/Models，设置页可以删除
    static let modelsFolder: URL = {
        let url = URL.applicationSupportDirectory.appending(path: "Models", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    func unload() async {
        await pipe?.unloadModels()
        pipe = nil
        loadedModel = nil
    }

    func transcribe(audioURL: URL, model: WhisperModel, language: SpokenLanguage,
                    onStage: @escaping (RecognitionStage) -> Void) async throws -> (words: [TimedToken], language: String) {
        let pipe = try await prepare(model: model, onStage: onStage)
        let path = audioURL.path
        let audio = try await Task.detached(priority: .userInitiated) {
            try AudioProcessor.loadAudioAsFloatArray(fromPath: path)
        }.value

        var code = language.whisperCode
        if code == nil {
            onStage(.detecting)
            let detected = try await detectLanguage(pipe: pipe, audio: audio)
            code = detected
            onStage(.detected(detected))
        }

        onStage(.transcribing(0))
        let progressTask = Task { @MainActor in
            while !Task.isCancelled {
                onStage(.transcribing(pipe.progress.fractionCompleted))
                try? await Task.sleep(for: .milliseconds(300))
            }
        }
        defer { progressTask.cancel() }

        let options = DecodingOptions(task: .transcribe, language: code, detectLanguage: false,
                                      wordTimestamps: true, chunkingStrategy: .vad)
        let results = try await pipe.transcribe(audioArray: audio, decodeOptions: options)
        var words: [TimedToken] = []
        for result in results {
            for segment in result.segments {
                if let timings = segment.words, !timings.isEmpty {
                    for w in timings where !Self.isSpecial(w.word) {
                        words.append(TimedToken(text: w.word, start: Double(w.start), end: Double(w.end)))
                    }
                } else if !Self.isSpecial(segment.text) {
                    words.append(TimedToken(text: segment.text, start: Double(segment.start), end: Double(segment.end)))
                }
            }
        }
        return (words.sorted { $0.start < $1.start }, code ?? "en")
    }

    private func prepare(model: WhisperModel, onStage: @escaping (RecognitionStage) -> Void) async throws -> WhisperKit {
        if let pipe, loadedModel == model { return pipe }
        await unload()
        onStage(.downloading(0))
        let folder = try await WhisperKit.download(variant: model.rawValue, downloadBase: Self.modelsFolder) { progress in
            let fraction = progress.fractionCompleted
            Task { @MainActor in onStage(.downloading(fraction)) }
        }
        onStage(.loading)
        let config = WhisperKitConfig(modelFolder: folder.path, verbose: false, logLevel: .error,
                                      prewarm: false, load: true, download: false)
        let pipe = try await WhisperKit(config)
        self.pipe = pipe
        loadedModel = model
        return pipe
    }

    /// 从歌曲 20%、45%、70% 处各取 30 秒判断语言，避开纯音乐的前奏，取出现最多的结果
    private func detectLanguage(pipe: WhisperKit, audio: [Float]) async throws -> String {
        let window = 30 * WhisperKit.sampleRate
        let starts: [Int] = audio.count <= window ? [0] : [0.2, 0.45, 0.7].map { fraction in
            min(audio.count - window, max(0, Int(Double(audio.count) * fraction) - window / 2))
        }
        var votes: [String: Int] = [:]
        var order: [String] = []
        for start in starts {
            let slice = Array(audio[start..<min(audio.count, start + window)])
            guard let result = try? await pipe.detectLangauge(audioArray: slice) else { continue }
            if votes[result.language] == nil { order.append(result.language) }
            votes[result.language, default: 0] += 1
        }
        var best = order.first ?? "en"
        for lang in order where (votes[lang] ?? 0) > (votes[best] ?? 0) { best = lang }
        return best
    }

    /// 过滤 Whisper 的特殊标记（如 <|endoftext|>、[音乐]）
    private static func isSpecial(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespaces)
        return t.isEmpty || (t.hasPrefix("<|") && t.hasSuffix("|>"))
    }
}
