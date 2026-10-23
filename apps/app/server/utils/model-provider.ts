import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { wrapLanguageModel } from 'ai'
import { DEFAULT_MODEL, getAIProviderKind, getConfiguredModels, toolProtocolGuard } from '@savoir/agent'
import { transformDeepSeekRequest } from './deepseek-request'

type ModelWrapper = (model: string) => unknown

interface CompatibleProviderCache {
  key: string
  provider: ReturnType<typeof createOpenAICompatible>
}

let compatibleProviderCache: CompatibleProviderCache | undefined

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
}

function getCompatibleProvider() {
  const runtimeConfig = useRuntimeConfig()
  const baseURL = readEnv('OPENAI_COMPATIBLE_BASE_URL', 'AI_BASE_URL')
    ?? runtimeConfig.ai.openAICompatibleBaseURL
  const apiKey = readEnv('OPENAI_COMPATIBLE_API_KEY', 'AI_API_KEY')
    ?? runtimeConfig.ai.openAICompatibleAPIKey
  const name = readEnv('OPENAI_COMPATIBLE_NAME', 'AI_PROVIDER_NAME')
    || runtimeConfig.ai.openAICompatibleName
    || 'openai-compatible'

  if (!baseURL) return undefined

  const key = `${name}:${baseURL}:${apiKey ? 'keyed' : 'anonymous'}`
  if (!compatibleProviderCache || compatibleProviderCache.key !== key) {
    compatibleProviderCache = {
      key,
      provider: createOpenAICompatible({
        name,
        baseURL,
        apiKey,
        ...(/^https:\/\/api\.deepseek\.com(?:\/|$)/i.test(baseURL) && {
          transformRequestBody: transformDeepSeekRequest,
        }),
      }),
    }
  }

  return compatibleProviderCache.provider
}

function resolveCompatibleModel(model: string) {
  const configuredModels = getConfiguredModels()
  if (configuredModels.includes(model)) return model

  const shortModel = model.split('/').pop()
  if (shortModel && configuredModels.includes(shortModel)) return shortModel

  return readEnv('AI_DEFAULT_MODEL', 'OPENAI_COMPATIBLE_DEFAULT_MODEL')
    ?? configuredModels[0]
    ?? DEFAULT_MODEL
}

export function createRuntimeModelWrapper(gatewayWrap: ModelWrapper): ModelWrapper {
  return (model: string) => {
    if (getAIProviderKind() !== 'openai-compatible') {
      return gatewayWrap(model)
    }

    const compatibleProvider = getCompatibleProvider()
    if (!compatibleProvider) {
      throw new Error('OpenAI-compatible provider requires OPENAI_COMPATIBLE_BASE_URL')
    }

    return wrapLanguageModel({ model: compatibleProvider(resolveCompatibleModel(model)), middleware: toolProtocolGuard })
  }
}
