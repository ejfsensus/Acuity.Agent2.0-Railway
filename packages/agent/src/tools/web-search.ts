import { tool } from 'ai'
import { z } from 'zod'

const BRAVE_WEB_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search'
const BRAVE_LLM_CONTEXT_URL = 'https://api.search.brave.com/res/v1/llm/context'

type BraveWebResult = {
  title?: string
  url: string
  description?: string
  age?: string
}

type BraveWebSearchResponse = {
  web?: { results?: BraveWebResult[] }
  news?: { results?: BraveWebResult[] }
  query?: { altered?: string, original?: string }
}

type BraveLlmGroundingItem = {
  url?: string
  title?: string
  text?: string
  content?: string
}

type BraveLlmContextResponse = {
  grounding?: Record<string, BraveLlmGroundingItem[] | undefined>
  sources?: Record<
    string,
    {
      title?: string
      url?: string
      site_name?: string
      favicon?: string
      thumbnail?: string
    }
  >
}

async function callBrave<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
  abortSignal?: AbortSignal,
): Promise<T> {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) throw new Error('BRAVE_API_KEY is not set')

  const url = new URL(endpoint)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: abortSignal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Brave API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`)
  }

  return await response.json() as T
}

function formatSourcePreview(sources: Array<{ title?: string, url: string }>) {
  return sources.map(source => `${source.title || source.url}\n  ${source.url}`).join('\n')
}

export const braveWebSearchTool = tool({
  description: 'Search the web with Brave Search for up-to-date information. Returns ranked web results with titles, URLs, and snippets. Use for current events, recent docs, or facts not in the local context.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The search query, max 400 chars or 50 words.'),
    count: z.number().int().min(1).max(20).optional().describe('Number of web results to return, 1-20. Default 10.'),
    freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Restrict to last day, week, month, or year.'),
    country: z.string().length(2).optional().describe('ISO country code, e.g. US or GB.'),
    search_lang: z.string().optional().describe('Search language, e.g. en.'),
    safesearch: z.enum(['off', 'moderate', 'strict']).optional(),
  }),
  execute: async function* ({ query, count = 10, freshness, country, search_lang, safesearch }, { abortSignal }) {
    yield { status: 'loading' as const }
    const start = Date.now()

    try {
      const data = await callBrave<BraveWebSearchResponse>(
        BRAVE_WEB_SEARCH_URL,
        {
          q: query,
          count,
          freshness,
          country,
          search_lang,
          safesearch,
          text_decorations: false,
          result_filter: 'web',
        },
        abortSignal,
      )

      const results = data.web?.results ?? []
      const sources = results.map(result => ({
        title: result.title ?? result.url,
        url: result.url,
      }))

      const text = results
        .map((result, index) => `${index + 1}. ${result.title ?? result.url}\n   ${result.url}\n   ${result.description ?? ''}`.trim())
        .join('\n\n')

      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text,
        sources,
        commands: [
          {
            title: `Brave web search: "${query}"`,
            command: '',
            stdout: formatSourcePreview(sources) || text.slice(0, 500),
            stderr: '',
            exitCode: 0,
            success: true,
          },
        ],
      }
    } catch (error) {
      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text: '',
        sources: [],
        commands: [
          {
            title: `Brave web search: "${query}"`,
            command: '',
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Search failed',
            exitCode: 1,
            success: false,
          },
        ],
      }
    }
  },
})

export const braveLlmContextTool = tool({
  description: 'Fetch pre-extracted, ranked web content from Brave optimized for LLM grounding and RAG. Use when you need synthesized passages of evidence about a query, not just a list of links.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The user question or topic, max 400 chars or 50 words.'),
    count: z.number().int().min(1).max(50).optional().describe('Number of underlying search results considered, 1-50. Default 20.'),
    maximum_number_of_urls: z.number().int().min(1).max(50).optional(),
    maximum_number_of_tokens: z.number().int().min(1024).max(32768).optional().describe('Approximate max tokens of grounding content, 1024-32768.'),
    maximum_number_of_snippets: z.number().int().min(1).max(256).optional(),
    maximum_number_of_tokens_per_url: z.number().int().min(512).max(8192).optional(),
    maximum_number_of_snippets_per_url: z.number().int().min(1).max(100).optional(),
    context_threshold_mode: z.enum(['disabled', 'strict', 'lenient', 'balanced']).optional().describe('Strictness of inclusion threshold. Default balanced.'),
    freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional(),
    country: z.string().length(2).optional(),
    search_lang: z.string().optional(),
    enable_source_metadata: z.boolean().optional(),
  }),
  execute: async function* ({ query, ...params }, { abortSignal }) {
    yield { status: 'loading' as const }
    const start = Date.now()

    try {
      const data = await callBrave<BraveLlmContextResponse>(
        BRAVE_LLM_CONTEXT_URL,
        {
          q: query,
          enable_source_metadata: true,
          ...params,
        },
        abortSignal,
      )

      const chunks: string[] = []
      for (const [groupName, items] of Object.entries(data.grounding ?? {})) {
        if (!items?.length) continue
        chunks.push(`## ${groupName}`)
        for (const item of items) {
          const body = item.text ?? item.content ?? ''
          if (!body) continue
          chunks.push([
            item.title && `**${item.title}**`,
            item.url,
            body,
          ].filter(Boolean).join('\n'))
        }
      }

      const text = chunks.join('\n\n')
      const sources = Object.entries(data.sources ?? {}).map(([url, meta]) => ({
        title: meta.title ?? meta.site_name ?? url,
        url: meta.url ?? url,
      }))

      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text,
        sources,
        commands: [
          {
            title: `Brave LLM context: "${query}"`,
            command: '',
            stdout: formatSourcePreview(sources) || text.slice(0, 500),
            stderr: '',
            exitCode: 0,
            success: true,
          },
        ],
      }
    } catch (error) {
      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text: '',
        sources: [],
        commands: [
          {
            title: `Brave LLM context: "${query}"`,
            command: '',
            stdout: '',
            stderr: error instanceof Error ? error.message : 'LLM context fetch failed',
            exitCode: 1,
            success: false,
          },
        ],
      }
    }
  },
})

export const webSearchTool = braveWebSearchTool
