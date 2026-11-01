import { stepCountIs, ToolLoopAgent, type StepResult, type ToolSet } from 'ai'
import { log } from 'evlog'
import { DEFAULT_MODEL, buildGenerationSettings, buildProviderOptions } from '../router/schema'
import { compactContext } from '../core/context'
import { callOptionsSchema } from '../core/schemas'
import { sanitizeToolCallInputs } from '../core/sanitize'
import { finalAnswerMessages, researchStepBudget, shouldForceTextOnlyStep } from '../core/policy'
import { LibraryResearch, researchContext } from '../retrieval/controller'
import { fallbackPlan, isLibraryPlan } from '../retrieval/plan'
import { researchTools } from '../tools/research'
import { resolveModelWrapper, resolveGatewayMetadata } from '../core/observe'
import type { AgentCallOptions, AgentExecutionContext, CreateAgentOptions } from '../types'

export function createAgent({
  tools,
  research,
  getAgentConfig,
  route,
  buildPrompt,
  resolveModel,
  onRouted,
  onStepFinish,
  onFinish,
}: CreateAgentOptions) {
  let maxSteps = 15
  let currentModel = DEFAULT_MODEL
  const wrap = resolveModelWrapper()

  return new ToolLoopAgent({
    model: wrap(DEFAULT_MODEL),
    callOptionsSchema,
    prepareCall: async ({ options, ...settings }) => {
      const modelOverride = (options as AgentCallOptions | undefined)?.model
      const customContext = (options as AgentCallOptions | undefined)?.context

      const [routerConfig, agentConfig] = await Promise.all([
        route(),
        getAgentConfig(),
      ])

      const plan = routerConfig.plan ?? fallbackPlan('Investigate the available sacred texts')
      const effectiveMaxSteps = research ? Math.min(12, researchStepBudget(routerConfig.maxSteps, agentConfig.maxStepsMultiplier)) : researchStepBudget(routerConfig.maxSteps, agentConfig.maxStepsMultiplier)
      let evidenceContext = ''
      let effectiveTools = { ...tools, ...researchTools } as ToolSet
      if (research && isLibraryPlan(plan)) {
        const controller = new LibraryResearch(research)
        const report = await controller.initial(plan, settings.abortSignal)
        evidenceContext = researchContext(report)
        effectiveTools = controller.tools
      } else if (research && plan.intent === 'conversation') {
        effectiveTools = {}
      } else if (research) {
        const { 'sacred-text-mcp': _legacy, ...otherTools } = effectiveTools
        effectiveTools = otherTools
      }
      const routedModel = resolveModel?.(routerConfig, agentConfig)
        ?? agentConfig.defaultModel
        ?? DEFAULT_MODEL
      const effectiveModel = modelOverride ?? routedModel
      currentModel = effectiveModel
      const { temperature } = agentConfig

      maxSteps = effectiveMaxSteps
      onRouted?.({ routerConfig, agentConfig, effectiveModel, effectiveMaxSteps })

      const executionContext: AgentExecutionContext = {
        mode: 'chat',
        effectiveModel,
        maxSteps: effectiveMaxSteps,
        routerConfig,
        agentConfig,
        customContext,
      }

      return {
        ...settings,
        model: wrap(effectiveModel),
        instructions: buildPrompt({ ...routerConfig, maxSteps: effectiveMaxSteps }, agentConfig) + evidenceContext,
        tools: effectiveTools,
        stopWhen: stepCountIs(effectiveMaxSteps + 1),
        ...buildGenerationSettings(effectiveModel, 'research', temperature),
        experimental_context: executionContext,
      }
    },
    prepareStep: ({ stepNumber, messages, steps }) => {
      sanitizeToolCallInputs(messages)
      const normalizedSteps = (steps as StepResult<ToolSet>[] | undefined) ?? []
      const compactedMessages = compactContext({ messages, steps: normalizedSteps })

      if (shouldForceTextOnlyStep({ stepNumber, maxSteps, steps: normalizedSteps })) {
        log.info({ event: 'agent.force_text_step', step: stepNumber + 1, maxSteps })
        return {
          toolChoice: 'none' as const,
          messages: finalAnswerMessages(compactedMessages),
          providerOptions: buildProviderOptions(currentModel, resolveGatewayMetadata(), 'final'),
        }
      }

      if (compactedMessages !== messages) {
        return { messages: compactedMessages }
      }
    },
    onStepFinish,
    onFinish,
  })
}
