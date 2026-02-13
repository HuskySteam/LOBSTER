import { test, expect, describe } from "bun:test"
import { CodebaseIndex } from "../../src/index/indexer"

describe("CodebaseIndex", () => {
  test("build is a function", () => {
    expect(typeof CodebaseIndex.build).toBe("function")
  })

  test("update is a function", () => {
    expect(typeof CodebaseIndex.update).toBe("function")
  })

  test("summary is a function", () => {
    expect(typeof CodebaseIndex.summary).toBe("function")
  })
})

// build(), update(), and summary() all depend on Instance.state() which requires
// an initialized project instance, and on Bun.Glob/Bun.file for filesystem scanning.
// Full testing would require mocking Instance.worktree and the filesystem,
// or setting up a fixture directory with known source files.
//
// The extractMatches() and scanFile() functions are private to the namespace
// and cannot be tested directly.
