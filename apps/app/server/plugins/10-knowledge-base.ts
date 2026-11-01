import { join } from 'node:path'
import { buildLocalCatalogue } from '@savoir/agent'
import { log } from 'evlog'
import { SANDBOX_ROOT } from '../utils/sandbox/local'
import { ensureKnowledgeBase } from '../utils/sandbox/knowledge-base'

export default defineNitroPlugin(async () => {
  try {
    await ensureKnowledgeBase()
    await buildLocalCatalogue(join(SANDBOX_ROOT, 'docs/sacred-texts'), join(SANDBOX_ROOT, '.library-catalogue-v1.json'))
  } catch (error) {
    log.error('sandbox', `Knowledge base initialization failed: ${error instanceof Error ? error.message : String(error)}`)
  }
})
