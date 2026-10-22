import { cp, mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { log } from 'evlog'
import { youtube } from '@googleapis/youtube'
import { YoutubeTranscript } from 'youtube-transcript'
import type { FileSource, GitHubSource, Source, SyncSourceResult, YouTubeSource } from '../../workflows/sync-docs/types'
import type { SandboxLike } from './types'
import { SANDBOX_ROOT } from './local'
import { generateRepoUrl, gitAuthEnv } from './git'

interface YouTubeVideo {
  id: string
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
}

interface VideoIndex {
  id: string
  title: string
  publishedAt: string
  file: string
  hasTranscript: boolean
}

const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.html', '.htm', '.usx', '.xml', '.json', '.jsonl', '.csv', '.yml', '.yaml', '.rst', '.tex'])

export function sourceDirectory(source: { id: string, basePath?: string, outputPath?: string }): string {
  const root = resolve(SANDBOX_ROOT)
  const output = source.outputPath || source.id
  if (output.startsWith('/') || output.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid source output path')
  const target = resolve(root, (source.basePath || '/docs').replace(/^\/+/, ''), output)
  const relative = target.slice(root.length + 1)
  if (!target.startsWith(`${root}/`) || relative.split('/').includes('.git') || relative === 'docs/sacred-texts' || relative.startsWith('docs/sacred-texts/')) {
    throw new Error('Source path must be inside the knowledge base and outside reserved directories')
  }
  return target
}

async function copyTextTree(source: string, target: string): Promise<number> {
  let count = 0
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.isSymbolicLink()) continue
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) count += await copyTextTree(from, to)
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      await cp(from, to)
      count++
    }
  }
  return count
}

