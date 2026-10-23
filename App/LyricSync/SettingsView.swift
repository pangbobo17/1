import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var usedSpace = "—"
    @State private var modelSpace = "—"
    @State private var confirmingDelete = false

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                Section("新建时的默认选项") {
                    Picker("语言", selection: $app.defaultLanguage) {
                        ForEach(SpokenLanguage.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("识别模型", selection: $app.defaultModel) {
                        ForEach(WhisperModel.allCases) { model in
                            Text("\(model.title)（\(model.detail)）").tag(model)
                        }
                    }
                    .pickerStyle(.navigationLink)
                }
                .listRowBackground(Color.white.opacity(0.06))

                Section("存储") {
                    LabeledContent("作品（含音频）", value: usedSpace)
                    LabeledContent("已下载的识别模型", value: modelSpace)
                    Button("删除已下载的识别模型", role: .destructive) { confirmingDelete = true }
                }
                .listRowBackground(Color.white.opacity(0.06))

                Section {
                    Text("识别用 Whisper 模型在这台 iPhone 上完成，歌曲和歌词不会上传。删除 App 会同时删除所有作品。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .background(AmbientBackground(hue: app.hue))
            .navigationTitle("设置")
            .task { await refreshSizes() }
            .confirmationDialog("删除已下载的识别模型？", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("删除", role: .destructive) {
                    Task {
                        await Recognizer.shared.unload()
                        try? FileManager.default.removeItem(at: Recognizer.modelsFolder)
                        await refreshSizes()
                        app.toast("已删除识别模型")
                    }
                }
            } message: {
                Text("下次识别时会重新下载")
            }
        }
    }

    private func refreshSizes() async {
        let projects = app.store.folder
        let models = Recognizer.modelsFolder
        let (a, b) = await Task.detached { (Self.size(of: projects), Self.size(of: models)) }.value
        usedSpace = a
        modelSpace = b
    }

    nonisolated private static func size(of folder: URL) -> String {
        var total: Int64 = 0
        if let e = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.totalFileAllocatedSizeKey]) {
            for case let url as URL in e {
                total += Int64((try? url.resourceValues(forKeys: [.totalFileAllocatedSizeKey]).totalFileAllocatedSize) ?? 0)
            }
        }
        return ByteCountFormatter.string(fromByteCount: total, countStyle: .file)
    }
}
