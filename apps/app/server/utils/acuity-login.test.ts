import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { acuityOidcSignupError, isAcuityLoginConfigured, isLocalLoginEnabled } from './access-policy'

const keys = ['ACUITY_OIDC_ISSUER', 'ACUITY_OIDC_CLIENT_ID', 'ACUITY_OIDC_CLIENT_SECRET', 'AUTH_LOCAL_LOGIN_ENABLED', 'PUBLIC_SIGNUP_ENABLED', 'AUTHORIZED_USER_EMAILS', 'NUXT_AUTHORIZED_USER_EMAILS'] as const
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

function configure() {
  process.env.ACUITY_OIDC_ISSUER = 'https://auth.example.test/api/auth'
  process.env.ACUITY_OIDC_CLIENT_ID = 'agent'
  process.env.ACUITY_OIDC_CLIENT_SECRET = 'secret'
}

test('unified login is off until all three ACUITY_OIDC_* values are set', () => {
  assert.equal(isAcuityLoginConfigured(), false)
  process.env.ACUITY_OIDC_ISSUER = 'https://auth.example.test/api/auth'
  assert.equal(isAcuityLoginConfigured(), false)
  configure()
  assert.equal(isAcuityLoginConfigured(), true)
})

test('local login stays on by default and cannot be disabled without an IdP', () => {
  assert.equal(isLocalLoginEnabled(), true)
  process.env.AUTH_LOCAL_LOGIN_ENABLED = 'false'
  assert.equal(isLocalLoginEnabled(), true, 'lockout guard: no IdP configured')
  configure()
  assert.equal(isLocalLoginEnabled(), false)
  process.env.AUTH_LOCAL_LOGIN_ENABLED = 'true'
  assert.equal(isLocalLoginEnabled(), true)
})

test('new IdP identities need a verified, approved email', () => {
  process.env.AUTHORIZED_USER_EMAILS = 'approved@example.org'
  assert.match(acuityOidcSignupError({ email: 'approved@example.org', emailVerified: false }) || '', /not verified/)
  assert.match(acuityOidcSignupError({ email: 'other@example.org', emailVerified: true }) || '', /not approved/)
  assert.equal(acuityOidcSignupError({ email: 'Approved@Example.org', emailVerified: true }), null)
  process.env.PUBLIC_SIGNUP_ENABLED = 'true'
  assert.equal(acuityOidcSignupError({ email: 'other@example.org', emailVerified: true }), null)
})
