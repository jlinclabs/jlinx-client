const Debug = require('debug')
const b4a = require('b4a')
const {
  base58,
  keyToString,
  keyToBuffer
} = require('jlinx-util')
const EventMachine = require('./EventMachine')

const debug = Debug('jlinx:client:profiles')

module.exports = class Profiles {
  constructor (jlinx) {
    this.jlinx = jlinx
  }

  async create (opts = {}) {
    const {
      ownerSigningKeys,
      serviceEndpoint
    } = opts

    await this.jlinx.connected()
    const doc = await this.jlinx.create({
      ownerSigningKeys
    })
    debug('create', { doc })
    const profile = new Profile(doc, this)
    await profile.init({
      serviceEndpoint,
    })
    await profile.ready()
    return profile
  }

  async get (id) {
    debug('get', { id })
    const doc = await this.jlinx.get(id)
    debug('get', { doc })
    return await Profile.open(doc, this)
  }
}

class Profile extends EventMachine {
  constructor (doc, profiles) {
    super(doc)
    this._profiles = profiles
  }

  get serviceEndpoint () { return this._header?.serviceEndpoint }

  async set (changes) {
    for (const key in changes)
      if (typeof changes[key] === 'undefined')
        changes[key] = null
    await this.appendEvent('update', changes)
  }

  get (key) {
    return this.value[key]
  }
}

Profile.events = {
  update: {
    schema: {
      type: 'object',
      additionalProperties: true
    },
    apply (state, changes) {
      state = { ...state, ...changes }
      for (const key in state)
        if (state[key] === null) delete state[key]
      return state
    }
  },
}
