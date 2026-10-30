import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyMessageLimit, isRateLimited, isServiceAccount } from './rate-limit'

test('service accounts and admins are exempt; limit is configurable', () => {
  process.env.AGENT_SERVICE_ACCOUNT_EMAILS = ' Svc@Example.test , other@x.test'
  assert.equal(isServiceAccount('svc@example.test'), true)
  assert.equal(isServiceAccount('nobody@example.test'), false)
  assert.equal(isServiceAccount(null), false)
  assert.equal(isRateLimited({ role: 'user', email: 'svc@example.test' }), false)
  assert.equal(isRateLimited({ role: 'admin', email: 'a@b.c' }), false)
  assert.equal(isRateLimited({ role: 'user', email: 'a@b.c' }), true)
  delete process.env.AGENT_DAILY_MESSAGE_LIMIT
  assert.equal(dailyMessageLimit(), 15)
  process.env.AGENT_DAILY_MESSAGE_LIMIT = '40'
  assert.equal(dailyMessageLimit(), 40)
  process.env.AGENT_DAILY_MESSAGE_LIMIT = 'nope'
  assert.equal(dailyMessageLimit(), 15)
})
