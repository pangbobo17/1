import SwiftUI

/// 奶油底 + 青柠绿 + 墨色
extension Color {
    static let cream = Color(red: 0.965, green: 0.957, blue: 0.918)
    static let lime = Color(red: 0.84, green: 0.96, blue: 0.36)
    static let limeSoft = Color(red: 0.91, green: 0.97, blue: 0.70)
    static let leaf = Color(red: 0.47, green: 0.74, blue: 0.24)
    static let ink = Color(red: 0.125, green: 0.133, blue: 0.118)
    static let inkSecondary = Color(red: 0.45, green: 0.46, blue: 0.43)
    static let card = Color.white
}

/// 吉祥物“团团”：黑色圆团子，青柠色眼睛，头顶一棵小芽
struct Mascot: View {
    var blink = false

    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height)
            ZStack {
                // 小芽
                Capsule().fill(Color.leaf)
                    .frame(width: w * 0.05, height: w * 0.2)
                    .offset(y: -w * 0.4)
                Ellipse().fill(Color.lime)
                    .frame(width: w * 0.2, height: w * 0.12)
                    .rotationEffect(.degrees(20))
                    .offset(x: -w * 0.1, y: -w * 0.5)
                Ellipse().fill(Color.lime)
                    .frame(width: w * 0.24, height: w * 0.13)
                    .rotationEffect(.degrees(-15))
                    .offset(x: w * 0.12, y: -w * 0.53)
                // 身体
                Circle()
                    .fill(RadialGradient(colors: [Color(white: 0.32), .ink], center: UnitPoint(x: 0.32, y: 0.28),
                                         startRadius: 0, endRadius: w * 0.5))
                    .frame(width: w * 0.86, height: w * 0.86)
                    .offset(y: w * 0.07)
                // 眼睛
                HStack(spacing: w * 0.1) {
                    eye(w)
                    eye(w)
                }
                .offset(y: w * 0.1)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func eye(_ w: CGFloat) -> some View {
        ZStack {
            Ellipse().fill(Color.lime)
            Circle().fill(Color.ink).frame(width: w * 0.06).offset(x: -w * 0.01)
        }
        .frame(width: w * 0.17, height: blink ? w * 0.03 : w * 0.17)
    }
}

/// 没有形象图片时的占位：一个带名字首字的圆团子小人
struct PlaceholderFigure: View {
    var name: String

    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height * 0.62)
            VStack(spacing: -w * 0.08) {
                Circle()
                    .fill(RadialGradient(colors: [.white, Color(red: 0.98, green: 0.88, blue: 0.78)],
                                         center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: w * 0.5))
                    .frame(width: w * 0.62, height: w * 0.62)
                    .overlay(Text(String(name.prefix(1))).font(.system(size: w * 0.26, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.ink.opacity(0.75)))
                    .zIndex(1)
                UnevenRoundedRectangle(topLeadingRadius: w * 0.4, bottomLeadingRadius: w * 0.12,
                                       bottomTrailingRadius: w * 0.12, topTrailingRadius: w * 0.4)
                    .fill(LinearGradient(colors: [.lime, .leaf], startPoint: .top, endPoint: .bottom))
                    .frame(width: w * 0.78, height: w * 0.7)
            }
            .shadow(color: .black.opacity(0.08), radius: w * 0.04, y: w * 0.03)
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}
