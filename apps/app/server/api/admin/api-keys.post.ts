import { z } from 'zod'
import type { InferAPI } from 'better-auth'
import type { apiKey } from '@better-auth/api-key'

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  const { user } = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  requestLog.set({ adminUserId: user.id, keyName: body.name || 'Admin key' })

  const auth = serverAuth(event)
  const api = auth.api as typeof auth.api & InferAPI<ReturnType<typeof apiKey>['endpoints']>
  const result = await api.createApiKey({
    body: {
      name: body.name || 'Admin key',
      prefix: 'sk',
      userId: user.id,
    },
  })

  return result
})
