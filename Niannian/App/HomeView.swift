import NiannianCore
import SwiftUI

struct HomeView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        if let person = store.currentPerson {
            PersonPage(person: person)
                .id(person.id)
                .transition(.opacity)
        } else {
            EmptyHome()
        }
    }
}

/// 还没有人物时
struct EmptyHome: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(spacing: 18) {
            Logo().frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
            BlinkingMascot().frame(width: 140, height: 140)
            Text("找到你在意的人").font(.largeTitle.bold())
            Text("为每个人留住重要日子和日常小事。\n生日、纪念日提前提醒，想送礼时问问团团。")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.inkSecondary)
            Spacer()
            Button("添加第一个人") { store.sheet = .newPerson }
                .buttonStyle(LimeButtonStyle())
            Button("先看看示例") { store.loadSample() }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.inkSecondary)
        }
        .padding(24)
    }
}

struct Logo: View {
    var body: some View {
        HStack(spacing: 4) {
            Text("念念").font(.system(size: 22, weight: .black, design: .rounded))
            Circle().fill(Color.lime).frame(width: 8, height: 8)
        }
        .foregroundStyle(Color.ink)
    }
}

/// 某个人的主页
struct PersonPage: View {
    @Environment(AppStore.self) private var store
    var person: Person

    private var upcoming: [UpcomingMoment] { store.library.upcoming(for: person.id) }
    private var memories: [Memory] { store.library.memories(of: person.id) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                stage
                if let next = upcoming.first(where: { !$0.isPast }) {
                    Button { store.sheet = .editMoment(next.moment) } label: { nextCard(next) }
                }
                momentsSection
                memoriesSection
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Logo()
                Spacer()
                Button {
                    store.tab = .me
                } label: {
                    Label("小组件", systemImage: "square.grid.2x2")
                }
                .buttonStyle(ChipStyle())
            }
            HStack(spacing: 8) {
                Text(person.name)
                    .font(.system(size: 34, weight: .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Button {
                    store.sheet = .editPerson(person)
                } label: {
                    Image(systemName: "pencil").font(.title3.weight(.bold))
                }
                .accessibilityLabel("编辑\(person.name)")
                Spacer()
                PeopleSwitcher(current: person)
                Button("重要时刻") { store.sheet = .moments }
                    .buttonStyle(ChipStyle(selected: true))
            }
            .foregroundStyle(Color.ink)
            if !person.relation.isEmpty || !person.about.isEmpty {
                Text([person.relation, person.about].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(Color.inkSecondary)
                    .lineLimit(2)
            }
        }
    }

    /// 形象站在一块浅绿色地面上，右下角是团团
    private var stage: some View {
        ZStack(alignment: .bottomTrailing) {
            Ellipse()
                .fill(Color.limeSoft.opacity(0.7))
                .frame(height: 50)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.horizontal, 10)
            LivelyAvatar(person: person)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 22)
                .padding(.horizontal, 40)
            Button {
                store.sheet = .chat(person.id)
            } label: {
                VStack(spacing: -6) {
                    BlinkingMascot().frame(width: 62, height: 62)
                    Text("问问团团")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.white, in: Capsule())
                        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
                }
                .foregroundStyle(Color.ink)
            }
            .padding(.bottom, 4)
        }
        .frame(height: 380)
    }

    private func nextCard(_ next: UpcomingMoment) -> some View {
        HStack(spacing: 12) {
            Text(next.moment.kind.emoji).font(.largeTitle)
            VStack(alignment: .leading, spacing: 2) {
                Text("下一个重要时刻").font(.caption).foregroundStyle(Color.inkSecondary)
                Text(next.moment.title).font(.title3.bold())
                Text(next.date.chineseMonthDay).font(.caption).foregroundStyle(Color.inkSecondary)
            }
            Spacer()
            DaysBadge(upcoming: next)
            Image(systemName: "chevron.right").foregroundStyle(Color.inkSecondary)
        }
        .foregroundStyle(Color.ink)
        .card()
    }

    private var momentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "重要时刻", count: upcoming.count) { store.sheet = .moments }
            VStack(spacing: 0) {
                ForEach(upcoming.prefix(4)) { u in
                    Button { store.sheet = .editMoment(u.moment) } label: { MomentRow(upcoming: u).padding(.vertical, 8) }
                    Divider().opacity(u.id == upcoming.prefix(4).last?.id ? 0 : 1)
                }
                addButton("添加生日、纪念日") { store.sheet = .newMoment(person.id) }
            }
            .card(padding: 12)
        }
    }

    private var memoriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "小事记录", count: memories.count)
            VStack(spacing: 0) {
                if memories.isEmpty {
                    Text("最近关于 TA，有什么小事想记住？不用写得完整，一两句话就好。")
                        .font(.subheadline)
                        .foregroundStyle(Color.inkSecondary)
                        .padding(.vertical, 8)
                }
                ForEach(memories) { m in
                    Button { store.sheet = .editMemory(m) } label: { MemoryRow(memory: m).padding(.vertical, 10) }
                    Divider()
                }
                addButton("记一件小事") { store.sheet = .newMemory(person.id) }
            }
            .card(padding: 12)
        }
    }

    private func addButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: "plus.circle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 10)
        }
    }
}

/// 右上角的小头像：点一下切换到别人，长按出完整列表
struct PeopleSwitcher: View {
    @Environment(AppStore.self) private var store
    var current: Person

    var body: some View {
        let others = store.library.people.filter { $0.id != current.id }
        Menu {
            ForEach(store.library.people) { p in
                Button {
                    withAnimation { store.select(p.id) }
                } label: {
                    if p.id == current.id {
                        Label(p.name, systemImage: "checkmark")
                    } else {
                        Text(p.name)
                    }
                }
            }
            Divider()
            Button("添加在意的人", systemImage: "plus") { store.sheet = .newPerson }
        } label: {
            HStack(spacing: -8) {
                ForEach(others.prefix(2)) { p in
                    AvatarView(person: p)
                        .frame(width: 26, height: 34)
                }
                if others.isEmpty {
                    Image(systemName: "person.2.circle").font(.title2)
                }
            }
        } primaryAction: {
            // 按顺序轮到下一个人
            let people = store.library.people
            if people.count > 1, let i = people.firstIndex(where: { $0.id == current.id }) {
                withAnimation { store.select(people[(i + 1) % people.count].id) }
            } else {
                store.sheet = .newPerson
            }
        }
        .accessibilityLabel("切换人物")
    }
}
