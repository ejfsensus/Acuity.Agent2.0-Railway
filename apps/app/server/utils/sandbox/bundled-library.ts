import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from 'evlog'
import { SANDBOX_ROOT } from './local'

/** Path inside the sandbox. The agent greps from the sandbox root. */
export const SACRED_TEXTS_SANDBOX_DIR = 'docs/sacred-texts'

const MARKER = 'ATTRIBUTION.txt'

/**
 * Finds the vendored sacred-text tree.
 * Production copies it to /app/library/sacred-texts. Local dev keeps it at
 * Texts/sacred_texts_archive in the repository root.
 */
export function resolveBundledLibraryDir(): string | null {
  const walked: string[] = []
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 8; i++) {
      walked.push(join(dir, 'Texts/sacred_texts_archive'))
      dir = dirname(dir)
    }
  } catch {
    // import.meta.url is unavailable in some runners.
  }

  const candidates = [
    process.env.SACRED_TEXTS_DIR,
    '/app/library/sacred-texts',
    join(process.cwd(), 'Texts/sacred_texts_archive'),
    join(process.cwd(), '../Texts/sacred_texts_archive'),
    join(process.cwd(), '../../Texts/sacred_texts_archive'),
    ...walked,
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (existsSync(join(candidate, MARKER))) return candidate
  }
  return null
}

/**
 * Copies the vendored library into the sandbox so grep can read it.
 * Skips the copy when LIBRARY_STAMP already matches.
 */
export async function installBundledLibrary(): Promise<void> {
  const source = resolveBundledLibraryDir()
  if (!source) {
    log.warn('sandbox', 'No bundled sacred-text library found; docs/sacred-texts will not be mounted')
    return
  }

  const target = join(SANDBOX_ROOT, SACRED_TEXTS_SANDBOX_DIR)
  const stamp = (await readFile(join(source, 'LIBRARY_STAMP'), 'utf8')).trim()
  const mountedStamp = join(target, 'LIBRARY_STAMP')

  if (existsSync(mountedStamp)) {
    const current = (await readFile(mountedStamp, 'utf8')).trim()
    if (current === stamp) {
      log.info('sandbox', `Sacred-text library already mounted at ${target}`)
      return
    }
  }

  await mkdir(join(SANDBOX_ROOT, 'docs'), { recursive: true })
  const staged = await mkdtemp(join(SANDBOX_ROOT, '.library-mount-'))
  try {
    await cp(source, staged, {
      recursive: true,
      filter: src => !src.endsWith('.DS_Store') && src !== join(source, 'LIBRARY_STAMP'),
    })
    // A matching marker must mean the entire copy completed, including after
    // an interrupted deployment. Never stamp a partially copied library.
    await writeFile(join(staged, 'LIBRARY_STAMP'), `${stamp}\n`)
    await rm(target, { recursive: true, force: true })
    await rename(staged, target)
  } finally {
    await rm(staged, { recursive: true, force: true })
  }
  log.info('sandbox', `Mounted sacred-text library at ${target} from ${source}`)
}
