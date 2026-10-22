import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { withKnowledgeBaseLock } from './lock'

test('concurrent clone writers stay ordered and nested steps do not deadlock', async () => {
  const events: string[] = []
  const first = withKnowledgeBaseLock(async () => {
    events.push('first started')
    await new Promise(resolve => setTimeout(resolve, 10))
    await withKnowledgeBaseLock(() => Promise.resolve(events.push('nested step')))
    events.push('first finished')
  })
  const second = withKnowledgeBaseLock(() => Promise.resolve(events.push('second started')))
  await Promise.all([first, second])
  assert.deepEqual(events, ['first started', 'nested step', 'first finished', 'second started'])
})

test('a failed sync releases the clone for the next operation', async () => {
  await assert.rejects(withKnowledgeBaseLock(() => Promise.reject(new Error('failed fetch'))), /failed fetch/)
  assert.equal(await withKnowledgeBaseLock(() => Promise.resolve('next sync')), 'next sync')
})
