// Observability
export { enterAIContext, setAIGatewayMetadata, resolveGatewayMetadata } from './core/observe'
export type { GatewayMetadata } from './core/observe'
export { toolProtocolGuard, hasToolProtocol, INVALID_RESPONSE_MESSAGE } from './core/protocol-guard'
export { generateFinalAnswer } from './core/final-answer'

// Tools
export { braveLlmContextTool, braveWebSearchTool, webSearchTool } from './tools/web-search'
export { sacredTextMcpTool, sacredTextInputSchema } from './tools/sacred-text'
export { researchTools } from './tools/research'

// Agents
export { createSourceAgent } from './agents/source'
export type { SourceAgentOptions } from './agents/source'
export { createAdminAgent } from './agents/admin'
export type { AdminAgentOptions } from './agents/admin'
export { createAgent } from './agents/base'

// Router
export { routeQuestion } from './router/route-question'
export {
  agentConfigSchema,
  getDefaultConfig,
  getAIProviderKind,
  getConfiguredModels,
  getModelFallbackOptions,
  buildProviderOptions,
  buildGatewayProviderOptions,
  DEFAULT_MODEL,
  ROUTER_MODEL,
} from './router/schema'

// Prompts
export { ROUTER_SYSTEM_PROMPT } from './prompts/router'
export { buildBotSystemPrompt, buildBotUserMessage } from './prompts/bot'
export { buildAdminSystemPrompt, ADMIN_SYSTEM_PROMPT, buildChatSystemPrompt } from './prompts/chat'

// Types
export type {
  AgentConfigData,
  ThreadContext,
  RoutingResult,
  AgentExecutionContext,
  CreateAgentOptions,
  AgentCallOptions,
} from './types'
export type { AgentConfig } from './router/schema'
