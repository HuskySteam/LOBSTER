import { describe, expect, test } from "bun:test"
import { MemoryManager } from "../../src/memory/manager"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("memory.manager", () => {
  test("indexes saved entries and finds targeted query content", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const scope = `memory-manager-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const created: string[] = []

        const candidate = await MemoryManager.save({
          content: `${scope} orchestra deployment runbook`,
          tags: ["deployment", scope],
          category: "pattern",
          sessionID: "session-memory-test",
        })
        created.push(candidate.id)

        for (let i = 0; i < 20; i++) {
          const entry = await MemoryManager.save({
            content: `${scope} background note ${i}`,
            tags: ["background"],
            category: "note",
            sessionID: "session-memory-test",
          })
          created.push(entry.id)
        }

        const matches = await MemoryManager.search(`${scope} orchestra`)
        expect(matches.some((entry) => entry.id === candidate.id)).toBe(true)

        for (const id of created) {
          await MemoryManager.forget(id)
        }
      },
    })
  })
})
