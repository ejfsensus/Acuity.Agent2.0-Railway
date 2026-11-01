import { strict as assert } from 'node:assert'
import { afterEach, test } from 'node:test'
import { buildProviderOptions, buildGenerationSettings, getConfiguredModels } from './schema'

const keys = ['AI_PROVIDER', 'AI_MODELS', 'AI_DEFAULT_MODEL', 'AI_ROUTER_MODEL', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODELS', 'OPENAI_COMPATIBLE_DEFAULT_MODEL', 'OPENAI_COMPATIBLE_ROUTER_MODEL', 'NUXT_PUBLIC_AI_MODELS', 'NUXT_PUBLIC_AI_DEFAULT_MODEL']
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

test('compatible providers expose only configured model names', () => {
  for (const key of keys) delete process.env[key]
  process.env.AI_PROVIDER = 'openai-compatible'
  process.env.OPENAI_COMPATIBLE_MODELS = 'deepseek-flash,deepseek-v4-pro'
  process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL = 'deepseek-flash'
  assert.deepEqual(getConfiguredModels(), ['deepseek-flash', 'deepseek-v4-pro'])
})

test('DeepSeek final synthesis disables additional thinking in the provider namespace', () => {
  process.env.AI_PROVIDER = 'openai-compatible'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.deepseek.com'
  assert.deepEqual(buildProviderOptions('deepseek-flash', undefined, true), { openaiCompatible: { reasoningEffort: 'none' } })
  assert.deepEqual(buildProviderOptions('deepseek-flash'), { openaiCompatible: { reasoningEffort: 'high' } })
})


test('DeepSeek helpers avoid thinking and bound auxiliary output while research has room for reasoning', () => {
  process.env.AI_PROVIDER = 'openai-compatible'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.deepseek.com'
  assert.deepEqual(buildGenerationSettings('deepseek-flash', 'router'), {
    temperature: 0, maxOutputTokens: 2048, providerOptions: { openaiCompatible: { reasoningEffort: 'none' } },
  })
  const title = buildGenerationSettings('deepseek-flash', 'title')
  assert.equal(title.temperature, 0.2)
  assert.equal(title.maxOutputTokens, 64)
  const research = buildGenerationSettings('deepseek-flash', 'research', 0)
  assert.equal(research.temperature, 0)
  assert.equal(research.maxOutputTokens, 16384)
  assert.deepEqual(research.providerOptions, { openaiCompatible: { reasoningEffort: 'high' } })
  assert.equal(buildGenerationSettings('deepseek-flash', 'final', 0).temperature, 0)
})

test('other compatible providers keep their own reasoning defaults', () => {
  process.env.AI_PROVIDER = 'openai-compatible'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://models.example.test/v1'
  assert.equal(buildGenerationSettings('configured-model', 'router').providerOptions, undefined)
})
