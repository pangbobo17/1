import NiannianCore
import SwiftUI

/// 添加 / 编辑重要时刻
struct MomentEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var moment: Moment
    @State private var confirmDelete = false
    let isNew: Bool

    init(moment: Moment, isNew: Bool) {
        var m = moment
        if isNew && m.title.isEmpty { m.title = m.kind.title }
        _moment = State(initialValue: m)
        self.isNew = isNew
    }

    private static let remindOptions: [(String, Int?)] = [("不提醒", nil), ("当天", 0), ("提前 1 天", 1), ("提前 3 天", 3), ("提前 7 天", 7)]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("人物", selection: $moment.personID) {
                        ForEach(store.library.people) { p in Text(p.name).tag(p.id) }
                    }
                }
                Section("类型") {
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(MomentKind.allCases, id: \.self) { kind in
                                Button("\(kind.emoji) \(kind.title)") { pick(kind) }
                                    .buttonStyle(ChipStyle(selected: moment.kind == kind))
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    TextField("名称，比如：GESP 考试", text: $moment.title)
                }
                Section {
                    DatePicker(moment.kind == .birthday ? "出生日期" : "日期", selection: $moment.date, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "zh_CN"))
                    Toggle("每年重复", isOn: $moment.repeatsYearly)
                        .tint(Color.ink)
                } footer: {
                    Text(preview)
                }
                Section("提醒") {
                    Picker("提醒", selection: $moment.remindDaysBefore) {
                        ForEach(Self.remindOptions.indices, id: \.self) { i in
                            Text(Self.remindOptions[i].0).tag(Self.remindOptions[i].1)
                        }
                    }
                    .pickerStyle(.menu)
                }
                if !isNew {
                    Section {
                        Button("删除这个时刻", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.cream)
            .navigationTitle(isNew ? "添加重要时刻" : "重要时刻")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        moment.title = moment.title.trimmingCharacters(in: .whitespacesAndNewlines)
                        store.save(moment)
                        store.show("已保存")
                        dismiss()
                    }
                    .disabled(moment.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("删除这个时刻？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("删除", role: .destructive) {
                    store.delete(moment: moment.id)
                    dismiss()
                }
            }
        }
    }

    private var preview: String {
        let u = UpcomingMoment(moment: moment)
        var s = "下一次：\(u.date.chineseDate)，\(u.label)"
        if moment.kind == .birthday, let y = u.years { s += "，满 \(y) 岁" }
        return s
    }

    private func pick(_ kind: MomentKind) {
        // 名称还是默认值时跟着类型换
        if moment.title.isEmpty || MomentKind.allCases.contains(where: { $0.title == moment.title }) {
            moment.title = kind.title
        }
        moment.kind = kind
        moment.repeatsYearly = kind.repeatsByDefault
    }
}

/// 所有人接下来的重要日子
struct MomentsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let upcoming = store.library.upcoming()
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    if upcoming.isEmpty {
                        ContentUnavailableView("还没有重要时刻", systemImage: "calendar",
                                               description: Text("在人物主页添加生日、纪念日，这里会按日子远近排好。"))
                    }
                    ForEach(upcoming) { u in
                        Button {
                            store.sheet = nil
                            Task {
                                try? await Task.sleep(for: .milliseconds(350))
                                store.sheet = .editMoment(u.moment)
                            }
                        } label: {
                            HStack(spacing: 12) {
                                if let p = store.library.person(u.moment.personID) {
                                    AvatarView(person: p).frame(width: 40, height: 52)
                                }
                                MomentRow(upcoming: u, personName: store.library.person(u.moment.personID)?.name)
                            }
                            .card(padding: 12)
                        }
                    }
                }
                .padding(20)
            }
            .background(Color.cream)
            .navigationTitle("重要日子")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
            }
        }
    }
}
