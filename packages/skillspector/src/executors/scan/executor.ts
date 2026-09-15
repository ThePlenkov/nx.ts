import { execFile } from 'node:child_process'
import { mkdir, writeFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve as resolvePath, isAbsolute, sep } from 'node:path'
import { createHash } from 'node:crypto'

export interface ScanExecutorOptions {
  /** Path to the skill directory to scan (relative to workspace root). */
  path: string
  /** Disable LLM-based analysis. Default: true. */
  noLlm?: boolean
  /** Emit GitHub workflow annotations for code findings. Default: true. */
  annotations?: boolean
  /** Fail the target on HIGH/CRITICAL findings. Default: true. */
  failOnError?: boolean
  /** Binary to invoke for skillspector. Default: "skillspector". */
  skillspectorBin?: string
  /** SARIF output file path. */
  sarif?: string
  /** Baseline file path for suppressing known findings. */
  baseline?: string
}

export interface ScanExecutorContext {
  workspaceRoot: string
  options: ScanExecutorOptions
}

export interface ScanExecutorResult {
  success: boolean
}

interface SkillIssue {
  id: string
  severity: string
  category?: string
  confidence?: string
  explanation?: string
  remediation?: string
  code_snippet?: string
  intent?: string
  tags?: string[]
  location: {
    file: string
    start_line: number
  }
}

const CODE_FILE_EXTENSIONS = ['.ts', '.js', '.py', '.sh', '.yml', '.json']

function isCodeFile(filePath: string): boolean {
  return CODE_FILE_EXTENSIONS.some((ext) => filePath.endsWith(ext))
}

/**
 * Parse a bin string (e.g. "skillspector") into command + args
 * for use with execFile (which does not use a shell).
 */
function parseBin(bin: string): { cmd: string; args: string[] } {
  const parts = bin.split(/\s+/).filter((p) => p.length > 0)
  return { cmd: parts[0] ?? 'skillspector', args: parts.slice(1) }
}

/**
 * Escape annotation values for GitHub workflow commands.
 * - Encode `%` as `%25` (must be first to avoid double-encoding)
 * - Encode newlines as literal `\n` / `\r`
 * - Remove `::` and other workflow-command delimiters from values
 */
function escapeAnnotationValue(value: string): string {
  let escaped = value
  // Encode % first to avoid double-encoding
  escaped = escaped.replaceAll('%', '%25')
  // Encode newlines as literal \n / \r
  escaped = escaped.replaceAll('\r\n', '\\r\\n')
  escaped = escaped.replaceAll('\n', '\\n')
  escaped = escaped.replaceAll('\r', '\\r')
  // Remove workflow-command delimiters
  escaped = escaped.replaceAll('::', '')
  return escaped
}

function severityToSarifLevel(severity: string): 'error' | 'warning' | 'note' {
  const upper = severity.toUpperCase()
  if (upper === 'HIGH' || upper === 'CRITICAL') return 'error'
  if (upper === 'MEDIUM' || upper === 'WARNING') return 'warning'
  return 'note'
}

function isFailingSeverity(severity: string): boolean {
  const upper = severity.toUpperCase()
  return upper === 'HIGH' || upper === 'CRITICAL'
}

function buildSarifReport(issues: SkillIssue[], _workspaceRoot: string): Record<string, unknown> {
  const results = issues.map((issue) => {
    const relFile = issue.location.file.replace(/\\/g, '/')
    const properties: Record<string, unknown> = {}
    if (issue.category !== undefined) properties.category = issue.category
    if (issue.confidence !== undefined) properties.confidence = issue.confidence
    if (issue.remediation !== undefined) properties.remediation = issue.remediation
    if (issue.code_snippet !== undefined) properties.code_snippet = issue.code_snippet
    if (issue.intent !== undefined) properties.intent = issue.intent
    if (issue.tags !== undefined) properties.tags = issue.tags

    return {
      ruleId: issue.id,
      level: severityToSarifLevel(issue.severity),
      message: {
        text: issue.explanation ?? issue.id,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: relFile.replace(/\\/g, '/'),
            },
            region: {
              startLine: issue.location.start_line,
            },
          },
        },
      ],
      properties,
    }
  })

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'SkillSpector',
            informationUri: 'https://github.com/nx-devkit/skillspector',
          },
        },
        results,
      },
    ],
  }
}

function buildAnnotations(issues: SkillIssue[], _projectName: string): string[] {
  const lines: string[] = []
  for (const issue of issues) {
    // Only annotate code findings, not doc findings
    if (!isCodeFile(issue.location.file)) continue
    const file = escapeAnnotationValue(issue.location.file.replace(/\\/g, '/'))
    const line = issue.location.start_line
    const ruleId = escapeAnnotationValue(issue.id)
    const message = escapeAnnotationValue(issue.explanation ?? issue.id)
    lines.push(`::error file=${file},line=${line}::${ruleId}: ${message}`)
  }
  return lines
}

