import SwiftUI

@main
struct BareSwitchApp: App {
  @StateObject private var model = SyncModel()

  var body: some Scene {
    WindowGroup {
      ContentView(model: model)
    }
    .windowResizability(.contentSize)
  }
}
