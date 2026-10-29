import type { AgentConfigData } from '../types'
import type { AgentConfig } from '../router/schema'

export const STYLE_INSTRUCTIONS: Record<AgentConfigData['responseStyle'], string> = {
  concise: 'Keep your responses brief and to the point.',
  detailed: 'Provide comprehensive explanations with context.',
  technical: 'Focus on technical details and include code examples.',
  friendly: 'Be conversational and approachable in your responses.',
}

export function applyAgentConfig(basePrompt: string, config: AgentConfigData): string {
  let prompt = basePrompt

  prompt = prompt.replace(
    /## Response(?: Style)?\n+- Be concise and helpful/,
    `## Response Style\n\n- ${STYLE_INSTRUCTIONS[config.responseStyle]}`,
  )

  if (config.language && config.language !== 'en') {
    prompt += `\n\n## Language\nRespond in ${config.language}.`
  }

  if (config.citationFormat === 'footnote') {
    prompt += '\n\n## Citations\nPlace all source citations as footnotes at the end of your response.'
  } else if (config.citationFormat === 'none') {
    prompt += '\n\n## Citations\nDo not include source citations in your response.'
  }

  if (config.searchInstructions) {
    prompt += `\n\n## Custom Search Instructions\n${config.searchInstructions}`
  }

  if (config.additionalPrompt) {
    prompt += `\n\n## Additional Instructions\n${config.additionalPrompt}`
  }

  return prompt
}

export const COMPLEXITY_HINTS: Record<AgentConfig['complexity'], string> = {
  trivial: 'Respond directly without searching.',
  simple: 'Search the relevant collections, read matching passages and edition information, then answer. Use further searches when the first results do not answer the question.',
  moderate: 'Search broadly across relevant traditions and collections, including the Ancient Wisdom Atlas Markdown texts. Batch independent searches, try synonyms and alternate spellings, then read and cross-reference the best passages. Continue researching while important parts of the question remain unsupported.',
  complex: 'Map the relevant collections and traditions, run broad parallel searches with alternate terms, then read passages in context and compare primary sources. Follow evidence gaps with additional searches. Distinguish meaningful differences between traditions and acknowledge gaps rather than claiming exhaustive coverage.',
}

export function applyComplexity(prompt: string, agentConfig: AgentConfig): string {
  return `${prompt}\n\n## Research and final answer
You have up to **${agentConfig.maxSteps} research iterations**, followed by a separate reserved synthesis iteration. An iteration can contain multiple tool calls or a batch of independent searches.
Use as many research iterations as needed within that allowance. Finish early when the evidence answers the question; do not stop after an arbitrary number of searches. If the allowance is reached, synthesize the evidence gathered and state any remaining gaps. Every completed search must end with a substantive, user-facing text answer.

## Task Complexity: ${agentConfig.complexity}
${COMPLEXITY_HINTS[agentConfig.complexity]}`
}

export function applyTemporalContext(prompt: string): string {
  const now = new Date()
  const [date] = now.toISOString().split('T')
  return prompt.replace('{{TEMPORAL_CONTEXT}}', `Current date: ${date}. Documentation may reference older or newer versions — always check what's in the sandbox.`)
}
