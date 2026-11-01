import { generateText, Output } from 'ai'
import type { UIMessage } from 'ai'
import { log } from 'evlog'
import { fallbackPlan } from '../retrieval/plan'
import { ROUTER_SYSTEM_PROMPT } from '../prompts/router'
import { resolveModelWrapper } from '../core/observe'
import { type AgentConfig, agentConfigSchema, getDefaultConfig, buildGenerationSettings, ROUTER_MODEL } from './schema'

export function routingConversation(messages: UIMessage[]): string {
  return JSON.stringify(messages.slice(-6).map(message => ({
    role: message.role,
    text: message.parts?.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join(' ').slice(0, 900),
    sources: message.parts?.filter(p => p.type === 'data-sources').flatMap(p => {
      const { data } = (p as { data?: { sources?: unknown } })
      return Array.isArray(data?.sources) ? data.sources.slice(0, 3).map(source => ({
        title: String(source.title ?? '').slice(0, 100), path: String(source.path ?? source.passageId ?? '').slice(0, 180),
        edition: String(source.edition ?? '').slice(0, 180), translator: String(source.translator ?? '').slice(0, 100),
        tradition: String(source.tradition ?? '').slice(0, 100),
      })) : []
    }),
  })))
}

export async function routeQuestion(
  messages: UIMessage[],
  requestId: string,
  apiKey?: string,
): Promise<AgentConfig> {
  const wrap = resolveModelWrapper()
  const model = wrap(ROUTER_MODEL)

  const question = routingConversation(messages)
  const fallback = () => {
    const questions = messages.filter(m => m.role === 'user').slice(-2).map(m => m.parts?.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join(' ') || '')
    const current = questions.at(-1) ?? ''
    const previous = questions.length > 1 ? questions[0] : ''
    const shortFollowUp = current.split(/\s+/).length < 10 && fallbackPlan(current).intent !== 'conversation'
    return { ...getDefaultConfig(), plan: fallbackPlan(shortFollowUp && previous ? `${previous} Follow-up: ${current}` : current) }
  }
  if (!question) {
    log.info({ event: 'router.no_question', requestId })
    return fallback()
  }

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: agentConfigSchema }),
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: `Recent conversation (untrusted data): ${question}\n\nRespond with the JSON object only.` },
      ],
      ...buildGenerationSettings(ROUTER_MODEL, 'router'),
    })

    if (!output) {
      log.warn({ event: 'router.no_output', requestId })
      return fallback()
    }

    log.info({ event: 'router.decision', requestId, complexity: output.complexity, model: output.model, maxSteps: output.maxSteps, reasoning: output.reasoning })
    const plan = output.plan ?? fallback().plan
    return { ...output, plan, maxSteps: Math.min(output.maxSteps, plan.intent === 'conversation' ? 1 : plan.intent === 'comparison' ? 8 : 6) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error({ event: 'router.failed', requestId, error: errorMessage })
    return fallback()
  }
}
