import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readableAssistantMessage } from './response-integrity'

test('historical invalid assistant text is readable without mutating stored research or user quotes', () => {
  const bad = '<｜｜DSML｜｜tool_calls>broken call</｜｜DSML｜｜tool_calls>'
  const message = { role: 'assistant', parts: [{ type: 'tool-bash', state: 'output-available' }, { type: 'text', text: bad }] }
  const safe = readableAssistantMessage(message)
  assert.match(safe.parts[1]!.text!, /Please regenerate/)
  assert.equal(safe.parts[0], message.parts[0])
  assert.equal(message.parts[1]!.text, bad)
  const user = { role: 'user', parts: [{ type: 'text', text: bad }] }
  assert.equal(readableAssistantMessage(user), user)
})
