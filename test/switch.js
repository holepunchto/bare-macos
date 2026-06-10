const test = require('brittle')

const Switch = require('../lib/switch')

test('setLocal updates state, broadcasts to peers, does not echo to the UI', (t) => {
  const broadcast = []
  const notify = []
  const sw = new Switch({
    broadcast: (on) => broadcast.push(on),
    notify: (on) => notify.push(on)
  })

  const result = sw.setLocal(true)

  t.is(result, true, 'returns the new authoritative state')
  t.is(sw.on, true, 'state is updated')
  t.alike(broadcast, [true], 'broadcast to peers')
  t.alike(notify, [], 'no echo back to the UI that made the change')
})

test('applyRemote updates state, notifies the UI, does not re-broadcast', (t) => {
  const broadcast = []
  const notify = []
  const sw = new Switch({
    broadcast: (on) => broadcast.push(on),
    notify: (on) => notify.push(on)
  })

  sw.applyRemote(true)

  t.is(sw.on, true, 'state is updated')
  t.alike(notify, [true], 'the UI is told a peer changed it')
  t.alike(broadcast, [], 'not re-broadcast, so peers cannot loop')
})

test('decode reads the last byte when chunks coalesce', (t) => {
  t.is(Switch.decode(Buffer.from([0, 1, 0, 1])), true)
  t.is(Switch.decode(Buffer.from([1, 0])), false)
})

test('encode produces a single 0/1 byte', (t) => {
  t.alike(Switch.encode(true), Buffer.from([1]))
  t.alike(Switch.encode(false), Buffer.from([0]))
})
