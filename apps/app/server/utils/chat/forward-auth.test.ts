import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { forwardAuthHeaders } from './forward-auth'

test('bearer-only and x-api-key identities reach internal research tools', () => {
  assert.deepEqual(forwardAuthHeaders({ authorization: 'Bearer fixture-key', host: 'untrusted.example', 'x-forwarded-for': '1.2.3.4' }), { authorization: 'Bearer fixture-key' })
  assert.deepEqual(forwardAuthHeaders({ 'x-api-key': 'fixture-key' }), { 'x-api-key': 'fixture-key' })
  assert.deepEqual(forwardAuthHeaders({ cookie: 'session=fixture', authorization: 'Bearer fixture-key' }), { cookie: 'session=fixture', authorization: 'Bearer fixture-key' })
})

test('missing and ambiguous headers cannot add credentials or unrelated headers', () => {
  assert.deepEqual(forwardAuthHeaders({ authorization: ['Bearer one', 'Bearer two'], cookie: undefined, 'x-api-key': '' }), {})
})
