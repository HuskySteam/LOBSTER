import { test, expect, describe } from "bun:test"
import { ConventionDetector } from "../../src/convention/detector"

describe("ConventionDetector", () => {
  test("Conventions interface has expected shape", () => {
    // Verify the type exists and detect is a function
    expect(typeof ConventionDetector.detect).toBe("function")
  })

  test("detect returns a Promise", () => {
    // detect() depends on Instance.worktree and filesystem, so we can't fully test it
    // but we can verify it's an async function
    expect(ConventionDetector.detect.constructor.name).toBe("AsyncFunction")
  })
})

// The detect(), detectFromConfigs(), and detectFromSources() functions all depend on
// Instance.worktree and Bun.file/Bun.Glob, making them hard to test without mocking
// the project instance. The core logic (majority voting on source patterns) is
// internal to detectFromSources() and not directly testable.
//
// Integration tests would need a fixture directory with known config files and
// source files to verify the full detection pipeline.
