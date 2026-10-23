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
  simple:
    'One bash_batch call: search + read in parallel, then answer.\nbash_batch: ["grep -rl \'keyword\' docs/sacred-texts --include=\'*.txt\' --include=\'*.html\' --include=\'*.usx\' | head -5", "grep -rl \'keyword\' docs/ --include=\'*.md\' | head -5"]\nThen answer.',
  moderate:
    'Use one bash_batch to search likely collections in docs/sacred-texts with *.txt, *.html, and *.usx filters. Use one further batch to read relevant passages and their edition information. Then synthesize a cited answer. Do not repeatedly list directories or search only Markdown files.',
  complex:
    'Wide search then deep read:\n1. bash_batch: parallel grep -rl across all relevant directories\n2. bash_batch: read top files with head -100, use grep -n -C3 for specific sections\n3. If needed, `web_search` for external context or recent information\n4. Cross-reference sources, then answer.',
}

export function applyComplexity(prompt: string, agentConfig: AgentConfig): string {
  const maxToolCalls = Math.max(1, agentConfig.maxSteps - 2)
  return `${prompt}\n\n## Step Budget
You have **${agentConfig.maxSteps} steps** total. Each tool call = 1 step. Your final text answer = 1 step.
**Use at most ${maxToolCalls} tool calls, then STOP and answer with what you found.** Never exhaust all steps on searching — always reserve the last step to provide your answer.

## Task Complexity: ${agentConfig.complexity}
${COMPLEXITY_HINTS[agentConfig.complexity]}`
}

export function applyTemporalContext(prompt: string): string {
  const now = new Date()
  const [date] = now.toISOString().split('T')
  return prompt.replace('{{TEMPORAL_CONTEXT}}', `Current date: ${date}. Documentation may reference older or newer versions — always check what's in the sandbox.`)
}
