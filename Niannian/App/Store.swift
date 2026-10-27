import NiannianCore
import SwiftUI
import UserNotifications
import WidgetKit

enum AppTab: Hashable {
    case home, me
}

/// 全局弹出的页面
enum AppSheet: Identifiable {
    case create
    case newPerson
    case editPerson(Person)
    case newMemory(UUID)
    case editMemory(Memory)
    case newMoment(UUID)
    case editMoment(Moment)
    case chat(UUID)
    case moments

    var id: String {
        switch self {
        case .create: "create"
        case .newPerson: "newPerson"
        case .editPerson(let p): "person-\(p.id)"
        case .newMemory(let id): "newMemory-\(id)"
        case .editMemory(let m): "memory-\(m.id)"
        case .newMoment(let id): "newMoment-\(id)"
        case .editMoment(let m): "moment-\(m.id)"
        case .chat(let id): "chat-\(id)"
        case .moments: "moments"
        }
    }
}

@MainActor
@Observable
final class AppStore {
    var library: Library {
        didSet { persist(oldValue) }
    }
    var tab: AppTab = .home
    var sheet: AppSheet?
    var toast: String?

    @ObservationIgnored private var avatarCache: [String: UIImage] = [:]
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    init() {
        library = SharedStorage.loadLibrary()
        Reminders.reschedule(library)
    }

    var currentPerson: Person? { library.currentPerson }

    func show(_ message: String) {
        toast = message
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { toast = nil }
        }
    }

    private func persist(_ old: Library) {
        do {
            try SharedStorage.saveLibrary(library)
        } catch {
            show("保存失败：\(error.localizedDescription)")
        }
        WidgetCenter.shared.reloadAllTimelines()
        if old.moments != library.moments || old.people != library.people {
            Reminders.reschedule(library)
        }
    }

    // MARK: 人物

    func select(_ id: UUID) {
        library.currentPersonID = id
    }

    func save(_ person: Person, avatar: UIImage?) {
        var person = person
        if let avatar {
            do {
                try avatar.resized(maxSide: 700).pngData()?.write(to: SharedStorage.avatarURL(for: person.id), options: .atomic)
                person.avatarVersion += 1
            } catch {
                show("形象保存失败")
            }
        }
        if let i = library.people.firstIndex(where: { $0.id == person.id }) {
            library.people[i] = person
        } else {
            library.people.append(person)
            library.currentPersonID = person.id
        }
    }

    func delete(person id: UUID) {
        try? FileManager.default.removeItem(at: SharedStorage.avatarURL(for: id))
        library.removePerson(id)
    }

    func avatar(for person: Person) -> UIImage? {
        guard person.hasAvatar else { return nil }
        let key = "\(person.id)-\(person.avatarVersion)"
        if let cached = avatarCache[key] { return cached }
        let image = UIImage(contentsOfFile: SharedStorage.avatarURL(for: person.id).path)
        avatarCache[key] = image
        return image
    }

    // MARK: 时刻和小事

    func save(_ moment: Moment) {
        if let i = library.moments.firstIndex(where: { $0.id == moment.id }) {
            library.moments[i] = moment
        } else {
            library.moments.append(moment)
        }
        if moment.remindDaysBefore != nil {
            Task { await Reminders.requestAuthorization() }
        }
    }

    func delete(moment id: UUID) {
        library.moments.removeAll { $0.id == id }
    }

    func save(_ memory: Memory) {
        if let i = library.memories.firstIndex(where: { $0.id == memory.id }) {
            library.memories[i] = memory
        } else {
            library.memories.append(memory)
        }
    }

    func delete(memory id: UUID) {
        library.memories.removeAll { $0.id == id }
    }

    // MARK: 备份

    func makeBackupFile() throws -> URL {
        var avatars: [UUID: Data] = [:]
        for p in library.people where p.hasAvatar {
            avatars[p.id] = try? Data(contentsOf: SharedStorage.avatarURL(for: p.id))
        }
        let data = try Backup(library: library, avatars: avatars).encoded()
        let name = "念念备份-\(Date.now.formatted(.iso8601.year().month().day())).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try data.write(to: url, options: .atomic)
        return url
    }

    func restore(from url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let backup = try Backup.decode(Data(contentsOf: url))
            var restored = backup.library
            for (id, data) in backup.avatars {
                try data.write(to: SharedStorage.avatarURL(for: id), options: .atomic)
                // 版本号加一，让界面重新读取图片
                if let i = restored.people.firstIndex(where: { $0.id == id }) {
                    restored.people[i].avatarVersion = max(restored.people[i].avatarVersion,
                                                           (library.person(id)?.avatarVersion ?? 0)) + 1
                }
            }
            var merged = library
            merged.merge(restored)
            library = merged
            show("已恢复 \(backup.library.people.count) 位人物")
        } catch {
            show("这个文件读不出来")
        }
    }

    // MARK: 示例

    func loadSample() {
        let cal = Calendar.current
        let now = Date.now
        func date(daysFromNow d: Int) -> Date { cal.date(byAdding: .day, value: d, to: now) ?? now }
        func birthday(yearsAgo y: Int, daysFromNow d: Int) -> Date {
            cal.date(byAdding: .year, value: -y, to: date(daysFromNow: d)) ?? now
        }

        let kid = Person(name: "小菠萝", relation: "儿子", about: "四年级，喜欢乐高、编程和动手做东西，最近迷上用 AI 做手工。")
        let wife = Person(name: "老婆", relation: "老婆", about: "喜欢花、咖啡和周末去郊外走走。")
        let father = Person(name: "岳父", relation: "岳父", about: "爱下象棋，血压有点高。")
        library.people += [kid, wife, father]
        library.moments += [
            Moment(personID: kid.id, title: "GESP 考试", kind: .exam, date: date(daysFromNow: 57)),
            Moment(personID: kid.id, title: "生日", kind: .birthday, date: birthday(yearsAgo: 10, daysFromNow: 213)),
            Moment(personID: wife.id, title: "生日", kind: .birthday, date: birthday(yearsAgo: 34, daysFromNow: 32)),
            Moment(personID: wife.id, title: "结婚纪念日", kind: .anniversary, date: birthday(yearsAgo: 12, daysFromNow: 72)),
            Moment(personID: father.id, title: "生日", kind: .birthday, date: birthday(yearsAgo: 65, daysFromNow: 8)),
        ]
        library.memories += [
            Memory(personID: kid.id, title: "在家自学的五天", text: "这周没去上课，在家也没闲着，把学校作业做了，还自己搭了一个乐高机器人。", date: date(daysFromNow: -1)),
            Memory(personID: kid.id, title: "看电视超时被批评", text: "看电视超时被批评，后来自己定了每天 30 分钟的规矩。", date: date(daysFromNow: -3)),
            Memory(personID: kid.id, title: "想要 Arduino 套件", text: "说同学有一套 Arduino 入门套件，能做会动的小车，很羡慕。", date: date(daysFromNow: -6)),
            Memory(personID: wife.id, title: "", text: "说公司楼下新开的花店很好看，想要一束洋桔梗。", date: date(daysFromNow: -2)),
            Memory(personID: father.id, title: "", text: "电话里说最近膝盖有点疼，下楼梯不方便。", date: date(daysFromNow: -4)),
        ]
        library.currentPersonID = kid.id
        show("已添加示例")
    }
}

