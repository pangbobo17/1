import SwiftUI

@main
struct LyricSyncApp: App {
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            Tab("制作", systemImage: "wand.and.stars", value: AppTab.create) { CreateView() }
            Tab("时间轴", systemImage: "waveform", value: AppTab.timeline) { TimelineScreen() }
            Tab("作品", systemImage: "square.stack", value: AppTab.library) { LibraryView() }
            Tab("设置", systemImage: "gearshape", value: AppTab.settings) { SettingsView() }
        }
        .tint(Color.accent(hue: app.hue))
        .overlay(alignment: .top) {
            if let message = app.toastMessage {
                Text(message)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding(.top, 54)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35), value: app.toastMessage)
    }
}
