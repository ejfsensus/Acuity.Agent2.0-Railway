// https://nuxt.com/docs/api/configuration/nuxt-config
const databaseUrl = process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.DATABASE_URL || ''

// Railway injects RAILWAY_PUBLIC_DOMAIN (no scheme) for the service's public hostname.
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL
  || process.env.BETTER_AUTH_URL
  || process.env.AUTH_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  || (process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL.replace(/\/$/, '') : '')

// PGlite is a local-dev fallback only; production always attaches Postgres.
const pgliteDataDir = process.env.NUXT_HUB_PGLITE_DIR || '.data/db/pglite'

// NuxtHub resolves the db driver at build time and bakes the choice into the
// bundle, so an image built without POSTGRES_URL silently ships PGlite: the
// generated client ignores the runtime connection string and /api/health still
// answers 200 against the embedded database, hiding the data loss. The Docker
// builder sets this to force the external driver.
const forceExternalDb = process.env.NUXT_HUB_DB_DRIVER === 'postgres-js'
const useExternalDb = forceExternalDb || Boolean(databaseUrl)

export default defineNuxtConfig({
  extends: ['../../packages/github'],

  modules: [
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@nuxthub/core',
    '@onmax/nuxt-better-auth',
    '@evlog/nuxthub',
    'nuxt-charts',
  ],

  auth: {
    redirects: {
      login: '/login',
      guest: '/',
    },
    schema: {
      usePlural: false,
      casing: 'camelCase',
    },
  },

  evlog: {
    retention: '7d',
    env: {
      service: 'acuity-agent',
      version: '0.1.0',
    },
    routes: {
      '/api/admin/**': { service: 'admin-api' },
      '/api/webhooks/**': { service: 'webhook-api' },
      '/api/sync/**': { service: 'sync-api' },
      '/api/sandbox/**': { service: 'sandbox-api' },
      '/api/stats/**': { service: 'stats-api' },
    },
    transport: { enabled: process.env.EVLOG_TRANSPORT_ENABLED === 'true' },
  },

  $production: {
    evlog: {
      sampling: {
        rates: {
          debug: 0,
          info: 10,
          warn: 50,
        },
        keep: [
          { status: 400 },
          { duration: 2000 },
          { path: '/api/webhooks/**' },
          { path: '/api/sandbox/**' },
        ],
      },
    },
  },

  devtools: { enabled: true },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  $development: {
    vite: {
      server: {
        allowedHosts: true // Allow ngrok and other tunnels
      }
    }
  },

  css: ['~/assets/css/main.css'],

  mdc: {
    headings: {
      anchorLinks: false
    },
    highlight: {
      shikiEngine: 'javascript'
    }
  },

  experimental: {
    viewTransition: true
  },

  icon: {
    customCollections: [
      {
        prefix: 'custom',
        dir: './app/assets/icons/custom',
      },
    ],
    clientBundle: {
      scan: true,
      includeCustomCollections: true,
    },
    provider: 'iconify',
  },

  compatibilityDate: 'latest',

  nitro: {
    // Long-running Node server: Railway runs the container as a service, not as
    // serverless functions, so the Vercel preset and its function config are gone.
    preset: process.env.NITRO_PRESET || 'node-server',
    experimental: {
      asyncContext: true,
      openAPI: true
    },
  },

  hub: {
    dir: process.env.NUXT_HUB_DIR || '.data',
    db: useExternalDb
      ? {
        dialect: 'postgresql',
        driver: 'postgres-js',
        // Omitted on purpose when forced: NuxtHub inlines `connection.url` into
        // the bundle, which would freeze a build-time value into the image and
        // shadow the POSTGRES_URL that Railway injects at runtime. Leaving it
        // unset makes the generated client read the env var on boot.
        ...(forceExternalDb ? {} : { connection: { url: databaseUrl } }),
        // The production database is not reachable at image-build time, so
        // migrations are applied at boot by server/plugins/00-database-migrations.ts
        applyMigrationsDuringBuild: false,
      }
      : {
        dialect: 'postgresql',
        driver: 'pglite',
        connection: { dataDir: pgliteDataDir },
      },
    kv: Boolean(process.env.REDIS_URL),
    // Object storage is served by server/utils/blob.ts against an S3-compatible
    // bucket (Railway Bucket) instead of Vercel Blob.
    blob: false,
    cache: true
  },

  routeRules: {
    '/': { isr: false, cache: false },
    '/login': { isr: false, cache: false },
    '/shared/**': { cache: { maxAge: 300 } },
    '/api/auth/**': { isr: false, cache: false },
    '/api/chats/**': { isr: false, cache: false },
    '/api/webhooks/**': { isr: false, cache: false },
    '/admin/docs/**': { isr: { expiration: false } },
    '/admin/**': { auth: { user: { role: 'admin' } as any } },
  },

  runtimeConfig: {
    betterAuthSecret: process.env.NUXT_BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET || '',
    ai: {
      provider: '',
      openAICompatibleBaseURL: '',
      openAICompatibleAPIKey: '',
      openAICompatibleName: '',
      defaultModel: '',
      routerModel: '',
      models: '',
    },
    github: {
      token: '',
      snapshotRepo: '',
      snapshotBranch: 'main',
      appId: '',
      appPrivateKey: '',
      webhookSecret: '',
      replyToNewIssues: false,
    },
    discord: {
      botToken: '',
      publicKey: '',
      applicationId: '',
      mentionRoleIds: '',
    },
    youtube: {
      apiKey: '',
    },
    public: {
      siteUrl,
      githubLoginEnabled: false,
      ai: {
        models: process.env.NUXT_PUBLIC_AI_MODELS || process.env.AI_MODELS || process.env.OPENAI_COMPATIBLE_MODELS || '',
        defaultModel: process.env.NUXT_PUBLIC_AI_DEFAULT_MODEL || process.env.AI_DEFAULT_MODEL || process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL || '',
        providerName: process.env.NUXT_PUBLIC_AI_PROVIDER_NAME || process.env.AI_PROVIDER_NAME || process.env.OPENAI_COMPATIBLE_NAME || '',
      },
      github: {
        appName: '',
        botTrigger: '',
      },
      discordBotUrl: '',
    },
  }
})
