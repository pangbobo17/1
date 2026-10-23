import Foundation
import LyricsAlignCore
import Observation
import SwiftUI

enum LineLength: String, CaseIterable, Identifiable, Codable {
    case short, normal, long

    var id: String { rawValue }
    var title: String {
        switch self {
        case .short: return "短"
        case .normal: return "标准"
        case .long: return "长"
        }
    }
    /// 每行最多几个字（中日韩）或几个词（其他语言）
    func maxUnits(cjk: Bool) -> Int {
        switch self {
        case .short: return cjk ? 10 : 6
        case .normal: return cjk ? 16 : 9
        case .long: return cjk ? 24 : 13
        }
    }
}

enum AppTab: Hashable {
    case create, timeline, library, settings
}

/// 歌名 → 主色色相（每首歌一个颜色）
func songHue(_ name: String) -> Double {
    var h = 0
    for scalar in name.unicodeScalars { h = (h * 31 + Int(scalar.value)) % 360 }
    return Double(h)
}

@MainActor
@Observable
final class AppModel {
    var tab: AppTab = .create
    let store = ProjectStore()
    let player = AudioPlayer()

    // 设置
    var defaultLanguage: SpokenLanguage { didSet { defaults.set(defaultLanguage.rawValue, forKey: "defaultLanguage"); language = defaultLanguage } }
    var defaultModel: WhisperModel { didSet { defaults.set(defaultModel.rawValue, forKey: "defaultModel"); model = defaultModel } }

    // 制作页草稿
    var mode: ProjectKind { didSet { defaults.set(mode.rawValue, forKey: "mode") } }
    var lyricsText: String { didSet { defaults.set(lyricsText, forKey: "lyrics") } }
    var language: SpokenLanguage
    var model: WhisperModel
    var script: ChineseScript { didSet { defaults.set(script.rawValue, forKey: "script") } }
    var lineLength: LineLength { didSet { defaults.set(lineLength.rawValue, forKey: "lineLength") } }
    private(set) var draftAudio: URL?
    private(set) var draftName = ""
    private(set) var draftDuration: TimeInterval = 0
    private(set) var draftPeaks: [Float] = []
    private(set) var isImportingAudio = false

    // 识别进度
    private(set) var busy = false
    private(set) var status: String?
    private(set) var progress: Double?
    var errorMessage: String?

    // 当前打开的作品
    private(set) var project: Project?
    private(set) var undoStack: [[AlignedLine]] = []
    var toastMessage: String?

    @ObservationIgnored private let defaults = UserDefaults.standard
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    init() {
        let lang = SpokenLanguage(rawValue: defaults.string(forKey: "defaultLanguage") ?? "") ?? .auto
        let model = WhisperModel(rawValue: defaults.string(forKey: "defaultModel") ?? "") ?? .base
        defaultLanguage = lang
        defaultModel = model
        language = lang
        self.model = model
        mode = ProjectKind(rawValue: defaults.string(forKey: "mode") ?? "") ?? .lyrics
        lyricsText = defaults.string(forKey: "lyrics") ?? ""
        script = ChineseScript(rawValue: defaults.string(forKey: "script") ?? "") ?? .simplified
        lineLength = LineLength(rawValue: defaults.string(forKey: "lineLength") ?? "") ?? .normal
        if let id = defaults.string(forKey: "lastProject"), let p = store.projects.first(where: { $0.id.uuidString == id }) {
            open(p)
        }
    }

    var hue: Double {
        if tab == .create, !draftName.isEmpty { return songHue(draftName) }
        return project?.hue ?? 14
    }

    var lyricLines: [String] { LyricsText.lines(from: lyricsText) }

