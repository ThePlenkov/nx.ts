#!/usr/bin/env bun
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['openspec', 'packages']
const TARGET_PATTERNS = [
  /createNodesV2\s*[:=]/,
  /createNodes\s*[:=]/,
  /inferTarget\s*\(/,
  /buildTarget\s*[:=]/,
  /testTarget\s*[:=]/,
  /lintTarget\s*[:=]/,
  /formatTarget\s*[:=]/,
  /typecheckTarget\s*[:=]/,
]
const INFERENCE_KEYS = [
  'build',
  'test',
  'lint',
  'format',
  'format-check',
  'typecheck',
  'test:watch',
  'test:coverage',
]

type Finding = { file: string; line: number; key: string; content: string }

const findings: Finding[] = []

const MAX_DEPTH = 10

function walk(dir: string, depth: number = 0): string[] {
  if (depth > MAX_DEPTH) return []
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st: ReturnType<typeof lstatSync>
    try {
      st = lstatSync(full)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) {
      continue
    }
    if (st.isDirectory()) {
      out.push(...walk(full, depth + 1))
    } else if (['.ts', '.md'].includes(extname(full))) {
      out.push(full)
    }
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => {
  const root = join(ROOT, d)
  const rel = relative(ROOT, root)
  if (rel.startsWith('..') || rel === '..' || root === ROOT) return []
  return walk(root)
})

for (const file of files) {
  const rel = relative(ROOT, file)
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    for (const pattern of TARGET_PATTERNS) {
      if (pattern.test(line)) {
        for (const key of INFERENCE_KEYS) {
          const keyRe = new RegExp(`['"\`]${key}['"\`]:?`)
          if (keyRe.test(line)) {
            findings.push({ file: rel, line: i + 1, key, content: line.trim() })
          }
        }
      }
    }
  }
}

const seen = new Map<string, Finding[]>()
for (const f of findings) {
  const k = `${f.key}`
  const existing = seen.get(k)
  if (existing) {
    existing.push(f)
  } else {
    seen.set(k, [f])
  }
}

const conflicts: Array<{ key: string; entries: Finding[] }> = []
for (const [key, entries] of seen) {
  if (entries.length > 1) {
    const distinctFiles = new Set(entries.map((e) => e.file))
    if (distinctFiles.size > 1) conflicts.push({ key, entries })
  }
}

if (conflicts.length === 0) {
  console.log(
    `spec-check: OK - scanned ${files.length} files, no duplicate inference definitions across plugin/spec boundaries`,
  )
  process.exit(0)
}

console.error('spec-check: CONFLICTS detected')
for (const c of conflicts) {
  console.error(`\n  Target key '${c.key}' defined in multiple files:`)
  for (const e of c.entries) {
    console.error(`    - ${e.file}:${e.line}  ${e.content}`)
  }
}
console.error(`\n  ${conflicts.length} conflict(s) found. Resolve before committing.`)
process.exit(1)
