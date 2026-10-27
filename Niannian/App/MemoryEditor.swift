import NiannianCore
import SwiftUI

/// 记一件小事
struct MemoryEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var memory: Memory
    @State private var hasDate: Bool
    @State private var date: Date
    let isNew: Bool

    @State private var isOrganizing = false
    /// AI 整理前的原文，用来撤销
    @State private var original: (title: String, text: String)?
    @State private var aiMessage: String?
    @State private var confirmDelete = false

    init(memory: Memory, isNew: Bool) {
        _memory = State(initialValue: memory)
        _hasDate = State(initialValue: isNew || memory.date != nil)
        _date = State(initialValue: memory.date ?? .now)
        self.isNew = isNew
    }

    private var person: Person? { store.library.person(memory.personID) }
    private var canSave: Bool { !memory.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let person {
                        HStack(spacing: 12) {
                            AvatarView(person: person).frame(width: 48, height: 60)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("关于\(person.name)的小事").font(.headline)
                                Text("不用写得完整，一两句话就好。").font(.caption).foregroundStyle(Color.inkSecondary)
                            }
                        }
                    }
                    Text("最近关于 TA，有什么小事想记住？").font(.title3.bold())

                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("填写事情发生的日期", isOn: $hasDate.animation())
                            .font(.subheadline)
                            .tint(Color.ink)
                        if hasDate {
                            DatePicker("日期", selection: $date, in: ...Date.now, displayedComponents: .date)
                                .environment(\.locale, Locale(identifier: "zh_CN"))
                        }
                        Divider()
                        TextField("标题（可选）", text: $memory.title)
                            .font(.headline)
                        PlaceholderEditor(text: $memory.text, placeholder: "比如：侄女最近喜欢画小猫，下次带盒彩笔给她。")
                        HStack {
                            Text("打字，或说给念念听").font(.caption).foregroundStyle(Color.inkSecondary)
                            Spacer()
                            MicButton(text: $memory.text)
                        }
                    }
                    .card()

                    aiCard
                }
                .padding(20)
            }
            .background(Color.cream)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                Button(isNew ? "保存这件小事" : "保存") { save() }
                    .buttonStyle(LimeButtonStyle())
                    .disabled(!canSave)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
            }
            .navigationTitle(isNew ? "记一件小事" : "小事")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                if !isNew {
                    ToolbarItem(placement: .destructiveAction) {
                        Button("删除", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .confirmationDialog("删除这件小事？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("删除", role: .destructive) {
                    store.delete(memory: memory.id)
                    dismiss()
                }
            }
        }
    }

    private var aiCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "sparkles")
                Text("用 AI 整理").font(.headline)
                Spacer()
                if original != nil {
                    Button("撤销") {
                        if let original {
                            memory.title = original.title
                            memory.text = original.text
                        }
                        original = nil
                        aiMessage = nil
                    }
                    .font(.subheadline.weight(.semibold))
                }
            }
            Text(aiMessage ?? "帮你起个标题、把口语理顺，整理后都能再修改。在手机上用 Apple 智能完成，内容不会上传。")
                .font(.caption)
                .foregroundStyle(Color.inkSecondary)
            Button {
                Task { await organize() }
            } label: {
                HStack {
                    if isOrganizing { ProgressView().tint(Color.ink) }
                    Text(isOrganizing ? "正在整理…" : "整理这段记录")
                }
            }
            .buttonStyle(ChipStyle(selected: true))
            .disabled(!canSave || isOrganizing)
        }
        .card()
    }

    private func organize() async {
        if let reason = Assistant.unavailableReason {
            aiMessage = reason
            return
        }
        isOrganizing = true
        defer { isOrganizing = false }
        do {
            let result = try await Assistant.organize(memory.text, about: person)
            if original == nil { original = (memory.title, memory.text) }
            withAnimation {
                memory.title = result.title
                memory.text = result.text
            }
            aiMessage = "已整理，觉得不对可以直接改，或者点“撤销”。"
        } catch {
            aiMessage = "整理失败：\(error.localizedDescription)"
        }
    }

    private func save() {
        var m = memory
        m.title = m.title.trimmingCharacters(in: .whitespacesAndNewlines)
        m.text = m.text.trimmingCharacters(in: .whitespacesAndNewlines)
        m.date = hasDate ? date : nil
        store.save(m)
        store.show(isNew ? "记下了" : "已保存")
        dismiss()
    }
}
