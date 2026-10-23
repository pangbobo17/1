import LyricsAlignCore
import SwiftUI

struct TimelineScreen: View {
    @Environment(AppModel.self) private var app
    @State private var editingLine: EditingLine?
    @State private var showingTools = false
    @State private var showingExport = false
    @State private var lastUserScroll = Date.distantPast

    struct EditingLine: Identifiable { let id: Int }

    var body: some View {
        NavigationStack {
            Group {
                if let project = app.project {
                    content(project)
                } else {
                    ContentUnavailableView {
                        Label("还没有打开的歌曲", systemImage: "waveform")
                    } description: {
                        Text("先去“制作”导入一首歌，或者从“作品”里打开")
                    } actions: {
                        Button("去制作") { app.tab = .create }.buttonStyle(.glassProminent)
                        Button("打开作品") { app.tab = .library }.buttonStyle(.glass)
                    }
                }
            }
            .background(AmbientBackground(hue: app.hue))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let project = app.project {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("工具", systemImage: "slider.horizontal.3") { showingTools = true }
                    }
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 0) {
                            Text(project.name).font(.headline).lineLimit(1)
                            Text(subtitle(project)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("导出", systemImage: "square.and.arrow.up") { showingExport = true }
                    }
                }
            }
            .sheet(item: $editingLine) { LineSheet(index: $0.id) }
            .sheet(isPresented: $showingTools) { ToolsSheet() }
            .sheet(isPresented: $showingExport) { ExportSheet() }
        }
    }

    private func subtitle(_ p: Project) -> String {
        let unit = p.kind == .subtitle ? "条字幕" : "句"
        if p.untimedCount > 0 { return "还有 \(p.untimedCount) 句没打点" }
        if p.reviewCount > 0 { return "\(p.lines.count) \(unit) · \(p.reviewCount) 句需检查" }
        return "\(p.lines.count) \(unit)"
    }

    private func content(_ project: Project) -> some View {
        let player = app.player
        let time = player.currentTime
        let current = app.currentIndex(at: time)
        let accent = Color.accent(hue: project.hue)
        return VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(Array(project.lines.enumerated()), id: \.element.id) { i, line in
                            LineRow(line: line, state: rowState(i, current: current), time: time, accent: accent) {
                                editingLine = EditingLine(id: i)
                            } onPlay: {
                                guard let start = line.start else { editingLine = EditingLine(id: i); return }
                                player.seek(to: max(0, start - 0.05))
                                player.play()
                            }
                            .id(line.id)
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 160)
                }
                .scrollIndicators(.hidden)
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.12),
                                             .init(color: .black, location: 0.85), .init(color: .clear, location: 1)],
                                     startPoint: .top, endPoint: .bottom))
                .simultaneousGesture(DragGesture().onChanged { _ in lastUserScroll = .now })
                .onChange(of: current) { _, index in
                    guard let index, player.isPlaying, Date.now.timeIntervalSince(lastUserScroll) > 2.5 else { return }
                    withAnimation(.smooth) { proxy.scrollTo(project.lines[index].id, anchor: .center) }
                }
            }
            Dock(project: project, current: current, accent: accent)
        }
    }

    private func rowState(_ i: Int, current: Int?) -> LineRow.RowState {
        guard let current else { return .upcoming }
        return i == current ? .current : i < current ? .past : .upcoming
    }
}

struct LineRow: View {
    enum RowState { case past, current, upcoming }

    let line: AlignedLine
    let state: RowState
    let time: TimeInterval
    let accent: Color
    let onAdjust: () -> Void
    let onPlay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: onAdjust) {
                HStack(spacing: 8) {
                    Text(line.start?.lrc ?? "--:--.--")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(line.start == nil ? Color.orange : (state == .current ? accent : Color.secondary))
                    if line.needsReview {
                        Text("需检查")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 1)
                            .background(.orange.opacity(0.18), in: .capsule)
                            .foregroundStyle(.orange)
                    }
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("调整这一句的时间")

            Text(attributed)
                .font(.system(size: 28, weight: .heavy))
                .frame(maxWidth: .infinity, alignment: .leading)
                .scaleEffect(state == .current ? 1.03 : 1, anchor: .leading)
                .animation(.smooth(duration: 0.25), value: state)
                .contentShape(Rectangle())
                .onTapGesture(perform: onPlay)
        }
    }

    /// 当前句逐字点亮，其他句子按已唱/未唱变暗
    private var attributed: AttributedString {
        let dim: Color = state == .past ? .white.opacity(0.2) : .white.opacity(state == .current ? 0.45 : 0.35)
        guard state == .current else {
            var s = AttributedString(line.text)
            s.foregroundColor = dim
            return s
        }
        guard !line.words.isEmpty else {
            var s = AttributedString(line.text)
            s.foregroundColor = .white
            return s
        }
        var s = AttributedString()
        for w in line.words {
            var part = AttributedString(w.text)
            part.foregroundColor = w.start <= time ? .white : dim
            s += part
        }
        return s
    }
}

