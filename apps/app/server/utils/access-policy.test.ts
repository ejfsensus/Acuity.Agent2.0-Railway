import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { isEmailAllowed, isPublicSignupEnabled } from './access-policy'

const keys = ['PUBLIC_SIGNUP_ENABLED', 'AUTHORIZED_USER_EMAILS', 'NUXT_AUTHORIZED_USER_EMAILS'] as const
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
beforeEach(() => {
  for (const key of keys) delete process.env[key] 
})
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

test('public signup and application access default to restricted', () => {
  assert.equal(isPublicSignupEnabled(), false)
  assert.equal(isEmailAllowed('developments@sensusinvista.ltd'), true)
  assert.equal(isEmailAllowed('new@example.org'), false)
  process.env.PUBLIC_SIGNUP_ENABLED = 'false'
  assert.equal(isEmailAllowed('new@example.org'), false)
})

test('restricted mode normalizes the allowlist and never treats an empty value as public access', () => {
  process.env.AUTHORIZED_USER_EMAILS = ' One@example.org, two@example.org '
  assert.equal(isEmailAllowed('one@EXAMPLE.org'), true)
  assert.equal(isEmailAllowed('TWO@example.org'), true)
  assert.equal(isEmailAllowed('three@example.org'), false)
  process.env.AUTHORIZED_USER_EMAILS = ''
  assert.equal(isEmailAllowed('new@example.org'), false)
})

test('the explicit public switch admits authenticated emails without replacing the admin role check', () => {
  process.env.PUBLIC_SIGNUP_ENABLED = 'true'
  assert.equal(isPublicSignupEnabled(), true)
  assert.equal(isEmailAllowed('new@example.org'), true)
  assert.equal(isEmailAllowed(''), false)
  assert.equal(isEmailAllowed(undefined), false)
})
