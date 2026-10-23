import SwiftUI

struct LibraryView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        NavigationStack {
            Group {
                if app.store.projects.isEmpty {
                    ContentUnavailableView {
                        Label("还没有作品", systemImage: "square.stack")
                    } description: {
                        Text("做好的歌词和字幕会保存在这里")
                    } actions: {
                        Button("制作第一首") { app.tab = .create }.buttonStyle(.glassProminent)
                    }
                } else {
                    List {
                        ForEach(app.store.projects) { project in
                            Button {
                                app.open(project)
                                app.tab = .timeline
                            } label: {
                                ProjectRow(project: project, isOpen: project.id == app.project?.id)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Color.white.opacity(0.05))
                        }
                        .onDelete { offsets in
                            for project in offsets.map({ app.store.projects[$0] }) { app.delete(project) }
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .toolbar { EditButton() }
                }
            }
            .background(AmbientBackground(hue: app.hue))
            .navigationTitle("作品")
        }
    }
}

struct ProjectRow: View {
    let project: Project
    let isOpen: Bool

    var body: some View {
        HStack(spacing: 14) {
            Text(String(project.name.first ?? "♪"))
                .font(.title3.weight(.heavy))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(
                    LinearGradient(colors: [Color(hue: project.hue / 360, saturation: 0.8, brightness: 0.85),
                                            Color(hue: (project.hue + 38).truncatingRemainder(dividingBy: 360) / 360, saturation: 0.75, brightness: 0.55)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(project.name).font(.headline).lineLimit(1)
                    if project.kind == .subtitle {
                        Text("字幕").font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 1)
                            .background(.white.opacity(0.12), in: .capsule)
                    }
                    if isOpen {
                        Image(systemName: "waveform").font(.caption).foregroundStyle(.tint)
                    }
                }
                HStack(spacing: 0) {
                    Text("\(project.lines.count) 句 · \(project.updatedAt.formatted(.dateTime.month().day()))")
                        .foregroundStyle(.secondary)
                    if project.untimedCount > 0 {
                        Text(" · \(project.untimedCount) 句没打点").foregroundStyle(.orange)
                    } else if project.reviewCount > 0 {
                        Text(" · \(project.reviewCount) 句需检查").foregroundStyle(.orange)
                    }
                }
                .font(.caption)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}
