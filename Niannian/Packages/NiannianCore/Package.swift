// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "NiannianCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "NiannianCore", targets: ["NiannianCore"]),
    ],
    targets: [
        .target(name: "NiannianCore"),
        .testTarget(name: "NiannianCoreTests", dependencies: ["NiannianCore"]),
    ]
)
