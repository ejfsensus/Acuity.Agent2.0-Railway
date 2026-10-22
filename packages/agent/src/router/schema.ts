import type { JSONObject, SharedV3ProviderOptions } from '@ai-sdk/provider'
import { z } from 'zod'

const GATEWAY_DEFAULT_MODEL = 'deepseek/deepseek-v4-pro'
const GATEWAY_ROUTER_MODEL = 'minimax/minimax-m2.7'
const COMPATIBLE_DEFAULT_MODEL = 'gpt-4o-mini'

const GATEWAY_MODELS = [
  'deepseek/deepseek-v4-pro',
  'minimax/minimax-m2.7',
]

const ALLOWED_GATEWAY_MODELS = new Set(GATEWAY_MODELS)

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
}

function parseCsv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
}

export function getAIProviderKind(): 'gateway' | 'openai-compatible' {
  const provider = readEnv('AI_PROVIDER')?.toLowerCase()
  if (provider === 'openai-compatible' || provider === 'openai') return 'openai-compatible'
  if (readEnv('OPENAI_COMPATIBLE_BASE_URL', 'AI_BASE_URL')) return 'openai-compatible'
  return 'gateway'
}

export function getConfiguredModels(): string[] {
  const configured = parseCsv(readEnv('AI_MODELS', 'OPENAI_COMPATIBLE_MODELS', 'NUXT_PUBLIC_AI_MODELS'))
  const defaultModel = readEnv('AI_DEFAULT_MODEL', 'OPENAI_COMPATIBLE_DEFAULT_MODEL', 'NUXT_PUBLIC_AI_DEFAULT_MODEL')
  const routerModel = readEnv('AI_ROUTER_MODEL', 'OPENAI_COMPATIBLE_ROUTER_MODEL')
  const gateway = getAIProviderKind() === 'gateway'
  const fallbackModels = gateway ? GATEWAY_MODELS : [COMPATIBLE_DEFAULT_MODEL]
  const maybeAllowed = (model?: string) => !gateway || !model || ALLOWED_GATEWAY_MODELS.has(model)

  return Array.from(new Set([
    ...configured.filter(maybeAllowed),
    defaultModel,
    routerModel,
    ...fallbackModels,
  ].filter(maybeAllowed).filter(Boolean) as string[]))
}

const RAW_DEFAULT_MODEL = readEnv('AI_DEFAULT_MODEL', 'OPENAI_COMPATIBLE_DEFAULT_MODEL', 'NUXT_PUBLIC_AI_DEFAULT_MODEL')
const CONFIGURED_DEFAULT_MODEL = RAW_DEFAULT_MODEL && (getAIProviderKind() !== 'gateway' || ALLOWED_GATEWAY_MODELS.has(RAW_DEFAULT_MODEL))
  ? RAW_DEFAULT_MODEL
  : undefined

export const DEFAULT_MODEL = CONFIGURED_DEFAULT_MODEL
  ?? getConfiguredModels()[0]
  ?? (getAIProviderKind() === 'gateway' ? GATEWAY_DEFAULT_MODEL : COMPATIBLE_DEFAULT_MODEL)

const CONFIGURED_ROUTER_MODEL = readEnv('AI_ROUTER_MODEL', 'OPENAI_COMPATIBLE_ROUTER_MODEL')
export const ROUTER_MODEL = CONFIGURED_ROUTER_MODEL && (getAIProviderKind() !== 'gateway' || ALLOWED_GATEWAY_MODELS.has(CONFIGURED_ROUTER_MODEL))
  ? CONFIGURED_ROUTER_MODEL
  : (getAIProviderKind() === 'gateway' ? GATEWAY_ROUTER_MODEL : DEFAULT_MODEL)

export const agentConfigSchema = z.object({
  complexity: z.enum(['trivial', 'simple', 'moderate', 'complex'])
    .describe('trivial=greeting, simple=single lookup, moderate=multi-search, complex=deep analysis'),

  maxSteps: z.number().min(1).max(30)
    .describe('Agent iterations: 4 trivial, 8 simple, 15 moderate, 25 complex'),

  model: z.string()
    .describe(`Model id to use. Prefer one of: ${getConfiguredModels().join(', ')}`),

  reasoning: z.string().max(200)
    .describe('Brief explanation of the classification'),
})

export type AgentConfig = z.infer<typeof agentConfigSchema>

export function getDefaultConfig(): AgentConfig {
  return {
    complexity: 'moderate',
    maxSteps: 15,
    model: DEFAULT_MODEL,
    reasoning: 'Default fallback configuration',
  }
}

const MODEL_FALLBACKS: Record<string, string[]> = {
  'deepseek/deepseek-v4-pro': ['minimax/minimax-m2.7'],
  'minimax/minimax-m2.7': ['deepseek/deepseek-v4-pro'],
}

export function getModelFallbackOptions(model: string): SharedV3ProviderOptions | undefined {
  if (getAIProviderKind() !== 'gateway') return undefined

  const fallbacks = MODEL_FALLBACKS[model]
  if (!fallbacks?.length) return undefined
  return { gateway: { models: fallbacks } }
}

export function buildProviderOptions(
  model: string,
  metadata?: { userId?: string, tags?: string[] },
): SharedV3ProviderOptions | undefined {
  if (getAIProviderKind() !== 'gateway') return undefined

  const fallbacks = MODEL_FALLBACKS[model]
  const gateway: JSONObject = {}

  if (fallbacks?.length) gateway.models = fallbacks
  if (metadata?.userId) gateway.user = metadata.userId
  if (metadata?.tags?.length) gateway.tags = metadata.tags

  return Object.keys(gateway).length > 0 ? { gateway } : undefined
}

export function buildGatewayProviderOptions(
  metadata?: { userId?: string, tags?: string[] },
): SharedV3ProviderOptions | undefined {
  if (getAIProviderKind() !== 'gateway') return undefined

  const gateway: JSONObject = {}

  if (metadata?.userId) gateway.user = metadata.userId
  if (metadata?.tags?.length) gateway.tags = metadata.tags

  return Object.keys(gateway).length > 0 ? { gateway } : undefined
}
