import NiannianCore
import SwiftUI

/// 问问团团：根据记录聊聊 TA
struct ChatView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let personID: UUID

    @State private var chat = ChatModel()
    @State private var input = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            if let person = store.library.person(personID) {
                content(person)
                    .navigationTitle("问问团团")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                    }
            }
        }
    }

    private func content(_ person: Person) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    greeting(person)
                    ForEach(chat.messages) { message in
                        bubble(message, person: person).id(message.id)
                    }
                    if chat.isResponding {
                        HStack(spacing: 8) {
                            BlinkingMascot().frame(width: 28, height: 28)
                            ProgressView()
                            Text("团团在想…").font(.caption).foregroundStyle(Color.inkSecondary)
                        }
                        .id("typing")
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chat.messages.count) {
                if let id = chat.messages.last?.id {
                    withAnimation { proxy.scrollTo(id, anchor: .bottom) }
                }
            }
            .onChange(of: chat.isResponding) {
                if chat.isResponding { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
            }
        }
        .background(Color.cream)
        .safeAreaInset(edge: .bottom) { inputBar(person) }
    }

    private func greeting(_ person: Person) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                BlinkingMascot().frame(width: 44, height: 44)
                Text("我看过你记下的关于\(person.name)的事啦。想聊聊 TA 最近的状态，还是想要送礼建议？")
                    .padding(12)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            if chat.messages.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(Prompts.suggestions(for: person, in: store.library), id: \.self) { s in
                            Button(s) { send(s, person: person) }
                                .buttonStyle(ChipStyle())
                        }
                    }
                    .padding(.leading, 54)
                }
                .scrollIndicators(.hidden)
            }
            if let reason = Assistant.unavailableReason {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(Color.inkSecondary)
                    .padding(.leading, 54)
            }
        }
    }

    @ViewBuilder
    private func bubble(_ message: ChatModel.Message, person: Person) -> some View {
        switch message.role {
        case .user:
            Text(message.text)
                .padding(12)
                .background(Color.limeSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.leading, 40)
        case .assistant:
            VStack(alignment: .leading, spacing: 8) {
                Text(LocalizedStringKey(message.text))
                    .textSelection(.enabled)
                    .padding(12)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Button {
                    // 把这条建议记成一件小事
                    store.save(Memory(personID: person.id, title: "团团的建议", text: message.text))
                    store.show("已记进小事")
                } label: {
                    Label("记一笔", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(ChipStyle())
            }
            .padding(.trailing, 30)
        }
    }

    private func inputBar(_ person: Person) -> some View {
        HStack(spacing: 10) {
            TextField("问问关于 TA 的事…", text: $input, axis: .vertical)
                .lineLimit(1...4)
                .focused($focused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .onSubmit { send(input, person: person) }
            MicButton(text: $input)
            if !input.isEmpty {
                Button {
                    send(input, person: person)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.ink)
                        .frame(width: 52, height: 52)
                        .background(Color.lime, in: Circle())
                }
                .disabled(chat.isResponding)
                .accessibilityLabel("发送")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.cream)
    }

    private func send(_ text: String, person: Person) {
        input = ""
        Task { await chat.send(text, person: person, library: store.library) }
    }
}
