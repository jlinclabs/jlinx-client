const Debug = require('debug')
const multibase = require('jlinx-util/multibase')
const Ledger = require('./Ledger')

const debug = Debug('jlinx:client:identifiers')

module.exports = class Identifiers {
  constructor (jlinx) {
    this.jlinx = jlinx
  }

  async create (opts = {}) {
    return await this.jlinx.create({
      ...opts,
      class: Identifier
    })
  }

  async get (id, opts = {}) {
    debug('get', { id })
    return await this.jlinx.get(id, {
      ...opts,
      class: Identifier
    })
  }
}

class Identifier extends Ledger {
  constructor (doc, identifiers) {
    super(doc)
    this._identifiers = identifiers
  }

  get did () {
    if (this.signingKey) return publicKeyToDidKey(this.signingKey)
  }

  getInitialState () {
    return {
      services: []
    }
  }

  get services () { return this.state?.services }

  [Symbol.for('nodejs.util.inspect.custom')] (depth, opts) {
    let indent = ''
    if (typeof opts.indentationLvl === 'number') { while (indent.length < opts.indentationLvl) indent += ' ' }
    return this.constructor.name + '(\n' +
      indent + '  id: ' + opts.stylize(this.id, 'string') + '\n' +
      indent + '  writable: ' + opts.stylize(this.writable, 'boolean') + '\n' +
      indent + '  host: ' + opts.stylize(this.host, 'string') + '\n' +
      indent + '  did: ' + opts.stylize(this.did, 'string') + '\n' +
      indent + '  signingKey: ' + opts.stylize(this.signingKey, 'string') + '\n' +
      indent + ')'
  }

  async addService (service) {
    await this.appendEvent('Added Service', { service })
  }

  async removeService (serviceId) {
    await this.appendEvent('Removed Service', { serviceId })
  }

  async addProfile (profile) {
    await this.addService({
      id: profile.id,
      type: 'jlinx.profile',
      serviceEndpoint: profile.serviceEndpoint
    })
  }

  asDidDocument () {
    return signingKeyToDidDocument(this.signingKey, {
      services: this.services
    })
  }
}

Identifier.events = {

  'Added Service': {
    schema: {
      type: 'object',
      properties: {
        service: {
          type: 'object',
          properties: {
            id: { type: 'string' }, // "did:example:123#linked-domain",
            type: { type: 'string' }, // "LinkedDomains",
            serviceEndpoint: { type: 'string' } // "https://bar.example.com"
          },
          required: ['id', 'type', 'serviceEndpoint'],
          additionalProperties: true
        }
      },
      required: ['service'],
      additionalProperties: false
    },
    validate (state, event) {
      if (
        state.services.find(services =>
          services.id === event.service.id
        )
      ) {
        return `service already referenced by did document: ${event.services.id}`
      }
    },
    apply (state, event) {
      return {
        ...state,
        services: [...state.services, event.service]
      }
    }
  },

  'Removed Service': {
    schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' }
      },
      required: ['serviceId'],
      additionalProperties: false
    },
    validate (state, { serviceId }) {
      const service = state.services.find(service => service.id === serviceId)
      if (!service) { return `service is not referenced by the did document: ${serviceId}` }
    },
    apply (state, { serviceId }) {
      return {
        ...state,
        services: state.services.filter(service => service.id !== serviceId)
      }
    }
  }
}

function didToPublicKey (did) {
  const matches = did.match(/^did:([^:]+):([^:]+)/)
  if (!matches) {
    throw new Error(`invalid did "${did}"`)
  }
  const [, method, encodedPublicKey] = matches
  if (method === 'key' || method === 'jlinx') {
    return multibase.toBuffer(encodedPublicKey)
  }
}

function publicKeyToDidKey (publicKey) {
  if (typeof publicKey === 'string') {
    publicKey = multibase.toBuffer(publicKey)
  }
  return `did:key:${multibase.encode(publicKey)}`
}

function signingKeyToDidDocument (publicKey, opts = {}) {
  publicKey = multibase.toBuffer(publicKey)
  const did = publicKeyToDidKey(publicKey)
  const publicKeyMultibase = did.split('did:key:')[1]
  // const publicKeyMultibase = multibase.encode(publicKey)
  const didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
      'https://w3id.org/security/suites/x25519-2020/v1'
    ],
    id: `${did}`,
    verificationMethod: [{
      id: `${did}#${publicKeyMultibase}`,
      type: 'Ed25519VerificationKey2020',
      controller: `${did}`,
      publicKeyMultibase: `${publicKeyMultibase}`
    }],
    authentication: [
      `${did}#${publicKeyMultibase}`
    ],
    assertionMethod: [
      `${did}#${publicKeyMultibase}`
    ],
    capabilityDelegation: [
      `${did}#${publicKeyMultibase}`
    ],
    capabilityInvocation: [
      `${did}#${publicKeyMultibase}`
    ],
    keyAgreement: [{
      id: `${did}#${publicKeyMultibase}`,
      type: 'X25519KeyAgreementKey2020',
      controller: `${did}`,
      publicKeyMultibase: `${publicKeyMultibase}`
    }]
  }

  if (opts.services) didDocument.services = opts.services

  return didDocument
}

Object.assign(module.exports, {
  didToPublicKey,
  publicKeyToDidKey
})
