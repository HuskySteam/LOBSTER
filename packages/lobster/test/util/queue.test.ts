import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.queue", () => {
  test("work avoids Array.shift in the worker loop", async () => {
    const originalShift = Array.prototype.shift
    let queueShiftCalls = 0

    Array.prototype.shift = function (this: unknown[]) {
      const stack = new Error().stack ?? ""
      if (stack.includes("src/util/queue.ts") || stack.includes("src\\util\\queue.ts")) {
        queueShiftCalls++
      }
      return originalShift.call(this)
    }

    try {
      const visited: number[] = []
      await work(
        4,
        Array.from({ length: 32 }, (_, index) => index),
        async (item) => {
          visited.push(item)
        },
      )

      expect(queueShiftCalls).toBe(0)
      expect(visited.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, index) => index))
    } finally {
      Array.prototype.shift = originalShift
    }
  })

  test("AsyncQueue preserves FIFO semantics", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)

    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)

    const pending = queue.next()
    queue.push(3)
    expect(await pending).toBe(3)
  })
})
