'use strict'

// The Bare worklet: the "backend" of the app, running on its own thread inside
// the macOS process. It owns a Hyperswarm node — a real peer-to-peer connection
// to every other copy of this app on the same topic — and exposes a typed hrpc
// interface to the native Swift UI over the BareKit IPC channel.
//
// There is no server anywhere. Two instances of the app find each other through
// the distributed hash table and talk directly, end-to-end encrypted.
//
// The interesting state logic (local vs. remote changes, no-echo/no-loop) lives
// in ../lib/switch.js and is unit-tested; this file is just the wiring.

const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

const HRPC = require('../spec/hrpc')
const Switch = require('../lib/switch')

// `BareKit` is injected by the host; `BareKit.IPC` is the duplex byte stream to
// the Swift side. hrpc rides on top of it and handles all framing/encoding.
const { IPC } = BareKit
const rpc = new HRPC(IPC)

// Every copy of the app joins the same 32-byte topic, so they all meet on the
// DHT. (A real app would let the user pick a room; we keep one fixed room so
// "launch it twice and watch them sync" just works.)
const ROOM = 'bare-macos-switch'
const topic = b4a.alloc(32).fill(ROOM)

const swarm = new Hyperswarm()
const peers = new Set()

const state = new Switch({
  broadcast: (on) => {
    for (const connection of peers) connection.write(Switch.encode(on))
  },
  notify: (on) => rpc.newState({ on })
})

// --- UI -> worklet ---
// The user flipped the switch; apply it locally, push to peers, reply with the
// authoritative state.
rpc.onSetState(async ({ on }) => ({ on: state.setLocal(on) }))

// --- peer wiring ---
swarm.on('connection', (connection) => {
  peers.add(connection)
  console.log('[worklet] peer connected —', peers.size, 'total')
  announcePeers()

  // Bring the newcomer in sync with our current state immediately.
  connection.write(Switch.encode(state.on))

  connection.on('data', (data) => state.applyRemote(Switch.decode(data)))
  connection.on('error', () => {}) // ignore peer resets
  connection.on('close', () => {
    peers.delete(connection)
    announcePeers()
  })
})

swarm.join(topic, { server: true, client: true })

// Tell the UI who we are. Sent once; the IPC stream buffers it until the UI's
// read loop attaches.
const publicKey = b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 8)
console.log('[worklet] up — key', publicKey, 'topic', ROOM)
rpc.info({ publicKey, topic: ROOM })

function announcePeers() {
  rpc.peersChanged({ count: peers.size })
}
