import { createError } from 'evlog'
import type { SyncSourceResult } from '../../workflows/sync-docs/types'
import type { SandboxLike } from './types'
import { SANDBOX_ROOT } from './local'

export interface GitConfig {
  email: string
  name: string
}

export interface GitPushOptions {
  branch: string
  repoUrl: string
  commitMessage: string
  githubToken?: string
}

export interface GitPushResult {
  success: boolean
  error?: string
  hasChanges: boolean
}

/** Generates a validated GitHub URL without persisting credentials. */
export function generateRepoUrl(repoPath: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoPath)) throw new Error('Invalid GitHub repository name')
  return `https://github.com/${repoPath}.git`
}

/** Credentials are inherited by trusted Git processes, never saved in the clone. */
export function gitAuthEnv(token?: string): Record<string, string> {
  if (!token) return {}
  return {
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    GIT_CONFIG_KEY_1: 'credential.helper',
    GIT_CONFIG_VALUE_1: '',
  }
}

/** Sets git user email and name in sandbox */
export async function configureGit(sandbox: SandboxLike, config: GitConfig): Promise<void> {
  await sandbox.runCommand({
    cmd: 'git',
    args: ['config', 'user.email', config.email],
    cwd: SANDBOX_ROOT,
  })

  await sandbox.runCommand({
    cmd: 'git',
    args: ['config', 'user.name', config.name],
    cwd: SANDBOX_ROOT,
  })
}

/** Checks out branch, creating it if it doesn't exist */
export async function checkoutBranch(sandbox: SandboxLike, branch: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['checkout', '-B', branch],
    cwd: SANDBOX_ROOT,
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: `Git checkout failed for branch "${branch}"`,
      why: await result.stderr(),
      fix: 'Ensure the branch name is valid and git is properly configured',
    })
  }
}

/** Returns true if there are uncommitted changes in sandbox */
export async function hasChanges(sandbox: SandboxLike): Promise<boolean> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['status', '--porcelain'],
    cwd: SANDBOX_ROOT,
  })

  return (await result.stdout()).trim().length > 0
}

/** Adds files at path to git staging area */
export async function addFiles(sandbox: SandboxLike, path: string): Promise<void> {
  await sandbox.runCommand({
    cmd: 'git',
    args: ['add', path],
    cwd: SANDBOX_ROOT,
  })
}

/** Creates git commit with message */
export async function commit(sandbox: SandboxLike, message: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['commit', '-m', message],
    cwd: SANDBOX_ROOT,
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: 'Git commit failed',
      why: await result.stderr(),
      fix: 'Ensure there are staged changes and git user is configured',
    })
  }
}

/** Pushes branch to remote repository with upstream tracking */
export async function push(sandbox: SandboxLike, repoUrl: string, branch: string, token?: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['push', '--set-upstream', repoUrl, branch],
    env: gitAuthEnv(token),
    cwd: SANDBOX_ROOT,
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: `Git push failed for branch "${branch}"`,
      why: await result.stderr(),
      fix: 'Check repository permissions and ensure the remote URL is correct',
    })
  }
}

/** Generates formatted commit message from sync results with source list */
export function generateCommitMessage(results: SyncSourceResult[]): string {
  const successfulSources = results.filter(r => r.success)
  const totalFiles = results.reduce((sum, r) => sum + (r.fileCount || 0), 0)

  let message = `chore: sync docs (${successfulSources.length} sources, ${totalFiles} files)`

  if (successfulSources.length > 0) {
    message += `\n\nSources:\n${successfulSources.map(r => `- ${r.sourceId}`).join('\n')}`
  }

  message += `\n\nTimestamp: ${new Date().toISOString()}`

  return message
}

/** Executes complete git workflow: configure, checkout, add, commit, and push. Returns result with success status */
export async function pushChanges(
  sandbox: SandboxLike,
  options: GitPushOptions,
  gitConfig: GitConfig = { email: 'bot@acuity.institute', name: 'Acuity Knowledge Agent' },
): Promise<GitPushResult> {
  try {
    await configureGit(sandbox, gitConfig)
    await checkoutBranch(sandbox, options.branch)

    const changesExist = await hasChanges(sandbox)
    if (!changesExist) {
      await push(sandbox, options.repoUrl, options.branch, options.githubToken)
      return { success: true, hasChanges: false }
    }

    await addFiles(sandbox, '.')
    await commit(sandbox, options.commitMessage)
    await push(sandbox, options.repoUrl, options.branch, options.githubToken)

    return { success: true, hasChanges: true }
  } catch (error) {
    return {
      success: false,
      hasChanges: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
