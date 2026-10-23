import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool } from 'ai'
import { z } from 'zod'
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
  await generateText({ model: provider('fixture'), prompt: 'Answer from the fixture.', tools: { lookup: tool({ inputSchema: z.object({}) }) }, toolChoice: 'none', providerOptions: { openaiCompatible: { reasoningEffort: 'none' } } })
  assert.equal(sent?.tool_choice, 'none')
  assert.deepEqual(sent?.thinking, { type: 'disabled' })
  assert.equal(sent?.reasoning_effort, undefined)
  const research = { tool_choice: 'auto', reasoning_effort: 'high' }
  assert.equal(transformDeepSeekRequest(research), research)
})
