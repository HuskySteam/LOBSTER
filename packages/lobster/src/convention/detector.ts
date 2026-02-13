import { Instance } from "../project/instance"

export namespace ConventionDetector {
  export interface Conventions {
    indentation: "tabs" | "spaces-2" | "spaces-4"
    semicolons: boolean
    quotes: "single" | "double"
    naming: "camelCase" | "snake_case"
    testFramework: string | null
    packageManager: "npm" | "yarn" | "pnpm" | "bun" | null
    lineEnding: "lf" | "crlf"
  }

  export async function detect(): Promise<Conventions> {
    const conventions: Conventions = {
      indentation: "spaces-2",
      semicolons: true,
      quotes: "double",
      naming: "camelCase",
      testFramework: null,
      packageManager: null,
      lineEnding: "lf",
    }

    // Check config files first for explicit settings
    await detectFromConfigs(conventions)

    // Sample source files for patterns
    await detectFromSources(conventions)

    return conventions
  }

  async function detectFromConfigs(conventions: Conventions) {
    const root = Instance.worktree

    // .editorconfig
    const editorconfig = await Bun.file(`${root}/.editorconfig`).text().catch(() => "")
    if (editorconfig) {
      if (editorconfig.includes("indent_style = tab")) conventions.indentation = "tabs"
      else if (editorconfig.includes("indent_size = 4")) conventions.indentation = "spaces-4"
      else if (editorconfig.includes("indent_size = 2")) conventions.indentation = "spaces-2"
      if (editorconfig.includes("end_of_line = crlf")) conventions.lineEnding = "crlf"
    }

    // package.json
    const pkg = await Bun.file(`${root}/package.json`).json().catch(() => null)
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      // Test framework
      if (deps?.["vitest"]) conventions.testFramework = "vitest"
      else if (deps?.["jest"]) conventions.testFramework = "jest"
      else if (/\bbun\s+test\b/.test(pkg.scripts?.test ?? "")) conventions.testFramework = "bun"
      // Package manager from lockfile
      if (await Bun.file(`${root}/bun.lock`).exists().catch(() => false)) conventions.packageManager = "bun"
      else if (await Bun.file(`${root}/bun.lockb`).exists().catch(() => false)) conventions.packageManager = "bun"
      else if (await Bun.file(`${root}/pnpm-lock.yaml`).exists().catch(() => false)) conventions.packageManager = "pnpm"
      else if (await Bun.file(`${root}/yarn.lock`).exists().catch(() => false)) conventions.packageManager = "yarn"
      else if (await Bun.file(`${root}/package-lock.json`).exists().catch(() => false)) conventions.packageManager = "npm"
    }

    // .prettierrc
    const prettierrc = (await Bun.file(`${root}/.prettierrc`).json().catch(() => null)) as any
    if (prettierrc) {
      if (prettierrc.semi === false) conventions.semicolons = false
      if (prettierrc.singleQuote) conventions.quotes = "single"
      if (prettierrc.useTabs) conventions.indentation = "tabs"
      else if (prettierrc.tabWidth === 4) conventions.indentation = "spaces-4"
      else if (prettierrc.tabWidth === 2) conventions.indentation = "spaces-2"
    }

    // Go project
    if (await Bun.file(`${root}/go.mod`).exists().catch(() => false)) {
      conventions.naming = "camelCase" // Go uses camelCase exports
      conventions.testFramework = "go test"
      conventions.indentation = "tabs"
    }

    // Python project
    if (await Bun.file(`${root}/pyproject.toml`).exists().catch(() => false)) {
      conventions.naming = "snake_case"
      conventions.testFramework = "pytest"
      conventions.indentation = "spaces-4"
    }
  }

  async function detectFromSources(conventions: Conventions) {
    const root = Instance.worktree
    // Sample up to 10 source files
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx,py,go}")
    const files: string[] = []
    for await (const file of glob.scan({
      cwd: root,
      absolute: true,
      onlyFiles: true,
    })) {
      if (file.includes("node_modules") || file.includes(".git") || file.includes("dist")) continue
      files.push(file)
      if (files.length >= 10) break
    }

    let singleQuotes = 0
    let doubleQuotes = 0
    let semicolons = 0
    let noSemicolons = 0
    let tabs = 0
    let spaces2 = 0
    let spaces4 = 0
    let camelCase = 0
    let snakeCase = 0
    let crlfCount = 0
    let lfCount = 0

    for (const file of files) {
      const content = await Bun.file(file).text().catch(() => "")
      if (!content) continue

      // Line endings
      if (content.includes("\r\n")) crlfCount++
      else lfCount++

      const lines = content.split("\n").slice(0, 100) // sample first 100 lines
      for (const line of lines) {
        // Indentation
        if (line.startsWith("\t")) tabs++
        else if (line.startsWith("    ")) spaces4++
        else if (line.startsWith("  ") && !line.startsWith("    ")) spaces2++

        // Quotes (simple heuristic)
        const singleMatches = line.match(/'/g)?.length ?? 0
        const doubleMatches = line.match(/"/g)?.length ?? 0
        singleQuotes += singleMatches
        doubleQuotes += doubleMatches

        // Semicolons (for JS/TS files)
        if (file.match(/\.[jt]sx?$/)) {
          if (line.trimEnd().endsWith(";")) semicolons++
          else if (line.trim().length > 0 && !line.trim().startsWith("//") && !line.trim().startsWith("/*") && !line.trim().startsWith("*")) noSemicolons++
        }

        // Naming conventions
        const funcMatch = line.match(/function\s+(\w+)/)
        if (funcMatch) {
          if (funcMatch[1].includes("_")) snakeCase++
          else camelCase++
        }
      }
    }

    // Apply majority vote
    if (singleQuotes > doubleQuotes) conventions.quotes = "single"
    if (noSemicolons > semicolons * 1.5) conventions.semicolons = false
    if (tabs > spaces2 + spaces4) conventions.indentation = "tabs"
    else if (spaces4 > spaces2) conventions.indentation = "spaces-4"
    if (snakeCase > camelCase) conventions.naming = "snake_case"
    if (crlfCount > lfCount) conventions.lineEnding = "crlf"
  }
}
