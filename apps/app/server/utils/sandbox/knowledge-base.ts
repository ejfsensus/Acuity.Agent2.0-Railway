import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { log } from 'evlog'
import { getSnapshotToken } from '../github-auth'
import { installBundledLibrary, SACRED_TEXTS_SANDBOX_DIR } from './bundled-library'
import { LocalSandbox, SANDBOX_ROOT, ensureSandboxRoot } from './local'
import { generateRepoUrl, gitAuthEnv } from './git'
import { getSnapshotRepoConfig } from './snapshot-config'
import { getCurrentSnapshot, setCurrentSnapshot } from './snapshot'
import { withKnowledgeBaseLock } from './lock'

const sandbox = new LocalSandbox('local-knowledge-base')

async function run(args: string[], token?: string): Promise<{ code: number, out: string }> {
  const result = await sandbox.runCommand({ cmd: 'git', args, cwd: SANDBOX_ROOT, env: gitAuthEnv(token), timeoutMs: 300_000 })
  const out = `${await result.stdout()}\n${await result.stderr()}`.trim()
  return { code: result.exitCode, out }
}

function isGitRepo(): boolean {
  return existsSync(join(SANDBOX_ROOT, '.git'))
}

/**
 * Brings the local knowledge base up to date with the snapshot repository.
 *
 * Replaces Vercel Sandbox snapshot boot: instead of launching a microVM from an
 * image, we keep one clone on the attached volume and fast-forward it.
 * Uses `init` + `fetch` rather than `clone` so it also works when the root
 * directory already exists (which it does, because it is a volume mount).
 */
let initialized: Promise<void> | null = null

export function ensureKnowledgeBase(): Promise<void> {
  if (!initialized) initialized = prepareKnowledgeBase().catch((error) => {
    initialized = null
    throw error
  })
  return initialized
}

export function prepareKnowledgeBase(): Promise<void> {
  return withKnowledgeBaseLock(prepare)
}

async function recordRevision(sourceRepo: string): Promise<void> {
  const { snapshotId } = await sandbox.snapshot()
  const current = await getCurrentSnapshot()
  if (current?.snapshotId === snapshotId && current.sourceRepo === sourceRepo) return
  await setCurrentSnapshot({ snapshotId, sourceRepo, createdAt: Date.now(), commitSha: snapshotId.startsWith('local-') ? undefined : snapshotId })
}

async function prepare(): Promise<void> {
  await ensureSandboxRoot()

  const { snapshotRepo, snapshotBranch } = await getSnapshotRepoConfig()

  if (!snapshotRepo) {
    // Not an error: the app boots and admin can still configure a repo later.
    // The vendored library is still mounted so scripture search works.
    log.warn('sandbox', `No snapshot repository configured; mounting the bundled library only`)
    await installBundledLibrary()
    await recordRevision('')
    return
  }

  const branch = snapshotBranch || 'main'
  const token = await getSnapshotToken()
  const repoUrl = generateRepoUrl(snapshotRepo)

  const validBranch = await run(['check-ref-format', '--branch', branch])
  if (validBranch.code !== 0) throw new Error('Invalid knowledge repository branch')
  const previousRemote = isGitRepo() ? await run(['remote', 'get-url', 'origin']) : null
  const previousBranch = isGitRepo() ? await run(['symbolic-ref', '--short', 'HEAD']) : null
  const remoteChanged = previousRemote?.out.replace(/https:\/\/[^@]+@/, 'https://') !== repoUrl
  const branchChanged = previousBranch?.out !== branch

  if (!isGitRepo()) {
    log.info('sandbox', `Initialising knowledge base from ${snapshotRepo}#${branch}`)
    const init = await run(['init'])
    if (init.code !== 0) throw new Error(`git init failed: ${init.out}`)

    // Remote may already exist if a previous attempt got partway.
    await run(['remote', 'remove', 'origin'])
    const addRemote = await run(['remote', 'add', 'origin', repoUrl])
    if (addRemote.code !== 0) throw new Error(`git remote add failed: ${addRemote.out}`)
  } else {
    // Refresh credentials each run: GitHub App installation tokens are short-lived.
    await run(['remote', 'set-url', 'origin', repoUrl])
  }

  await ignoreBundledLibrary()
  const fetch = await run(['fetch', 'origin', branch], token)
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed for ${snapshotRepo}#${branch}: ${scrub(fetch.out, token)}`)
  }

  const head = await run(['rev-parse', '--verify', 'HEAD'])
  const checkout = head.code === 0 && !remoteChanged && !branchChanged
    ? await run(['merge', '--ff-only', 'FETCH_HEAD'])
    : await run(['checkout', '-B', branch, 'FETCH_HEAD'])
  if (checkout.code !== 0) {
    throw new Error(`git checkout failed: ${scrub(checkout.out, token)}`)
  }

  // Keep the vendored library across cleans. It is not part of the snapshot repo.
  await ignoreBundledLibrary()
  await installBundledLibrary()
  await recordRevision(snapshotRepo)

  log.info('sandbox', `Knowledge base ready at ${SANDBOX_ROOT} (${snapshotRepo}#${branch})`)
}

/** Stops a later sync from committing the vendored library into the snapshot repo. */
async function ignoreBundledLibrary(): Promise<void> {
  if (!isGitRepo()) return

  const exclude = join(SANDBOX_ROOT, '.git/info/exclude')
  const lines = [`${SACRED_TEXTS_SANDBOX_DIR}/`, 'lost+found/', '.sync-*/', '.library-mount-*/', '.library-catalogue-*.json', '.library-catalogue-*.json.*.tmp']
  const current = existsSync(exclude) ? await readFile(exclude, 'utf8') : ''
  const missing = lines.filter(line => !current.split('\n').includes(line))
  if (!missing.length) return

  await mkdir(dirname(exclude), { recursive: true })
  await writeFile(exclude, `${current.trimEnd()}\n${missing.join('\n')}\n`)
}

/** Keeps an embedded token out of logs and error messages. */
function scrub(text: string, token?: string): string {
  if (!token) return text
  return text.replaceAll(token, '[redacted]')
}