export async function syncGitHubSource(sandbox: SandboxLike, source: GitHubSource, token?: string): Promise<SyncSourceResult> {
  let temporary: string | undefined
  let staged: string | undefined
  try {
    const target = sourceDirectory(source)
    const repoUrl = generateRepoUrl(source.repo)
    const branch = await sandbox.runCommand({ cmd: 'git', args: ['check-ref-format', '--branch', source.branch], cwd: SANDBOX_ROOT })
    if (branch.exitCode !== 0) throw new Error('Invalid GitHub source branch')
    if (source.readmeOnly) {
      const response = await fetch(`https://api.github.com/repos/${source.repo}/readme?ref=${encodeURIComponent(source.branch)}`, {
        headers: { Accept: 'application/vnd.github.raw+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`README fetch failed (HTTP ${response.status})`)
      await mkdir(target, { recursive: true })
      await writeFile(join(target, 'README.md'), await response.text())
      return { sourceId: source.id, label: source.label, success: true, fileCount: 1 }
    }
    temporary = await mkdtemp(join(tmpdir(), 'acuity-source-'))
    const clone = join(temporary, 'repository')
    const contentPath = source.contentPath || ''
    if (contentPath.startsWith('/') || contentPath.split('/').includes('..')) throw new Error('Invalid repository content path')
    const cloned = await sandbox.runCommand({
      cmd: 'git',
      args: ['clone', '--depth', '1', '--single-branch', '--branch', source.branch, ...(contentPath ? ['--filter=blob:none', '--sparse'] : []), '--', repoUrl, clone],
      env: gitAuthEnv(token), cwd: SANDBOX_ROOT, timeoutMs: 300_000,
    })
    if (cloned.exitCode !== 0) throw new Error(`Repository clone failed: ${await cloned.stderr()}`)
    if (contentPath) {
      const checkedOut = await sandbox.runCommand({ cmd: 'git', args: ['-C', clone, 'sparse-checkout', 'set', '--', contentPath], env: gitAuthEnv(token), cwd: SANDBOX_ROOT, timeoutMs: 300_000 })
      if (checkedOut.exitCode !== 0) throw new Error(`Content checkout failed: ${await checkedOut.stderr()}`)
    }
    const cloneRoot = await realpath(clone)
    const content = await realpath(join(clone, contentPath))
    if (content !== cloneRoot && !content.startsWith(`${cloneRoot}/`)) throw new Error('Content path escapes the repository')
    await mkdir(dirname(target), { recursive: true })
    staged = await mkdtemp(join(dirname(target), '.sync-'))
    const fileCount = await copyTextTree(content, staged)
    if (!fileCount) throw new Error('Repository content contains no supported text files')
    await rm(target, { recursive: true, force: true })
    await rename(staged, target)
    staged = undefined
    return { sourceId: source.id, label: source.label, success: true, fileCount }
  } catch (error) {
    return { sourceId: source.id, label: source.label, success: false, fileCount: 0, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true })
    if (staged) await rm(staged, { recursive: true, force: true })
  }
}

/** Synchronizes a YouTube channel to the sandbox filesystem */
export async function syncYouTubeSource(
  sandbox: SandboxLike,
  source: YouTubeSource,
  apiKey: string,
): Promise<SyncSourceResult> {
  try {
    log.info('sync', `Starting YouTube sync for ${source.label} (${source.channelId})`)

    const videos = await fetchChannelVideos(source.channelId, source.maxVideos, apiKey)
    log.info('sync', `Found ${videos.length} videos to sync`)

    if (videos.length === 0) {
      return {
        sourceId: source.id,
        label: source.label,
        success: true,
        fileCount: 0,
      }
    }

    const targetDir = sourceDirectory(source)
    await mkdir(targetDir, { recursive: true })

    const videosIndex: VideoIndex[] = []
    let successCount = 0

    for (const video of videos) {
      try {
        const transcript = await fetchVideoTranscript(video.id)
        const markdown = generateVideoMarkdown(video, transcript)
        const filename = `${video.id}-${slugify(video.title)}.md`
        const filepath = `${targetDir}/${filename}`

        await writeFile(filepath, markdown)

        videosIndex.push({
          id: video.id,
          title: video.title,
          publishedAt: video.publishedAt,
          file: filename,
          hasTranscript: !!transcript,
        })
        successCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.warn('sync', `Failed to sync video ${video.id}: ${errorMessage}`)
      }
    }

    const indexData = {
      lastSync: new Date().toISOString(),
      totalVideos: successCount,
      channelId: source.channelId,
      handle: source.handle,
      videos: videosIndex,
    }
    await writeFile(join(targetDir, 'videos.json'), JSON.stringify(indexData, null, 2))

    log.info('sync', `YouTube sync completed: ${successCount}/${videos.length} videos`)

    return {
      sourceId: source.id,
      label: source.label,
      success: successCount === videos.length,
      error: successCount === videos.length ? undefined : 'Some video transcripts could not be synchronized',
      fileCount: successCount + 1,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('sync', `YouTube sync failed for ${source.label}: ${errorMessage}`)
    return {
      sourceId: source.id,
      label: source.label,
      success: false,
      fileCount: 0,
      error: errorMessage,
    }
  }
}

async function fetchChannelVideos(
  channelId: string,
  maxVideos: number,
  apiKey: string,
): Promise<YouTubeVideo[]> {
  const yt = youtube({ version: 'v3', auth: apiKey })
  const videos: YouTubeVideo[] = []
  let pageToken: string | undefined

  while (videos.length < maxVideos) {
    try {
      const response = await yt.search.list({
        part: ['snippet'],
        channelId,
        maxResults: Math.min(50, maxVideos - videos.length),
        order: 'date',
        type: ['video'],
        pageToken,
      })

      for (const item of response.data.items || []) {
        if (!item.id?.videoId)
          continue

        videos.push({
          id: item.id.videoId,
          title: item.snippet?.title || 'Untitled',
          description: item.snippet?.description || '',
          publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || '',
        })
      }

      pageToken = response.data.nextPageToken || undefined
      if (!pageToken)
        break
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('sync', `Failed to fetch videos from channel ${channelId}: ${errorMessage}`)
      throw error
    }
  }

  return videos.slice(0, maxVideos)
}

async function fetchVideoTranscript(videoId: string): Promise<string | null> {
  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId)

    if (!transcriptItems || transcriptItems.length === 0) {
      log.warn('sync', `No transcript found for video ${videoId}`)
      return null
    }

    const transcript = transcriptItems
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    return transcript
  } catch (error) {
    log.warn('sync', `Failed to fetch transcript for ${videoId}: ${error}`)
    return null
  }
}

function generateVideoMarkdown(video: YouTubeVideo, transcript: string | null): string {
  const escapedTitle = video.title.replace(/"/g, '\\"')
  const escapedDescription = video.description
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .slice(0, 200)

  const publishedDate = new Date(video.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `---
title: "${escapedTitle}"
description: "${escapedDescription}"
videoId: "${video.id}"
publishedAt: "${video.publishedAt}"
url: "https://youtube.com/watch?v=${video.id}"
hasTranscript: ${!!transcript}
---

# ${video.title}

> Published on ${publishedDate}

## Description

${video.description}

## Watch on YouTube

[Watch this video](https://youtube.com/watch?v=${video.id})

${transcript ? `## Transcript\n\n${transcript}` : '⚠️ No transcript available for this video'}
`
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/** Keeps uploaded originals in object storage so a retry never loses source data. */
export async function syncFileSource(_sandbox: SandboxLike, source: FileSource): Promise<SyncSourceResult> {
  try {
    const target = sourceDirectory(source)
    await mkdir(target, { recursive: true })
    for (const entry of source.files) {
      if (basename(entry.filename) !== entry.filename || !TEXT_EXTENSIONS.has(extname(entry.filename).toLowerCase())) throw new Error('Invalid source filename')
      await writeFile(join(target, entry.filename), entry.content)
    }
    return { sourceId: source.id, label: source.label, success: true, fileCount: source.files.length }
  } catch (error) {
    return { sourceId: source.id, label: source.label, success: false, fileCount: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Syncs all sources sequentially, returns array of results */
export async function syncSources(
  sandbox: SandboxLike,
  sources: Source[],
  config?: { githubToken?: string; youtubeApiKey?: string },
): Promise<SyncSourceResult[]> {
  const results: SyncSourceResult[] = []

  for (const source of sources) {
    let result: SyncSourceResult

    if (source.type === 'github') {
      result = await syncGitHubSource(sandbox, source, config?.githubToken)
    } else if (source.type === 'youtube') {
      if (!config?.youtubeApiKey) {
        result = {
          sourceId: source.id,
          label: source.label,
          success: false,
          fileCount: 0,
          error: 'YouTube API key not configured',
        }
      } else {
        result = await syncYouTubeSource(sandbox, source, config.youtubeApiKey)
      }
    } else if (source.type === 'file') {
      result = await syncFileSource(sandbox, source)
    } else {
      const unknownSource = source as Source
      result = {
        sourceId: unknownSource.id,
        label: unknownSource.label,
        success: false,
        fileCount: 0,
        error: `Unsupported source type: ${unknownSource.type}`,
      }
    }

    results.push(result)
  }

  return results
}
