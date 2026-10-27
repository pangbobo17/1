import NiannianCore
import SwiftUI
import UniformTypeIdentifiers
import UserNotifications
import WidgetKit

struct MeView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL

    @State private var backup: BackupFile?
    @State private var importing = false
    @State private var notificationsAllowed: Bool?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Logo()
                    summary
                    peopleCard
                    NavigationLink {
                        WidgetSettingsView()
                    } label: {
                        widgetCard
                    }
                    settingsCard
                    Text("念念 · 资料只保存在这台设备上，AI 功能使用手机上的 Apple 智能。")
                        .font(.caption)
                        .foregroundStyle(Color.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .padding(20)
            }
            .background(Color.cream)
            .toolbar(.hidden, for: .navigationBar)
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result { store.restore(from: url) }
            }
            .task { await refreshNotificationStatus() }
        }
    }

    private var summary: some View {
        let lib = store.library
        return HStack(spacing: 14) {
            HStack(spacing: -14) {
                ForEach(lib.people.prefix(3)) { p in
                    AvatarView(person: p).frame(width: 40, height: 54)
                }
                if lib.people.isEmpty { BlinkingMascot().frame(width: 48, height: 48) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("我的念念").font(.title3.bold())
                Text("\(lib.people.count) 位人物 · \(lib.memories.count) 件小事 · \(lib.moments.count) 个时刻")
                    .font(.caption)
                    .foregroundStyle(Color.inkSecondary)
            }
            Spacer()
        }
        .card()
    }

    private var peopleCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "念着的人", count: store.library.people.count)
                .padding(.bottom, 6)
            ForEach(store.library.people) { p in
                Button {
                    store.select(p.id)
                    store.tab = .home
                } label: {
                    HStack(spacing: 12) {
                        AvatarView(person: p).frame(width: 36, height: 46)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.body.weight(.semibold))
                            if !p.relation.isEmpty {
                                Text(p.relation).font(.caption).foregroundStyle(Color.inkSecondary)
                            }
                        }
                        Spacer()
                        Button {
                            store.sheet = .editPerson(p)
                        } label: {
                            Image(systemName: "pencil.circle.fill").font(.title2).foregroundStyle(Color.inkSecondary)
                        }
                        .accessibilityLabel("编辑\(p.name)")
                    }
                    .foregroundStyle(Color.ink)
                    .padding(.vertical, 8)
                }
                Divider()
            }
            Button {
                store.sheet = .newPerson
            } label: {
                Label("添加在意的人", systemImage: "plus.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10)
            }
        }
        .card(padding: 12)
    }

    private var widgetCard: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("把念念放在桌面").font(.headline)
                Text("选择要展示的形象，以及想提醒的事").font(.caption).foregroundStyle(Color.inkSecondary)
            }
            Spacer()
            Text("设置小组件").font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color.limeSoft, in: Capsule())
            Image(systemName: "chevron.right").foregroundStyle(Color.inkSecondary)
        }
        .foregroundStyle(Color.ink)
        .card()
    }

    private var settingsCard: some View {
        VStack(spacing: 0) {
            row("重要日子", subtitle: "所有人的生日、纪念日", systemImage: "calendar") {
                store.sheet = .moments
            }
            Divider()
            row("提醒", subtitle: notificationSubtitle, systemImage: "bell.badge") {
                Task {
                    if notificationsAllowed == false {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    } else {
                        await Reminders.requestAuthorization()
                        await refreshNotificationStatus()
                    }
                }
            }
            Divider()
            row("导出备份", subtitle: "人物、形象、时刻和小事存成一个文件", systemImage: "square.and.arrow.up") {
                do {
                    backup = BackupFile(url: try store.makeBackupFile())
                } catch {
                    store.show("导出失败")
                }
            }
            Divider()
            row("从备份恢复", subtitle: "同一条资料会被备份里的覆盖", systemImage: "square.and.arrow.down") {
                importing = true
            }
        }
        .card(padding: 12)
        .sheet(item: $backup) { file in
            ShareSheet(items: [file.url])
                .presentationDetents([.medium, .large])
        }
    }

    private var notificationSubtitle: String {
        switch notificationsAllowed {
        case .some(true): "已开启，按每个时刻的设置提前提醒"
        case .some(false): "未开启，点这里去设置里打开"
        case .none: "生日、纪念日到之前提醒你"
        }
    }

    private func row(_ title: String, subtitle: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.body)
                    .frame(width: 36, height: 36)
                    .background(Color.limeSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.semibold))
                    Text(subtitle).font(.caption).foregroundStyle(Color.inkSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.inkSecondary)
            }
            .foregroundStyle(Color.ink)
            .padding(.vertical, 8)
        }
    }

    private func refreshNotificationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: notificationsAllowed = true
        case .denied: notificationsAllowed = false
        default: notificationsAllowed = nil
        }
    }
}

struct BackupFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// 系统分享面板
struct ShareSheet: UIViewControllerRepresentable {
    var items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// 桌面小组件：选择轮流展示的形象，以及提醒谁的事
struct WidgetSettingsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        let selected = store.library.widget.personIDs
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("小组件效果").font(.headline)
                        Spacer()
                        Text("每小时换一个人").font(.caption).foregroundStyle(Color.inkSecondary)
                    }
                    let entry = NiannianEntry.timeline(from: store.library, hours: 1).first ?? .placeholder
                    HStack(spacing: 12) {
                        NiannianWidgetView(entry: entry, family: .systemSmall)
                            .padding(14)
                            .frame(width: 150, height: 150)
                            .background(Color.cream, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        NiannianWidgetView(entry: entry, family: .systemMedium)
                            .padding(14)
                            .frame(height: 150)
                            .frame(maxWidth: .infinity)
                            .background(Color.cream, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    }
                }
                .card()

                VStack(alignment: .leading, spacing: 10) {
                    Text("1 · 选择陪伴形象").font(.headline)
                    Text(selected.isEmpty ? "没选的时候，展示首页当前的人。" : "已选 \(selected.count) 个形象，将轮流展示。")
                        .font(.caption)
                        .foregroundStyle(Color.inkSecondary)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 10)], spacing: 10) {
                        ForEach(store.library.people) { p in
                            let isOn = selected.contains(p.id)
                            Button {
                                if isOn {
                                    store.library.widget.personIDs.removeAll { $0 == p.id }
                                } else {
                                    store.library.widget.personIDs.append(p.id)
                                }
                            } label: {
                                VStack(spacing: 6) {
                                    AvatarView(person: p).frame(height: 70)
                                    Text(p.name).font(.caption.weight(.semibold)).lineLimit(1)
                                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(isOn ? Color.ink : Color.inkSecondary)
                                }
                                .foregroundStyle(Color.ink)
                                .padding(8)
                                .frame(maxWidth: .infinity)
                                .background(isOn ? Color.limeSoft : Color.cream, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                }
                .card()

                VStack(alignment: .leading, spacing: 10) {
                    Text("2 · 提醒谁的事").font(.headline)
                    Picker("提醒谁的事", selection: $store.library.widget.scope) {
                        ForEach(WidgetSettings.Scope.allCases, id: \.self) { s in Text(s.title).tag(s) }
                    }
                    .pickerStyle(.segmented)
                    Text("长按桌面空白处 → 左上角“编辑” → 添加小组件 → 搜索“念念”。")
                        .font(.caption)
                        .foregroundStyle(Color.inkSecondary)
                }
                .card()
            }
            .padding(20)
        }
        .background(Color.cream)
        .navigationTitle("桌面小组件")
        .navigationBarTitleDisplayMode(.inline)
    }
}
