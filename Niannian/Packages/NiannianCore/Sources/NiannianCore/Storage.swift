import Foundation

/// App 和小组件共用的存储：App Group 容器里的 library.json 和 Avatars 文件夹
public enum SharedStorage {
    public static let appGroupID = "group.com.pangbobo17.niannian"

    /// 资料目录。拿不到 App Group（比如未签名的模拟器构建）时退回到 App 自己的 Documents
    public static var directory: URL {
        let fm = FileManager.default
        let base = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
            ?? fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Niannian", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var libraryURL: URL { directory.appendingPathComponent("library.json") }

    public static var avatarsDirectory: URL {
        let dir = directory.appendingPathComponent("Avatars", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// 某人的形象图片（PNG，透明背景）
    public static func avatarURL(for personID: UUID) -> URL {
        avatarsDirectory.appendingPathComponent("\(personID.uuidString).png")
    }

    public static func loadLibrary(from url: URL = libraryURL) -> Library {
        guard let data = try? Data(contentsOf: url) else { return Library() }
        return (try? decoder.decode(Library.self, from: data)) ?? Library()
    }

    public static func saveLibrary(_ library: Library, to url: URL = libraryURL) throws {
        let data = try encoder.encode(library)
        try data.write(to: url, options: .atomic)
    }

    public static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    public static let decoder = JSONDecoder()
}

/// 导出的备份：资料加上所有形象图片
public struct Backup: Codable, Sendable {
    public var version: Int
    public var exportedAt: Date
    public var library: Library
    /// 人物 id → PNG 数据
    public var avatars: [UUID: Data]

    public init(library: Library, avatars: [UUID: Data], exportedAt: Date = .now) {
        self.version = 1
        self.exportedAt = exportedAt
        self.library = library
        self.avatars = avatars
    }

    public func encoded() throws -> Data {
        try SharedStorage.encoder.encode(self)
    }

    public static func decode(_ data: Data) throws -> Backup {
        try SharedStorage.decoder.decode(Backup.self, from: data)
    }
}

public extension Library {
    /// 把备份合并进来：同一 id 的条目用备份里的覆盖，其余保留
    mutating func merge(_ other: Library) {
        func merged<T: Identifiable>(_ mine: [T], _ theirs: [T]) -> [T] {
            let ids = Set(theirs.map(\.id))
            return mine.filter { !ids.contains($0.id) } + theirs
        }
        people = merged(people, other.people)
        moments = merged(moments, other.moments)
        memories = merged(memories, other.memories)
        if currentPersonID == nil { currentPersonID = other.currentPersonID }
    }
}
