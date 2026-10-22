import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { AgentConfigData } from '@savoir/agent'
import { KV_KEYS } from './sandbox/types'
import { appKvDel, appKvGet, appKvSet } from './app-kv'

export type { AgentConfigData }

const DEFAULT_CONFIG: AgentConfigData = {
  id: 'default',
  name: 'default',
  additionalPrompt: null,
  responseStyle: 'concise',
  language: 'en',
  defaultModel: null,
  maxStepsMultiplier: 1.0,
  temperature: 0.7,
  searchInstructions: null,
  citationFormat: 'inline',
  isActive: true,
}

const CACHE_TTL_SECONDS = 60 // 1 minute

export async function invalidateAgentConfigCache(): Promise<void> {
  await appKvDel(KV_KEYS.AGENT_CONFIG_CACHE)
}

export async function getAgentConfig(): Promise<AgentConfigData> {
  const cached = await appKvGet<AgentConfigData>(KV_KEYS.AGENT_CONFIG_CACHE)
  if (cached) {
    return cached
  }

  const config = await db.query.agentConfig.findFirst({
    where: () => eq(schema.agentConfig.isActive, true),
  })

  let result: AgentConfigData

  if (config) {
    result = {
      id: config.id,
      name: config.name,
      additionalPrompt: config.additionalPrompt,
      responseStyle: config.responseStyle || 'concise',
      language: config.language || 'en',
      defaultModel: config.defaultModel,
      maxStepsMultiplier: config.maxStepsMultiplier || 1.0,
      temperature: config.temperature || 0.7,
      searchInstructions: config.searchInstructions,
      citationFormat: config.citationFormat || 'inline',
      isActive: config.isActive,
    }
  } else {
    result = DEFAULT_CONFIG
  }

  await appKvSet(KV_KEYS.AGENT_CONFIG_CACHE, result, { ttl: CACHE_TTL_SECONDS })

  return result
}

export function getDefaultAgentConfig(): AgentConfigData {
  return { ...DEFAULT_CONFIG }
}