/// 底部播放台：波形进度、播放控制、打点
struct Dock: View {
    @Environment(AppModel.self) private var app
    let project: Project
    let current: Int?
    let accent: Color

    var body: some View {
        let player = app.player
        let duration = max(project.duration, player.duration)
        let timed = project.lines.enumerated().filter { $0.element.start != nil }
        let markers = duration > 0 ? timed.map { ($0.element.start ?? 0) / duration } : []
        let currentMarker = current.flatMap { c in timed.firstIndex { $0.offset == c } }
        let target = app.tapTarget(at: player.currentTime)

        VStack(spacing: 10) {
            WaveformView(peaks: project.peaks, progress: duration > 0 ? player.currentTime / duration : 0,
                         markers: markers, currentMarker: currentMarker, accent: accent)
                .frame(height: 48)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    // 宽度用整条波形的宽度换算
                    if let width = waveWidth, width > 0 { player.seek(to: value.location.x / width * duration) }
                })
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { waveWidth = $0 }
                .accessibilityLabel("播放进度")

            HStack {
                Text(player.currentTime.lrc)
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 18) {
                    Button("后退 5 秒", systemImage: "gobackward.5") { player.seek(to: player.currentTime - 5) }
                    Button(player.isPlaying ? "暂停" : "播放", systemImage: player.isPlaying ? "pause.fill" : "play.fill") { player.toggle() }
                        .font(.title2)
                        .buttonStyle(.glassProminent)
                        .buttonBorderShape(.circle)
                        .controlSize(.large)
                    Button("前进 5 秒", systemImage: "goforward.5") { player.seek(to: player.currentTime + 5) }
                }
                .labelStyle(.iconOnly)
                .font(.title3)
                Button("撤销", systemImage: "arrow.uturn.backward") { app.undo() }
                    .labelStyle(.iconOnly)
                    .disabled(app.undoStack.isEmpty)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .disabled(!player.isLoaded)

            Button {
                guard let target else { app.toast("已经是最后一句"); return }
                app.setStart(target, to: player.currentTime)
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("打点").font(.headline).tracking(4)
                    if let target {
                        Text("下一句：\(project.lines[target].text)").font(.caption.weight(.semibold)).opacity(0.75).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(!player.isLoaded)
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    @State private var waveWidth: CGFloat?
}

struct LineSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let index: Int
    @State private var text = ""
    @State private var lineID: UUID?
    @State private var confirmingDelete = false

    /// 当前这一句在列表里的位置（按 id 找）
    private var position: Int? {
        guard let lineID else { return nil }
        return app.project?.lines.firstIndex { $0.id == lineID }
    }

    var body: some View {
        let player = app.player
        let index = position ?? index
        let line = app.project?.lines[safe: index]
        VStack(spacing: 16) {
            TextField("这一句的文字", text: $text, axis: .vertical)
                .font(.title3.weight(.heavy))
                .lineLimit(1...3)
                .padding(12)
                .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .submitLabel(.done)
                .onSubmit(commitText)

            Text(line?.start?.lrc ?? "--:--.--")
                .font(.system(size: 44, weight: .bold, design: .monospaced))
                .foregroundStyle(Color.accent(hue: app.hue))
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 8) {
                ForEach([-0.5, -0.1, 0.1, 0.5], id: \.self) { d in
                    Button(String(format: "%+.1f", d)) {
                        app.setStart(index, to: (line?.start ?? player.currentTime) + d)
                    }
                    .font(.body.monospacedDigit().weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.glass)
                }
            }

            Button {
                app.setStart(index, to: player.currentTime)
            } label: {
                Text("设为当前播放位置 \(player.currentTime.lrc)").frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)

            HStack(spacing: 10) {
                Button {
                    if let start = line?.start { player.seek(to: max(0, start - 0.05)); player.play() }
                    dismiss()
                } label: { Text("从这句播放").frame(maxWidth: .infinity) }
                .disabled(line?.start == nil)
                Button(role: .destructive) { confirmingDelete = true } label: { Text("删除这一句").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.glass)
            .controlSize(.large)
        }
        .padding(20)
        .presentationDetents([.medium])
        .onAppear {
            text = line?.text ?? ""
            lineID = line?.id
        }
        .onDisappear(perform: commitText)
        .confirmationDialog("删除这一句？", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                guard let i = position else { return }
                lineID = nil
                app.edit { $0.remove(at: i) }
                app.toast("已删除，可以撤销")
                dismiss()
            }
        }
    }

