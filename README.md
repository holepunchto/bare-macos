# bare-macos

A peer-to-peer **shared switch** for macOS, showing how to embed [Bare](https://github.com/holepunchto/bare) in a native SwiftUI app.

Flip the switch in one window and it flips in every other copy of the app - connected directly, device to device, with **no server**. The networking is JavaScript running inside the app on its own thread; the interface is native Swift. The two halves talk over a typed RPC protocol generated from a single schema.

> This is an example/reference app, not a library - the macOS counterpart to
> [bare-ios](https://github.com/holepunchto/bare-ios) and
> [bare-android](https://github.com/holepunchto/bare-android).

## What it demonstrates

- **Embedding Bare in a native macOS app** via [bare-kit](https://github.com/holepunchto/bare-kit). The Bare runtime runs as a _worklet_ - a JavaScript runtime on its own background thread, started and messaged by the native app.
- **A real peer-to-peer stack on the desktop.** [Hyperswarm](https://github.com/holepunchto/hyperswarm) discovers peers through a distributed hash table and connects them with end-to-end (Noise) encryption - no server, no signalling.
- **One schema, two runtimes.** `schema.js` defines the wire protocol once and emits a typed [hrpc](https://github.com/holepunchto/hrpc) interface for _both_ the JavaScript backend and the Swift UI (via [hrpc-swift](https://github.com/holepunchto/hrpc-swift)). Neither side parses bytes by hand. The generated code lives under `spec/` and is committed, so you can read it without running codegen.
- **A distributed-systems lesson, on purpose.** The shared switch is deliberately naive - last-writer-wins with no conflict resolution - so the demo can _show_ you where that breaks and point you at the right tool for it ([Autobase](https://github.com/holepunchto/autobase)). See the two-act demo below.

## Architecture

```
+------------------------------+   typed hrpc over IPC    +------------------------------+
|  SwiftUI (main thread)       |  <------- (bytes) ------> |  Worklet thread (Bare)       |
|  Toggle, peer count, key     |                          |  Hyperswarm node             |
|  HRPC client (generated)     |                          |  HRPC server (generated)     |
+------------------------------+                          +--------------+---------------+
        ^  one schema generates both ends                                | Noise-encrypted
        +------------------- schema.js -------------------+               v
                                                          |   other copies of the app
                                                          |   (found on the DHT)
```

`schema.js` generates both the Swift client and the JavaScript server, all under `spec/`. The switch state travels: **toggle -> hrpc `setState` -> worklet -> broadcast to peers -> peers' worklets -> hrpc `newState` -> their UIs.**

## Quickstart

Prerequisites: macOS + Xcode, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), the [GitHub CLI](https://cli.github.com) (`gh`, for the prebuilt framework), and Node.js.

One-time setup:

```sh
npm install                                   # JS deps + codegen/build tools

# Fetch the prebuilt macOS BareKit framework:
gh release download v2.1.3 --repo holepunchto/bare-kit --pattern prebuilds.zip
unzip prebuilds.zip 'darwin/*' -d prebuilds/
mv prebuilds/darwin/BareKit.xcframework app/frameworks/

xcodegen generate                             # project.yml -> App.xcodeproj
```

Then **the build is driven entirely by `xcodebuild`** - the scheme's pre-actions regenerate the schema (`schema.js`), re-link the native addons (`bare-link`), and re-pack the worklet JS (`bare-pack`) on every build:

```sh
xcodebuild -scheme App -derivedDataPath build build
```

Edit `schema.js` or `backend/backend.js` and just run `xcodebuild` again; the pre-actions pick the changes up. (If a schema edit changes the generated `spec/`, commit the regenerated files.)

## Try it - then watch it break (on purpose)

**Act 1 - it syncs.** Launch two copies of the built app:

```sh
open build/Build/Products/Debug/App.app      # window 1
open -n build/Build/Products/Debug/App.app   # window 2 (new instance)
```

Both start off. Flip the switch in one window and the other follows - instantly, with no server. That is the whole stack working: Hyperswarm found the peer on the DHT, opened a Noise-encrypted connection, and your flip crossed the native/Bare boundary as a typed `hrpc` call and back.

**Act 2 - now break it.** Quit both, then:

```sh
open build/Build/Products/Debug/App.app      # one window - flip it ON while it is alone
open -n build/Build/Products/Debug/App.app   # NOW launch the second window
```

The two windows **disagree**: the freshly launched peer's default clobbers the state you set. That is not a bug to file - it is the point. The switch is a shared mutable value with no ordering, so when two peers hold different states there is no way to know whose is "right." Last-writer-wins, and they can diverge.

## The right tool for this: Autobase

Convergent multi-writer state is a solved problem in this ecosystem - it is just a different building block. [**Autobase**](https://github.com/holepunchto/autobase) linearizes each peer's append-only log into one deterministic view, so every peer ends in the same state regardless of join order, concurrent edits, or restarts. A real shared switch - or shared list, or collaborative document - would be built on it.

This example deliberately _does not_ use Autobase: it brings storage, replication, and a multi-writer membership model that would bury the thing we are actually showing here - embedding Bare and talking to it over a typed protocol. Treat the divergence above as the motivation for reaching for Autobase next, not as a defect to patch here.

## How it works

- **Worklet** (`backend/backend.js`) - runs on the Bare thread. It owns the Hyperswarm node and serves the hrpc interface. The bug-prone bit (local vs. remote changes, no-echo / no-loop) lives in `lib/switch.js` and is unit-tested.
- **Transport** (`app/BareTransport.swift`) - bridges the generated hrpc engine to the worklet's IPC byte stream. `bare-rpc` does its own framing, so there is no hand-rolled byte parsing.
- **Model** (`app/SyncModel.swift`) - boots the worklet, wires the typed RPC, and exposes `@Published` state to SwiftUI.

## Project layout

```
schema.js            the protocol, defined once
backend/backend.js   the worklet: Hyperswarm node + hrpc server
lib/switch.js        the shared-switch state logic (unit-tested)
app/                 the SwiftUI app + IPC/hrpc transport
project.yml          XcodeGen project spec (incl. Generate/Link/Pack pre-actions)
spec/                generated code (committed): JS server + Swift packages
```

## Tests

`npm test` runs the worklet's state logic on Bare (`brittle-bare --coverage`). The `xcodebuild` build is the integration test (the whole stack compiling and linking); launching two instances that discover each other on the DHT is the end-to-end test.

## Notes

- **Entitlements.** `project.yml` declares `com.apple.security.cs.allow-jit` (xcodegen writes it into the app's entitlements). It is required for V8's JIT under the Hardened Runtime on macOS; the same key is inert on iOS, where Bare runs V8 jitless. The app is not sandboxed; for the Mac App Store you would add the App Sandbox plus `com.apple.security.network.client`/`.server`.
- **Minimum macOS.** Targets macOS 13.0.
- **Engine.** Uses the default V8 build of BareKit; a JavaScriptCore variant also ships in the release.

## License

Apache-2.0
