import NiannianCore
import SwiftUI

/// 白色圆角卡片
struct CardModifier: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardModifier(padding: padding)) }
}

/// 青柠色大按钮
struct LimeButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.lime.opacity(isEnabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.25), value: configuration.isPressed)
    }
}

/// 小胶囊按钮
struct ChipStyle: ButtonStyle {
    var selected = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(selected ? Color.lime : Color.limeSoft.opacity(0.6), in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// 人物形象：有图片用图片，没有用占位小人
struct AvatarView: View {
    @Environment(AppStore.self) private var store
    var person: Person

    var body: some View {
        if let image = store.avatar(for: person) {
            Image(uiImage: image).resizable().scaledToFit()
        } else {
            PlaceholderFigure(name: person.name)
        }
    }
}

/// 首页的大形象：轻轻呼吸，点一下会晃一晃
struct LivelyAvatar: View {
    var person: Person
    @State private var wiggle = 0.0

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            AvatarView(person: person)
                .scaleEffect(x: 1, y: 1 + 0.012 * sin(t * 2.2), anchor: .bottom)
                .offset(y: -3 * sin(t * 1.1))
                .rotationEffect(.degrees(wiggle * sin(t * 18)), anchor: .bottom)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            wiggle = 4
            withAnimation(.easeOut(duration: 0.9)) { wiggle = 0 }
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        }
    }
}

/// 会眨眼的团团
struct BlinkingMascot: View {
    @State private var blink = false

    var body: some View {
        Mascot(blink: blink)
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(Double.random(in: 2.5...5)))
                    withAnimation(.easeInOut(duration: 0.08)) { blink = true }
                    try? await Task.sleep(for: .milliseconds(140))
                    withAnimation(.easeInOut(duration: 0.08)) { blink = false }
                }
            }
    }
}

/// 页面分区标题：“重要时刻  2  >”
struct SectionHeader: View {
    var title: String
    var count: Int? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            if let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        if let count { Text("\(count)") }
                        Image(systemName: "chevron.right")
                    }
                    .font(.subheadline)
                    .foregroundStyle(Color.inkSecondary)
                }
            } else if let count {
                Text("\(count)").font(.subheadline).foregroundStyle(Color.inkSecondary)
            }
        }
        .padding(.horizontal, 4)
    }
}

/// “57 天后”
struct DaysBadge: View {
    var upcoming: UpcomingMoment

    var body: some View {
        let parts = upcoming.labelParts
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(parts.number).font(.system(.title3, design: .rounded).weight(.heavy))
            if !parts.unit.isEmpty { Text(parts.unit).font(.caption.weight(.semibold)) }
        }
        .foregroundStyle(upcoming.isPast ? Color.inkSecondary : Color.ink)
    }
}

/// 重要时刻的一行
struct MomentRow: View {
    var upcoming: UpcomingMoment
    var personName: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Text(upcoming.moment.kind.emoji)
                .font(.title2)
                .frame(width: 44, height: 44)
                .background(Color.limeSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(upcoming.moment.title).font(.body.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(Color.inkSecondary)
            }
            Spacer()
            DaysBadge(upcoming: upcoming)
        }
        .foregroundStyle(Color.ink)
    }

    private var subtitle: String {
        var parts: [String] = []
        if let personName { parts.append(personName) }
        parts.append(upcoming.date.chineseDate)
        if upcoming.moment.kind == .birthday, let y = upcoming.years { parts.append("\(y) 岁") }
        else if upcoming.moment.kind == .anniversary, let y = upcoming.years { parts.append("第 \(y) 年") }
        return parts.joined(separator: " · ")
    }
}

/// 小事的一行
struct MemoryRow: View {
    var memory: Memory

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(memory.displayTitle).font(.body.weight(.semibold)).lineLimit(1)
            Text(memory.sortDate.chineseDate).font(.caption).foregroundStyle(Color.inkSecondary)
            if !memory.title.isEmpty {
                Text(memory.text).font(.subheadline).foregroundStyle(Color.inkSecondary).lineLimit(2)
            }
        }
        .foregroundStyle(Color.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 有占位文字的多行输入框
struct PlaceholderEditor: View {
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 120

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(Color.inkSecondary.opacity(0.7))
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .frame(minHeight: minHeight)
        }
    }
}
