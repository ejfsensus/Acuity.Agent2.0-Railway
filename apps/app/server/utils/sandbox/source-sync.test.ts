import { strict as assert } from 'node:assert'
import { after, test } from 'node:test'
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SandboxLike } from './types'

const root = await mkdtemp(join(tmpdir(), 'acuity-sync-test-'))
const previousRoot = process.env.SANDBOX_ROOT
process.env.SANDBOX_ROOT = join(root, 'volume')
const { sourceDirectory, syncFileSource, syncGitHubSource } = await import('./source-sync')
const { LocalSandbox: localSandbox } = await import('./local')
await mkdir(process.env.SANDBOX_ROOT, { recursive: true })

after(async () => {
  if (previousRoot === undefined) delete process.env.SANDBOX_ROOT
  else process.env.SANDBOX_ROOT = previousRoot
  await rm(root, { recursive: true, force: true })
})

test('file content is written literally inside the configured volume', async () => {
  const content = 'EOFMARKER\n$(touch /tmp/not-executed)\nA record with a quoted title.'
  const source = { id: 'uploaded', type: 'file' as const, label: 'Uploaded records', basePath: '/files', outputPath: 'records', files: [{ filename: 'record.txt', content }] }
  const result = await syncFileSource({} as SandboxLike, source)
  assert.equal(result.success, true)
  assert.equal(await readFile(join(sourceDirectory(source), 'record.txt'), 'utf8'), content)
})

test('source paths cannot escape the volume or replace the bundled library', () => {
  assert.throws(() => sourceDirectory({ id: 'x', basePath: '/docs', outputPath: '../../outside' }))
  assert.throws(() => sourceDirectory({ id: 'x', basePath: '/docs', outputPath: 'sacred-texts' }))
  assert.throws(() => sourceDirectory({ id: 'x', basePath: '/.git', outputPath: 'config' }))
})

test('agent commands cannot follow a library symlink into the app container', async () => {
  const link = join(process.env.SANDBOX_ROOT!, 'unsafe.txt')
  await symlink('/etc/passwd', link)
  try {
    await assert.rejects(new localSandbox().runAgentCommand('cat unsafe.txt'), /symbolic link outside the sandbox/)
  } finally {
    await rm(link)
  }
})

test('a targeted GitHub sync counts all text formats and preserves other sources', async () => {
  const fixture = join(root, 'repository')
  await mkdir(join(fixture, 'records'), { recursive: true })
  await writeFile(join(fixture, 'records', 'passage.txt'), 'A searchable record')
  await writeFile(join(fixture, 'records', 'passage.html'), '<p>Another record</p>')
  await writeFile(join(fixture, 'records', 'passage.usx'), '<usx>Scripture</usx>')
  await writeFile(join(fixture, 'records', 'scan.pdf'), 'A binary scan')
  await symlink('/etc/passwd', join(fixture, 'records', 'outside.txt'))
  const other = join(process.env.SANDBOX_ROOT!, 'docs', 'other-source')
  await mkdir(other, { recursive: true })
  await writeFile(join(other, 'keep.txt'), 'Do not remove')
  const sandbox = {
    runCommand: async (options) => {
      if (options.args?.[0] === 'clone') await cp(fixture, options.args.at(-1)!, { recursive: true })
      return { exitCode: 0, stdout: () => Promise.resolve(''), stderr: () => Promise.resolve('') }
    },
  } as SandboxLike
  const source = { id: 'github', type: 'github' as const, label: 'Records', basePath: '/docs', outputPath: 'records', repo: 'owner/library', branch: 'main', contentPath: 'records', readmeOnly: false }
  const result = await syncGitHubSource(sandbox, source)
  assert.equal(result.success, true)
  assert.equal(result.fileCount, 3)
  assert.equal(await readFile(join(other, 'keep.txt'), 'utf8'), 'Do not remove')
  assert.equal(await stat(join(sourceDirectory(source), 'outside.txt')).then(() => true).catch(() => false), false)
  assert.equal(await stat(join(sourceDirectory(source), 'scan.pdf')).then(() => true).catch(() => false), false)
})