function computeProjectName(projectRoot: string): string {
  const slug = projectRoot.replace(/\//g, '-')
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)
  return `${slug}-${hash}`
}

function spawnSkillspector(
  bin: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
        timeout: 300_000,
        // Explicitly NOT using shell: true for security
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
          return
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' })
      },
    )
  })
}

export async function scanExecutor(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
  const opts = ctx.options
  const noLlm = opts.noLlm ?? true
  const annotations = opts.annotations ?? true
  const failOnError = opts.failOnError ?? true
  const skillspectorBin = opts.skillspectorBin ?? 'skillspector'
  const { cmd: binCmd, args: binArgs } = parseBin(skillspectorBin)

  const args: string[] = [...binArgs, 'scan', opts.path, '--format', 'json']
  if (noLlm) {
    args.push('--no-llm')
  }
  if (opts.baseline) {
    args.push('--baseline', opts.baseline)
  }

  let stdout: string
  try {
    const result = await spawnSkillspector(binCmd, args, ctx.workspaceRoot)
    stdout = result.stdout
  } catch (error) {
    // If skillspector exits non-zero, treat as failure
    console.error(`skillspector scan failed: ${(error as Error).message}`)
    return { success: false }
  }

  let issues: SkillIssue[] = []
  try {
    // SkillSpector may emit log lines before JSON; find the first JSON delimiter
    const jsonStart = stdout.search(/[[{]/)
    const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout
    const parsed = JSON.parse(jsonStr) as unknown
    if (Array.isArray(parsed)) {
      issues = parsed as SkillIssue[]
    } else if (parsed && typeof parsed === 'object' && 'findings' in parsed) {
      issues = (parsed as { findings: SkillIssue[] }).findings
    }
  } catch {
    // No valid JSON output — no findings
    issues = []
  }

  // Write SARIF report if option is set
  if (opts.sarif) {
    const workspaceRoot = resolvePath(ctx.workspaceRoot)
    const sarifPath = resolvePath(workspaceRoot, opts.sarif)
    const relSarif = relative(workspaceRoot, sarifPath)
    if (relSarif === '..' || relSarif.startsWith(`..${sep}`) || isAbsolute(relSarif)) {
      return { success: false }
    }
    // Resolve symlinks on the workspace root to prevent CWE-59 escapes.
    // The SARIF file itself doesn't exist yet, so we validate the parent
    // directory after mkdir resolves all symlinks in the path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- workspaceRoot is the trusted Nx workspace root
    const realWorkspaceRoot = await realpath(workspaceRoot).catch(() => workspaceRoot)
    const sarifDir = dirname(sarifPath)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sarifDir is contained within workspaceRoot, validated via relative()
    await mkdir(sarifDir, { recursive: true })
    // After mkdir, resolve the real path of the directory to catch symlinks
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sarifDir is validated above
    const realSarifDir = await realpath(sarifDir).catch(() => sarifDir)
    const realRel = relative(realWorkspaceRoot, realSarifDir)
    if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
      return { success: false }
    }
    // Also check if the SARIF file itself is an existing symlink pointing outside
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sarifPath is validated above
    const realSarifPath = await realpath(sarifPath).catch(() => sarifPath)
    const realFileRel = relative(realWorkspaceRoot, realSarifPath)
    if (realFileRel === '..' || realFileRel.startsWith(`..${sep}`) || isAbsolute(realFileRel)) {
      return { success: false }
    }
    const sarifReport = buildSarifReport(issues, ctx.workspaceRoot)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sarifPath is contained within workspaceRoot, validated via relative() + realpath()
    await writeFile(sarifPath, JSON.stringify(sarifReport, null, 2), 'utf8')
  }

  // Write annotations if enabled
  if (annotations) {
    const projectName = computeProjectName(opts.path)
    const annotationsFileName = `annotations-${projectName}.txt`
    const annotationsPath = join(ctx.workspaceRoot, annotationsFileName)
    const annotationLines = buildAnnotations(issues, projectName)
    if (annotationLines.length > 0) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- annotationsPath is derived from the trusted workspaceRoot
      await writeFile(annotationsPath, `${annotationLines.join('\n')}\n`, 'utf8')
    }
  }

  // Check failOnError
  if (failOnError) {
    const hasFailing = issues.some((issue) => isFailingSeverity(issue.severity))
    if (hasFailing) {
      return { success: false }
    }
  }

  return { success: true }
}

export default scanExecutor