    func toast(_ message: String) {
        toastMessage = message
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2.4))
            if !Task.isCancelled { toastMessage = nil }
        }
    }

    // MARK: - 制作

    func importAudio(_ url: URL) async {
        isImportingAudio = true
        defer { isImportingAudio = false }
        errorMessage = nil
        do {
            let local = try await AudioTools.importMedia(from: url)
            let (duration, peaks) = await Task.detached(priority: .userInitiated) {
                (AudioTools.duration(of: local), AudioTools.peaks(of: local))
            }.value
            draftAudio = local
            draftName = url.deletingPathExtension().lastPathComponent
            draftDuration = duration
            draftPeaks = peaks
        } catch {
            toast("这个文件读不出声音，换一个试试")
        }
    }

    func runRecognition() async {
        guard let audio = draftAudio, !busy else { return }
        busy = true
        errorMessage = nil
        defer { busy = false; status = nil; progress = nil }
        let mode = self.mode
        var heard = ""
        do {
            let result = try await Recognizer.shared.transcribe(audioURL: audio, model: model, language: language) { [weak self] stage in
                guard let self else { return }
                switch stage {
                case .downloading(let f): status = "下载识别模型（仅首次）"; progress = f
                case .loading: status = "正在加载模型…"; progress = nil
                case .detecting: status = "正在判断语言…"; progress = nil
                case .detected(let code): heard = SpokenLanguage.displayName(code: code)
                case .transcribing(let f): status = heard.isEmpty ? "正在听歌识词…" : "听出是\(heard)，正在识别…"; progress = f
                }
            }
            let lang = language == .auto ? result.language : language.rawValue

            let lyricLines = mode == .lyrics ? self.lyricLines : []
            var lines: [AlignedLine]
            if !lyricLines.isEmpty {
                status = "正在逐行对齐…"
                progress = 1
                var options = AlignmentOptions()
                if lang == "zh" { options.phonetic = { Phonetic.pinyin($0) } }
                let words = result.words
                let duration = draftDuration
                lines = await Task.detached(priority: .userInitiated) {
                    LyricsAligner.align(lines: lyricLines, recognized: words, duration: duration, options: options)
                }.value
            } else {
                let cjk = ["zh", "yue", "ja", "ko"].contains(lang)
                let length = mode == .subtitle ? lineLength : .normal
                lines = LineSegmenter.lines(from: result.words, maxUnitsPerLine: length.maxUnits(cjk: cjk))
                if lang == "zh" || lang == "yue" {
                    let script = mode == .subtitle ? self.script : .simplified
                    for i in lines.indices {
                        lines[i].text = script.convert(lines[i].text)
                        for k in lines[i].words.indices { lines[i].words[k].text = script.convert(lines[i].words[k].text) }
                    }
                }
            }
            guard !lines.isEmpty else {
                errorMessage = mode == .subtitle ? "没有识别到人声。检查一下语言设置。" : "没有识别到人声。检查一下语言设置，或者用手动打点。"
                return
            }
            try createProject(lines: lines, kind: mode, language: lang)
            tab = .timeline
            let prefix = language == .auto ? "识别为\(heard)，" : ""
            if mode == .subtitle {
                toast("\(prefix)共 \(lines.count) 条字幕，点时间可以改字")
            } else {
                let low = lines.filter(\.needsReview).count
                toast(prefix + (low > 0 ? "有 \(low) 句需要检查" : "播放核对一下"))
            }
        } catch {
            errorMessage = "识别失败：\(error.localizedDescription)。可以换“快速”模型重试，或者用手动打点。"
        }
    }

    func startManual() {
        let lines = lyricLines.map { AlignedLine(text: $0, start: nil, end: nil) }
        guard !lines.isEmpty, draftAudio != nil else { return }
        do {
            try createProject(lines: lines, kind: .lyrics, language: language.rawValue)
            tab = .timeline
            toast("播放歌曲，每句开口时点“打点”")
        } catch {
            errorMessage = "保存失败：\(error.localizedDescription)"
        }
    }

    private func createProject(lines: [AlignedLine], kind: ProjectKind, language: String) throws {
        guard let audio = draftAudio else { return }
        let draft = Project(kind: kind, name: draftName, hue: songHue(draftName),
                            lyrics: kind == .subtitle ? "" : lyricsText, lines: lines, language: language,
                            model: model.rawValue, duration: draftDuration, peaks: draftPeaks, audioFileName: "")
        open(try store.create(draft, audioFrom: audio))
    }

    // MARK: - 作品

    func open(_ project: Project) {
        if self.project?.id != project.id {
            player.load(url: store.audioURL(for: project))
        }
        self.project = project
        undoStack = []
        defaults.set(project.id.uuidString, forKey: "lastProject")
    }

    func delete(_ project: Project) {
        if self.project?.id == project.id {
            player.unload()
            self.project = nil
        }
        store.delete(project)
    }

    // MARK: - 编辑时间轴

    func edit(_ change: (inout [AlignedLine]) -> Void) {
        guard var p = project else { return }
        undoStack.append(p.lines)
        if undoStack.count > 100 { undoStack.removeFirst() }
        change(&p.lines)
        project = p
        scheduleSave()
    }

    func undo() {
        guard var p = project, let last = undoStack.popLast() else { return }
        p.lines = last
        project = p
        scheduleSave()
    }

    /// 设置第 i 句的开始时间，并把上一句（没有逐字时间的）结束时间接上
    func setStart(_ i: Int, to time: TimeInterval) {
        edit { lines in
            guard lines.indices.contains(i) else { return }
            lines[i].setStart(time)
            if i > 0, let prevStart = lines[i - 1].start, lines[i - 1].words.isEmpty, let t = lines[i].start, t > prevStart {
                lines[i - 1].end = t
            }
        }
    }

    func currentIndex(at time: TimeInterval) -> Int? {
        project?.lines.lastIndex { ($0.start ?? .infinity) <= time + 0.01 }
    }

    /// 打点目标：还有没打点的句子就按顺序打；都打过了就打当前句的下一句
    func tapTarget(at time: TimeInterval) -> Int? {
        guard let lines = project?.lines else { return nil }
        if let i = lines.firstIndex(where: { $0.start == nil }) { return i }
        let next = (currentIndex(at: time) ?? -1) + 1
        return next < lines.count ? next : nil
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled, let p = project else { return }
            try? store.save(p)
        }
    }
}
