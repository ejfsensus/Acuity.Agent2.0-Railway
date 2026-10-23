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
    const result = await new localSandbox().runAgentCommand('cat unsafe.txt')
    assert.notEqual(result.exitCode, 0)
    assert.equal(await result.stdout(), '')
  } finally {
    await rm(link)
  }
})

test('virtual commands preserve quoted paths, pipelines and Unicode', async () => {
  await writeFile(join(process.env.SANDBOX_ROOT!, 'record café.txt'), 'A prayer for wisdom: שלום\nSecond line\n')
  const result = await new localSandbox().runAgentCommand('cat "record café.txt" | head -1')
  assert.equal(result.exitCode, 0)
  assert.equal(await result.stdout(), 'A prayer for wisdom: שלום\n')
})

test('quoted paths and shell utilities cannot read or overwrite host files', async () => {
  const privateFile = join(root, 'private.txt')
  await writeFile(privateFile, 'private fixture')
  const sandbox = new localSandbox()
  const read = await sandbox.runAgentCommand(`cat "${privateFile}"`)
  assert.notEqual(read.exitCode, 0)
  assert.equal(await read.stdout(), '')
  const write = await sandbox.runAgentCommand(`echo changed | tee "${privateFile}"`)
  assert.notEqual(write.exitCode, 0)
  assert.equal(await readFile(privateFile, 'utf8'), 'private fixture')
  const library = await sandbox.runAgentCommand('echo changed | tee "record café.txt"')
  assert.notEqual(library.exitCode, 0)
  assert.match(await readFile(join(process.env.SANDBOX_ROOT!, 'record café.txt'), 'utf8'), /A prayer/)
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
