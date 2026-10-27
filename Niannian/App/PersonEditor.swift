import NiannianCore
import SwiftUI

/// 添加 / 编辑在意的人
struct PersonEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var person: Person
    @State private var newAvatar: UIImage?
    @State private var showMaker = false
    @State private var confirmDelete = false
    let isNew: Bool

    private static let relations = ["老婆", "老公", "儿子", "女儿", "爸爸", "妈妈", "岳父", "岳母", "朋友", "我自己"]

    init(person: Person, isNew: Bool) {
        _person = State(initialValue: person)
        self.isNew = isNew
    }

    private var canSave: Bool { !person.name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if isNew {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("找到你在意的人").font(.title.bold())
                            Text("为每个人留住重要日子和日常小事。").foregroundStyle(Color.inkSecondary)
                        }
                    }

                    avatarCard

                    VStack(alignment: .leading, spacing: 12) {
                        Text("怎么称呼 TA").font(.subheadline.weight(.semibold))
                        TextField("比如：小菠萝", text: $person.name)
                            .font(.title3.weight(.semibold))
                        Divider()
                        Text("TA 是你的").font(.subheadline.weight(.semibold))
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(Self.relations, id: \.self) { r in
                                    Button(r) {
                                        person.relation = person.relation == r ? "" : r
                                        if person.name.isEmpty && r != "我自己" { person.name = r }
                                    }
                                    .buttonStyle(ChipStyle(selected: person.relation == r))
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                        TextField("或者自己写", text: $person.relation)
                    }
                    .card()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("关于 TA").font(.subheadline.weight(.semibold))
                        PlaceholderEditor(text: $person.about, placeholder: "喜好、性格、最近在忙的事……团团会参考这些给建议。", minHeight: 90)
                    }
                    .card()

                    if !isNew {
                        Button("删除\(person.name)", role: .destructive) { confirmDelete = true }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 8)
                    }
                }
                .padding(20)
            }
            .background(Color.cream)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(isNew ? "添加在意的人" : "编辑")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        person.name = person.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        store.save(person, avatar: newAvatar)
                        store.show(isNew ? "已添加\(person.name)" : "已保存")
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
            .sheet(isPresented: $showMaker) {
                AvatarMaker(personName: person.name, about: person.about) { image in
                    newAvatar = image
                }
            }
            .confirmationDialog("删除\(person.name)？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("删除", role: .destructive) {
                    store.delete(person: person.id)
                    dismiss()
                }
            } message: {
                Text("TA 的重要时刻和小事也会一起删除。")
            }
        }
    }

    private var avatarCard: some View {
        HStack(spacing: 16) {
            Group {
                if let newAvatar {
                    Image(uiImage: newAvatar).resizable().scaledToFit()
                } else {
                    AvatarView(person: person)
                }
            }
            .frame(width: 90, height: 120)
            VStack(alignment: .leading, spacing: 8) {
                Text("TA 的形象").font(.headline)
                Text("用照片做一个站在首页上的小人，也会显示在桌面小组件里。")
                    .font(.caption)
                    .foregroundStyle(Color.inkSecondary)
                Button(person.hasAvatar || newAvatar != nil ? "换个形象" : "制作形象") { showMaker = true }
                    .buttonStyle(ChipStyle(selected: true))
            }
        }
        .card()
    }
}
