import Foundation
import LyricsAlignCore
import Observation

enum ProjectKind: String, Codable {
    case lyrics, subtitle
}

/// 一首歌（或一段视频）的作品：歌词/字幕、时间轴和音频文件
struct Project: Identifiable, Codable, Equatable {
    var id = UUID()
    var kind: ProjectKind
    var name: String
    var hue: Double
    var lyrics: String
    var lines: [AlignedLine]
    var language: String
    var model: String
    var duration: TimeInterval
    var peaks: [Float]
    var audioFileName: String
    var createdAt = Date()
    var updatedAt = Date()

    var untimedCount: Int { lines.filter { $0.start == nil }.count }
    var reviewCount: Int { lines.filter(\.needsReview).count }
}

/// 作品保存在 App 的 Documents/Projects 里：每个作品一个 JSON，加上一份音频文件
@MainActor
@Observable
final class ProjectStore {
    private(set) var projects: [Project] = []

    let folder: URL = {
        let url = URL.documentsDirectory.appending(path: "Projects", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    init() {
        load()
    }

    func audioURL(for project: Project) -> URL {
        folder.appending(path: project.audioFileName)
    }

    func load() {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        let decoder = JSONDecoder()
        projects = files.filter { $0.pathExtension == "json" }
            .compactMap { try? decoder.decode(Project.self, from: Data(contentsOf: $0)) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    /// 新建作品：把音频复制进 App
    func create(_ project: Project, audioFrom source: URL) throws -> Project {
        var project = project
        project.audioFileName = "\(project.id.uuidString).\(source.pathExtension.isEmpty ? "m4a" : source.pathExtension)"
        let dest = audioURL(for: project)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.copyItem(at: source, to: dest)
        try save(project)
        return project
    }

    func save(_ project: Project) throws {
        var project = project
        project.updatedAt = Date()
        let data = try JSONEncoder().encode(project)
        try data.write(to: folder.appending(path: "\(project.id.uuidString).json"), options: .atomic)
        if let i = projects.firstIndex(where: { $0.id == project.id }) {
            projects[i] = project
        } else {
            projects.insert(project, at: 0)
        }
        projects.sort { $0.updatedAt > $1.updatedAt }
    }

    func delete(_ project: Project) {
        try? FileManager.default.removeItem(at: folder.appending(path: "\(project.id.uuidString).json"))
        try? FileManager.default.removeItem(at: audioURL(for: project))
        projects.removeAll { $0.id == project.id }
    }
}
