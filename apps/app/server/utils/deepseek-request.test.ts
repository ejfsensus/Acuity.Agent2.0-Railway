import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, Output, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { buildGenerationSettings } from '../../../../packages/agent/src/router/schema'
import { transformDeepSeekRequest } from './deepseek-request'

test('the actual adapter sends DeepSeek thinking disabled during final synthesis', async () => {
  let sent: Record<string, unknown> | undefined
  const provider = createOpenAICompatible({
    name: 'openai-compatible', baseURL: 'https://api.deepseek.com', transformRequestBody: transformDeepSeekRequest,
    fetch: (_url, options) => {
      sent = JSON.parse(String(options?.body))
      return Promise.resolve(new Response(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'A grounded answer.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }))
    },
  })
  await generateText({ model: provider('fixture'), prompt: 'Answer from the fixture.', temperature: 0, tools: { lookup: tool({ inputSchema: z.object({}) }) }, toolChoice: 'none', providerOptions: { openaiCompatible: { reasoningEffort: 'none' } } })
  assert.equal(sent?.tool_choice, 'none')
  assert.equal(sent?.temperature, 0)
  assert.deepEqual(sent?.thinking, { type: 'disabled' })
  assert.equal(sent?.reasoning_effort, undefined)
  const research = { tool_choice: 'auto', reasoning_effort: 'high' }
  assert.deepEqual(transformDeepSeekRequest(research), { ...research, thinking: { type: 'enabled' } })
})


test('thinking drops ineffective sampling controls; text-only requests preserve temperature zero', () => {
  const result = transformDeepSeekRequest({ tool_choice: 'auto', reasoning_effort: 'high', temperature: 0.9, presence_penalty: 1, frequency_penalty: 1 })
  assert.equal(result.temperature, undefined)
  assert.equal(result.presence_penalty, undefined)
  assert.equal(result.frequency_penalty, undefined)
  assert.deepEqual(result.thinking, { type: 'enabled' })
  const final = transformDeepSeekRequest({ tool_choice: 'none', reasoning_effort: 'high', temperature: 0 })
  assert.equal(final.temperature, 0)
  assert.equal(final.reasoning_effort, undefined)
  assert.deepEqual(final.thinking, { type: 'disabled' })
})

test('the adapter round-trips reasoning across research tool calls', async () => {
  const sent: Array<Record<string, any>> = []
  const provider = createOpenAICompatible({
    name: 'openai-compatible', baseURL: 'https://api.deepseek.com', transformRequestBody: transformDeepSeekRequest,
    fetch: (_url, options) => {
      sent.push(JSON.parse(String(options?.body)))
      const first = sent.length === 1
      return Promise.resolve(new Response(JSON.stringify({
        id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture',
        choices: [
          { index: 0, message: first
            ? { role: 'assistant', content: '', reasoning_content: 'Inspect the synthetic passage.', tool_calls: [{ id: 'lookup-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] }
            : { role: 'assistant', content: 'The synthetic passage supports the claim.', reasoning_content: 'The source was checked.' }, finish_reason: first ? 'tool_calls' : 'stop' }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { headers: { 'content-type': 'application/json' } }))
    },
  })
  await generateText({
    model: provider('fixture'), prompt: 'Check the synthetic passage.', temperature: 0.2,
    tools: { lookup: tool({ inputSchema: z.object({}), execute: () => 'STAGING TEST synthetic passage' }) },
    stopWhen: stepCountIs(2), providerOptions: { openaiCompatible: { reasoningEffort: 'high' } },
  })
  assert.equal(sent.length, 2)
  assert.equal(sent[0]?.temperature, undefined)
  assert.equal(sent[1]?.reasoning_effort, 'high')
  assert.deepEqual(sent[1]?.thinking, { type: 'enabled' })
  assert.equal(sent[1]?.messages.find((message: any) => message.role === 'assistant')?.reasoning_content, 'Inspect the synthetic passage.')
})

test('JSON routing uses the actual adapter without hidden thinking', async () => {
  const keys = ['AI_PROVIDER', 'OPENAI_COMPATIBLE_BASE_URL'] as const
  const previous = keys.map(key => process.env[key])
  let sent: Record<string, any> = {}
  try {
    process.env.AI_PROVIDER = 'openai-compatible'
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.deepseek.com'
    const provider = createOpenAICompatible({
      name: 'openai-compatible', baseURL: 'https://api.deepseek.com', transformRequestBody: transformDeepSeekRequest,
      fetch: (_url, options) => {
        sent = JSON.parse(String(options?.body))
        return Promise.resolve(new Response(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: '{"route":"lookup"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }))
      },
    })
    const result = await generateText({ model: provider('fixture'), prompt: 'Return a JSON route.', output: Output.object({ schema: z.object({ route: z.string() }) }), ...buildGenerationSettings('fixture', 'router') })
    assert.equal(result.output.route, 'lookup')
    assert.equal(sent.temperature, 0)
    assert.equal(sent.max_tokens, 1024)
    assert.deepEqual(sent.thinking, { type: 'disabled' })
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    })
  }
})
