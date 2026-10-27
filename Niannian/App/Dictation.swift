import AVFoundation
import Speech
import SwiftUI

/// 语音转文字：按下麦克风开始，再按一次结束
@MainActor
@Observable
final class Dictation {
    private(set) var isRecording = false
    var errorMessage: String?

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    /// 收到识别结果时调用，参数是这次录音到目前为止的全文
    @ObservationIgnored var onText: ((String) -> Void)?

    func start() async {
        guard !isRecording else { return }
        errorMessage = nil
        guard await Self.authorize() else {
            errorMessage = "需要在设置里允许麦克风和语音识别"
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")), recognizer.isAvailable else {
            errorMessage = "语音识别暂时不可用"
            return
        }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)

            let engine = AVAudioEngine()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            Self.installTap(on: engine.inputNode, request: request)
            engine.prepare()
            try engine.start()

            self.engine = engine
            self.request = request
            isRecording = true
            task = Self.recognize(with: recognizer, request: request) { [weak self] text, done in
                Task { @MainActor in
                    guard let self, self.isRecording else { return }
                    if let text { self.onText?(text) }
                    if done { self.stop() }
                }
            }
        } catch {
            errorMessage = "没法开始录音：\(error.localizedDescription)"
            stop()
        }
    }

    func stop() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        engine = nil
        request = nil
        task = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // 下面几个回调在音频线程或系统队列上执行，不能带主线程隔离

    nonisolated private static func installTap(on input: AVAudioInputNode, request: SFSpeechAudioBufferRecognitionRequest) {
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
    }

    nonisolated private static func recognize(with recognizer: SFSpeechRecognizer,
                                              request: SFSpeechAudioBufferRecognitionRequest,
                                              handler: @escaping @Sendable (String?, Bool) -> Void) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            handler(result?.bestTranscription.formattedString, error != nil || (result?.isFinal ?? false))
        }
    }

    nonisolated private static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}

/// 输入框旁边的麦克风按钮，说的话接在已有文字后面
struct MicButton: View {
    @Binding var text: String
    @State private var dictation = Dictation()
    @State private var base = ""

    var body: some View {
        Button {
            if dictation.isRecording {
                dictation.stop()
            } else {
                base = text
                dictation.onText = { spoken in
                    text = base.isEmpty ? spoken : base + spoken
                }
                Task { await dictation.start() }
            }
        } label: {
            Image(systemName: dictation.isRecording ? "stop.fill" : "mic.fill")
                .font(.title3)
                .foregroundStyle(Color.lime)
                .frame(width: 52, height: 52)
                .background(Color.ink, in: Circle())
                .symbolEffect(.pulse, isActive: dictation.isRecording)
        }
        .accessibilityLabel(dictation.isRecording ? "停止说话" : "说话输入")
        .alert("语音输入", isPresented: Binding(get: { dictation.errorMessage != nil },
                                             set: { if !$0 { dictation.errorMessage = nil } })) {
            Button("好") {}
        } message: {
            Text(dictation.errorMessage ?? "")
        }
        .onDisappear { dictation.stop() }
    }
}
