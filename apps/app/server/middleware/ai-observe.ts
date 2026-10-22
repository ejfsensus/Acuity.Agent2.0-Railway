import { enterAIContext } from '@savoir/agent'

export default defineEventHandler(() => {
  enterAIContext(createRuntimeModelWrapper(useAI().wrap))
})
