import { Instance } from "../project/instance"

export namespace TestDetector {
  export type Framework = "jest" | "vitest" | "bun" | "pytest" | "go" | "unknown"

  let cachedFramework: Framework | undefined
  let cachedWorktree: string | undefined

  export async function detect(): Promise<Framework> {
    const worktree = Instance.worktree
    if (cachedFramework !== undefined && cachedWorktree === worktree) return cachedFramework

    // Check package.json for test frameworks
    const pkgPath = `${worktree}/package.json`
    const pkg = await Bun.file(pkgPath).json().catch(() => null)
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps["vitest"]) return (cachedWorktree = worktree, cachedFramework = "vitest")
      if (deps["jest"]) return (cachedWorktree = worktree, cachedFramework = "jest")
      // Check if bun runtime with bun test
      if (/\bbun\s+test\b/.test(pkg.scripts?.test ?? "")) return (cachedWorktree = worktree, cachedFramework = "bun")
    }

    // Check go.mod, pyproject.toml, setup.py in parallel
    const [hasGoMod, hasPyproject, hasSetupPy] = await Promise.all([
      Bun.file(`${worktree}/go.mod`).exists(),
      Bun.file(`${worktree}/pyproject.toml`).exists(),
      Bun.file(`${worktree}/setup.py`).exists(),
    ])

    if (hasGoMod) return (cachedWorktree = worktree, cachedFramework = "go")
    if (hasPyproject || hasSetupPy) return (cachedWorktree = worktree, cachedFramework = "pytest")

    cachedWorktree = worktree
    cachedFramework = "unknown"
    return cachedFramework
  }

  export function command(fw: Framework): string {
    switch (fw) {
      case "jest": return "npx jest"
      case "vitest": return "npx vitest run"
      case "bun": return "bun test"
      case "pytest": return "pytest"
      case "go": return "go test ./..."
      default: return "test"
    }
  }
}
