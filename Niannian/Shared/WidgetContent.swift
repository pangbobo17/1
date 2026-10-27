import NiannianCore
import SwiftUI
import UIKit
import WidgetKit

/// 小组件一条时间线上的内容。App 里的小组件预览也用它
struct NiannianEntry: TimelineEntry {
    struct Item: Hashable {
        var emoji: String
        var title: String
        var personName: String
        var upcoming: UpcomingMoment
    }

    var date: Date
    var personName: String?
    var avatar: UIImage?
    var items: [Item]

    static let placeholder = NiannianEntry(date: .now, personName: "小菠萝", avatar: nil, items: [])

    /// 按设置算出接下来几个小时的内容：选了多个形象时每小时换一个人
    static func timeline(from library: Library, now: Date = .now, hours: Int = 12) -> [NiannianEntry] {
        var people = library.widget.personIDs.compactMap { library.person($0) }
        if people.isEmpty, let p = library.currentPerson { people = [p] }
        guard !people.isEmpty else { return [NiannianEntry(date: now, personName: nil, avatar: nil, items: [])] }

        var avatars: [UUID: UIImage] = [:]
        for p in people where p.hasAvatar {
            avatars[p.id] = UIImage(contentsOfFile: SharedStorage.avatarURL(for: p.id).path)
        }
        let count = people.count == 1 ? 1 : hours
        return (0..<count).map { i in
            let date = Calendar.current.date(byAdding: .hour, value: i, to: now) ?? now
            let person = people[i % people.count]
            let scopeID = library.widget.scope == .shownPerson ? person.id : nil
            let items = library.upcoming(for: scopeID, from: date)
                .filter { !$0.isPast }
                .prefix(3)
                .map { u in
                    Item(emoji: u.moment.kind.emoji, title: u.moment.title,
                         personName: library.person(u.moment.personID)?.name ?? "", upcoming: u)
                }
            return NiannianEntry(date: date, personName: person.name, avatar: avatars[person.id], items: items)
        }
    }
}

struct NiannianWidgetView: View {
    var entry: NiannianEntry
    var family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryRectangular: rectangular
        case .systemSmall: small
        default: medium
        }
    }

    private var figure: some View {
        Group {
            if let avatar = entry.avatar {
                Image(uiImage: avatar).resizable().scaledToFit()
            } else {
                PlaceholderFigure(name: entry.personName ?? "念")
            }
        }
    }

    private var logo: some View {
        HStack(spacing: 3) {
            Text("念念").font(.system(size: 13, weight: .black, design: .rounded))
            Circle().fill(Color.lime).frame(width: 5, height: 5)
        }
        .foregroundStyle(Color.ink)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                logo
                Spacer()
            }
            HStack(alignment: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Spacer(minLength: 0)
                    if let first = entry.items.first {
                        Text(first.title).font(.caption.weight(.semibold)).lineLimit(2)
                        Text(first.personName).font(.caption2).foregroundStyle(Color.inkSecondary).lineLimit(1)
                        let parts = first.upcoming.labelParts
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(parts.number).font(.system(size: 30, weight: .heavy, design: .rounded))
                            Text(parts.unit).font(.caption2.weight(.semibold))
                        }
                    } else {
                        Text("还没有重要时刻").font(.caption).foregroundStyle(Color.inkSecondary)
                    }
                }
                Spacer(minLength: 0)
                figure.frame(width: 62)
            }
        }
        .foregroundStyle(Color.ink)
    }

    private var medium: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading) {
                logo
                Spacer(minLength: 0)
                figure.frame(maxHeight: 110)
            }
            .frame(width: 90)
            VStack(alignment: .leading, spacing: 8) {
                Text("近期念念").font(.caption2.weight(.semibold)).foregroundStyle(Color.inkSecondary)
                if entry.items.isEmpty {
                    Spacer()
                    Text("在 App 里添加生日、纪念日，这里会提醒你").font(.caption).foregroundStyle(Color.inkSecondary)
                    Spacer()
                }
                ForEach(entry.items, id: \.self) { item in
                    HStack(spacing: 8) {
                        Text(item.emoji).font(.title3)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(item.title).font(.caption.weight(.semibold)).lineLimit(1)
                            Text(item.personName).font(.caption2).foregroundStyle(Color.inkSecondary).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Text(item.upcoming.label)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .foregroundStyle(Color.ink)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let first = entry.items.first {
                Text("\(first.emoji) \(first.title)").font(.headline).lineLimit(1)
                Text(first.personName).font(.caption).lineLimit(1)
                Text(first.upcoming.label).font(.caption.weight(.bold))
            } else {
                Text("念念").font(.headline)
                Text("暂无重要时刻").font(.caption)
            }
        }
    }
}
