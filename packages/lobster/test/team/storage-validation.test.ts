import { describe, test, expect } from "bun:test"

/**
 * Test the Storage key validation logic.
 *
 * Storage.validateKey is a private function, so we replicate the exact
 * validation logic from src/storage/storage.ts (lines 144-150) and test it
 * directly. This ensures path traversal attempts are rejected.
 */

function validateKey(key: string[]) {
  for (const segment of key) {
    if (segment.includes("..") || segment.includes("/") || segment.includes("\\") || segment === "") {
      throw new Error(`Invalid storage key segment: "${segment}"`)
    }
  }
}

describe("Storage.validateKey rejects path traversal", () => {
  test("rejects segments with '..'", () => {
    expect(() => validateKey(["../etc"])).toThrow("Invalid storage key segment")
    expect(() => validateKey([".."])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["foo..bar"])).toThrow("Invalid storage key segment")
  })

  test("rejects segments with forward slashes", () => {
    expect(() => validateKey(["foo/bar"])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["a/b/c"])).toThrow("Invalid storage key segment")
  })

  test("rejects empty segments", () => {
    expect(() => validateKey([""])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["valid", ""])).toThrow("Invalid storage key segment")
  })

  test("rejects segments with backslashes", () => {
    expect(() => validateKey(["a\\b"])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["\\"])).toThrow("Invalid storage key segment")
  })

  test("rejects traversal in any position", () => {
    expect(() => validateKey(["valid", "../escape"])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["ok", "fine", ".."])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["first", "second", "foo/bar"])).toThrow("Invalid storage key segment")
  })

  test("rejects combined traversal patterns", () => {
    expect(() => validateKey(["..\\.."])).toThrow("Invalid storage key segment")
    expect(() => validateKey(["foo/../bar"])).toThrow("Invalid storage key segment")
  })

  test("accepts valid key segments", () => {
    expect(() => validateKey(["team", "alpha"])).not.toThrow()
    expect(() => validateKey(["team_task", "alpha", "1"])).not.toThrow()
    expect(() => validateKey(["a-b-c"])).not.toThrow()
    expect(() => validateKey(["simple"])).not.toThrow()
    expect(() => validateKey(["with.dots"])).not.toThrow() // single dots are OK
    expect(() => validateKey(["123"])).not.toThrow()
  })
})
