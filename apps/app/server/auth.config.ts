import { admin, genericOAuth } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import { schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { acuityOidcSignupError, isAcuityLoginConfigured, isPublicSignupEnabled } from './utils/access-policy'

export default defineServerAuth(({ db }) => {
  const githubClientId = process.env.GITHUB_CLIENT_ID || ''
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || ''
  const baseURL = process.env.BETTER_AUTH_URL
    || process.env.NUXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || (process.env.VERCEL ? 'https://acuity-agent.vercel.app' : '')

  // Unified login: auth.acuity.institute as a generic OIDC provider ("acuity").
  // Callback (better-auth 1.7): <BETTER_AUTH_URL>/api/auth/callback/acuity
  const acuityIssuer = (process.env.ACUITY_OIDC_ISSUER || '').trim().replace(/\/+$/, '')
  const acuityPlugins = isAcuityLoginConfigured()
    ? [
      genericOAuth({
        config: [
          {
            providerId: 'acuity',
            discoveryUrl: `${acuityIssuer}/.well-known/openid-configuration`,
            clientId: process.env.ACUITY_OIDC_CLIENT_ID!.trim(),
            clientSecret: process.env.ACUITY_OIDC_CLIENT_SECRET!.trim(),
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
            mapProfileToUser: (profile: Record<string, unknown>) => ({
              email: String(profile.email || '').toLowerCase(),
              emailVerified: profile.email_verified === true,
              name: String(profile.name || profile.email || ''),
              image: typeof profile.picture === 'string' ? profile.picture : undefined,
            }),
          }
        ],
      })
    ]
    : []

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
      // New identities from the Acuity IdP must be verified and approved.
      validateUserInfo: (data: { user: Record<string, unknown>, source: { action: string, method: string, oauth?: { providerId: string } } }) => {
        const { user, source } = data
        if (source.action !== 'create-user' || source.oauth?.providerId !== 'acuity') return
        const reason = acuityOidcSignupError(user)
        return reason ? { error: 'sign_up_not_allowed', errorDescription: reason } : undefined
      },
    },
    // Existing accounts link to their Acuity identity on first sign-in. Linking
    // requires the IdP to assert email_verified (acuity is not a trusted provider).
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
      },
    },
    plugins: [
      admin(),
      ...acuityPlugins,
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
