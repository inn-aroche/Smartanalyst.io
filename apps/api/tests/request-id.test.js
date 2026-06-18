// Tests du middleware requestId : génère un UUID v4 si pas fourni, accepte
// un UUID v4 client, rejette les strings arbitraires.

const test = require('node:test')
const assert = require('node:assert/strict')

const { requestId, UUID_RE } = require('../src/middleware/request-id.middleware')

function fakeRes() {
  const headers = {}
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value
    },
  }
}

test('requestId : génère un UUID v4 si aucun header', () => {
  const req = { headers: {} }
  const res = fakeRes()
  let nextCalled = false
  requestId(req, res, () => {
    nextCalled = true
  })
  assert.ok(nextCalled)
  assert.ok(UUID_RE.test(req.requestId), `not a UUID v4: ${req.requestId}`)
  assert.equal(res.headers['X-Request-Id'], req.requestId)
})

test('requestId : accepte un UUID v4 valide depuis x-request-id', () => {
  const incoming = '12345678-1234-4abc-9def-1234567890ab'
  const req = { headers: { 'x-request-id': incoming } }
  const res = fakeRes()
  requestId(req, res, () => {})
  assert.equal(req.requestId, incoming)
  assert.equal(res.headers['X-Request-Id'], incoming)
})

test('requestId : rejette une string arbitraire et régénère', () => {
  const req = { headers: { 'x-request-id': 'not-a-uuid; INJECT' } }
  const res = fakeRes()
  requestId(req, res, () => {})
  assert.notEqual(req.requestId, 'not-a-uuid; INJECT')
  assert.ok(UUID_RE.test(req.requestId))
})

test('requestId : rejette un UUID v1 (on veut spécifiquement du v4)', () => {
  const v1 = '12345678-1234-1abc-9def-1234567890ab'
  const req = { headers: { 'x-request-id': v1 } }
  const res = fakeRes()
  requestId(req, res, () => {})
  assert.notEqual(req.requestId, v1)
  assert.ok(UUID_RE.test(req.requestId))
})
