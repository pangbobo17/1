import FoundationModels
import NiannianCore
import SwiftUI

/// AI 整理出的小事
@Generable
struct OrganizedMemory {
    @Guide(description: "不超过 12 个字的标题，概括这件事")
    var title: String
    @Guide(description: "整理后的正文，一两句通顺的话，保留原文的细节")
    var text: String
}

/// 端上的 Apple 智能模型。资料不出手机
enum Assistant {
    /// 能用时为 nil，不能用时是给用户看的原因
    static var unavailableReason: String? {
        switch SystemLanguageModel.default.availability {
        case .available:
            return nil
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                return "这台设备不支持 Apple 智能，需要 iPhone 15 Pro 或更新的机型。"
            case .appleIntelligenceNotEnabled:
                return "请先在“设置 → Apple 智能与 Siri”中打开 Apple 智能。"
            case .modelNotReady:
                return "Apple 智能模型还在下载，请稍后再试。"
            @unknown default:
                return "暂时用不了 Apple 智能。"
            }
        }
    }

    static var isAvailable: Bool { unavailableReason == nil }

    static func organize(_ text: String, about person: Person?) async throws -> OrganizedMemory {
        let session = LanguageModelSession(instructions: Prompts.organizeInstructions)
        var prompt = "原文：\(text)"
        if let person { prompt = "这段记录是关于\(person.name)的。\n" + prompt }
        return try await session.respond(to: prompt, generating: OrganizedMemory.self).content
    }
}

/// 和团团聊某个人
@MainActor
@Observable
final class ChatModel {
    struct Message: Identifiable, Equatable {
        enum Role { case user, assistant }
        let id = UUID()
        var role: Role
        var text: String
    }

    var messages: [Message] = []
    var isResponding = false
    @ObservationIgnored private var session: LanguageModelSession?

    func send(_ text: String, person: Person, library: Library) async {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isResponding else { return }
        messages.append(Message(role: .user, text: text))
        if let reason = Assistant.unavailableReason {
            messages.append(Message(role: .assistant, text: reason))
            return
        }
        isResponding = true
        defer { isResponding = false }

        if session == nil {
            let instructions = Prompts.chatInstructions + "\n\n以下是关于这个人的资料：\n" + Prompts.context(for: person, in: library)
            session = LanguageModelSession(instructions: instructions)
        }
        do {
            let response = try await session!.respond(to: text)
            messages.append(Message(role: .assistant, text: response.content))
        } catch {
            // 上下文满了或者出错时换一个新会话
            session = nil
            messages.append(Message(role: .assistant, text: "刚才没想好，换个说法再问我一次吧。（\(error.localizedDescription)）"))
        }
    }
}
