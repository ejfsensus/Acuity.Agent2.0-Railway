import { strict as assert } from 'node:assert'
import { afterEach, test } from 'node:test'
import { buildProviderOptions, getConfiguredModels } from './schema'

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
  assert.equal(buildProviderOptions('deepseek-flash'), undefined)
})
