import Foundation

/// 从粘贴的文字里找链接，并识别常见平台的分享链接（这些是网页，不是音频文件本身）
public enum LinkParser {
    private static let platforms: [(hosts: [String], name: String)] = [
        (["douyin.com", "iesdouyin.com", "tiktok.com"], "抖音"),
        (["bilibili.com", "b23.tv"], "B站"),
        (["youtube.com", "youtu.be"], "YouTube"),
        (["xiaohongshu.com", "xhslink.com"], "小红书"),
        (["kuaishou.com", "chenzhongtech.com"], "快手"),
        (["music.163.com", "163cn.tv"], "网易云音乐"),
        (["y.qq.com"], "QQ 音乐"),
        (["kugou.com", "kuwo.cn"], "酷狗 / 酷我"),
        (["weixin.qq.com"], "微信"),
        (["music.apple.com", "open.spotify.com"], "在线音乐平台"),
    ]

    /// 文字里的第一个 http(s) 链接；分享文案常是“标题 + 链接”
    public static func findURL(in text: String) -> URL? {
        let stops: Set<Character> = [" ", "\n", "\t", "<", ">", "\"", "'", "，", "。", "！", "？", "、", "）", ")", "】"]
        guard let range = text.range(of: "https://", options: .caseInsensitive) ?? text.range(of: "http://", options: .caseInsensitive) else {
            return nil
        }
        let candidate = String(text[range.lowerBound...].prefix { !stops.contains($0) })
        guard let url = URL(string: candidate), let host = url.host, !host.isEmpty else { return nil }
        return url
    }

    /// 平台分享链接返回平台名，否则 nil
    public static func platform(of url: URL) -> String? {
        guard let host = url.host?.lowercased() else { return nil }
        for (hosts, name) in platforms where hosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
            return name
        }
        return nil
    }

    /// 从链接路径里取文件名（不含扩展名），取不到就用域名
    public static func name(from url: URL) -> String {
        let last = url.deletingPathExtension().lastPathComponent
        return last.isEmpty || last == "/" ? (url.host ?? "未命名") : last
    }
}
