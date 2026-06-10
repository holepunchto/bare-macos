'use strict'

// One schema, two runtimes.
//
// This single file defines the wire protocol once and emits it for *both*
// sides of the app:
//
//   - the Bare worklet (JavaScript)  -> spec/schema, spec/hrpc
//   - the native macOS UI (Swift)    -> swift/schema, swift/hrpc
//
// The Swift UI and the Bare backend therefore speak a typed, generated
// protocol with no hand-written byte parsing on either side. Edit the
// definitions below and re-run `npm run gen`.

const fs = require('fs')
const path = require('path')

const Hyperschema = require('hyperschema')
const HRPCBuilder = require('hrpc')
const SwiftHyperschema = require('hyperschema-swift')
const SwiftHRPC = require('hrpc-swift')

const ROOT = __dirname

const JS_SCHEMA_DIR = path.join(ROOT, 'spec', 'schema')
const JS_HRPC_DIR = path.join(ROOT, 'spec', 'hrpc')
const SWIFT_SCHEMA_DIR = path.join(ROOT, 'swift', 'schema')
const SWIFT_HRPC_DIR = path.join(ROOT, 'swift', 'hrpc')

const NS = 'sync'

// Regenerate from a clean slate so `generate.js` is the single source of truth.
// (For a *published* protocol you would instead commit spec/ and let hyperschema
// enforce append-only evolution; here the schema is still being designed.)
for (const dir of [JS_SCHEMA_DIR, JS_HRPC_DIR, SWIFT_SCHEMA_DIR, SWIFT_HRPC_DIR]) {
  fs.rmSync(dir, { recursive: true, force: true })
}

// --- The protocol, defined once ---

// Message types (become compact-encoding codecs in JS and structs in Swift).
function defineTypes(ns) {
  // NB: do not name this 'state' — the Swift codegen would emit a `State`
  // struct that collides with `CompactEncoding.State` inside the generated
  // codecs. 'switch-state' -> `SwitchState`, which is collision-free.
  ns.register({
    name: 'switch-state',
    fields: [{ name: 'on', type: 'bool', required: true }]
  })
  // Named 'identity' rather than 'info' so its codec property does not collide
  // with the 'info' *command* method in the generated Swift class.
  ns.register({
    name: 'identity',
    fields: [
      { name: 'publicKey', type: 'string', required: true },
      { name: 'topic', type: 'string', required: true }
    ]
  })
  ns.register({
    name: 'peers',
    fields: [{ name: 'count', type: 'uint', required: true }]
  })
}

// RPC commands (become typed methods + handlers on both sides).
function defineCommands(ns) {
  // UI -> worklet: request the switch be set; worklet replies with the
  // authoritative state after broadcasting it to peers.
  ns.register({
    name: 'set-state',
    request: { name: '@sync/switch-state', stream: false },
    response: { name: '@sync/switch-state', stream: false }
  })

  // worklet -> UI: the switch changed because a *peer* flipped it.
  ns.register({
    name: 'new-state',
    request: { name: '@sync/switch-state', stream: false, send: true },
    response: null
  })

  // worklet -> UI: the number of connected peers changed.
  ns.register({
    name: 'peers-changed',
    request: { name: '@sync/peers', stream: false, send: true },
    response: null
  })

  // worklet -> UI: our identity and topic, emitted once on startup.
  ns.register({
    name: 'info',
    request: { name: '@sync/identity', stream: false, send: true },
    response: null
  })
}

// --- Emit the JavaScript side (for the Bare worklet) ---

const jsSchema = Hyperschema.from(JS_SCHEMA_DIR)
defineTypes(jsSchema.namespace(NS))
Hyperschema.toDisk(jsSchema)

const jsHrpc = HRPCBuilder.from(JS_SCHEMA_DIR, JS_HRPC_DIR)
defineCommands(jsHrpc.namespace(NS))
HRPCBuilder.toDisk(jsHrpc)

console.log('Wrote JS schema  ->', path.relative(ROOT, JS_SCHEMA_DIR))
console.log('Wrote JS hrpc    ->', path.relative(ROOT, JS_HRPC_DIR))

// --- Emit the Swift side (for the native UI) ---

const swiftSchema = SwiftHyperschema.from(null)
defineTypes(swiftSchema.namespace(NS))

const swiftHrpc = SwiftHRPC.from(swiftSchema)
defineCommands(swiftHrpc.namespace(NS))

SwiftHyperschema.toDisk(swiftSchema, SWIFT_SCHEMA_DIR)
SwiftHRPC.toDisk(swiftHrpc, SWIFT_HRPC_DIR, {
  schemaPackagePath: '../schema',
  schemaPackageName: 'Schema',
  schemaPackageId: 'schema'
})

console.log('Wrote Swift schema ->', path.relative(ROOT, SWIFT_SCHEMA_DIR))
console.log('Wrote Swift hrpc   ->', path.relative(ROOT, SWIFT_HRPC_DIR))