    /// 改了字就去掉逐字时间（字数可能对不上了），保留整句时间
    private func commitText() {
        let t = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
        guard let i = position, let line = app.project?.lines[i], !t.isEmpty, t != line.text else { return }
        app.edit { lines in
            lines[i].text = t
            lines[i].words = []
        }
    }
}

struct ToolsSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingClear = false

    var body: some View {
        @Bindable var player = app.player
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("播放速度（慢放更容易打准）").font(.footnote).foregroundStyle(.secondary)
                Picker("播放速度", selection: $player.rate) {
                    Text("0.5×").tag(Float(0.5))
                    Text("0.75×").tag(Float(0.75))
                    Text("1×").tag(Float(1))
                }
                .pickerStyle(.segmented)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("整体偏移（所有句子一起前后移动）").font(.footnote).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    ForEach([-0.5, -0.1, 0.1, 0.5], id: \.self) { d in
                        Button(String(format: "%+.1f", d)) {
                            app.edit { lines in for i in lines.indices { lines[i].shift(by: d) } }
                            app.toast("所有句子\(d > 0 ? "推后" : "提前") \(String(format: "%.1f", abs(d))) 秒")
                        }
                        .font(.body.monospacedDigit().weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .buttonStyle(.glass)
                    }
                }
            }
            Button(role: .destructive) { confirmingClear = true } label: {
                Text("清空所有时间，重新打点").frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .controlSize(.large)
        }
        .padding(20)
        .presentationDetents([.medium])
        .confirmationDialog("清空所有句子的时间？", isPresented: $confirmingClear, titleVisibility: .visible) {
            Button("清空", role: .destructive) {
                app.edit { lines in
                    for i in lines.indices {
                        lines[i].start = nil
                        lines[i].end = nil
                        lines[i].words = []
                        lines[i].confidence = nil
                    }
                }
                app.player.seek(to: 0)
                app.toast("已清空，播放后按“打点”")
                dismiss()
            }
        } message: {
            Text("可以用“撤销”恢复")
        }
    }
}

struct ExportSheet: View {
    @Environment(AppModel.self) private var app
    @State private var format: LyricsExporter.Format = .lrc
    @State private var fileURL: URL?

    var body: some View {
        let text = app.project.map { LyricsExporter.export($0.lines, format: format, title: $0.name) } ?? ""
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Picker("格式", selection: $format) {
                    Text("LRC 逐行").tag(LyricsExporter.Format.lrc)
                    Text("LRC 逐字").tag(LyricsExporter.Format.enhancedLRC)
                    Text("SRT 字幕").tag(LyricsExporter.Format.srt)
                }
                .pickerStyle(.segmented)
                Text(description).font(.footnote).foregroundStyle(.secondary)
                ScrollView([.vertical, .horizontal]) {
                    Text(text).font(.caption.monospaced()).textSelection(.enabled).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let fileURL {
                    ShareLink(item: fileURL) {
                        Text("存储 / 分享文件").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.glassProminent)
                    .controlSize(.large)
                }
                Button {
                    UIPasteboard.general.string = text
                    app.toast("已复制")
                } label: { Text("复制文字").frame(maxWidth: .infinity) }
                .buttonStyle(.glass)
                .controlSize(.large)
            }
            .padding(20)
            .navigationTitle("导出")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.large])
        .onAppear { if app.project?.kind == .subtitle { format = .srt } }
        .task(id: format) { fileURL = writeFile(text: text) }
    }

    private var description: String {
        switch format {
        case .lrc: return "最常用的歌词格式，音乐播放器都支持。"
        case .enhancedLRC: return "带每个字的时间，可用于卡拉 OK 逐字变色。"
        case .srt: return "视频字幕格式，剪映、Premiere 等都能导入。"
        }
    }

    private func writeFile(text: String) -> URL? {
        guard let name = app.project?.name else { return nil }
        let dir = FileManager.default.temporaryDirectory.appending(path: "export", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appending(path: "\(name).\(format.fileExtension)")
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            return nil
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
