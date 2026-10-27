import Foundation

/// 给端上大模型的提示词。模型上下文不大，所以资料要截短
public enum Prompts {
    public static let mascotName = "团团"

    public static let chatInstructions = """
    你是“\(mascotName)”，一个温柔、靠谱的小助手，住在“念念”App 里。用户在这里记录 TA 在意的人：重要日子和生活里的小事。
    你会收到关于某一个人的资料。请只根据这些资料和常识回答，用简体中文，语气自然亲切，不要编造资料里没有的经历。
    回答简洁：一般不超过 200 字；给建议时列 2 到 4 条，每条一句话说明理由。
    """

    public static let organizeInstructions = """
    你帮用户整理一段关于家人或朋友的随手记录。保留原意和细节，不要添加没有提到的事实。
    标题不超过 12 个字；正文把口语整理成通顺的一两句话。用简体中文。
    """

    /// 某个人的资料摘要，放进对话开头
    public static func context(for person: Person, in library: Library, now: Date = .now,
                               maxMemories: Int = 15, maxCharacters: Int = 1600) -> String {
        var lines: [String] = []
        var head = "名字：\(person.name)"
        if !person.relation.isEmpty { head += "（用户的\(person.relation)）" }
        lines.append(head)
        if !person.about.isEmpty { lines.append("关于 TA：\(person.about)") }
        lines.append("今天是 \(now.chineseDate)。")

        let upcoming = library.upcoming(for: person.id, from: now).filter { !$0.isPast }.prefix(5)
        if !upcoming.isEmpty {
            lines.append("重要时刻：")
            for u in upcoming {
                var s = "- \(u.moment.title)（\(u.moment.kind.title)），\(u.date.chineseDate)，\(u.label)"
                if u.moment.kind == .birthday, let y = u.years { s += "，满 \(y) 岁" }
                lines.append(s)
            }
        }

        let memories = library.memories(of: person.id).prefix(maxMemories)
        if !memories.isEmpty {
            lines.append("最近的小事（新的在前）：")
            for m in memories {
                let date = (m.date ?? m.createdAt).chineseDate
                let text = m.text.replacingOccurrences(of: "\n", with: " ")
                let body = text.count > 80 ? String(text.prefix(80)) + "…" : text
                lines.append("- \(date) \(m.title.isEmpty ? "" : m.title + "：")\(body)")
            }
        }

        var result = lines.joined(separator: "\n")
        if result.count > maxCharacters { result = String(result.prefix(maxCharacters)) }
        return result
    }

    /// 聊天里的快捷问题
    public static func suggestions(for person: Person, in library: Library, now: Date = .now) -> [String] {
        var s = ["TA 最近在忙什么？"]
        if let next = library.upcoming(for: person.id, from: now).first(where: { !$0.isPast && $0.days <= 60 }) {
            s.append("\(next.moment.title)快到了，可以送什么？")
        } else {
            s.append("想给 TA 一个小惊喜，有什么主意？")
        }
        s.append("这周可以和 TA 一起做点什么？")
        return s
    }
}
