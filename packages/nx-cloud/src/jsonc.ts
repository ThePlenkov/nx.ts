import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser'

export function parseJsonObject(text: string, path: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const data = parse(text, errors, { allowTrailingComma: true }) as unknown
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join('; ')
    throw new Error(`Cannot parse ${path}: ${details}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Cannot parse ${path}: expected a JSON object`)
  }
  return data as Record<string, unknown>
}

export function detectIndent(text: string): {
  eol: string
  insertSpaces: boolean
  tabSize: number
} {
  const match = /\n([ \t]+)"/.exec(text)
  const indent = match?.[1] ?? '  '
  return {
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    insertSpaces: !indent.startsWith('\t'),
    tabSize: indent.startsWith('\t') ? 1 : indent.length,
  }
}
