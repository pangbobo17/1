import CoreImage
import ImagePlayground
import PhotosUI
import SwiftUI
import Vision

/// 制作形象：选照片 → 用 Image Playground 生成卡通形象（可跳过）→ 去掉背景
struct AvatarMaker: View {
    var personName: String
    var about: String
    var onDone: (UIImage) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.supportsImagePlayground) private var supportsImagePlayground

    enum Step: Int { case pick, understood, making, removing, done }

    @State private var step = Step.pick
    @State private var pickerItem: PhotosPickerItem?
    @State private var photo: UIImage?
    @State private var result: UIImage?
    @State private var note: String?
    @State private var showPlayground = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(spacing: 6) {
                    Text(title).font(.title2.bold())
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.inkSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 8)

                preview
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                progress
                actions
            }
            .padding(20)
            .background(Color.cream)
            .navigationTitle("制作形象")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            }
        }
        .imagePlaygroundSheet(isPresented: $showPlayground, concepts: concepts,
                              sourceImage: photo.map { Image(uiImage: $0) }) { url in
            Task { await finishPlayground(url) }
        } onCancellation: {
            step = photo == nil ? .pick : .understood
        }
        .imagePlaygroundGenerationStyle(.animation)
        .onChange(of: pickerItem) {
            Task { await loadPhoto() }
        }
    }

    private var title: String {
        switch step {
        case .pick: "给\(personName.isEmpty ? "TA" : personName)做个形象"
        case .understood: "照片选好了"
        case .making: "正在制作新形象"
        case .removing: "正在去除背景"
        case .done: "形象做好了"
        }
    }

    private var subtitle: String {
        switch step {
        case .pick: "选一张 TA 的全身或半身照，会做成站在首页上的小人。"
        case .understood: supportsImagePlayground ? "可以生成卡通形象，也可以直接把照片里的人抠出来。" : "会把照片里的人抠出来，作为 TA 的形象。"
        case .making: "在 Image Playground 里挑一个喜欢的样子。"
        case .removing: "马上就好。"
        case .done: note ?? "确认后就会出现在 TA 的主页和桌面小组件上。"
        }
    }

    @ViewBuilder
    private var preview: some View {
        if let image = result ?? photo {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: result == nil ? 20 : 0, style: .continuous))
                .opacity(step == .removing ? 0.5 : 1)
                .overlay { if step == .removing { ProgressView().controlSize(.large) } }
        } else {
            VStack(spacing: 12) {
                Image(systemName: "hands.and.sparkles.fill")
                    .font(.system(size: 90))
                    .foregroundStyle(Color.ink.opacity(0.8), Color.lime)
                    .symbolEffect(.bounce, options: .repeating.speed(0.3))
            }
        }
    }

    /// 理解图片 · 制作形象 · 去除背景
    private var progress: some View {
        let percent: Double = switch step {
        case .pick: 0
        case .understood: 0.3
        case .making: 0.55
        case .removing: 0.85
        case .done: 1
        }
        return VStack(spacing: 12) {
            ProgressView(value: percent)
                .tint(Color.lime)
                .animation(.easeInOut, value: percent)
            HStack {
                stepDot(1, "理解图片", doneWhen: .understood)
                Spacer()
                stepDot(2, "制作形象", doneWhen: .removing)
                Spacer()
                stepDot(3, "去除背景", doneWhen: .done)
            }
        }
        .card()
    }

    private func stepDot(_ n: Int, _ label: String, doneWhen: Step) -> some View {
        let done = step.rawValue >= doneWhen.rawValue
        let active = !done && step.rawValue >= doneWhen.rawValue - 1
        return VStack(spacing: 4) {
            ZStack {
                Circle().fill(done ? Color.ink : (active ? Color.lime : Color.clear))
                Circle().strokeBorder(Color.ink.opacity(done || active ? 0 : 0.3))
                if done {
                    Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white)
                } else {
                    Text("\(n)").font(.caption.bold())
                }
            }
            .frame(width: 26, height: 26)
            Text(label).font(.caption2).foregroundStyle(Color.inkSecondary)
        }
    }

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 10) {
            switch step {
            case .pick:
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Text("选一张照片").frame(maxWidth: .infinity)
                }
                .buttonStyle(LimeButtonStyle())
                if supportsImagePlayground {
                    Button("不用照片，按描述生成") {
                        step = .making
                        showPlayground = true
                    }
                    .font(.subheadline.weight(.semibold))
                }
            case .understood:
                if supportsImagePlayground {
                    Button("生成卡通形象") {
                        step = .making
                        showPlayground = true
                    }
                    .buttonStyle(LimeButtonStyle())
                }
                Button("直接用照片抠图") {
                    if let photo { Task { await cutout(photo) } }
                }
                .modifier(SecondaryOrLime(isPrimary: !supportsImagePlayground))
                PhotosPicker("换一张照片", selection: $pickerItem, matching: .images)
                    .font(.subheadline.weight(.semibold))
            case .making, .removing:
                Button("请稍候") {}
                    .buttonStyle(LimeButtonStyle())
                    .disabled(true)
            case .done:
                Button("用这个形象") {
                    if let result { onDone(result) }
                    dismiss()
                }
                .buttonStyle(LimeButtonStyle())
                Button("重新制作") {
                    result = nil
                    note = nil
                    step = photo == nil ? .pick : .understood
                }
                .font(.subheadline.weight(.semibold))
            }
        }
        .foregroundStyle(Color.ink)
    }

    private var concepts: [ImagePlaygroundConcept] {
        var c: [ImagePlaygroundConcept] = [.text("全身站立的人物，正面，简单纯色背景")]
        if !about.isEmpty { c.append(.text(about)) }
        return c
    }

    private func loadPhoto() async {
        guard let item = pickerItem,
              let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        photo = image.resized(maxSide: 1600)
        result = nil
        step = .understood
    }

    private func finishPlayground(_ url: URL) async {
        guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
            step = photo == nil ? .pick : .understood
            return
        }
        await cutout(image)
    }

    private func cutout(_ image: UIImage) async {
        step = .removing
        if let cut = await BackgroundRemover.cutout(image) {
            result = cut
            note = nil
        } else {
            result = image
            note = "没认出画面里的人，先保留了整张图。"
        }
        step = .done
    }
}

private struct SecondaryOrLime: ViewModifier {
    var isPrimary: Bool

    func body(content: Content) -> some View {
        if isPrimary {
            content.buttonStyle(LimeButtonStyle())
        } else {
            content.font(.headline)
        }
    }
}

/// 用 Vision 把主体抠出来，裁到主体范围
enum BackgroundRemover {
    static func cutout(_ image: UIImage) async -> UIImage? {
        let upright = image.resized(maxSide: 1600)
        return await Task.detached(priority: .userInitiated) {
            cutoutSync(upright)
        }.value
    }

    nonisolated static func cutoutSync(_ image: UIImage) -> UIImage? {
        guard let cg = image.cgImage else { return nil }
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        do {
            try handler.perform([request])
            guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return nil }
            let buffer = try observation.generateMaskedImage(ofInstances: observation.allInstances, from: handler,
                                                             croppedToInstancesExtent: true)
            let ci = CIImage(cvPixelBuffer: buffer)
            guard let out = CIContext().createCGImage(ci, from: ci.extent) else { return nil }
            return UIImage(cgImage: out)
        } catch {
            return nil
        }
    }
}
