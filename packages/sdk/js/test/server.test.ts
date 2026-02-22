import { beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"

class MockStream extends EventEmitter {}

class MockChildProcess extends EventEmitter {
  stdout = new MockStream()
  stderr = new MockStream()
  killed = false
  killCount = 0

  kill() {
    this.killed = true
    this.killCount += 1
    queueMicrotask(() => {
      this.emit("exit", null)
    })
    return true
  }
}

let nextProcess: MockChildProcess | undefined
const spawnCalls: Array<{ command: string; args: string[] }> = []

mock.module("node:child_process", () => ({
  spawn: (command: string, args: string[]) => {
    spawnCalls.push({ command, args })
    if (!nextProcess) {
      throw new Error("No mock process configured for spawn()")
    }
    const proc = nextProcess
    nextProcess = undefined
    return proc as any
  },
}))

const { createLobsterServer } = await import("../src/server")

function createMockProcess() {
  const proc = new MockChildProcess()
  nextProcess = proc
  return proc
}

beforeEach(() => {
  spawnCalls.length = 0
  nextProcess = undefined
})

describe("createLobsterServer", () => {
  test("kills the spawned process when startup times out", async () => {
    const proc = createMockProcess()

    await expect(
      createLobsterServer({
        timeout: 10,
      }),
    ).rejects.toThrow("Timeout waiting for server to start")

    expect(proc.killCount).toBeGreaterThanOrEqual(1)
  })

  test("kills the spawned process when startup is aborted", async () => {
    const proc = createMockProcess()
    const abortController = new AbortController()

    const startup = createLobsterServer({
      signal: abortController.signal,
      timeout: 1_000,
    })
    abortController.abort()

    await expect(startup).rejects.toThrow("Aborted")
    expect(proc.killCount).toBeGreaterThanOrEqual(1)
  })

  test("detaches startup listeners once ready to avoid retaining buffers", async () => {
    const proc = createMockProcess()
    const startup = createLobsterServer({
      timeout: 1_000,
    })

    proc.stdout.emit("data", Buffer.from("lobster server listening on http://127.0.0.1:6123\n"))

    const server = await startup
    expect(server.url).toBe("http://127.0.0.1:6123")

    expect(proc.stdout.listenerCount("data")).toBe(0)
    expect(proc.stderr.listenerCount("data")).toBe(0)
    expect(proc.listenerCount("exit")).toBe(0)
    expect(proc.listenerCount("error")).toBe(0)

    server.close()
    expect(proc.killCount).toBeGreaterThanOrEqual(1)
  })

  test("rejects and kills process when listen output does not contain a URL", async () => {
    const proc = createMockProcess()
    const startup = createLobsterServer({
      timeout: 1_000,
    })

    proc.stdout.emit("data", Buffer.from("lobster server listening\n"))

    await expect(startup).rejects.toThrow("Failed to parse server url")
    expect(proc.killCount).toBeGreaterThanOrEqual(1)
  })
})