extension UIImage {
    /// 按最长边缩小（不放大），顺便把方向转正
    func resized(maxSide: CGFloat) -> UIImage {
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

/// 重要时刻的本地提醒：每个时刻只排下一次，App 每次打开或修改时重排
enum Reminders {
    static func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    }

    static func reschedule(_ library: Library) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        let cal = Calendar.current
        let now = Date.now
        var requests: [(Date, UNNotificationRequest)] = []
        for u in library.upcoming(from: now) where !u.isPast {
            guard let before = u.moment.remindDaysBefore,
                  let day = cal.date(byAdding: .day, value: -before, to: u.date),
                  let fire = cal.date(bySettingHour: 9, minute: 0, second: 0, of: day),
                  fire > now else { continue }
            let name = library.person(u.moment.personID)?.name ?? ""
            let content = UNMutableNotificationContent()
            content.title = "\(u.moment.kind.emoji) \(name)的\(u.moment.title)"
            content.body = before == 0 ? "就是今天，别忘了。" : "还有 \(before) 天（\(u.date.chineseMonthDay)），提前准备一下吧。"
            content.sound = .default
            let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            requests.append((fire, UNNotificationRequest(identifier: u.moment.id.uuidString, content: content, trigger: trigger)))
        }
        // 系统最多保留 64 个待发提醒
        for (_, r) in requests.sorted(by: { $0.0 < $1.0 }).prefix(60) {
            center.add(r)
        }
    }
}
