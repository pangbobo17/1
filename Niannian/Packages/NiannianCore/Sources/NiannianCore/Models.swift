import Foundation

/// 惦记的人
public struct Person: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    /// 关系，比如“老婆”“岳父”“侄女”
    public var relation: String
    /// 关于 TA：性格、喜好之类，一两句话
    public var about: String
    /// 形象图片的版本号，换形象时加一，用来让界面和小组件刷新缓存
    public var avatarVersion: Int
    public var createdAt: Date

    public init(id: UUID = UUID(), name: String, relation: String = "", about: String = "",
                avatarVersion: Int = 0, createdAt: Date = .now) {
        self.id = id
        self.name = name
        self.relation = relation
        self.about = about
        self.avatarVersion = avatarVersion
        self.createdAt = createdAt
    }

    public var hasAvatar: Bool { avatarVersion > 0 }
}

public enum MomentKind: String, Codable, CaseIterable, Sendable {
    case birthday, anniversary, exam, festival, other

    public var title: String {
        switch self {
        case .birthday: "生日"
        case .anniversary: "纪念日"
        case .exam: "考试"
        case .festival: "节日"
        case .other: "其他"
        }
    }

    public var emoji: String {
        switch self {
        case .birthday: "🎂"
        case .anniversary: "💐"
        case .exam: "📝"
        case .festival: "🏮"
        case .other: "📌"
        }
    }

    /// 生日、纪念日、节日默认每年重复
    public var repeatsByDefault: Bool { self != .exam && self != .other }
}

/// 重要时刻：生日、纪念日、考试……
public struct Moment: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var personID: UUID
    public var title: String
    public var kind: MomentKind
    public var date: Date
    public var repeatsYearly: Bool
    /// 提前几天提醒；nil 表示不提醒
    public var remindDaysBefore: Int?

    public init(id: UUID = UUID(), personID: UUID, title: String, kind: MomentKind = .other,
                date: Date, repeatsYearly: Bool? = nil, remindDaysBefore: Int? = 1) {
        self.id = id
        self.personID = personID
        self.title = title
        self.kind = kind
        self.date = date
        self.repeatsYearly = repeatsYearly ?? kind.repeatsByDefault
        self.remindDaysBefore = remindDaysBefore
    }
}

/// 小事记录
public struct Memory: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var personID: UUID
    /// AI 整理出的标题，或用户自己写的；可以为空
    public var title: String
    public var text: String
    /// 事情发生的日期；不填就是 nil
    public var date: Date?
    public var createdAt: Date

    public init(id: UUID = UUID(), personID: UUID, title: String = "", text: String,
                date: Date? = nil, createdAt: Date = .now) {
        self.id = id
        self.personID = personID
        self.title = title
        self.text = text
        self.date = date
        self.createdAt = createdAt
    }

    /// 列表里显示的标题：没有标题时取正文第一行
    public var displayTitle: String {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return t }
        let first = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? text
        return first.count > 20 ? String(first.prefix(20)) + "…" : first
    }

    /// 排序和显示用的日期
    public var sortDate: Date { date ?? createdAt }
}

/// 桌面小组件设置
public struct WidgetSettings: Codable, Hashable, Sendable {
    public enum Scope: String, Codable, CaseIterable, Sendable {
        /// 提醒所有人的事
        case everyone
        /// 只提醒画面中那个人的事
        case shownPerson

        public var title: String {
            switch self {
            case .everyone: "所有人"
            case .shownPerson: "画面中的人"
            }
        }
    }

    /// 轮流展示的人；为空时展示首页当前的人
    public var personIDs: [UUID]
    public var scope: Scope

    public init(personIDs: [UUID] = [], scope: Scope = .everyone) {
        self.personIDs = personIDs
        self.scope = scope
    }
}

/// 全部资料，整体存成一个 JSON
public struct Library: Codable, Hashable, Sendable {
    public var people: [Person]
    public var moments: [Moment]
    public var memories: [Memory]
    public var currentPersonID: UUID?
    public var widget: WidgetSettings

    public init(people: [Person] = [], moments: [Moment] = [], memories: [Memory] = [],
                currentPersonID: UUID? = nil, widget: WidgetSettings = WidgetSettings()) {
        self.people = people
        self.moments = moments
        self.memories = memories
        self.currentPersonID = currentPersonID
        self.widget = widget
    }

    // 旧版本文件里缺少的字段用默认值
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        people = try c.decodeIfPresent([Person].self, forKey: .people) ?? []
        moments = try c.decodeIfPresent([Moment].self, forKey: .moments) ?? []
        memories = try c.decodeIfPresent([Memory].self, forKey: .memories) ?? []
        currentPersonID = try c.decodeIfPresent(UUID.self, forKey: .currentPersonID)
        widget = try c.decodeIfPresent(WidgetSettings.self, forKey: .widget) ?? WidgetSettings()
    }

    public func person(_ id: UUID?) -> Person? {
        guard let id else { return nil }
        return people.first { $0.id == id }
    }

    /// 首页当前的人：记住的那个，没有就取第一个
    public var currentPerson: Person? {
        person(currentPersonID) ?? people.first
    }

    /// 某人的小事，新的在前
    public func memories(of personID: UUID) -> [Memory] {
        memories.filter { $0.personID == personID }.sorted { $0.sortDate > $1.sortDate }
    }

    /// 接下来的重要时刻，最近的在前；已经过去且不重复的排在最后
    public func upcoming(for personID: UUID? = nil, from now: Date = .now,
                        calendar: Calendar = .current) -> [UpcomingMoment] {
        moments
            .filter { personID == nil || $0.personID == personID }
            .map { UpcomingMoment(moment: $0, from: now, calendar: calendar) }
            .sorted { a, b in
                if a.isPast != b.isPast { return !a.isPast }
                return a.isPast ? a.days > b.days : a.days < b.days
            }
    }

    /// 删除一个人以及 TA 的时刻和小事
    public mutating func removePerson(_ id: UUID) {
        people.removeAll { $0.id == id }
        moments.removeAll { $0.personID == id }
        memories.removeAll { $0.personID == id }
        widget.personIDs.removeAll { $0 == id }
        if currentPersonID == id { currentPersonID = people.first?.id }
    }
}
