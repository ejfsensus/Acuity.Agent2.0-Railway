import type { UIMessage } from 'ai'
import { DEFAULT_MODEL } from '../router/schema'
import { routeQuestion } from '../router/route-question'
import { buildChatSystemPrompt } from '../prompts/chat'
import { applyComplexity } from '../prompts/shared'
import type { ResearchDependencies } from '../retrieval/controller'
import type { AgentConfigData, RoutingResult } from '../types'
import { createAgent } from './base'

export interface SourceAgentOptions {
  research?: ResearchDependencies
  tools: Record<string, unknown>
  getAgentConfig: () => Promise<AgentConfigData>
  messages: UIMessage[]
  /** AI Gateway API key. Optional — falls back to OIDC on Vercel or AI_GATEWAY_API_KEY env var. */
  apiKey?: string
  requestId?: string
  /** Falls back to agentConfig.defaultModel then DEFAULT_MODEL */
  defaultModel?: string
  onRouted?: (result: RoutingResult) => void
   
  onStepFinish?: (stepResult: any) => void
   
  onFinish?: (result: any) => void
}

export function createSourceAgent({ tools, research, getAgentConfig, messages, apiKey, requestId, defaultModel = DEFAULT_MODEL, onRouted, onStepFinish, onFinish }: SourceAgentOptions) {
  return createAgent({
    tools, research, getAgentConfig,
    route: () => routeQuestion(messages, requestId ?? crypto.randomUUID().slice(0, 8), apiKey),
    buildPrompt: (route, config) => applyComplexity(buildChatSystemPrompt(config), route),
    resolveModel: (_route, config) => config.defaultModel ?? defaultModel,
    onRouted, onStepFinish, onFinish,
  })
}
