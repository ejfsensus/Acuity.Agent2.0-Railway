import { describe, expect, test } from 'bun:test'
import { isPathWithinDirectory, pathMatchesGlob, validateShellCommand } from './shell-policy'

describe('validateShellCommand', () => {
  test('accepts allowed command', () => {
    const result = validateShellCommand('ls -la docs/')
    expect(result).toEqual({ ok: true })
  })

  test('rejects blocked shell pattern', () => {
    const result = validateShellCommand('ls $(pwd)')
    expect(result.ok).toBe(false)
  })

  test('rejects disallowed command', () => {
    const result = validateShellCommand('curl https://example.com')
    expect(result).toEqual({
      ok: false,
      reason: 'Command not allowed: curl',
    })
  })

  test('rejects absolute path outside sandbox', () => {
    const result = validateShellCommand('cat /etc/passwd', {
      allowedBaseDirectory: '/vercel/sandbox',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'Path outside sandbox is not allowed: /etc/passwd',
    })
  })

  test('accepts quoted regex alternation and sed ranges within a pipeline', () => {
    expect(validateShellCommand('grep -nE "wisdom|practice" docs/book.txt | head -5')).toEqual({ ok: true })
    expect(validateShellCommand('sed -n \'10,20p;30,40p\' docs/book.txt')).toEqual({ ok: true })
  })

  test('still rejects commands separated outside quotes', () => {
    expect(validateShellCommand('grep "wisdom|practice" docs/book.txt; curl https://example.com').ok).toBe(false)
    expect(validateShellCommand('echo ok & curl https://example.com').ok).toBe(false)
    expect(validateShellCommand('cat "unfinished').ok).toBe(false)
  })
})

describe('path utils', () => {
  test('isPathWithinDirectory works for nested path', () => {
    expect(isPathWithinDirectory('/vercel/sandbox/docs/file.md', '/vercel/sandbox')).toBe(true)
    expect(isPathWithinDirectory('/etc/passwd', '/vercel/sandbox')).toBe(false)
  })

  test('pathMatchesGlob matches recursive patterns', () => {
    expect(pathMatchesGlob('/vercel/sandbox/docs/a/b.md', 'docs/**', '/vercel/sandbox')).toBe(true)
    expect(pathMatchesGlob('/vercel/sandbox/src/index.ts', 'docs/**', '/vercel/sandbox')).toBe(false)
  })
})
