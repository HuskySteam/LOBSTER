import { test, expect, describe } from "bun:test"
import { IndexCache } from "../../src/index/cache"

describe("IndexCache.djb2", () => {
  test("deterministic - same string produces same hash", () => {
    const hash1 = IndexCache.djb2("hello world")
    const hash2 = IndexCache.djb2("hello world")
    expect(hash1).toBe(hash2)
  })

  test("different strings produce different hashes", () => {
    const hash1 = IndexCache.djb2("hello")
    const hash2 = IndexCache.djb2("world")
    expect(hash1).not.toBe(hash2)
  })

  test("empty string produces consistent hash", () => {
    const hash = IndexCache.djb2("")
    expect(hash).toBe(5381) // initial hash value with no iterations
  })

  test("returns a number", () => {
    const hash = IndexCache.djb2("test")
    expect(typeof hash).toBe("number")
  })

  test("single character", () => {
    const hash = IndexCache.djb2("a")
    // djb2: ((5381 << 5) + 5381 + 97) | 0 = (5381 * 33 + 97) | 0 = 177670
    expect(hash).toBe(177670)
  })

  test("handles special characters", () => {
    const hash1 = IndexCache.djb2("hello!")
    const hash2 = IndexCache.djb2("hello?")
    expect(hash1).not.toBe(hash2)
  })
})

describe("IndexCache.empty", () => {
  test("returns correct structure", () => {
    const cache = IndexCache.empty()
    expect(cache.version).toBe(1)
    expect(cache.files).toEqual([])
    expect(typeof cache.timestamp).toBe("number")
  })

  test("timestamp is recent", () => {
    const before = Date.now()
    const cache = IndexCache.empty()
    const after = Date.now()
    expect(cache.timestamp).toBeGreaterThanOrEqual(before)
    expect(cache.timestamp).toBeLessThanOrEqual(after)
  })
})
