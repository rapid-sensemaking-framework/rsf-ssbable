require('dotenv').config()
const EventEmitter = require('events')

const pull = require('pull-stream')

const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const Config = require('ssb-config/inject')

// ssb-test matches the name of ~/.ssb-test folder where the rest of the `config` is
const ssbconfig = Config('ssb-test', {
  logging: { level: 'info' },
  port: process.env.PORT
})

const STANDARD_EVENT_KEY = 'msg'
module.exports.STANDARD_EVENT_KEY = STANDARD_EVENT_KEY

// export a var which will be used to determine whether to use Textable
// as their mode of contact
const TYPE_KEY = 'ssb'
module.exports.TYPE_KEY = TYPE_KEY

let eventBus, server, serverId

const init = async (config) => {
  console.log('initializing rsf-ssbable')
  // add plugins
  const createApp = SecretStack({ caps: { shs: Buffer.from(caps.shs, 'base64') } })
    .use(require('ssb-db'))
    .use(require('ssb-gossip'))
    .use(require('ssb-replicate'))
    .use(require('ssb-private'))
    .use(require('ssb-logging'))

  server = createApp(ssbconfig)

  // cache the id of the server
  // for later use with encryption
  serverId = await new Promise((resolve, reject) => {
    // .whoami comes from ssb-db
    server.whoami((err, { id }) => {
      if (err) {
        reject(err)
        return
      }
      console.log('ssb id: ' + id)
      resolve(id)
    })
  })

  // a singleton that will act to transmit events between the server listener
  // and the instances of SSBable
  eventBus = new EventEmitter()

  pull(
    server.private.read({ old: false, live: true }), // don't bother with old messages, just stream new ones
    pull.drain((msg) => {
      // already decrypted :)
      console.log(`receiving a message from ${msg.value.author}`)
      eventBus.emit(msg.value.author, msg.value.content.text)
    })
  )
}
module.exports.init = init

const shutdown = async () => {
  console.log('shutting down rsf-ssbable')
  await new Promise((resolve) => {
    server.close(resolve)
  })
  eventBus.removeAllListeners()
  eventBus = null
  server = null
}
module.exports.shutdown = shutdown

class SSBable extends EventEmitter {
  constructor(id, name) {
    super()
    // the feed id
    this.id = id
    // a human name, optional
    this.name = name
    // forward messages from the event bus over the class/instance level event emitter
    eventBus.on(this.id, text => {
      // emit an event that conforms to the standard for Contactable
      this.emit(STANDARD_EVENT_KEY, text)
    })
  }

  // expose a function that conforms to the standard for Contactable
  // which can "reach" the person
  speak(string) {
    return new Promise((resolve, reject) => {
      server.private.publish({
        type: 'post',
        text: string,
        recps: [
          { link: this.id },
          { link: serverId } // remove self?
        ]
      },
        [this.id, serverId], // those to encrypt for.. remove self?
        (err, msg) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
    })
  }

  listen(callback) {
    // just set up the actual event listener
    // using the appropriate key,
    // but not bothering to expose it
    this.on(STANDARD_EVENT_KEY, callback)
  }

  stopListening() {
    this.removeAllListeners()
  }

  config() {
    return {
      type: TYPE_KEY,
      id: this.id,
      name: this.name
    }
  }
}
module.exports.SSBable = SSBable

