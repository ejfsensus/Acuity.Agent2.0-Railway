import { log } from 'evlog'
import type { DiscordAdapter } from '@chat-adapter/discord'
import { useBot } from '../utils/bot/index'
import { waitUntil } from '../utils/wait-until'

/**
 * Keeps the Discord gateway connection alive for the lifetime of the process.
 *
 * On Vercel this ran as a daily cron holding a 10-minute listener, which left the
 * bot offline for most of the day. On a long-running Railway service the gateway
 * stays connected and is re-established if it drops.
 *
 * Enable with DISCORD_GATEWAY_ENABLED=true alongside NUXT_DISCORD_BOT_TOKEN.
 */

const LISTEN_DURATION_MS = 60 * 60 * 1000
const RESTART_DELAY_MS = 5_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default defineNitroPlugin(() => {
  if (process.env.DISCORD_GATEWAY_ENABLED !== 'true') return
  if (!process.env.NUXT_DISCORD_BOT_TOKEN) {
    log.warn('discord', 'DISCORD_GATEWAY_ENABLED=true but NUXT_DISCORD_BOT_TOKEN is not set; gateway not started')
    return
  }

  let stopping = false

  const shutdown = () => {
    stopping = true
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  waitUntil((async () => {
    const bot = useBot()
    await bot.initialize()

    let discord: DiscordAdapter
    try {
      discord = bot.getAdapter('discord') as DiscordAdapter
    } catch {
      log.error('discord', 'Discord adapter not configured; gateway not started')
      return
    }

    const siteUrl = useRuntimeConfig().public.siteUrl as string | undefined
    const webhookUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/api/webhooks/discord` : undefined

    log.info('discord', 'Starting persistent gateway listener')

    while (!stopping) {
      try {
        await discord.startGatewayListener(
          { waitUntil: (task: Promise<unknown>) => waitUntil(task, 'discord-gateway') },
          LISTEN_DURATION_MS,
          undefined,
          webhookUrl,
        )
        log.info('discord', 'Gateway listener returned; reconnecting')
      } catch (error) {
        log.error('discord', `Gateway listener failed: ${error instanceof Error ? error.message : String(error)}`)
      }

      if (!stopping) await sleep(RESTART_DELAY_MS)
    }

    log.info('discord', 'Gateway listener stopped')
  })(), 'discord-gateway-bootstrap')
})
