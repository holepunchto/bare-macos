# bare-macos

A peer-to-peer **shared switch** for macOS, showing how to embed [Bare](https://github.com/holepunchto/bare) in a native SwiftUI app.

Flip the switch in one window and it flips in every other copy of the app — connected directly, device to device, with **no server**. The networking is JavaScript running inside the app on its own thread; the interface is native Swift. The two halves talk over a typed RPC protocol generated from a single schema.

> This is an example/reference app, not a library — the macOS counterpart to
> [bare-ios](https://github.com/holepunchto/bare-ios) and
> [bare-android](https://github.com/holepunchto/bare-android).

## What it demonstrates

- **Embedding Bare in a native macOS app** via [bare-kit](https://github.com/holepunchto/bare-kit). The Bare runtime runs as a _worklet_ — a JavaScript runtime on its own background thread, started and messaged by the native app.
- **A real peer-to-peer stack on the desktop.** [Hyperswarm](https://github.com/holepunchto/hyperswarm) discovers peers through a distributed hash table and connects them with end-to-end (Noise) encryption — no server, no signalling.
- **One schema, two runtimes.** `schema/generate.js` defines the wire protocol once and emits a typed [hrpc](https://github.com/holepunchto/hrpc) interface for _both_ the JavaScript backend (via [hrpc](https://github.com/holepunchto/hrpc)) and the Swift UI (via [hrpc-swift](https://github.com/holepunchto/hrpc-swift)). Neither side parses bytes by hand.

## Architecture

```
┌──────────────────────────────┐   typed hrpc over IPC   ┌──────────────────────────────┐
│  SwiftUI (main thread)       │  ◄───── (bytes) ──────►  │  Worklet thread (Bare)        │
│  Toggle, peer count, key     │                          │  Hyperswarm node              │
│  HRPC client (generated)     │                          │  HRPC server (generated)      │
└──────────────────────────────┘                          └───────────────┬──────────────┘
        ▲  one schema generates both ends                                  │ Noise-encrypted
        └──────────────── schema/generate.js ───────────────┐             ▼
                                                              │   other copies of the app
                                                              │   (found on the DHT)
```

The same `schema/generate.js` produces `swift/` (the UI's typed client) and `spec/` (the worklet's typed server). The switch state travels: **toggle → hrpc `setState` → worklet → broadcast to peers → peers' worklets → hrpc `newState` → their UIs.**

## Quickstart

Prerequisites: macOS + Xcode, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), the [GitHub CLI](https://cli.github.com) (`gh`, for the prebuilt framework), and Node.js.

```sh
make          # install deps, fetch BareKit, generate, bundle, link, build the app
make run      # launch it
make run2     # launch a SECOND instance — flip the switch and watch them sync
```

`make` runs these steps in order (each is also a separate target):

| Step          | What it does                                                              |
| ------------- | ------------------------------------------------------------------------- |
| `npm install` | JS dependencies and codegen/build tools                                   |
| `framework`   | downloads the prebuilt macOS `BareKit.xcframework` into `app/frameworks/` |
| `gen`         | one schema → JS (`spec/`) and Swift (`swift/`) packages                   |
| `pack`        | bundles the worklet JS (+ deps) into `app/app.bundle`                     |
| `link`        | resolves native addons (udx-native, sodium-native, …) into `app/addons/`  |
| `addons`      | derives `app/addons/addons.yml` so Xcode embeds those frameworks          |
| `project`     | `xcodegen generate` → `BareSwitch.xcodeproj`                              |
| `build`       | `xcodebuild`                                                              |

Edit the worklet JS and re-run `make pack build`; edit the schema and re-run `make gen pack build`.

## How it works

- **Worklet** (`backend/backend.js`) — runs on the Bare thread. It owns the Hyperswarm node and serves the hrpc interface. The bug-prone bit (local vs. remote changes, no-echo / no-loop) lives in `lib/switch.js` and is unit-tested.
- **Transport** (`app/BareTransport.swift`) — bridges the generated hrpc engine to the worklet's IPC byte stream. `bare-rpc` does its own framing, so there is no hand-rolled byte parsing.
- **Model** (`app/SyncModel.swift`) — boots the worklet, wires the typed RPC, and exposes `@Published` state to SwiftUI.

## Project layout

```
schema/generate.js   the protocol, defined once
backend/backend.js   the worklet: Hyperswarm node + hrpc server
lib/switch.js        the shared-switch state logic (unit-tested)
app/                 the SwiftUI app + IPC↔hrpc transport
project.yml          XcodeGen project spec
Makefile             clean checkout → running app
spec/  swift/        generated (gitignored); produced by `make gen`
```

## Tests

`npm test` runs the worklet's state logic on **both Bare and Node** (`brittle`). The native `make build` is the integration test (the whole stack compiling and linking); launching two instances that discover each other on the DHT is the end-to-end test (`make run` + `make run2`).

## Notes

- **Entitlements.** `app/BareSwitch.entitlements` sets `com.apple.security.cs.allow-jit`, required for V8's JIT under the Hardened Runtime on macOS. (The same key is inert on iOS, where Bare runs V8 jitless.) The app is not sandboxed; for the Mac App Store you would add the App Sandbox plus `com.apple.security.network.client`/`.server`.
- **Minimum macOS.** Targets macOS 13.0.
- **Engine.** Uses the default V8 build of BareKit; a JavaScriptCore variant also ships in the release.

## License

Apache-2.0
