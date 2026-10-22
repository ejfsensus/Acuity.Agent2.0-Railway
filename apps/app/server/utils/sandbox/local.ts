import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { log } from 'evlog'
import { createError } from 'h3'
import { validateShellCommand } from '@savoir/sdk'
import type { CommandRunOptions, CommandRunResult, SandboxLike } from './types'
import { withKnowledgeBaseLock } from './lock'

/**
 * Root of the knowledge base the agent is allowed to search.
 *
 * The path is deliberately kept at the historical `/vercel/sandbox` default:
 * `@savoir/sdk` pre-validates agent commands against this directory on the
 * client, so changing it would silently desync the published SDK contract.
 * Override with SANDBOX_ROOT only if you also update the SDK.
 */
export const SANDBOX_ROOT = process.env.SANDBOX_ROOT || '/vercel/sandbox'

async function assertSafeSandbox(): Promise<void> {
  const root = await realpath(SANDBOX_ROOT)
  async function inspect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === root && (entry.name === '.git' || entry.name === 'lost+found')) continue
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await realpath(path).catch(() => '')
        if (target !== root && !target.startsWith(`${root}/`)) throw new Error('Knowledge base contains a symbolic link outside the sandbox')
      } else if (entry.isDirectory()) await inspect(path)
    }
  }
  await inspect(root)
}

const DEFAULT_TIMEOUT_MS = Number(process.env.SANDBOX_COMMAND_TIMEOUT_MS || 60_000)
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

/**
 * Commands run inside the app container rather than an isolated microVM, so the
 * child environment is scrubbed: an agent could otherwise read `POSTGRES_URL` or
 * API keys via `echo $VAR`, which no allow-list catches.
 */
function childEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: SANDBOX_ROOT,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    SANDBOX_ROOT,
  }
}

function resolveCwd(cwd?: string): string {
  if (!cwd) return SANDBOX_ROOT
  // Accept absolute paths that already point at the root, and root-relative ones.
  const candidate = resolve(SANDBOX_ROOT, cwd)
  if (candidate !== SANDBOX_ROOT && !candidate.startsWith(`${SANDBOX_ROOT}/`)) {
    throw createError({
      statusCode: 400,
      message: 'Working directory outside sandbox root is not allowed',
      data: { why: `cwd "${cwd}" escapes ${SANDBOX_ROOT}`, fix: 'Use a path inside the sandbox root' },
    })
  }
  return candidate
}

/** Runs a command and adapts node:child_process output to the async-getter shape callers expect. */
function exec(options: CommandRunOptions, cwd: string): Promise<CommandRunResult> {
  const { cmd, args = [], timeoutMs = DEFAULT_TIMEOUT_MS, env } = options
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false

    const child = spawn(cmd, args, {
      cwd,
      env: { ...childEnv(), ...env },
      shell: false,
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      stderr += `\n[command timed out after ${timeoutMs}ms]`
    }, timeoutMs)

    const finish = (exitCode: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode,
        stdout: () => Promise.resolve(stdout),
        stderr: () => Promise.resolve(stderr),
      })
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= MAX_OUTPUT_BYTES) return
      stdoutBytes += chunk.length
      stdout += chunk.toString('utf8')
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBytes >= MAX_OUTPUT_BYTES) return
      stderrBytes += chunk.length
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      stderr += `\n${error.message}`
      finish(127)
    })

    child.on('close', code => finish(code ?? 0))
  })
}

let rootReady: Promise<void> | null = null

/** Ensures the sandbox root exists exactly once per process. */
export function ensureSandboxRoot(): Promise<void> {
  if (!rootReady) {
    rootReady = mkdir(SANDBOX_ROOT, { recursive: true }).then(
      () => undefined,
      (error) => {
        rootReady = null
        throw createError({
          statusCode: 500,
          message: `Could not initialise sandbox root at ${SANDBOX_ROOT}`,
          data: {
            why: error instanceof Error ? error.message : String(error),
            fix: 'Mount a writable volume at SANDBOX_ROOT, or set SANDBOX_ROOT to a writable path',
          },
        })
      },
    )
  }
  return rootReady
}

/**
 * Local replacement for a Vercel Sandbox.
 *
 * One instance is shared by every user and conversation — the app already pooled
 * sandboxes this way, and the knowledge base is a single read-only clone.
 */
export class LocalSandbox implements SandboxLike {

  readonly sandboxId: string
  readonly status = 'running'

  constructor(sandboxId: string = 'local') {
    this.sandboxId = sandboxId
  }

  /** Trusted path used by content sync and git plumbing. Commands run as given. */
  async runCommand(options: CommandRunOptions): Promise<CommandRunResult> {
    await ensureSandboxRoot()
    const cwd = resolveCwd(options.cwd)
    return exec(options, cwd)
  }

  /**
   * Untrusted path used by the agent. Re-applies the shell policy here as well as
   * at the API boundary, because this executor now runs in the app's own
   * container instead of a disposable microVM.
   */
  runAgentCommand(command: string): Promise<CommandRunResult> {
    const validation = validateShellCommand(command, { allowedBaseDirectory: SANDBOX_ROOT })
    if (!validation.ok) {
      throw createError({
        statusCode: 400,
        message: validation.reason,
        data: { why: 'The command failed security validation', fix: `Use only allowed commands within ${SANDBOX_ROOT}` },
      })
    }
    return withKnowledgeBaseLock(async () => {
      await assertSafeSandbox()
      return this.runCommand({ cmd: 'bash', args: ['-c', command], cwd: SANDBOX_ROOT })
    })
  }

  /**
   * Snapshots are git commits of the knowledge base, not microVM images.
   * Returns the current HEAD so callers can persist it as the snapshot id.
   */
  async snapshot(): Promise<{ snapshotId: string }> {
    const result = await this.runCommand({
      cmd: 'git',
      args: ['rev-parse', 'HEAD'],
      cwd: SANDBOX_ROOT,
    })
    const sha = result.exitCode === 0 ? (await result.stdout()).trim() : ''
    const stamp = await readFile(join(SANDBOX_ROOT, 'docs/sacred-texts/LIBRARY_STAMP'), 'utf8').catch(() => '')
    if (!sha && !stamp.trim()) throw new Error('Knowledge base contains no Git revision or bundled library')
    const snapshotId = sha || `local-${stamp.trim()}`
    log.info('sandbox', `Local snapshot recorded: ${snapshotId}`)
    return { snapshotId }
  }

}
