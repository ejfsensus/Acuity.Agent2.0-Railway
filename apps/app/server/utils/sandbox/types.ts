export interface CommandRunOptions {
  cmd: string
  args?: string[]
  cwd?: string
  timeoutMs?: number
}

/**
 * Mirrors the shape callers already use against the Vercel Sandbox SDK:
 * `await result.stdout()`, `await result.stderr()`, `result.exitCode`.
 */
export interface CommandRunResult {
  exitCode: number
  stdout: () => Promise<string>
  stderr: () => Promise<string>
}

export interface SandboxLike {
  readonly sandboxId: string
  readonly status: string
  runCommand(options: CommandRunOptions): Promise<CommandRunResult>
  runAgentCommand(command: string): Promise<CommandRunResult>
  snapshot(): Promise<{ snapshotId: string }>
}

export interface SandboxSession {
  sandboxId: string
  snapshotId: string
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
}

export interface SnapshotMetadata {
  snapshotId: string
  createdAt: number
  sourceRepo: string
  commitSha?: string
}

export interface SandboxManagerConfig {
  githubToken?: string
  snapshotRepo: string
  snapshotBranch?: string
  sessionTtlMs?: number
}

export interface ActiveSandbox {
  sandbox: SandboxLike
  session: SandboxSession
  sessionId: string
}

export const KV_KEYS = {
  CURRENT_SNAPSHOT: 'snapshot:current',
  SNAPSHOT_STATUS_CACHE: 'snapshot:status-cache',
  SNAPSHOT_REPO_CONFIG: 'snapshot:repo-config',
  LAST_SOURCE_SYNC: 'sources:last-sync',
  AGENT_CONFIG_CACHE: 'agent:config-cache',
  SYNC_STATUS: 'sync:status',
  session: (sessionId: string) => `session:${sessionId}`,
  ACTIVE_SANDBOX_SESSION: 'sandbox:active-session',
  rateLimit: (userId: string, date: string) => `ratelimit:${userId}:${date}`,
} as const
