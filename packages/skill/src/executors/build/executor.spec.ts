import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecFile = vi.fn()

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}))

// We must import after the mock is registered
const { buildExecutor } = await import('./executor.ts')

describe('@nx-devkit/skill build executor', () => {
  beforeEach(() => {
    mockExecFile.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns success: true on exit code 0', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        // Simulate successful exit
        setTimeout(() => cb(null, '', ''), 0)
        return undefined
      },
    )

    const result = await buildExecutor({
      target: 'skills-sh',
      outDir: '.build/skills/test',
      path: 'skills/test',
    })

    expect(result.success).toBe(true)
  })

  it('returns success: false on non-zero exit code', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        // Real execFile sets err to an Error with .code = exit code on non-zero
        const exitErr = new Error('Command exited with code 1') as Error & {
          code: number
        }
        exitErr.code = 1
        setTimeout(() => cb(exitErr, '', ''), 0)
        return undefined
      },
    )

    const result = await buildExecutor({
      target: 'skills-sh',
      outDir: '.build/skills/test',
      path: 'skills/test',
    })

    expect(result.success).toBe(false)
  })

  it('returns success: false on error', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        setTimeout(() => cb(new Error('command not found'), '', ''), 0)
        return undefined
      },
    )

    const result = await buildExecutor({
      target: 'skills-sh',
      outDir: '.build/skills/test',
      path: 'skills/test',
    })

    expect(result.success).toBe(false)
  })

  it('calls execFile with skills-compiler binary and correct args (no shell)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        setTimeout(() => cb(null, '', ''), 0)
        return undefined
      },
    )

    await buildExecutor({
      target: 'claude',
      outDir: '.build/skills/my-skill',
      path: 'skills/my-skill',
    })

    expect(mockExecFile).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = mockExecFile.mock.calls[0]!
    expect(cmd).toBe('skills-compiler')
    expect(args).toEqual([
      '--target',
      'claude',
      '--out',
      '.build/skills/my-skill',
      '--skill',
      'skills/my-skill',
    ])
    // Must NOT use shell: true
    expect(opts).not.toHaveProperty('shell', true)
    expect(opts?.shell).not.toBe(true)
  })

  it('returns { success: false } for invalid target', async () => {
    const result = await buildExecutor({
      target: 'invalid',
      outDir: './dist',
      path: 'skills/foo',
    })

    expect(result.success).toBe(false)
    expect(mockExecFile).not.toHaveBeenCalled()
  })
})
