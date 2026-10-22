import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { log } from 'evlog'
import { installBundledLibrary, SACRED_TEXTS_SANDBOX_DIR } from './bundled-library'
import { LocalSandbox, SANDBOX_ROOT, ensureSandboxRoot } from './local'
import { generateAuthRepoUrl } from './git'
import { getSnapshotRepoConfig } from './snapshot-config'
import { getSnapshotToken } from '../github-auth'

const sandbox = new LocalSandbox('local-knowledge-base')

async function run(args: string[]): Promise<{ code: number, out: string }> {
  const result = await sandbox.runCommand({ cmd: 'git', args, cwd: SANDBOX_ROOT })
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
export async function prepareKnowledgeBase(): Promise<void> {
  await ensureSandboxRoot()

  const { snapshotRepo, snapshotBranch } = await getSnapshotRepoConfig()

  if (!snapshotRepo) {
    // Not an error: the app boots and admin can still configure a repo later.
    // The vendored library is still mounted so scripture search works.
    log.warn('sandbox', `No snapshot repository configured; mounting the bundled library only`)
    await installBundledLibrary()
    return
  }

  const branch = snapshotBranch || 'main'
  const token = await getSnapshotToken()
  const repoUrl = generateAuthRepoUrl(snapshotRepo, token)

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

  const fetch = await run(['fetch', '--depth', '1', 'origin', branch])
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed for ${snapshotRepo}#${branch}: ${scrub(fetch.out, token)}`)
  }

  const checkout = await run(['checkout', '-B', branch, 'FETCH_HEAD'])
  if (checkout.code !== 0) {
    throw new Error(`git checkout failed: ${scrub(checkout.out, token)}`)
  }

  // Keep the vendored library across cleans. It is not part of the snapshot repo.
  await ignoreBundledLibrary()
  await run(['clean', '-fd', '-e', SACRED_TEXTS_SANDBOX_DIR])
  await installBundledLibrary()

  log.info('sandbox', `Knowledge base ready at ${SANDBOX_ROOT} (${snapshotRepo}#${branch})`)
}

/** Stops a later sync from committing the vendored library into the snapshot repo. */
async function ignoreBundledLibrary(): Promise<void> {
  if (!isGitRepo()) return

  const exclude = join(SANDBOX_ROOT, '.git/info/exclude')
  const line = `${SACRED_TEXTS_SANDBOX_DIR}/`
  const current = existsSync(exclude) ? await readFile(exclude, 'utf8') : ''
  if (current.includes(line)) return

  await mkdir(dirname(exclude), { recursive: true })
  await writeFile(exclude, `${current.trimEnd()}\n${line}\n`)
}

/** Keeps an embedded token out of logs and error messages. */
function scrub(text: string, token?: string): string {
  if (!token) return text
  return text.replaceAll(token, '[redacted]')
}
