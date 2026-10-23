import SwiftUI

extension Color {
    static let ground = Color(red: 0.055, green: 0.05, blue: 0.08)

    /// 随歌曲变化的主色
    static func accent(hue: Double) -> Color {
        Color(hue: hue.truncatingRemainder(dividingBy: 360) / 360, saturation: 0.62, brightness: 1)
    }
}

/// 背景：按歌曲主色生成的流动光晕
struct AmbientBackground: View {
    var hue: Double

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 15)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let wobble = Float(sin(t / 6) * 0.08)
            MeshGradient(
                width: 3, height: 3,
                points: [
                    [0, 0], [0.5, 0], [1, 0],
                    [0, 0.5], [0.55 + wobble, 0.4 - wobble], [1, 0.55],
                    [0, 1], [0.5, 1], [1, 1],
                ],
                colors: [
                    tint(0, 0.5), tint(20, 0.38), tint(300, 0.28),
                    tint(330, 0.3), .ground, tint(40, 0.18),
                    .ground, .ground, tint(300, 0.2),
                ]
            )
        }
        .ignoresSafeArea()
    }

    private func tint(_ shift: Double, _ brightness: Double) -> Color {
        let h = (hue + shift).truncatingRemainder(dividingBy: 360) / 360
        return Color(hue: h, saturation: 0.75, brightness: brightness)
    }
}

/// 半透明卡片
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08)))
    }
}

extension View {
    func card() -> some View { modifier(CardBackground()) }
}

/// 波形：progress 之前的部分用主色；markers 是每句开始位置的小圆点
struct WaveformView: View {
    var peaks: [Float]
    var progress: Double = 1
    var markers: [Double] = []
    var currentMarker: Int? = nil
    var accent: Color

    var body: some View {
        Canvas { ctx, size in
            let bar: CGFloat = 3, gap: CGFloat = 2
            let n = max(1, Int((size.width + gap) / (bar + gap)))
            let top: CGFloat = markers.isEmpty ? 0 : 10
            let mid = top + (size.height - top) / 2
            for i in 0..<n {
                var v: Float = 0.08
                if !peaks.isEmpty {
                    let a = i * peaks.count / n
                    let b = max(a + 1, (i + 1) * peaks.count / n)
                    for k in a..<min(b, peaks.count) { v = max(v, peaks[k]) }
                }
                let h = max(2, CGFloat(v) * (size.height - top) * 0.92)
                let rect = CGRect(x: CGFloat(i) * (bar + gap), y: mid - h / 2, width: bar, height: h)
                let played = (Double(i) + 0.5) / Double(n) <= progress
                ctx.fill(Path(roundedRect: rect, cornerRadius: bar / 2), with: .color(played ? accent : .white.opacity(0.22)))
            }
            for (i, m) in markers.enumerated() {
                let current = i == currentMarker
                let r: CGFloat = current ? 3 : 2
                let dot = CGRect(x: m * size.width - r, y: 4 - r, width: r * 2, height: r * 2)
                ctx.fill(Path(ellipseIn: dot), with: .color(current ? accent : .white.opacity(0.55)))
            }
        }
    }
}

extension TimeInterval {
    /// mm:ss.xx
    var lrc: String {
        let cs = Int((Swift.max(self, 0) * 100).rounded())
        return String(format: "%02d:%02d.%02d", cs / 6000, (cs / 100) % 60, cs % 100)
    }
}
