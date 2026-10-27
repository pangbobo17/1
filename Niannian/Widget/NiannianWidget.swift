import NiannianCore
import SwiftUI
import WidgetKit

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> NiannianEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (NiannianEntry) -> Void) {
        completion(NiannianEntry.timeline(from: SharedStorage.loadLibrary(), hours: 1).first ?? .placeholder)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NiannianEntry>) -> Void) {
        let entries = NiannianEntry.timeline(from: SharedStorage.loadLibrary())
        // 过了零点天数会变，最晚在明天零点刷新
        let midnight = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now)
        let next = min(entries.last.map { $0.date.addingTimeInterval(3600) } ?? midnight, midnight)
        completion(Timeline(entries: entries, policy: .after(next)))
    }
}

struct NiannianWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: NiannianEntry

    var body: some View {
        NiannianWidgetView(entry: entry, family: family)
    }
}

struct NiannianWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NiannianWidget", provider: Provider()) { entry in
            NiannianWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { Color.cream }
        }
        .configurationDisplayName("念念")
        .description("在桌面看见在意的人和接下来的重要日子。")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

@main
struct NiannianWidgetBundle: WidgetBundle {
    var body: some Widget {
        NiannianWidget()
    }
}
