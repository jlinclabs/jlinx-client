const Debug = require('debug')

const {
  keyToString,
  keyToBuffer
} = require('jlinx-util')

const Vault = require('jlinx-vault')
const RemoteHost = require('./RemoteHost')
const Document = require('./Document')

const debug = Debug('jlinx:client')

module.exports = class JlinxClient {
  constructor (opts) {
    debug(opts)

    this.vault = new Vault({
      path: opts.vaultPath,
      key: opts.vaultKey
    })

    this.host = new RemoteHost({
      url: opts.hostUrl
    })

    this._ready = this._open()
  }

  ready () { return this._ready }

  async _open () {
    await this.vault.ready()
    await this.host.ready()
  }

  async destroy () {
    await this.vault.close()
    await this.host.destroy()
  }

  async create (opts = {}) {
    await this.ready()
    console.log('this.vault', this.vault)
    console.log('this.vault.constructor', this.vault.constructor)
    console.log('this.vault.constructor', this.vault.constructor + '')
    console.log('this.vault.keys', this.vault.keys)
    const ownerSigningKeys = await this.vault.keys.createSigningKeyPair()
    const ownerSigningKey = ownerSigningKeys.publicKey
    const ownerSigningKeyProof = await ownerSigningKeys.sign(
      keyToBuffer(this.host.publicKey)
    )
    const id = await this.host.create({
      ownerSigningKey,
      ownerSigningKeyProof
    })
    await this.vault.docs.put(id, {
      ownerSigningKey: keyToString(ownerSigningKey),
      writable: true,
      length: 0
    })
    const doc = await Document.open({
      host: this.host,
      id,
      ownerSigningKeys,
      length: 0
    })
    debug('created', { doc })
    return doc
  }

  async get (id) {
    debug('get', { id })
    const docRecord = await this.vault.docs.get(id)
    debug('get', { id, docRecord })
    const ownerSigningKeys = (docRecord && docRecord.ownerSigningKey)
      ? await this.vault.keys.get(keyToBuffer(docRecord.ownerSigningKey))
      : undefined
    debug('get', { id, ownerSigningKeys })
    const doc = await Document.open({
      host: this.host,
      id,
      ownerSigningKeys
    })
    debug('get', doc)
    return doc
  }

  async all () {
    // this.vault.myDocIds
    const ids = await this.vault.docs.ids()
    console.log({ ids })
    const docs = await Promise.all(
      ids.map(id => this.get(id))
    )
    return docs
  }

  // METHODS BELOW HERE SHOULD BE MOVED TO PLUGINS

  async createAppUser (opts) {
    const doc = await this.create()
    await doc.appendJson({
      type: 'JlinxAppUser',
      encoding: 'json',
      followupUrl: opts.followupUrl
      // TODO signed by our public key
    })
    return doc
  }
}
