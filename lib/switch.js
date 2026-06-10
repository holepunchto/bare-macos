// The shared switch, as a pure unit: it holds the boolean and decides what
// happens on a local vs. a remote change. The collaborators that actually touch
// the world - `broadcast` (write to peers) and `notify` (tell the UI) - are
// injected, so this logic is testable without a network or the BareKit host.
module.exports = class Switch {
  constructor({ broadcast = () => {}, notify = () => {} } = {}) {
    this._broadcast = broadcast
    this._notify = notify
    this.on = false
  }

  // The user flipped it: update, push to peers, and return the new state.
  // We do NOT notify our own UI - it made the change and already knows.
  setLocal(on) {
    this.on = on
    this._broadcast(on)
    return this.on
  }

  // A peer flipped it: update and tell our UI. We do NOT re-broadcast, or two
  // peers would echo a change back and forth forever.
  applyRemote(on) {
    this.on = on
    this._notify(on)
  }

  static encode(on) {
    return Buffer.from([on ? 1 : 0])
  }

  static decode(data) {
    // A chunk may coalesce several updates; the latest byte wins.
    return data[data.length - 1] === 1
  }
}
