import BareKit
import Foundation
import HRPC
import Schema
import SwiftUI

// The view model. It owns the Bare worklet (the P2P backend on its own thread)
// and talks to it through the generated, typed hrpc interface. Every @Published
// property here is driven by an event from the worklet.
@MainActor
final class SyncModel: ObservableObject {
  @Published var on = false
  @Published var peers = 0
  @Published var publicKey = "…"
  @Published var topic = "…"

  private let worklet = Worklet()
  private var transport: BareTransport?
  private var rpc: HRPC?

  init() {
    // Boot the P2P node when the app starts — it lives for the app's lifetime,
    // not a single window.
    start()
  }

  func start() {
    // Boot the worklet from the packed bundle (app.bundle in app resources).
    worklet.start(name: "app", ofType: "bundle")

    // Wire the typed RPC over the worklet's IPC byte stream.
    let ipc = IPC(worklet: worklet)
    let transport = BareTransport(ipc: ipc)
    let rpc = HRPC(delegate: transport)
    self.transport = transport
    self.rpc = rpc

    // worklet -> UI events.
    rpc.onNewState { [weak self] state in
      guard let state else { return }
      await MainActor.run { self?.on = state.on }
    }
    rpc.onPeersChanged { [weak self] peers in
      guard let peers else { return }
      await MainActor.run { self?.peers = Int(peers.count) }
    }
    rpc.onInfo { [weak self] info in
      guard let info else { return }
      await MainActor.run {
        self?.publicKey = info.publicKey
        self?.topic = info.topic
      }
    }

    // Pump inbound bytes from the worklet into the RPC engine.
    transport.readLoop(into: rpc)
  }

  // UI -> worklet request. Update optimistically, then reconcile with the
  // authoritative state the worklet returns after broadcasting to peers.
  func setOn(_ value: Bool) {
    on = value
    Task { [weak self] in
      guard let rpc = self?.rpc else { return }
      if let result = try? await rpc.setState(SwitchState(on: value)) {
        await MainActor.run { self?.on = result.on }
      }
    }
  }

  func terminate() {
    worklet.terminate()
  }
}
