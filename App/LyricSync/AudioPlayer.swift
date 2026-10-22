import AVFoundation
import Observation

@MainActor
@Observable
final class AudioPlayer {
    private(set) var isPlaying = false
    private(set) var duration: TimeInterval = 0
    private(set) var currentTime: TimeInterval = 0

    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?

    func load(url: URL) throws {
        stop()
        try AVAudioSession.sharedInstance().setCategory(.playback)
        try AVAudioSession.sharedInstance().setActive(true)
        let player = try AVAudioPlayer(contentsOf: url)
        player.prepareToPlay()
        self.player = player
        duration = player.duration
        currentTime = 0
    }

    func toggle() {
        isPlaying ? pause() : play()
    }

    func play() {
        guard let player else { return }
        player.play()
        isPlaying = true
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    func pause() {
        player?.pause()
        isPlaying = false
        timer?.invalidate()
    }

    func stop() {
        pause()
        player?.stop()
    }

    func seek(to time: TimeInterval) {
        guard let player else { return }
        player.currentTime = max(0, min(time, duration))
        currentTime = player.currentTime
    }

    private func tick() {
        guard let player else { return }
        currentTime = player.currentTime
        if !player.isPlaying {
            isPlaying = false
            timer?.invalidate()
        }
    }
}
