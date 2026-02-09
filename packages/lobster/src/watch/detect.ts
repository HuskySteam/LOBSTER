export namespace ErrorDetect {
  export interface ErrorInfo {
    file: string
    line: number
    message: string
    type: "typescript" | "test" | "runtime" | "build" | "unknown"
  }

  // TypeScript errors: src/foo.ts(10,5): error TS2345: ...
  // Also: src/foo.ts:10:5 - error TS2345: ...
  const tsParenPattern = /^(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)$/
  const tsColonPattern = /^(.+?):(\d+):\d+\s*-\s*error\s+TS\d+:\s*(.+)$/

  // Bun/Node test failures: "at <path>:<line>:<col>"
  const stackTracePattern = /^\s*at\s+.*?(?:\((.+?):(\d+):\d+\)|(.+?):(\d+):\d+)$/

  // Generic compile/runtime error: "<file>:<line>: <message>"
  const genericPattern = /^(.+?\.[a-zA-Z]{1,4}):(\d+)(?::\d+)?:\s*(.+)$/

  // Jest/Vitest: "FAIL src/foo.test.ts"
  const testFailPattern = /^\s*(?:FAIL|FAILED)\s+(.+?\.[a-zA-Z]{2,4})/

  // Bun test: "error: <message>"  then "at <file>:<line>"
  const bunErrorPattern = /^error:\s*(.+)$/

  export function parse(output: string): ErrorInfo[] {
    const lines = output.split("\n")
    const errors: ErrorInfo[] = []
    const seen = new Set<string>()

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      let match: RegExpMatchArray | null

      // TypeScript paren format
      match = line.match(tsParenPattern)
      if (match) {
        const key = `${match[1]}:${match[2]}`
        if (!seen.has(key)) {
          seen.add(key)
          errors.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            message: match[3].trim(),
            type: "typescript",
          })
        }
        continue
      }

      // TypeScript colon format
      match = line.match(tsColonPattern)
      if (match) {
        const key = `${match[1]}:${match[2]}`
        if (!seen.has(key)) {
          seen.add(key)
          errors.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            message: match[3].trim(),
            type: "typescript",
          })
        }
        continue
      }

      // Test failures
      match = line.match(testFailPattern)
      if (match) {
        const key = `test:${match[1]}`
        if (!seen.has(key)) {
          seen.add(key)
          errors.push({
            file: match[1].trim(),
            line: 1,
            message: "Test failed",
            type: "test",
          })
        }
        continue
      }

      // Stack traces
      match = line.match(stackTracePattern)
      if (match) {
        const file = (match[1] ?? match[3])?.trim()
        const lineNum = parseInt(match[2] ?? match[4], 10)
        if (file && !file.includes("node_modules") && lineNum) {
          const key = `${file}:${lineNum}`
          if (!seen.has(key)) {
            seen.add(key)
            // Look backwards for the error message
            let msg = "Runtime error"
            for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
              const prev = lines[j].trim()
              if (prev.match(bunErrorPattern) || prev.includes("Error:") || prev.includes("error:")) {
                msg = prev
                break
              }
            }
            errors.push({
              file,
              line: lineNum,
              message: msg,
              type: "runtime",
            })
          }
        }
        continue
      }

      // Generic file:line errors
      match = line.match(genericPattern)
      if (match) {
        const file = match[1].trim()
        if (!file.includes("node_modules") && !file.startsWith("http")) {
          const key = `${file}:${match[2]}`
          if (!seen.has(key)) {
            seen.add(key)
            errors.push({
              file,
              line: parseInt(match[2], 10),
              message: match[3].trim(),
              type: "build",
            })
          }
        }
      }
    }

    return errors
  }

  export function hasErrors(output: string): boolean {
    return parse(output).length > 0
  }

  export function formatErrors(errors: ErrorInfo[]): string {
    if (errors.length === 0) return "No errors detected."
    return errors
      .map((e) => `[${e.type}] ${e.file}:${e.line} - ${e.message}`)
      .join("\n")
  }
}
