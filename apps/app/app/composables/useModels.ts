export function formatModelName(modelId: string): string {
  const acronyms = ['gpt', 'llm', 'ai'] // words that should be uppercase
  const modelName = modelId.split('/')[1] || modelId

  return modelName
    .split('-')
    .map((word) => {
      const lowerWord = word.toLowerCase()
      return acronyms.includes(lowerWord)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

function parseModels(value?: string | null) {
  return (value || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
}

const gatewayModels = [
  'deepseek/deepseek-v4-pro',
  'minimax/minimax-m2.7',
]

const fallbackModel = 'deepseek/deepseek-v4-pro'

export function useModels() {
  const config = useRuntimeConfig()
  const configuredModels = parseModels(config.public.ai?.models)
  const configuredDefault = config.public.ai?.defaultModel || undefined

  const defaultModel = configuredDefault || configuredModels[0] || fallbackModel
  const models = Array.from(new Set([
    defaultModel,
    ...(configuredModels.length ? configuredModels : gatewayModels),
  ].filter(Boolean)))

  const model = useCookie<string>('model', {
    default: () => defaultModel,
    watch: true,
  })

  if (!models.includes(model.value)) {
    model.value = defaultModel
  }

  return {
    models,
    model,
    defaultModel,
    formatModelName
  }
}
