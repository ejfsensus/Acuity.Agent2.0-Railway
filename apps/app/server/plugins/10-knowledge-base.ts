import { log } from 'evlog'
import { ensureKnowledgeBase } from '../utils/sandbox/knowledge-base'

export default defineNitroPlugin(async () => {
  try {
    await ensureKnowledgeBase()
  } catch (error) {
    log.error('sandbox', `Knowledge base initialization failed: ${error instanceof Error ? error.message : String(error)}`)
  }
})
