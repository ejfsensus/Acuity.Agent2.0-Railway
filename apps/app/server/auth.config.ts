import { admin } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import { schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { isPublicSignupEnabled } from './utils/access-policy'

export default defineServerAuth(({ db }) => {
  const githubClientId = process.env.GITHUB_CLIENT_ID || ''
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || ''
  const baseURL = process.env.BETTER_AUTH_URL
    || process.env.NUXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || (process.env.VERCEL ? 'https://acuity-agent.vercel.app' : '')

  return {
    baseURL,
    secret: process.env.NUXT_BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET || (process.env.VERCEL ? 'acuity-agent-build-time-auth-secret' : 'local-dev-secret-for-acuity-agent'),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !isPublicSignupEnabled(),
    },
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    socialProviders: githubClientId && githubClientSecret
      ? {
        github: {
          clientId: githubClientId,
          clientSecret: githubClientSecret,
          scope: ['user:email'],
          mapProfileToUser: (profile: { name: string, login: string, avatar_url: string }) => ({
            name: profile.name || profile.login,
            image: profile.avatar_url,
            username: profile.login,
          }),
        },
      }
      : {},
    user: {
      additionalFields: {
        username: { type: 'string' as const, required: false },
      },
    },
    plugins: [
      admin(),
      apiKey({
        enableSessionForAPIKeys: true,
        rateLimit: {
          enabled: false,
        },
        customAPIKeyGetter: (ctx) => {
          const xApiKey = ctx.headers?.get('x-api-key')
          if (xApiKey) return xApiKey
          const authHeader = ctx.headers?.get('authorization')
          if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
          return null
        },
      }),
    ] as const,
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string }) => {
            try {
              const result = await db.select({ total: count() }).from(schema.user)
              if (!isPublicSignupEnabled() && result[0]!.total === 1) {
                await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, user.id))
              }
            } catch (error) {
              console.error('[auth] Failed to promote first user to admin', error)
            }
          },
        },
      },
    },
  }
})
