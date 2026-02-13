import path from "path"

export namespace TestAssociation {
  // Map patterns: user.ts -> user.test.ts / user.spec.ts / __tests__/user.ts / test_user.py / user_test.go
  const PATTERNS = [
    (base: string, ext: string, dir: string) => path.join(dir, `${base}.test${ext}`),
    (base: string, ext: string, dir: string) => path.join(dir, `${base}.spec${ext}`),
    (base: string, ext: string, dir: string) => path.join(dir, "__tests__", `${base}${ext}`),
    (base: string, ext: string, dir: string) => path.join(dir, "__tests__", `${base}.test${ext}`),
    // Python
    (base: string, _ext: string, dir: string) => path.join(dir, `test_${base}.py`),
    (base: string, _ext: string, dir: string) => path.join(path.dirname(dir), "tests", `test_${base}.py`),
    // Go
    (base: string, _ext: string, dir: string) => path.join(dir, `${base}_test.go`),
  ]

  export async function findTestFile(source: string): Promise<string | undefined> {
    const normalized = path.normalize(source)
    const parsed = path.parse(normalized)
    const base = parsed.name
    const ext = parsed.ext
    const dir = parsed.dir

    // Don't suggest tests for test files themselves
    if (base.endsWith(".test") || base.endsWith(".spec") || base.endsWith("_test") || base.startsWith("test_")) {
      return undefined
    }

    const candidates = PATTERNS.map((pattern) => pattern(base, ext, dir))
    const results = await Promise.all(candidates.map((c) => Bun.file(c).exists()))
    const idx = results.indexOf(true)
    return idx >= 0 ? candidates[idx] : undefined
  }

  export async function suggestion(editedFiles: string[]): Promise<string | undefined> {
    const testFiles: string[] = []
    for (const file of editedFiles) {
      const testFile = await findTestFile(file)
      if (testFile) testFiles.push(testFile)
    }
    if (testFiles.length === 0) return undefined
    const unique = [...new Set(testFiles)]
    return `Related test files found:\n${unique.map((f) => `- ${f}`).join("\n")}\nConsider running tests to verify your changes.`
  }
}
