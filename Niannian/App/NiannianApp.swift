import NiannianCore
import SwiftUI

@main
struct NiannianApp: App {
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(.light)
                .tint(Color.ink)
        }
    }
}

struct RootView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        ZStack {
            Color.cream.ignoresSafeArea()
            switch store.tab {
            case .home: HomeView()
            case .me: MeView()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { TabBar() }
        .sheet(item: $store.sheet) { sheet in
            sheetContent(sheet)
                .environment(store)
        }
        .overlay(alignment: .top) {
            if let message = store.toast {
                Text(message)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35), value: store.toast)
    }

    @ViewBuilder
    private func sheetContent(_ sheet: AppSheet) -> some View {
        switch sheet {
        case .create:
            CreateSheet()
                .presentationDetents([.height(340)])
        case .newPerson:
            PersonEditor(person: Person(name: ""), isNew: true)
        case .editPerson(let person):
            PersonEditor(person: person, isNew: false)
        case .newMemory(let personID):
            MemoryEditor(memory: Memory(personID: personID, text: ""), isNew: true)
        case .editMemory(let memory):
            MemoryEditor(memory: memory, isNew: false)
        case .newMoment(let personID):
            MomentEditor(moment: Moment(personID: personID, title: "", kind: .birthday, date: .now), isNew: true)
        case .editMoment(let moment):
            MomentEditor(moment: moment, isNew: false)
        case .chat(let personID):
            ChatView(personID: personID)
        case .moments:
            MomentsView()
        }
    }
}

/// 底部栏：惦记的人 · 创建 · 我的
struct TabBar: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        HStack {
            item(.home, title: "念着的人", systemImage: "heart.circle.fill")
            Button {
                store.sheet = store.library.people.isEmpty ? .newPerson : .create
            } label: {
                VStack(spacing: 2) {
                    Image(systemName: "plus")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Color.ink)
                        .frame(width: 52, height: 40)
                        .background(Color.lime, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Text("创建").font(.caption2.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
            }
            .accessibilityLabel("创建")
            item(.me, title: "我的", systemImage: "person.crop.circle.fill")
        }
        .foregroundStyle(Color.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, 24)
        .padding(.bottom, 4)
    }

    private func item(_ tab: AppTab, title: String, systemImage: String) -> some View {
        Button {
            store.tab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: systemImage).font(.title2)
                Text(title).font(.caption2.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .opacity(store.tab == tab ? 1 : 0.4)
        }
    }
}

/// 点“+”弹出的选择
struct CreateSheet: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("创建").font(.title2.bold()).padding(.bottom, 4)
            if let person = store.currentPerson {
                option("记一件小事", subtitle: "关于\(person.name)，一两句话就好", systemImage: "square.and.pencil") {
                    store.sheet = .newMemory(person.id)
                }
                option("添加重要时刻", subtitle: "生日、纪念日、考试……", systemImage: "calendar.badge.plus") {
                    store.sheet = .newMoment(person.id)
                }
            }
            option("添加在意的人", subtitle: "家人、朋友，给 TA 做个形象", systemImage: "person.badge.plus") {
                store.sheet = .newPerson
            }
        }
        .padding(24)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.cream)
    }

    private func option(_ title: String, subtitle: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button {
            // 先关掉这一层再弹下一层
            store.sheet = nil
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                action()
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(Color.limeSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(Color.inkSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.inkSecondary)
            }
            .foregroundStyle(Color.ink)
            .card(padding: 12)
        }
    }
}
